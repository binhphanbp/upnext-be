import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { clampScore } from './reputation.config';

@Injectable()
export class ReputationLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cộng/trừ điểm uy tín công ty (clamp 0-100) và ghi lại vào CompanyReputationActivity.
   * Truyền `tx` khi gọi bên trong 1 $transaction có sẵn để đảm bảo tính nguyên tử.
   */
  async applyDelta(
    tx: Prisma.TransactionClient,
    companyId: string,
    delta: number,
    actionType: string,
    reason?: string,
    byAdminId?: string,
  ) {
    const company = await tx.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { reputationScore: true },
    });

    const newScore = clampScore(Number(company.reputationScore) + delta);

    const updated = await tx.company.update({
      where: { id: companyId },
      data: { reputationScore: new Prisma.Decimal(newScore) },
    });

    await tx.companyReputationActivity.create({
      data: {
        companyId,
        actionType,
        score: new Prisma.Decimal(delta),
        reason,
        byAdminId,
      },
    });

    return updated;
  }
}
