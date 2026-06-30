import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.get<string>('googleClientId') || 'dummy-google-client-id',
      clientSecret: configService.get<string>('googleClientSecret') || 'dummy-google-client-secret',
      callbackURL: `${configService.get<string>('appBackendUrl') || 'http://localhost:3001'}/api/v1/candidate/auth/google/callback`,
      scope: ['email', 'profile'],
    });
  }
  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: (err: any, user: any, info?: any) => void,
  ): Promise<any> {
    const { id, name, emails } = profile;

    const user = {
      providerUserId: id,
      email: emails?.[0]?.value,
      fullName: name
        ? `${name.familyName || ''} ${name.givenName || ''}`.trim()
        : profile.displayName,
    };

    done(null, user);
  }
}
