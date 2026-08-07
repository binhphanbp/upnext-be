import { EducationLevel } from '@prisma/client';

export const EDUCATION_RANK: Readonly<Record<EducationLevel, number | null>> = {
  ANY: null,
  HIGH_SCHOOL: 1,
  VOCATIONAL: 2,
  COLLEGE: 3,
  BACHELOR: 4,
  POSTGRADUATE: 5,
};

const EDUCATION_LABEL: Readonly<Record<EducationLevel, string>> = {
  ANY: 'Không yêu cầu',
  HIGH_SCHOOL: 'THPT',
  VOCATIONAL: 'Trung cấp',
  COLLEGE: 'Cao đẳng',
  BACHELOR: 'Đại học',
  POSTGRADUATE: 'Sau đại học',
};

const EDUCATION_PATTERNS: ReadonlyArray<{
  level: EducationLevel;
  patterns: readonly RegExp[];
}> = [
  {
    level: EducationLevel.POSTGRADUATE,
    patterns: [
      /\btien si\b/i,
      /\bdoctor(?:ate|al)?\b/i,
      /\bph\.?\s?d\b/i,
      /\bthac si\b/i,
      /\bmaster(?:'s)?\b/i,
      /\bmba\b/i,
      /\bsau dai hoc\b/i,
      /\bpostgraduate\b/i,
    ],
  },
  {
    level: EducationLevel.BACHELOR,
    patterns: [
      /\bdai hoc\b/i,
      /\bcu nhan\b/i,
      /\bbachelor(?:'s)?\b/i,
      /\bengineer(?:ing)? degree\b/i,
      // "Kỹ sư" alone is a job title far more often than a degree in
      // Vietnamese CVs ("Kỹ sư phần mềm"), so it only counts as a degree when
      // paired with an explicit qualification word.
      /\b(?:bang|van bang|tot nghiep|hoc vi)\b[^.\n]{0,40}\bky su\b/i,
      /\bky su\b[^.\n]{0,40}\b(?:dai hoc|bach khoa)\b/i,
    ],
  },
  {
    level: EducationLevel.COLLEGE,
    patterns: [/\bcao dang\b/i, /\bassociate(?:'s)? degree\b/i],
  },
  {
    level: EducationLevel.VOCATIONAL,
    patterns: [/\btrung cap\b/i, /\bvocational\b/i, /\btechnical diploma\b/i],
  },
  {
    level: EducationLevel.HIGH_SCHOOL,
    patterns: [
      /\bthpt\b/i,
      /\btrung hoc pho thong\b/i,
      /\bhigh school\b/i,
      /\bsecondary school\b/i,
    ],
  },
];

export type EducationMatchScoreResult = {
  score: number;
  candidateLevel: EducationLevel | null;
  requiredLevel: EducationLevel | null;
  difference: number | null;
  reason: string;
};

export type EducationEvidenceInput = {
  text: string | null | undefined;
  evidence?: string | null;
};

export type ExtractedEducationLevel = {
  level: EducationLevel;
  evidence: string;
};

export function calculateEducationMatchScore(
  candidateEducationLevel: unknown,
  requiredEducationLevel: unknown,
): EducationMatchScoreResult {
  const candidateLevel = normalizeEducationLevel(candidateEducationLevel);
  const requiredLevel = normalizeEducationLevel(requiredEducationLevel);

  if (!requiredLevel) {
    return {
      score: 10,
      candidateLevel,
      requiredLevel: null,
      difference: null,
      reason: 'Tin tuyển dụng không yêu cầu trình độ học vấn.',
    };
  }

  if (!candidateLevel) {
    return {
      score: 0,
      candidateLevel: null,
      requiredLevel,
      difference: null,
      reason: 'Không tìm thấy thông tin học vấn trong hồ sơ ứng viên.',
    };
  }

  const candidateRank = EDUCATION_RANK[candidateLevel];
  const requiredRank = EDUCATION_RANK[requiredLevel];

  if (candidateRank === null || requiredRank === null) {
    return {
      score: 0,
      candidateLevel: null,
      requiredLevel,
      difference: null,
      reason: 'Không thể chuẩn hóa thông tin học vấn trong hồ sơ ứng viên.',
    };
  }

  const difference = requiredRank - candidateRank;
  const requirement = `Tin tuyển dụng yêu cầu ${getEducationLevelLabel(requiredLevel)}.`;
  const candidate = `Ứng viên có trình độ ${getEducationLevelLabel(candidateLevel)}`;

  if (difference <= 0) {
    return {
      score: 10,
      candidateLevel,
      requiredLevel,
      difference,
      reason: `${requirement} ${candidate}, đáp ứng hoặc cao hơn yêu cầu học vấn.`,
    };
  }

  const score = difference === 1 ? 7 : difference === 2 ? 4 : 1;
  return {
    score,
    candidateLevel,
    requiredLevel,
    difference,
    reason: `${requirement} ${candidate}, thấp hơn yêu cầu ${difference} bậc.`,
  };
}

export function normalizeEducationLevel(value: unknown): EducationLevel | null {
  if (typeof value !== 'string') {
    return null;
  }

  if (value === EducationLevel.ANY) {
    return null;
  }

  return Object.values(EducationLevel).includes(value as EducationLevel)
    ? (value as EducationLevel)
    : null;
}

export function getEducationLevelLabel(level: EducationLevel | null) {
  return level ? EDUCATION_LABEL[level] : 'Không xác định';
}

export function extractHighestEducationLevel(
  inputs: readonly EducationEvidenceInput[],
): ExtractedEducationLevel | null {
  let best: ExtractedEducationLevel | null = null;

  for (const input of inputs) {
    const text = input.text?.trim();
    if (!text) {
      continue;
    }

    const detected = detectEducationLevel(text);
    if (!detected) {
      continue;
    }

    const currentRank = best ? EDUCATION_RANK[best.level] : null;
    const detectedRank = EDUCATION_RANK[detected.level];
    if (detectedRank !== null && (currentRank === null || detectedRank > currentRank)) {
      best = {
        level: detected.level,
        evidence: input.evidence?.trim() || buildTextEvidence(text, detected.matchIndex),
      };
    }
  }

  return best;
}

function detectEducationLevel(text: string): { level: EducationLevel; matchIndex: number } | null {
  const normalized = normalizeSearchText(text);

  for (const definition of EDUCATION_PATTERNS) {
    for (const pattern of definition.patterns) {
      const match = pattern.exec(normalized);
      if (match) {
        return { level: definition.level, matchIndex: match.index };
      }
    }
  }

  return null;
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gi, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildTextEvidence(text: string, normalizedMatchIndex: number) {
  const compact = text.replace(/\s+/g, ' ').trim();
  const start = Math.max(0, normalizedMatchIndex - 60);
  const end = Math.min(compact.length, normalizedMatchIndex + 120);
  const excerpt = compact.slice(start, end).trim();
  return `CV ghi nhận: ${start > 0 ? '…' : ''}${excerpt}${end < compact.length ? '…' : ''}`;
}
