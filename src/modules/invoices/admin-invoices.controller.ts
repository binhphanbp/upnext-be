import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminPermissions } from '../../common/decorators/admin-permissions.decorator';
import { AdminPermissionsGuard } from '../auth/guards/admin-permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminInvoiceQueryDto } from './dto/admin-invoice-query.dto';
import { CancelInvoiceDto } from './dto/cancel-invoice.dto';
import { ManualConfirmInvoiceDto } from './dto/manual-confirm-invoice.dto';
import { RefundInvoiceDto } from './dto/refund-invoice.dto';
import { InvoicesService } from './invoices.service';

@ApiTags('Admin - Invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminPermissionsGuard)
@AdminPermissions('billing:invoices')
@Controller('admin/invoices')
export class AdminInvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @ApiOperation({ summary: 'Thống kê tổng quan KPI hóa đơn & doanh thu' })
  @Get('stats')
  getStats() {
    return this.invoicesService.getAdminInvoiceStats();
  }

  @ApiOperation({ summary: 'Lấy danh sách hóa đơn phân trang và lọc cho Admin' })
  @Get()
  findAll(@Query() query: AdminInvoiceQueryDto) {
    return this.invoicesService.findAdminInvoices(query);
  }

  @ApiOperation({ summary: 'Xem chi tiết hóa đơn (kèm thông tin công ty & gói dịch vụ)' })
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoicesService.findAdminInvoiceDetail(id);
  }

  @ApiOperation({ summary: 'Xác nhận thanh toán thủ công (Đối soát ngân hàng)' })
  @Post(':id/manual-confirm')
  manualConfirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ManualConfirmInvoiceDto,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.invoicesService.manualConfirmInvoice(id, dto, admin, ip, userAgent);
  }

  @ApiOperation({ summary: 'Hủy hóa đơn chờ thanh toán (PENDING)' })
  @Post(':id/cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelInvoiceDto,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.invoicesService.cancelInvoice(id, dto, admin, ip, userAgent);
  }

  @ApiOperation({ summary: 'Hoàn tiền hóa đơn (PAID)' })
  @Post(':id/refund')
  refund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefundInvoiceDto,
    @CurrentUser() admin: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.invoicesService.refundInvoice(id, dto, admin, ip, userAgent);
  }
}
