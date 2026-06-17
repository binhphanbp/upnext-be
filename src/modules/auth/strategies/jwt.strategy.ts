import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { AccountStatus, ActorType, AdminStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtPayload } from '../auth.types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwtAccessSecret'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.findActiveUser(payload);

    if (!user) {
      throw new UnauthorizedException('Invalid token');
    }

    return {
      id: user.id,
      email: user.email,
      role: payload.role,
      companyId: payload.companyId,
      recruiterRoleId: payload.recruiterRoleId,
      adminRoleId: payload.adminRoleId,
    };
  }

  private async findActiveUser(payload: JwtPayload) {
    switch (payload.role) {
      case ActorType.CANDIDATE:
        return this.prisma.candidateAccount.findFirst({
          where: {
            id: payload.sub,
            email: payload.email,
            candidateAccountStatus: AccountStatus.ACTIVE,
          },
          select: { id: true, email: true },
        });
      case ActorType.RECRUITER:
        return this.prisma.recruiterAccount.findFirst({
          where: {
            id: payload.sub,
            email: payload.email,
            status: AccountStatus.ACTIVE,
          },
          select: { id: true, email: true },
        });
      case ActorType.ADMIN:
        return this.prisma.adminUser.findFirst({
          where: {
            id: payload.sub,
            email: payload.email,
            status: AdminStatus.ACTIVE,
          },
          select: { id: true, email: true },
        });
      default:
        return null;
    }
  }
}
