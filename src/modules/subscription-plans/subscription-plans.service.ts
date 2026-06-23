import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto'
import { UpdateSubscriptionPlanDto } from './dto/update-subscription-plan.dto'
import { Prisma } from "@prisma/client";
@Injectable()
export class SubscriptionPlansService {
    constructor(private readonly prisma: PrismaService) {

    }
    async create(adminId: string, dto: CreateSubscriptionPlanDto) {
        const existing = await this.prisma.subscriptionPlan.findFirst({
            where: {
                subscriptionName: dto.subscriptionName
            }
        });
        if (existing) {
            throw new ConflictException('Subscription plan name already exists')
        }
        return this.prisma.subscriptionPlan.create(
            {
                data: {
                    ...dto,
                    price: new Prisma.Decimal(dto.price),
                    createdByAdminId: adminId,
                }
            }
        )
    }
    async findAll() {
        return this.prisma.subscriptionPlan.findMany({
            orderBy: { createdAt: 'desc' },
        });
    }
    async findOne(id: string) {
        const plan = await this.prisma.subscriptionPlan.findUnique({
            where: { id },
        });
        if (!plan) {
            throw new NotFoundException(`Subscription plan with ID ${id} not found`);
        }
        return plan;
    }
    async update(id: string, dto: UpdateSubscriptionPlanDto) {
        await this.findOne(id); // Kiểm tra xem gói có tồn tại không
        const updateData: Prisma.SubscriptionPlanUpdateInput = {
            ...dto,
            ...(dto.price ? { price: new Prisma.Decimal(dto.price) } : {}),
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