import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type HealthStatus = {
  status: 'ok' | 'error';
  uptime: number;
  timestamp: string;
  database: 'ok' | 'error';
};

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthStatus> {
    let database: HealthStatus['database'] = 'ok';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'error';
    }

    return {
      status: database === 'ok' ? 'ok' : 'error',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database,
    };
  }
}
