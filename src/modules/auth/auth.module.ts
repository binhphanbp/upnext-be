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
  providers: [AuthService, EmailService, JwtStrategy, JwtAuthGuard, RolesGuard,GoogleAuthGuard,GoogleStrategy],
  exports: [AuthService, EmailService, JwtAuthGuard, RolesGuard, JwtModule,GoogleAuthGuard,GoogleStrategy],
})
export class AuthModule {}
