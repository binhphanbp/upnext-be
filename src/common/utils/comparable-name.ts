const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Collapses a catalog name to the key used for duplicate detection.
 *
 * Case, diacritics and separators are noise here: "ReactJS", "React JS" and "react.js" all name the
 * same skill, and letting each one in is how a catalog turns into a landfill. `+` and `#` survive on
 * purpose — dropping them would merge C, C++ and C# into one entry.
 */
export function toComparableName(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/[đ]/g, 'd')
    .replace(/[^a-z0-9+#]+/g, '');
}
