import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';

@Injectable()
export class RecruiterGoogleStrategy extends PassportStrategy(Strategy, 'google-recruiter') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.get<string>('googleClientId') || 'dummy-google-client-id',
      clientSecret: configService.get<string>('googleClientSecret') || 'dummy-google-client-secret',
      callbackURL: `${configService.get<string>('appBackendUrl') || 'http://localhost:3001'}/api/v1/recruiter/auth/google/callback`,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
  ) {
    const { id, name, emails } = profile;

    const user = {
      providerUserId: id,
      email: emails?.[0]?.value,
      fullName: name
        ? `${name.familyName || ''} ${name.givenName || ''}`.trim()
        : profile.displayName,
    };

    // PassportStrategy invokes Passport's `done` callback using this return
    // value. Calling `done` here as well invokes it a second time with the
    // undefined async return value, which discards the Google profile.
    return user;
  }
}
