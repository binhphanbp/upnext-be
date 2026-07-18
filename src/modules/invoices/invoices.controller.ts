import { Controller, Get, Post, Param, Body, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { PayInvoiceDto } from './dto/pay-invoice.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ActorType } from '@prisma/client';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AdminPermissions } from '../../common/decorators/admin-permissions.decorator';
import { AdminPermissionsGuard } from '../auth/guards/admin-permissions.guard';

@ApiTags('Invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @ApiOperation({ summary: 'Tạo hóa đơn mới (Cho phép Admin hoặc Recruiter)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.ADMIN, ActorType.RECRUITER)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(user, dto);
  }

  @ApiOperation({ summary: 'Lấy tất cả hóa đơn (Admin thấy hết, Recruiter thấy của công ty)' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.ADMIN, ActorType.RECRUITER)
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.invoicesService.findAll(user);
  }

  @ApiOperation({ summary: 'Xem chi tiết một hóa đơn' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.ADMIN, ActorType.RECRUITER)
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invoicesService.findOne(id, user);
  }

  @ApiOperation({
    summary: 'Xác nhận thanh toán hóa đơn (Kích hoạt dịch vụ)',
    description:
      'Chỉ ADMIN được phép xác nhận hóa đơn đã thanh toán. ' +
      'Không cho phép người dùng tự khai báo đã thanh toán mà không có xác minh từ cổng thanh toán. ' +
      'TODO: thay thế bằng webhook server-to-server (có verify chữ ký) từ cổng thanh toán thực tế.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, AdminPermissionsGuard)
  @Roles(ActorType.ADMIN)
  @AdminPermissions('billing:invoices')
  @Post(':id/pay')
  pay(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PayInvoiceDto,
  ) {
    return this.invoicesService.pay(id, user, dto);
  }
}
