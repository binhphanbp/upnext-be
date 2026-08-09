import { isValidInternationalPhoneNumber, normalizeInternationalPhoneNumber } from './phone';

describe('international phone validation', () => {
  it('removes presentation-only separators without inventing a country code', () => {
    expect(normalizeInternationalPhoneNumber('  +44 (20) 7946-0958  ')).toBe('+442079460958');
    expect(normalizeInternationalPhoneNumber('0382 823 609')).toBe('0382823609');
  });

  it.each([
    '0382 823 609',
    '+84 (382) 823-609',
    '+1 202 555 0123',
    '+44 20 7946 0958',
    '2025550123',
  ])('accepts a valid domestic or international contact number: %s', (phoneNumber) => {
    expect(isValidInternationalPhoneNumber(phoneNumber)).toBe(true);
  });

  it.each([undefined, null, '', '0', '038282', '+1 202', '+0123456789', '+1234567890123456'])(
    'rejects an invalid contact number: %s',
    (phoneNumber) => {
      expect(isValidInternationalPhoneNumber(phoneNumber)).toBe(false);
    },
  );
});
