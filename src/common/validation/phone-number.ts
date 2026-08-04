import { parsePhoneNumberFromString } from 'libphonenumber-js/min';
import { registerDecorator, type ValidationOptions } from 'class-validator';

const DEFAULT_PHONE_COUNTRY = 'VN';

function parsePhoneNumber(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const digits = trimmedValue.replace(/[\s().-]/gu, '');
  const internationalInput = digits.startsWith('00')
    ? `+${digits.slice(2)}`
    : digits.startsWith('84')
      ? `+${digits}`
      : trimmedValue;

  if (!internationalInput.startsWith('+') && !internationalInput.startsWith('0')) {
    return null;
  }

  return parsePhoneNumberFromString(
    internationalInput,
    internationalInput.startsWith('+') ? undefined : DEFAULT_PHONE_COUNTRY,
  );
}

export function isValidPhoneNumber(value: string | null | undefined) {
  if (typeof value !== 'string') return false;

  return parsePhoneNumber(value)?.isValid() ?? false;
}

export function normalizePhoneNumber(value: string) {
  const phoneNumber = parsePhoneNumber(value);
  return phoneNumber?.isValid() ? phoneNumber.number : value.trim();
}

export function IsValidPhoneNumber(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isValidPhoneNumber',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isValidPhoneNumber(value),
      },
    });
  };
}
