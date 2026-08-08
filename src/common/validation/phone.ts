/**
 * Accept a practical international phone number: 7–15 digits, optional +
 * prefix, and common visual separators. We intentionally do not lock the
 * product to any single national numbering plan.
 */
export function isValidInternationalPhoneNumber(phoneNumber: string | null | undefined): boolean {
  if (!phoneNumber) return false;

  const normalized = phoneNumber.replace(/[\s().-]/gu, '');
  // A local leading zero is kept as well: it is a valid way candidates enter
  // domestic numbers, while `+` remains available for international format.
  return /^(?:\+[1-9]\d{6,14}|0\d{6,14}|[1-9]\d{6,14})$/u.test(normalized);
}
