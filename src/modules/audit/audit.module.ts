import { Global, Module } from '@nestjs/common';
import { DomainAuditService } from './domain-audit.service';

/**
 * `@Global()` theo đúng lý lẽ của `OutboxModule`: audit là quan tâm xuyên suốt
 * mà nhiều module sẽ gọi, và nó không phụ thuộc vào module nào khác ngoài
 * Prisma, nên không có nguy cơ vòng phụ thuộc.
 */
@Global()
@Module({
  providers: [DomainAuditService],
  exports: [DomainAuditService],
})
export class AuditModule {}
