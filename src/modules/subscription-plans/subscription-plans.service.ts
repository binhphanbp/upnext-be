import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { SetPlanFeaturesDto } from './dto/set-plan-features.dto';
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto';
import { PlanAudience, Prisma, SubscriptionStatus } from '@prisma/client';
import { SubscriptionFeature } from '../subscriptions/feature-registry';
@Injectable()
export class SubscriptionPlansService {
  constructor(private readonly prisma: PrismaService) {}
  async create(adminId: string, dto: CreateSubscriptionPlanDto) {
    const audience = dto.audience ?? PlanAudience.RECRUITER;

    // Trùng tên chỉ tính TRONG CÙNG audience: "Miễn phí" tồn tại hợp lệ ở cả hai
    // phía bảng giá, và chặn nó là chặn đúng một danh mục hợp lý.
    const sameName = await this.prisma.subscriptionPlan.findFirst({
      where: { subscriptionName: dto.subscriptionName, audience },
    });
    if (sameName) {
      throw new ConflictException({
        code: 'PLAN_NAME_TAKEN',
        message: `Đã có gói tên "${dto.subscriptionName}" cho ${audience}`,
      });
    }

    // `code` có unique constraint ở DB. Kiểm trước để trả lỗi đọc được thay vì để
    // Prisma ném P2002 ra ngoài dưới dạng 500.
    if (dto.code) {
      const sameCode = await this.prisma.subscriptionPlan.findUnique({
        where: { code: dto.code },
      });
      if (sameCode) {
        throw new ConflictException({
          code: 'PLAN_CODE_TAKEN',
          message: `Mã gói "${dto.code}" đã được dùng`,
        });
      }
    }

    return this.prisma.subscriptionPlan.create({
      data: {
        ...dto,
        audience,
        price: new Prisma.Decimal(dto.price),
        createdByAdminId: adminId,
      },
    });
  }
  async findAll() {
    return this.prisma.subscriptionPlan.findMany({
      include: { features: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Plans for the public pricing page. Filters on `isPublic` as well as
   * `status`, so an admin can retire a plan from the pricing page while keeping
   * existing subscribers on it.
   */
  async findPublic(audience: PlanAudience) {
    return this.prisma.subscriptionPlan.findMany({
      where: {
        audience,
        isPublic: true,
        status: SubscriptionStatus.ACTIVE,
      },
      include: { features: true },
      orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }],
    });
  }

  async findOne(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
      include: { features: true },
    });
    if (!plan) {
      throw new NotFoundException(`Subscription plan with ID ${id} not found`);
    }
    return plan;
  }

  /**
   * Replaces a plan's quota definition wholesale. Features omitted from the
   * payload are removed, which is what makes the admin form a simple full-state
   * save rather than a diff.
   */
  async setFeatures(id: string, dto: SetPlanFeaturesDto) {
    await this.findOne(id);

    const seen = new Set<SubscriptionFeature>();
    for (const feature of dto.features) {
      if (seen.has(feature.feature)) {
        throw new ConflictException(`Duplicate feature in payload: ${feature.feature}`);
      }
      seen.add(feature.feature);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.planFeature.deleteMany({
        where: { planId: id, feature: { notIn: [...seen] } },
      });

      for (const feature of dto.features) {
        await tx.planFeature.upsert({
          where: { planId_feature: { planId: id, feature: feature.feature } },
          update: {
            enabled: feature.enabled ?? true,
            limitValue: feature.limitValue ?? null,
          },
          create: {
            planId: id,
            feature: feature.feature,
            enabled: feature.enabled ?? true,
            limitValue: feature.limitValue ?? null,
          },
        });
      }

      return tx.subscriptionPlan.findUniqueOrThrow({
        where: { id },
        include: { features: true },
      });
    });
  }
  async update(id: string, dto: UpdateSubscriptionPlanDto) {
    await this.findOne(id); // Kiểm tra xem gói có tồn tại không
    const updateData: Prisma.SubscriptionPlanUpdateInput = {
      ...dto,
      // `dto.price !== undefined`, KHÔNG phải `dto.price ?`: giá 0 là falsy, nên cách
      // viết cũ âm thầm bỏ qua mọi lần hạ một gói về miễn phí.
      ...(dto.price !== undefined ? { price: new Prisma.Decimal(dto.price) } : {}),
    };
    return this.prisma.subscriptionPlan.update({
      where: { id },
      data: updateData,
    });
  }
  async remove(id: string) {
    await this.findOne(id); // Kiểm tra xem gói có tồn tại không
    await this.prisma.subscriptionPlan.delete({
      where: { id },
    });
  }
}
