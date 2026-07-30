import { toComparableName } from './comparable-name';

describe('toComparableName', () => {
  it('treats case, separators and diacritics as noise', () => {
    expect(toComparableName('ReactJS')).toBe('reactjs');
    expect(toComparableName('React JS')).toBe('reactjs');
    expect(toComparableName('  react.js ')).toBe('reactjs');
    expect(toComparableName('Lập trình Web')).toBe('laptrinhweb');
    expect(toComparableName('lap trinh web')).toBe('laptrinhweb');
  });

  it('keeps the characters that distinguish real technologies', () => {
    expect(toComparableName('C')).toBe('c');
    expect(toComparableName('C++')).toBe('c++');
    expect(toComparableName('C#')).toBe('c#');
    expect(new Set(['C', 'C++', 'C#'].map(toComparableName)).size).toBe(3);
  });
});
