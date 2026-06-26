import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ActorType, RoleStatus } from '@prisma/client';
import { ADMIN_PERMISSIONS_KEY } from '../../../common/decorators/admin-permissions.decorator';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class AdminPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      ADMIN_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no permission is required, let it pass
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Người dùng chưa đăng nhập!');
    }

    // Ensure they are indeed an admin
    if (user.role !== ActorType.ADMIN) {
      throw new ForbiddenException('Bạn không có quyền truy cập chức năng Admin!');
    }

    // If they have no role assigned
    if (!user.adminRoleId) {
      throw new ForbiddenException('Tài khoản admin chưa được gán vai trò!');
    }

    // Retrieve role and associated permissions from DB
    const role = await this.prisma.adminRole.findUnique({
      where: { id: user.adminRoleId },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!role) {
      throw new ForbiddenException('Vai trò của bạn không tồn tại trong hệ thống!');
    }

    // Check if role is active
    if (role.status !== RoleStatus.ACTIVE) {
      throw new ForbiddenException('Vai trò của bạn đã bị vô hiệu hóa!');
    }

    // Bypass permission check for super_admin
    const lowerRoleName = role.roleName.toLowerCase();
    if (lowerRoleName === 'super_admin' || lowerRoleName === 'super admin') {
      return true;
    }

    // Gather permission codes
    const userPermissionCodes = role.rolePermissions.map(
      (rp) => rp.permission.permissionCode,
    );

    // Verify all required permissions are possessed
    const hasAllPermissions = requiredPermissions.every((perm) =>
      userPermissionCodes.includes(perm),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException('Bạn không có quyền thực hiện hành động này!');
    }

    return true;
  }
}
