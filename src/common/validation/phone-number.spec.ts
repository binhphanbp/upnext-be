import { isValidPhoneNumber, normalizePhoneNumber } from './phone-number';

describe('phone number validation', () => {
  it.each(['0382 823 609', '+1 415 555 2671', '+44 20 7946 0018', '0044 20 7946 0018'])(
    'accepts %s',
    (value) => {
      expect(isValidPhoneNumber(value)).toBe(true);
    },
  );

  it.each(['0', '03828236', '1234567890', '+999 123 456'])('rejects %s', (value) => {
    expect(isValidPhoneNumber(value)).toBe(false);
  });

  it('stores valid input in E.164 format', () => {
    expect(normalizePhoneNumber('0382 823 609')).toBe('+84382823609');
    expect(normalizePhoneNumber('+1 415 555 2671')).toBe('+14155552671');
  });
});
