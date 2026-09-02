import { BadRequestException } from '@nestjs/common';
import {
  applyWeights,
  assertValidWeights,
  buildPromptFingerprint,
  describeInheritance,
  normalizeCriteriaInput,
  readScoringWeights,
  REFERENCE_WEIGHTS,
  resolveScreeningConfig,
  ScoringWeights,
} from './screening-config.resolver';
import { CvScoringCriterionBreakdown } from './scoring-rubric';

const SENIOR: ScoringWeights = { skills: 20, experience: 50, projects: 25, education: 5 };

/** A candidate who scored exactly half of every AI-scored group. */
function halfMarksBreakdown(): CvScoringCriterionBreakdown[] {
  return [
    { key: 'skills', summary: '', items: [{ ...item('required-skills', 20) }] },
    { key: 'experience', summary: '', items: [{ ...item('relevant-years', 15) }] },
    { key: 'projects', summary: '', items: [{ ...item('project-relevance', 10) }] },
  ];
}

function item(key: string, awardedScore: number) {
  return { key, awardedScore, reason: '', evidence: null };
}

describe('resolveScreeningConfig', () => {
  it('falls back to the reference rubric split when nothing is configured', () => {
    const config = resolveScreeningConfig(null, null);

    expect(config.weights).toEqual(REFERENCE_WEIGHTS);
    expect(config.weights).toEqual({ skills: 40, experience: 30, projects: 20, education: 10 });
    expect(config).toMatchObject({
      mustHaveCriteria: [],
      niceToHaveCriteria: [],
      customPrompt: null,
      passingScore: null,
      defaultTopN: null,
    });
  });

  it('lets a job post override the company defaults field by field', () => {
    const config = resolveScreeningConfig(
      {
        weightSkills: 40,
        weightExperience: 30,
        weightProjects: 20,
        weightEducation: 10,
        mustHaveCriteria: ['Tiếng Anh giao tiếp tốt'],
        customPrompt: 'Ghi chú công ty',
        passingScore: 60,
        defaultTopN: 20,
      },
      { passingScore: 80, customPrompt: 'Ghi chú riêng cho tin này' },
    );

    // Overridden at job level...
    expect(config.passingScore).toBe(80);
    expect(config.customPrompt).toBe('Ghi chú riêng cho tin này');
    // ...everything else still inherited from the company.
    expect(config.weights).toEqual({ skills: 40, experience: 30, projects: 20, education: 10 });
    expect(config.mustHaveCriteria).toEqual(['Tiếng Anh giao tiếp tốt']);
    expect(config.defaultTopN).toBe(20);
  });

  it('treats the four weights as one atomic block, never merging halves', () => {
    const config = resolveScreeningConfig(
      { weightSkills: 40, weightExperience: 30, weightProjects: 20, weightEducation: 10 },
      // A partially-filled job row (e.g. written by an older client) must not
      // combine into a split that no longer totals 100.
      { weightSkills: 20, weightExperience: null, weightProjects: null, weightEducation: null },
    );

    expect(config.weights).toEqual({ skills: 40, experience: 30, projects: 20, education: 10 });
  });

  it('distinguishes "cleared at job level" from "inherit"', () => {
    const company = { mustHaveCriteria: ['Bắt buộc A'], niceToHaveCriteria: ['Ưu tiên B'] };

    expect(resolveScreeningConfig(company, { mustHaveCriteria: [] }).mustHaveCriteria).toEqual([]);
    expect(resolveScreeningConfig(company, {}).mustHaveCriteria).toEqual(['Bắt buộc A']);
  });

  it('reports which fields a job is still inheriting', () => {
    expect(describeInheritance({ passingScore: 80 })).toMatchObject({
      passingScore: false,
      weights: true,
      customPrompt: true,
    });
    expect(describeInheritance(null).weights).toBe(true);
  });
});

describe('assertValidWeights', () => {
  it('accepts a split of multiples of 5 totalling 100', () => {
    expect(() => assertValidWeights(SENIOR)).not.toThrow();
    expect(() =>
      assertValidWeights({ skills: 100, experience: 0, projects: 0, education: 0 }),
    ).not.toThrow();
  });

  it.each([
    { weights: { skills: 40, experience: 30, projects: 20, education: 5 }, label: 'total 95' },
    { weights: { skills: 40, experience: 30, projects: 20, education: 15 }, label: 'total 105' },
    { weights: { skills: 37, experience: 33, projects: 20, education: 10 }, label: 'not step 5' },
    { weights: { skills: 110, experience: 0, projects: 0, education: -10 }, label: 'out of range' },
  ])('rejects $label', ({ weights }) => {
    expect(() => assertValidWeights(weights)).toThrow(BadRequestException);
  });
});

describe('applyWeights', () => {
  it('reproduces the pre-weights numbers exactly under the default split', () => {
    const scores = applyWeights(halfMarksBreakdown(), 10, REFERENCE_WEIGHTS);

    // Half of 40/30/20 plus a full 10 for education -- identical to what the
    // service produced before weights existed, which is why old rows need no
    // backfill.
    expect(scores).toEqual({
      skillScore: 20,
      experienceScore: 15,
      projectScore: 10,
      educationScore: 10,
      finalScore: 55,
    });
  });

  it('re-weights the same AI output for a senior-heavy split', () => {
    const scores = applyWeights(halfMarksBreakdown(), 10, SENIOR);

    expect(scores).toEqual({
      skillScore: 10, // 50% of 20
      experienceScore: 25, // 50% of 50
      projectScore: 12.5, // 50% of 25
      educationScore: 5, // 100% of 5
      finalScore: 52.5,
    });
  });

  it('never exceeds 100 even for a perfect CV', () => {
    const perfect: CvScoringCriterionBreakdown[] = [
      { key: 'skills', summary: '', items: [item('required-skills', 40)] },
      { key: 'experience', summary: '', items: [item('relevant-years', 30)] },
      { key: 'projects', summary: '', items: [item('project-relevance', 20)] },
    ];

    expect(applyWeights(perfect, 10, SENIOR).finalScore).toBe(100);
    expect(applyWeights(perfect, 10, REFERENCE_WEIGHTS).finalScore).toBe(100);
  });

  it('scores a group weighted at 0% as 0 points', () => {
    const noEducation: ScoringWeights = {
      skills: 50,
      experience: 30,
      projects: 20,
      education: 0,
    };

    expect(applyWeights(halfMarksBreakdown(), 10, noEducation).educationScore).toBe(0);
  });
});

describe('buildPromptFingerprint', () => {
  const base = {
    mustHaveCriteria: ['2 năm React'],
    niceToHaveCriteria: [],
    customPrompt: 'Ghi chú',
  };

  it('ignores weight changes, so a re-weight never forces a new AI call', () => {
    expect(buildPromptFingerprint(base, 'v12')).toBe(buildPromptFingerprint({ ...base }, 'v12'));
  });

  it('changes when the criteria or the note change', () => {
    const original = buildPromptFingerprint(base, 'v12');

    expect(buildPromptFingerprint({ ...base, mustHaveCriteria: ['3 năm React'] }, 'v12')).not.toBe(
      original,
    );
    expect(buildPromptFingerprint({ ...base, customPrompt: 'Khác' }, 'v12')).not.toBe(original);
    expect(buildPromptFingerprint(base, 'v13')).not.toBe(original);
  });
});

describe('readScoringWeights', () => {
  it('falls back to the reference split for rows scored before weights existed', () => {
    expect(readScoringWeights(null)).toEqual(REFERENCE_WEIGHTS);
    expect(readScoringWeights('not-an-object')).toEqual(REFERENCE_WEIGHTS);
  });

  it('reads a stored snapshot', () => {
    expect(readScoringWeights(SENIOR as never)).toEqual(SENIOR);
  });
});

describe('normalizeCriteriaInput', () => {
  it('trims, drops blanks, de-duplicates case-insensitively and caps the list', () => {
    const result = normalizeCriteriaInput([
      '  2 năm React  ',
      '2 NĂM REACT',
      '',
      '   ',
      'Tiếng Anh',
    ]);

    expect(result).toEqual(['2 năm React', 'Tiếng Anh']);
  });

  it('caps at 10 items', () => {
    const result = normalizeCriteriaInput(Array.from({ length: 15 }, (_, i) => `Tiêu chí ${i}`));
    expect(result).toHaveLength(10);
  });
});
