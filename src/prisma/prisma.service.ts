import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(configService: ConfigService) {
    const connectionString = configService.getOrThrow<string>('databaseUrl');
    const adapter = new PrismaPg({ connectionString });
    super({
      adapter,
      // Defense in depth: password hashes are opt-in through an explicit select.
      omit: {
        candidateAccount: { passwordHash: true },
        recruiterAccount: { passwordHash: true },
        adminUser: { passwordHash: true },
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
