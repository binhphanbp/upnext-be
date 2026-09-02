import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { CV_SCORING_RUBRIC, CvScoringCriterionBreakdown } from './scoring-rubric';

export type ScoringWeights = {
  skills: number;
  experience: number;
  projects: number;
  education: number;
};

export type ResolvedScreeningConfig = {
  weights: ScoringWeights;
  weightPreset: string | null;
  mustHaveCriteria: string[];
  niceToHaveCriteria: string[];
  customPrompt: string | null;
  passingScore: number | null;
  defaultTopN: number | null;
};

/** The raw shape of both config tables (company + job post override). Every
 * field is optional so the same merge works for either level. */
export type ScreeningConfigRow = {
  weightSkills?: number | null;
  weightExperience?: number | null;
  weightProjects?: number | null;
  weightEducation?: number | null;
  weightPreset?: string | null;
  mustHaveCriteria?: Prisma.JsonValue | null;
  niceToHaveCriteria?: Prisma.JsonValue | null;
  customPrompt?: string | null;
  passingScore?: number | null;
  defaultTopN?: number | null;
};

export const WEIGHT_STEP = 5;
export const WEIGHT_TOTAL = 100;
export const MAX_CRITERIA_ITEMS = 10;
export const MAX_CRITERION_LENGTH = 120;
export const MAX_CUSTOM_PROMPT_LENGTH = 1000;

/** Derived from the rubric itself so the default split can never drift away
 * from the scale the model actually scores on. */
export const REFERENCE_WEIGHTS: ScoringWeights = {
  skills: referenceMaxScore('skills'),
  experience: referenceMaxScore('experience'),
  projects: referenceMaxScore('projects'),
  education: referenceMaxScore('education'),
};

export const SYSTEM_DEFAULT_SCREENING_CONFIG: ResolvedScreeningConfig = {
  weights: REFERENCE_WEIGHTS,
  weightPreset: null,
  mustHaveCriteria: [],
  niceToHaveCriteria: [],
  customPrompt: null,
  passingScore: null,
  defaultTopN: null,
};

export function referenceMaxScore(key: CvScoringCriterionBreakdown['key']): number {
  const criterion = CV_SCORING_RUBRIC.find((item) => item.key === key);
  if (!criterion) {
    throw new Error(`Unknown scoring rubric criterion: ${key}`);
  }
  return criterion.maxScore;
}

/**
 * Merges a job-post override over the company defaults over the system
 * defaults, field by field.
 *
 * The four weights are treated as one atomic block: a level either sets all
 * of them or inherits the whole split. Merging them individually could
 * produce a total other than 100, which would silently break the 0-100 final
 * score contract.
 *
 * `mustHaveCriteria`/`niceToHaveCriteria` distinguish null (inherit) from an
 * empty array (deliberately cleared at this level).
 */
export function resolveScreeningConfig(
  company: ScreeningConfigRow | null | undefined,
  jobPost?: ScreeningConfigRow | null,
): ResolvedScreeningConfig {
  const weightsFromJob = readWeights(jobPost);
  const weightsFromCompany = readWeights(company);
  const weights = weightsFromJob ?? weightsFromCompany ?? SYSTEM_DEFAULT_SCREENING_CONFIG.weights;

  return {
    weights,
    weightPreset: weightsFromJob
      ? (jobPost?.weightPreset ?? null)
      : weightsFromCompany
        ? (company?.weightPreset ?? null)
        : null,
    mustHaveCriteria:
      readCriteria(jobPost?.mustHaveCriteria) ??
      readCriteria(company?.mustHaveCriteria) ??
      SYSTEM_DEFAULT_SCREENING_CONFIG.mustHaveCriteria,
    niceToHaveCriteria:
      readCriteria(jobPost?.niceToHaveCriteria) ??
      readCriteria(company?.niceToHaveCriteria) ??
      SYSTEM_DEFAULT_SCREENING_CONFIG.niceToHaveCriteria,
    customPrompt: firstDefined(jobPost?.customPrompt, company?.customPrompt),
    passingScore: firstDefined(jobPost?.passingScore, company?.passingScore),
    defaultTopN: firstDefined(jobPost?.defaultTopN, company?.defaultTopN),
  };
}

/** Which fields the job level actually overrides -- lets the UI label the
 * rest as "inherited from the company defaults". */
export function describeInheritance(jobPost?: ScreeningConfigRow | null) {
  return {
    weights: readWeights(jobPost) === null,
    mustHaveCriteria: readCriteria(jobPost?.mustHaveCriteria) === null,
    niceToHaveCriteria: readCriteria(jobPost?.niceToHaveCriteria) === null,
    customPrompt: (jobPost?.customPrompt ?? null) === null,
    passingScore: (jobPost?.passingScore ?? null) === null,
    defaultTopN: (jobPost?.defaultTopN ?? null) === null,
  };
}

export function assertValidWeights(weights: ScoringWeights) {
  const values = Object.values(weights);
  const invalid = values.some(
    (value) =>
      !Number.isInteger(value) || value < 0 || value > WEIGHT_TOTAL || value % WEIGHT_STEP !== 0,
  );
  if (invalid) {
    throw new BadRequestException({
      code: 'CV_SCREENING_INVALID_WEIGHTS',
      message: `Mỗi trọng số phải là số nguyên từ 0 đến ${WEIGHT_TOTAL} và là bội số của ${WEIGHT_STEP}.`,
    });
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  if (total !== WEIGHT_TOTAL) {
    throw new BadRequestException({
      code: 'CV_SCREENING_INVALID_WEIGHTS',
      message: `Tổng trọng số 4 tiêu chí phải bằng ${WEIGHT_TOTAL}%, hiện tại là ${total}%.`,
    });
  }
}

/**
 * Hash of everything that changes what the model produces: the criteria, the
 * free-text note and the scoring version.
 *
 * Weights are deliberately NOT part of this. They are applied after scoring,
 * so a weight change can be re-applied to a cached score locally instead of
 * spending another AI call and another AI_CV_MATCHING credit on it.
 */
export function buildPromptFingerprint(
  config: Pick<ResolvedScreeningConfig, 'mustHaveCriteria' | 'niceToHaveCriteria' | 'customPrompt'>,
  scoringVersion: string,
): string {
  const payload = JSON.stringify({
    mustHave: config.mustHaveCriteria,
    niceToHave: config.niceToHaveCriteria,
    customPrompt: config.customPrompt?.trim() ?? null,
    scoringVersion,
  });
  return createHash('sha256').update(payload).digest('hex');
}

export type WeightedScores = {
  skillScore: number;
  experienceScore: number;
  projectScore: number;
  educationScore: number;
  finalScore: number;
};

/**
 * Converts a breakdown scored on the fixed reference rubric into the
 * recruiter's configured weights.
 *
 * Each group's ratio (awarded / reference max) is multiplied by its weight, so
 * the group columns are "points out of that group's weight" and the final
 * score is always 0-100. With the default weights the ratios multiply by 1 and
 * the numbers come out identical to how they were before weights existed --
 * which is why old rows need no backfill.
 */
export function applyWeights(
  referenceBreakdown: CvScoringCriterionBreakdown[],
  referenceEducationScore: number,
  weights: ScoringWeights,
): WeightedScores {
  const skillScore = weightGroup(referenceBreakdown, 'skills', weights.skills);
  const experienceScore = weightGroup(referenceBreakdown, 'experience', weights.experience);
  const projectScore = weightGroup(referenceBreakdown, 'projects', weights.projects);
  const educationScore = roundScore(
    ratio(referenceEducationScore, REFERENCE_WEIGHTS.education) * weights.education,
  );

  return {
    skillScore,
    experienceScore,
    projectScore,
    educationScore,
    finalScore: roundScore(skillScore + experienceScore + projectScore + educationScore),
  };
}

/** Scale factor to convert reference-scale points of one group into weighted
 * points, used to present a breakdown/rubric consistently with the weighted
 * group totals. */
export function weightScaleFactor(
  key: CvScoringCriterionBreakdown['key'],
  weights: ScoringWeights,
): number {
  const reference = REFERENCE_WEIGHTS[weightKey(key)];
  if (reference <= 0) return 0;
  return weights[weightKey(key)] / reference;
}

export function weightKey(key: CvScoringCriterionBreakdown['key']): keyof ScoringWeights {
  return key === 'skills'
    ? 'skills'
    : key === 'experience'
      ? 'experience'
      : key === 'projects'
        ? 'projects'
        : 'education';
}

/** Reads a persisted `scoringWeights` snapshot, falling back to the reference
 * rubric for rows written before weights were configurable. */
export function readScoringWeights(value: Prisma.JsonValue | null | undefined): ScoringWeights {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return REFERENCE_WEIGHTS;
  }

  const record = value as Record<string, unknown>;
  const weights: ScoringWeights = {
    skills: readNumber(record.skills, REFERENCE_WEIGHTS.skills),
    experience: readNumber(record.experience, REFERENCE_WEIGHTS.experience),
    projects: readNumber(record.projects, REFERENCE_WEIGHTS.projects),
    education: readNumber(record.education, REFERENCE_WEIGHTS.education),
  };
  return weights;
}

/** Reads a persisted run `configSnapshot` back into a resolved config,
 * tolerating rows created before the snapshot column existed. */
export function readConfigSnapshot(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  return {
    weights: readScoringWeights((record.weights ?? null)),
    weightPreset: typeof record.weightPreset === 'string' ? record.weightPreset : null,
    mustHaveCriteria: readCriteria(record.mustHaveCriteria as Prisma.JsonValue) ?? [],
    niceToHaveCriteria: readCriteria(record.niceToHaveCriteria as Prisma.JsonValue) ?? [],
    customPrompt: typeof record.customPrompt === 'string' ? record.customPrompt : null,
    passingScore: typeof record.passingScore === 'number' ? record.passingScore : null,
    defaultTopN: typeof record.defaultTopN === 'number' ? record.defaultTopN : null,
  } satisfies ResolvedScreeningConfig;
}

/** Normalizes a recruiter-entered criteria list: trims, drops blanks,
 * de-duplicates case-insensitively and caps both count and length. */
export function normalizeCriteriaInput(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim().slice(0, MAX_CRITERION_LENGTH);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= MAX_CRITERIA_ITEMS) break;
  }

  return result;
}

function weightGroup(
  breakdown: CvScoringCriterionBreakdown[],
  key: CvScoringCriterionBreakdown['key'],
  weight: number,
): number {
  const group = breakdown.find((item) => item.key === key);
  const awarded = group?.items.reduce((total, item) => total + (item.awardedScore ?? 0), 0) ?? 0;
  return roundScore(ratio(awarded, referenceMaxScore(key)) * weight);
}

function ratio(awarded: number, referenceMax: number): number {
  if (referenceMax <= 0) return 0;
  return Math.min(1, Math.max(0, awarded / referenceMax));
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function readWeights(row: ScreeningConfigRow | null | undefined): ScoringWeights | null {
  if (!row) return null;
  const { weightSkills, weightExperience, weightProjects, weightEducation } = row;
  if (
    typeof weightSkills !== 'number' ||
    typeof weightExperience !== 'number' ||
    typeof weightProjects !== 'number' ||
    typeof weightEducation !== 'number'
  ) {
    return null;
  }

  return {
    skills: weightSkills,
    experience: weightExperience,
    projects: weightProjects,
    education: weightEducation,
  };
}

/** null = not set at this level (inherit); [] = deliberately cleared here. */
function readCriteria(value: Prisma.JsonValue | null | undefined): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function firstDefined<T>(...values: Array<T | null | undefined>): T | null {
  for (const value of values) {
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return null;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
