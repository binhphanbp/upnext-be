import { EducationLevel } from '@prisma/client';
import { calculateEducationMatchScore, extractHighestEducationLevel } from './education-scoring';

describe('calculateEducationMatchScore', () => {
  it.each([
    [EducationLevel.BACHELOR, EducationLevel.BACHELOR, 10],
    [EducationLevel.COLLEGE, EducationLevel.BACHELOR, 7],
    [EducationLevel.VOCATIONAL, EducationLevel.BACHELOR, 4],
    [EducationLevel.HIGH_SCHOOL, EducationLevel.BACHELOR, 1],
    [null, EducationLevel.BACHELOR, 0],
    [null, EducationLevel.ANY, 10],
    [EducationLevel.BACHELOR, EducationLevel.COLLEGE, 10],
    [EducationLevel.VOCATIONAL, EducationLevel.COLLEGE, 7],
  ])('scores candidate %s against requirement %s as %s', (candidate, required, expected) => {
    expect(calculateEducationMatchScore(candidate, required).score).toBe(expected);
  });

  it.each(['Tiến sĩ Khoa học máy tính', 'Thạc sĩ Công nghệ thông tin'])(
    'maps %s to POSTGRADUATE and awards 10 for a bachelor requirement',
    (degree) => {
      const extracted = extractHighestEducationLevel([{ text: degree }]);
      expect(extracted?.level).toBe(EducationLevel.POSTGRADUATE);
      expect(calculateEducationMatchScore(extracted?.level, EducationLevel.BACHELOR).score).toBe(
        10,
      );
    },
  );

  it('handles an invalid candidate enum without throwing', () => {
    expect(calculateEducationMatchScore('INVALID_LEVEL', EducationLevel.BACHELOR)).toMatchObject({
      score: 0,
      candidateLevel: null,
      requiredLevel: EducationLevel.BACHELOR,
    });
  });

  it('treats a null Gemini extraction as missing candidate education', () => {
    expect(calculateEducationMatchScore(null, EducationLevel.COLLEGE)).toMatchObject({
      score: 0,
      candidateLevel: null,
      difference: null,
    });
  });
});
