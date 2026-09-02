import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuditLogQueryDto } from './dto/admin-audit-log-query.dto';

export type AuditLogParams = {
  adminId?: string | null;
  action: string;
  targetId?: string | null;
  targetType?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
};

const SENSITIVE_KEY_PATTERN = /password|passwordhash|token|refreshtoken|secret|authorization|cookie/i;

function sanitizeValue(val: unknown): unknown {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeValue);
  }
  if (typeof val === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(k)) {
        sanitized[k] = '[REDACTED]';
      } else {
        sanitized[k] = sanitizeValue(v);
      }
    }
    return sanitized;
  }
  if (typeof val === 'bigint') {
    return val.toString();
  }
  return null;
}

@Injectable()
export class AdminAuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: AuditLogParams, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx || this.prisma;
    const sanitizedOld =
      params.oldValue !== undefined
        ? (sanitizeValue(params.oldValue) as Prisma.InputJsonValue)
        : Prisma.JsonNull;
    const sanitizedNew =
      params.newValue !== undefined
        ? (sanitizeValue(params.newValue) as Prisma.InputJsonValue)
        : Prisma.JsonNull;

    try {
      await client.adminAuditLog.create({
        data: {
          adminId: params.adminId || null,
          action: params.action,
          targetId: params.targetId || null,
          targetType: params.targetType || null,
          ipAddress: params.ipAddress || null,
          userAgent: params.userAgent || null,
          requestId: params.requestId || null,
          oldValue: sanitizedOld,
          newValue: sanitizedNew,
        },
      });
    } catch (err) {
      console.warn('Failed to record admin audit log:', err);
    }
  }

  async findAuditLogs(query: AdminAuditLogQueryDto) {
    const {
      page = 1,
      limit = 20,
      search,
      action,
      targetType,
      adminId,
      fromDate,
      toDate,
      sortOrder = 'desc',
    } = query;

    const where: Prisma.AdminAuditLogWhereInput = {};

    if (search?.trim()) {
      const s = search.trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
      where.OR = [
        { action: { contains: s, mode: 'insensitive' } },
        { targetType: { contains: s, mode: 'insensitive' } },
        { ipAddress: { contains: s, mode: 'insensitive' } },
        { admin: { fullName: { contains: s, mode: 'insensitive' } } },
        { admin: { email: { contains: s, mode: 'insensitive' } } },
        ...(isUuid ? [{ id: s }, { targetId: s }] : []),
      ];
    }

    if (action?.trim() && action !== 'ALL') {
      where.action = action.trim();
    }

    if (targetType?.trim() && targetType !== 'ALL') {
      where.targetType = targetType.trim();
    }

    if (adminId?.trim()) {
      where.adminId = adminId.trim();
    }

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt.gte = new Date(fromDate);
      }
      if (toDate) {
        const endOfDay = new Date(toDate);
        endOfDay.setHours(23, 59, 59, 999);
        where.createdAt.lte = endOfDay;
      }
    }

    const [total, items] = await Promise.all([
      this.prisma.adminAuditLog.count({ where }),
      this.prisma.adminAuditLog.findMany({
        where,
        take: limit,
        skip: (page - 1) * limit,
        orderBy: { createdAt: sortOrder },
        include: {
          admin: {
            select: {
              id: true,
              email: true,
              fullName: true,
              avatarUrl: true,
              role: {
                select: {
                  id: true,
                  roleName: true,
                  roleCode: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAuditLogStats() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [totalLogs, todayLogs, activeAdminsRaw, topActionsRaw] = await Promise.all([
      this.prisma.adminAuditLog.count(),
      this.prisma.adminAuditLog.count({
        where: { createdAt: { gte: todayStart } },
      }),
      this.prisma.adminAuditLog.findMany({
        where: {
          createdAt: { gte: weekAgo },
          adminId: { not: null },
        },
        distinct: ['adminId'],
        select: { adminId: true },
      }),
      this.prisma.adminAuditLog.groupBy({
        by: ['action'],
        where: { action: { notIn: ['INVOICE_REFUNDED'] } },
        _count: { action: true },
        orderBy: { _count: { action: 'desc' } },
        take: 1,
      }),
    ]);

    return {
      totalLogs,
      todayLogs,
      activeAdmins: activeAdminsRaw.length,
      topAction: topActionsRaw[0]?.action || 'N/A',
    };
  }

  async getAuditLogFilterOptions() {
    const [actionsRaw, targetTypesRaw] = await Promise.all([
      this.prisma.adminAuditLog.findMany({
        where: { action: { notIn: ['INVOICE_REFUNDED'] } },
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
      }),
      this.prisma.adminAuditLog.findMany({
        where: { targetType: { not: null } },
        distinct: ['targetType'],
        select: { targetType: true },
        orderBy: { targetType: 'asc' },
      }),
    ]);

    return {
      actions: actionsRaw.map((a) => a.action),
      targetTypes: targetTypesRaw.map((t) => t.targetType as string),
    };
  }

  async findAuditLogById(id: string) {
    const log = await this.prisma.adminAuditLog.findUnique({
      where: { id },
      include: {
        admin: {
          select: {
            id: true,
            email: true,
            fullName: true,
            avatarUrl: true,
            role: {
              select: {
                id: true,
                roleName: true,
                roleCode: true,
              },
            },
          },
        },
      },
    });

    if (!log) {
      throw new NotFoundException('Không tìm thấy bản ghi nhật ký hệ thống.');
    }

    return log;
  }
}
