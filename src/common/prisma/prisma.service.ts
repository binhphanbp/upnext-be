import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString =
      process.env.DATABASE_URL ?? 'postgresql://upnext:upnext@localhost:5432/upnext?schema=public';

    super({
      adapter: new PrismaPg({ connectionString }),
      // Defense in depth: never return password hashes unless a query explicitly
      // selects them (an explicit `select` overrides these global omits).
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
