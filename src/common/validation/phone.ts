/**
 * A practical, country-neutral contact-number contract shared by candidate
 * profile updates and application submission.
 *
 * We accept E.164-style international numbers (`+` followed by 7–15 digits)
 * and keep domestic / legacy entries valid. The product does not collect a
 * country selector here, so inferring or rewriting a country code would be
 * unsafe. Presentation separators are stripped before the value is stored.
 */
export const INTERNATIONAL_PHONE_PATTERN = /^(?:\+[1-9]\d{6,14}|0\d{6,14}|[1-9]\d{6,14})$/u;

export function normalizeInternationalPhoneNumber(value: string): string {
  return value.trim().replace(/[\s().-]/gu, '');
}

export function isValidInternationalPhoneNumber(phoneNumber: string | null | undefined): boolean {
  return (
    typeof phoneNumber === 'string' &&
    INTERNATIONAL_PHONE_PATTERN.test(normalizeInternationalPhoneNumber(phoneNumber))
  );
}
