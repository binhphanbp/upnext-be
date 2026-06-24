import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOkResponse({
    description: 'Application health status.',
    schema: {
      example: {
        status: 'ok',
        uptime: 12.345,
        timestamp: '2026-06-25T00:00:00.000Z',
        database: 'ok',
      },
    },
  })
  check() {
    return this.healthService.check();
  }
}
