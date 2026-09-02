import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(configService: ConfigService) {
    const backendUrl = configService.get<string>('appBackendUrl') || 'http://localhost:3001';
    const callbackURL = `${backendUrl}/api/v1/candidate/auth/google/callback`;

    super({
      clientID: configService.get<string>('googleClientId') || 'dummy-google-client-id',
      clientSecret: configService.get<string>('googleClientSecret') || 'dummy-google-client-secret',
      callbackURL,
      scope: ['email', 'profile'],
    });

    if (/localhost|127\.0\.0\.1/i.test(backendUrl)) {
      this.logger.warn(
        `Google OAuth callbackURL points to localhost (${callbackURL}). ` +
          'Set APP_BACKEND_URL to your production domain to fix Google login redirects.',
      );
    }
  }
  async validate(accessToken: string, refreshToken: string, profile: Profile) {
    const { id, name, emails } = profile;

    return {
      providerUserId: id,
      email: emails?.[0]?.value,
      fullName: name
        ? `${name.familyName || ''} ${name.givenName || ''}`.trim()
        : profile.displayName,
    };
  }
}
