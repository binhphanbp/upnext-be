import { CV_SCORING_RUBRIC } from './scoring-rubric';

describe('CV_SCORING_RUBRIC projects', () => {
  const projects = CV_SCORING_RUBRIC.find((criterion) => criterion.key === 'projects');

  it('keeps the projects group at 20 points with exactly three criteria', () => {
    expect(projects?.maxScore).toBe(20);
    expect(projects?.criteria).toHaveLength(3);
    expect(projects?.criteria.reduce((total, item) => total + item.maxScore, 0)).toBe(20);
  });

  it('defines impact-evidence at 7 points and removes the legacy keys', () => {
    expect(projects?.criteria).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'impact-evidence',
          label: 'Tác động và bằng chứng dự án',
          maxScore: 7,
        }),
      ]),
    );
    const keys = projects?.criteria.map((item): string => item.key) ?? [];
    expect(keys).not.toContain('impact-scale');
    expect(keys).not.toContain('evidence-quality');
  });

  it('keeps the complete scoring rubric at 100 points', () => {
    expect(CV_SCORING_RUBRIC.reduce((total, criterion) => total + criterion.maxScore, 0)).toBe(100);
  });
});
