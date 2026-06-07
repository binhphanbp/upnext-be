import { slugify } from './slugify';

describe('slugify', () => {
  it('normalizes text for URL slugs', () => {
    expect(slugify('Backend NestJS Engineer')).toBe('backend-nestjs-engineer');
    expect(slugify('Lap trinh vien TypeScript')).toBe('lap-trinh-vien-typescript');
  });
});
