import { ConfigService } from '@nestjs/config';
import type { Profile } from 'passport-google-oauth20';

import { GoogleStrategy } from './google.strategy';

describe('GoogleStrategy', () => {
  it('returns the candidate profile to Passport exactly once', async () => {
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'googleClientId') return 'google-client-id';
        if (key === 'googleClientSecret') return 'google-client-secret';
        if (key === 'appBackendUrl') return 'http://localhost:3001';
        return undefined;
      }),
    } as unknown as ConfigService;
    const strategy = new GoogleStrategy(configService);
    const profile = {
      id: 'google-user-id',
      displayName: 'Nguyen Van An',
      name: { familyName: 'Nguyen', givenName: 'Van An' },
      emails: [{ value: 'candidate@example.com', verified: true }],
    } as unknown as Profile;

    await expect(strategy.validate('access-token', 'refresh-token', profile)).resolves.toEqual({
      providerUserId: 'google-user-id',
      email: 'candidate@example.com',
      fullName: 'Nguyen Van An',
    });
  });
});
