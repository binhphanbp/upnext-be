import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { EmailService } from '../../common/email/email.service';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { RecruiterGoogleStrategy } from './strategies/recruiter-google.strategy';
import { RecruiterGoogleAuthGuard } from './guards/recruiter-google-auth.guard';
import { CurrentAuthController } from './current-auth.controller';
import { AdminPermissionsGuard } from './guards/admin-permissions.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { AuthIdentityService } from './services/auth-identity.service';
@Global()
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('jwtAccessSecret'),
        signOptions: {
          expiresIn: configService.getOrThrow<string>(
            'jwtAccessExpiresIn',
          ) as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [CurrentAuthController],
  providers: [
    AuthService,
    AuthIdentityService,
    EmailService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
    AdminPermissionsGuard,
    GoogleAuthGuard,
    GoogleStrategy,
    RecruiterGoogleAuthGuard,
    RecruiterGoogleStrategy,
  ],
  exports: [
    AuthService,
    EmailService,
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
    AdminPermissionsGuard,
    AuthIdentityService,
    JwtModule,
    GoogleAuthGuard,
    GoogleStrategy,
    RecruiterGoogleAuthGuard,
    RecruiterGoogleStrategy,
  ],
})
export class AuthModule {}
