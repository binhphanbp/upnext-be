export const VIETNAMESE_PHONE_PATTERN = /^(?:\+?84|0)[235789]\d{8,9}$/u;

export function normalizeVietnamesePhoneNumber(value: string) {
  return value.trim().replace(/[\s().-]/gu, '');
}

export function isValidVietnamesePhoneNumber(value: string | null | undefined) {
  return (
    typeof value === 'string' &&
    VIETNAMESE_PHONE_PATTERN.test(normalizeVietnamesePhoneNumber(value))
  );
}
