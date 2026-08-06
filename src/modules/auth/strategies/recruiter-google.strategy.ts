import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';

@Injectable()
export class RecruiterGoogleStrategy extends PassportStrategy(Strategy, 'google-recruiter') {
  private readonly logger = new Logger(RecruiterGoogleStrategy.name);

  constructor(configService: ConfigService) {
    const backendUrl =
      configService.get<string>('appBackendUrl') || 'http://localhost:3001';
    const callbackURL = `${backendUrl}/api/v1/recruiter/auth/google/callback`;

    super({
      clientID: configService.get<string>('googleClientId') || 'dummy-google-client-id',
      clientSecret: configService.get<string>('googleClientSecret') || 'dummy-google-client-secret',
      callbackURL,
      scope: ['email', 'profile'],
    });

    if (/localhost|127\.0\.0\.1/i.test(backendUrl)) {
      this.logger.warn(
        `Recruiter Google OAuth callbackURL points to localhost (${callbackURL}). ` +
          'Set APP_BACKEND_URL to your production domain to fix Google login redirects.',
      );
    }
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
