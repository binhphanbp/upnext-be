import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const permissions = [
  {
    name: 'Manage Applications',
    code: 'applications:manage',
    module: 'applications',
    description: 'Can thiệp quản trị vào hồ sơ ứng tuyển khi có phê duyệt.',
  },
  {
    name: 'Manage Interviews',
    code: 'interviews:manage',
    module: 'interviews',
    description: 'Can thiệp quản trị vào lịch phỏng vấn khi có phê duyệt.',
  },
  ...[
    'sales:handle',
    'billing:handle',
    'job_review:handle',
    'company_verification:handle',
    'technical:handle',
    'general:handle',
    'assign',
    'transfer',
    'resolve',
    'close',
    'reopen',
    'view_all',
  ].map((action) => ({
    name: `Support ${action}`,
    code: `support:${action}`,
    module: 'support',
    description: `Support permission: ${action}`,
  })),
];

const permissionsByRoleName: Record<string, string[]> = {
  'Content Moderator': [
    'support:job_review:handle',
    'support:assign',
    'support:resolve',
    'support:close',
    'support:reopen',
  ],
  'Compliance Officer': [
    'support:company_verification:handle',
    'support:assign',
    'support:resolve',
    'support:close',
    'support:reopen',
  ],
  'Finance & Billing': [
    'support:billing:handle',
    'support:assign',
    'support:resolve',
    'support:close',
    'support:reopen',
  ],
  'Support Specialist': [
    'support:sales:handle',
    'support:technical:handle',
    'support:general:handle',
    'support:assign',
    'support:transfer',
    'support:resolve',
    'support:close',
    'support:reopen',
  ],
};

async function main() {
  const permissionIds = new Map<string, string>();
  for (const permission of permissions) {
    const saved = await prisma.adminPermission.upsert({
      where: { permissionCode: permission.code },
      update: {
        permissionName: permission.name,
        module: permission.module,
        description: permission.description,
      },
      create: {
        permissionName: permission.name,
        permissionCode: permission.code,
        module: permission.module,
        description: permission.description,
      },
    });
    permissionIds.set(permission.code, saved.id);
  }

  const superAdmin = await prisma.adminRole.findUnique({ where: { roleName: 'Super Admin' } });
  if (superAdmin) {
    permissionsByRoleName['Super Admin'] = permissions.map((permission) => permission.code);
  }

  let assignmentsCreated = 0;
  for (const [roleName, permissionCodes] of Object.entries(permissionsByRoleName)) {
    const role = await prisma.adminRole.findUnique({ where: { roleName } });
    if (!role) {
      console.warn(`Skipping missing admin role: ${roleName}`);
      continue;
    }

    for (const permissionCode of permissionCodes) {
      const permissionId = permissionIds.get(permissionCode);
      if (!permissionId) throw new Error(`Unknown permission: ${permissionCode}`);
      const existing = await prisma.adminRolePermission.findUnique({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        select: { id: true },
      });
      if (!existing) {
        await prisma.adminRolePermission.create({ data: { roleId: role.id, permissionId } });
        assignmentsCreated += 1;
      }
    }
  }

  console.info(
    JSON.stringify(
      {
        permissionsUpserted: permissions.length,
        roleAssignmentsCreated: assignmentsCreated,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
