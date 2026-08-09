import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateCandidateProfileDto } from './update-candidate-profile.dto';

describe('UpdateCandidateProfileDto', () => {
  it.each([
    ['domestic formatted number', '0382 823 609', '0382823609'],
    ['E.164 international number', '+1 (202) 555-0123', '+12025550123'],
  ])('normalizes and accepts a %s', async (_label, phoneNumber, normalizedPhoneNumber) => {
    const dto = plainToInstance(UpdateCandidateProfileDto, { phoneNumber });

    expect(dto.phoneNumber).toBe(normalizedPhoneNumber);
    await expect(validate(dto)).resolves.toEqual([]);
  });

  it.each(['0', '038282', '+0123456789', '+1234567890123456'])(
    'rejects an invalid phone number: %s',
    async (phoneNumber) => {
      const dto = plainToInstance(UpdateCandidateProfileDto, { phoneNumber });

      const errors = await validate(dto);

      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            property: 'phoneNumber',
            constraints: expect.objectContaining({ matches: expect.any(String) }),
          }),
        ]),
      );
    },
  );

  it('allows a partial profile update without a phone number', async () => {
    await expect(validate(plainToInstance(UpdateCandidateProfileDto, {}))).resolves.toEqual([]);
  });
});
