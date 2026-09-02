import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { AdminPermissions } from '../../common/decorators/admin-permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AllowWhenRestricted } from '../../common/decorators/allow-when-restricted.decorator';
import { AdminPermissionsGuard } from '../auth/guards/admin-permissions.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RestrictedModeGuard } from '../auth/guards/restricted-mode.guard';
import { UserThrottlerGuard } from '../../common/guards/user-throttler.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { documentUploadOptions, imageUploadOptions } from '../../common/upload/multer-options';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { ListCompaniesQueryDto } from './dto/list-companies-query.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { GenerateCompanyLetterTemplateDto } from './dto/generate-company-letter-template.dto';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { VerifyCompanyDto } from './dto/verify-company.dto';
import { BanCompanyFraudDto } from './dto/ban-company-fraud.dto';
import { CreateJobLocationDto } from '../job-locations/dto/create-job-location.dto';
import { UpdateJobLocationDto } from '../job-locations/dto/update-job-location.dto';
import {
  Company,
  CompanyDetail,
  CompanyFileUploadResponse,
  CompanyJob,
  CompanyList,
  CompanyUpdateResponse,
} from './entities/company.entity';

type CompanyUploadFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

@ApiTags('Companies')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post(':id/letter-templates/generate')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Tạo mẫu thư tuyển dụng bằng AI từ hồ sơ công ty' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, UserThrottlerGuard)
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  generateLetterTemplate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: GenerateCompanyLetterTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.generateLetterTemplate(id, dto.type, user);
  }

  /**
   * Tạo mới một công ty với thông tin cơ bản.
   * @param createCompanyDto Dữ liệu chứa thông tin công ty cần tạo
   * @returns Thông tin công ty vừa được tạo thành công
   */
  @ApiOperation({
    summary: 'Tạo công ty',
    description: 'Tạo mới một công ty với thông tin cơ bản.',
  })
  @ApiCreatedResponse({
    description: 'Đã tạo công ty thành công.',
    type: Company,
  })
  @ApiBadRequestResponse({ description: 'Payload không hợp lệ' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @Post()
  create(@Body() createCompanyDto: CreateCompanyDto, @CurrentUser() user: AuthenticatedUser) {
    return this.companiesService.create(createCompanyDto, user);
  }

  /**
   * Lấy danh sách công ty, có hỗ trợ tìm kiếm, filter và pagination.
   * @param query Các tham số query dùng để tìm kiếm, phân trang (page, limit, keyword...)
   * @returns Danh sách các công ty thỏa mãn điều kiện tìm kiếm kèm metadata phân trang
   */
  @ApiOperation({
    summary: 'Lấy danh sách công ty (ADMIN)',
    description: 'Lấy danh sách công ty, có hỗ trợ tìm kiếm, filter và pagination.',
  })
  @ApiOkResponse({
    description: 'Lấy danh sách công ty thành công.',
    type: CompanyList,
  })
  @Get()
  findAll(@Query() query: ListCompaniesQueryDto) {
    return this.companiesService.findAll(query);
  }

  /**
   * Lấy chi tiết hồ sơ công ty kèm recruiter, member và job gần đây.
   * @param id ID (UUID) của công ty cần lấy chi tiết
   * @returns Toàn bộ thông tin chi tiết về công ty, bao gồm cả recruiter và jobs liên quan
   */
  @ApiOperation({
    summary: 'Chi tiết công ty',
    description: 'Lấy chi tiết hồ sơ công ty kèm recruiter, member và job gần đây.',
  })
  @ApiParam({ name: 'idOrSlug', description: 'Company UUID or string slug' })
  @ApiOkResponse({
    description: 'Lấy chi tiết công ty thành công.',
    type: CompanyDetail,
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy công ty' })
  @Get(':idOrSlug')
  findOne(@Param('idOrSlug') idOrSlug: string) {
    return this.companiesService.findOne(idOrSlug);
  }

  /**
   * Lấy danh sách job (công việc) đang thuộc một công ty.
   * @param id ID (UUID) của công ty cần lấy danh sách job
   * @returns Danh sách các công việc do công ty đó đăng tuyển
   */
  @ApiOperation({
    summary: 'Danh sách việc làm của công ty',
    description: 'Lấy danh sách job đang thuộc một công ty.',
  })
  @ApiParam({ name: 'id', description: 'Company UUID' })
  @ApiOkResponse({
    description: 'Lấy danh sách công việc thành công.',
    type: [CompanyJob],
  })
  @ApiNotFoundResponse({ description: 'Không tìm thấy công ty' })
  @Get(':id/jobs')
  findJobs(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.companiesService.findJobs(id);
  }

  /**
   * Cập nhật thông tin công ty theo company id.
   * @param id ID (UUID) của công ty cần cập nhật
   * @param updateCompanyDto Các trường dữ liệu công ty cần thay đổi
   * @returns Dữ liệu của công ty sau khi đã được cập nhật thành công
   */
  @ApiOperation({
    summary: 'Cập nhật công ty',
    description: 'Cập nhật thông tin công ty theo company id.',
  })
  @ApiParam({ name: 'id', description: 'Company UUID' })
  @ApiOkResponse({
    description: 'Cập nhật công ty thành công.',
    type: CompanyUpdateResponse,
  })
  @ApiBadRequestResponse({ description: 'Payload không hợp lệ' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy công ty' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateCompanyDto: UpdateCompanyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.update(id, updateCompanyDto, user);
  }

  /**
   * Upload logo cho công ty.
   * @param id ID (UUID) của công ty cần đổi logo
   * @param file File ảnh được upload lên (định dạng ảnh, dung lượng hợp lệ...)
   * @returns Trả về kết quả upload, thường là URL của logo sau khi lưu thành công
   */
  @ApiOperation({
    summary: 'Tải lên logo công ty',
    description: 'Upload logo công ty.',
  })
  @ApiParam({ name: 'id', description: 'Company UUID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiOkResponse({
    description: 'Upload logo công ty thành công.',
    type: CompanyFileUploadResponse,
  })
  @ApiBadRequestResponse({ description: 'File không được để trống hoặc ID không hợp lệ' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy công ty' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @Post(':id/logo')
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  uploadLogo(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: CompanyUploadFile,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.uploadLogo(id, file, user);
  }

  /**
   * Upload ảnh bìa (cover) cho công ty.
   * @param id ID (UUID) của công ty cần đổi ảnh bìa
   * @param file File ảnh bìa được upload lên
   * @returns Trả về kết quả upload, chứa thông tin hoặc URL của ảnh bìa
   */
  @ApiOperation({
    summary: 'Tải lên ảnh bìa công ty',
    description: 'Upload ảnh bìa công ty.',
  })
  @ApiParam({ name: 'id', description: 'Company UUID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiOkResponse({
    description: 'Upload ảnh bìa công ty thành công.',
    type: CompanyFileUploadResponse,
  })
  @ApiBadRequestResponse({ description: 'File không được để trống hoặc ID không hợp lệ' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy công ty' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @Post(':id/cover')
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  uploadCover(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: CompanyUploadFile,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.uploadCover(id, file, user);
  }

  /**
   * Tải lên ảnh công ty (gallery).
   * @param id ID (UUID) của công ty
   * @param file File ảnh được upload lên
   */
  @ApiOperation({
    summary: 'Tải lên ảnh hoạt động/văn phòng công ty',
    description: 'Upload ảnh hoạt động hoặc văn phòng công ty.',
  })
  @ApiParam({ name: 'id', description: 'Company UUID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiOkResponse({
    description: 'Upload ảnh công ty thành công.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @Post(':id/photos')
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  uploadPhoto(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: CompanyUploadFile,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.uploadPhoto(id, file, user);
  }

  /**
   * Xóa ảnh công ty theo photo id.
   * @param id ID (UUID) của công ty
   * @param photoId ID (UUID) của ảnh cần xóa
   */
  @ApiOperation({
    summary: 'Xóa ảnh công ty',
    description: 'Xóa ảnh công ty theo photo id.',
  })
  @ApiParam({ name: 'id', description: 'Company UUID' })
  @ApiParam({ name: 'photoId', description: 'Photo UUID' })
  @ApiOkResponse({
    description: 'Xóa ảnh công ty thành công.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @Delete(':id/photos/:photoId')
  deletePhoto(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('photoId', new ParseUUIDPipe()) photoId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.deletePhoto(id, photoId, user);
  }

  /**
   * Xóa một công ty theo company id (Xóa vĩnh viễn hoặc soft delete tùy logic service).
   * @param id ID (UUID) của công ty cần xóa
   */
  @ApiOperation({
    summary: 'Xóa công ty',
    description: 'Xóa một công ty theo company id.',
  })
  @ApiParam({ name: 'id', description: 'Company UUID' })
  @ApiNoContentResponse({ description: 'Đã xóa công ty thành công.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy công ty' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.companiesService.remove(id, user);
  }

  /**
   * Tải lên giấy đăng ký kinh doanh của công ty (Recruiter / Admin).
   * @param id ID (UUID) của công ty
   * @param file File giấy phép đăng ký kinh doanh
   * @param user Thông tin user đang đăng nhập
   */
  @ApiOperation({
    summary: 'Tải lên giấy đăng ký kinh doanh',
    description:
      'Tải lên giấy phép kinh doanh của công ty. Chỉ cho phép Recruiter thuộc công ty đó hoặc Admin.',
  })
  @ApiParam({ name: 'id', description: 'Company UUID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiOkResponse({
    description: 'Tải lên giấy phép đăng ký kinh doanh thành công.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @Post(':id/business-license')
  @UseInterceptors(FileInterceptor('file', documentUploadOptions))
  uploadBusinessLicense(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: CompanyUploadFile,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.uploadBusinessLicense(id, file, user);
  }

  /**
   * Quét giấy phép kinh doanh bằng AI (Gemini).
   * @param id ID (UUID) của công ty
   * @param file File giấy phép kinh doanh
   * @param user Thông tin user đang đăng nhập
   */
  @ApiOperation({
    summary: 'Quét giấy phép kinh doanh bằng AI',
    description: 'Trích xuất thông tin doanh nghiệp từ giấy phép kinh doanh thông qua Gemini AI.',
  })
  @ApiParam({ name: 'id', description: 'Company UUID' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiOkResponse({
    description: 'Trích xuất thông tin thành công.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, UserThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @Post(':id/scan-license')
  @UseInterceptors(FileInterceptor('file', documentUploadOptions))
  scanBusinessLicense(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: CompanyUploadFile,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.scanBusinessLicense(id, file, user);
  }

  /**
   * Quét giấy phép kinh doanh bằng AI (Gemini) trước khi công ty được tạo (onboarding).
   * @param file File giấy phép kinh doanh
   */
  @ApiOperation({
    summary: 'Quét giấy phép kinh doanh bằng AI (chưa có công ty)',
    description:
      'Trích xuất thông tin doanh nghiệp từ giấy phép kinh doanh, dùng để autofill onboarding trước khi công ty được tạo. Không đọc/ghi dữ liệu công ty nào.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @ApiOkResponse({
    description: 'Trích xuất thông tin thành công.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, UserThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @Post('scan-license')
  @UseInterceptors(FileInterceptor('file', documentUploadOptions))
  scanBusinessLicensePreview(@UploadedFile() file: CompanyUploadFile) {
    return this.companiesService.scanBusinessLicensePreview(file);
  }

  /**
   * Lấy Signed URL để xem giấy phép đăng ký kinh doanh (Recruiter / Admin).
   * @param id ID (UUID) của công ty
   * @param user Thông tin user đang đăng nhập
   */
  @ApiOperation({
    summary: 'Lấy URL xem giấy đăng ký kinh doanh',
    description:
      'Lấy Signed URL có thời hạn để xem giấy phép đăng ký kinh doanh bảo mật. Chỉ cho phép Recruiter thuộc công ty hoặc Admin.',
  })
  @ApiParam({ name: 'id', description: 'Company UUID' })
  @ApiOkResponse({
    description: 'Lấy URL thành công.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @Get(':id/business-license/url')
  getBusinessLicenseUrl(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.getBusinessLicenseUrl(id, user);
  }

  /**
   * Phê duyệt hoặc từ chối yêu cầu xác thực doanh nghiệp (Chỉ Admin).
   * @param id ID (UUID) của công ty cần xác thực
   * @param dto Dữ liệu cập nhật trạng thái xác thực và lý do
   * @param user Thông tin Admin thực hiện
   */
  @ApiOperation({
    summary: 'Xác thực doanh nghiệp (ADMIN)',
    description: 'Phê duyệt hoặc từ chối trạng thái xác thực của công ty. Chỉ dành cho Admin.',
  })
  @ApiParam({ name: 'id', description: 'Company UUID' })
  @ApiOkResponse({
    description: 'Xác thực doanh nghiệp thành công.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, AdminPermissionsGuard)
  @Roles(ActorType.ADMIN)
  @AdminPermissions('companies:verify')
  @Post(':id/verify')
  verifyCompany(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: VerifyCompanyDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.verifyCompany(id, dto, user);
  }

  /**
   * Ban vĩnh viễn công ty vì lừa đảo: khoá công ty, ban toàn bộ tài khoản NTD trực thuộc,
   * và đưa MST vào blacklist để chặn đăng ký lại (Chỉ Admin).
   */
  @ApiOperation({
    summary: 'Ban công ty vì lừa đảo (ADMIN)',
    description:
      'Khoá vĩnh viễn công ty, ban toàn bộ tài khoản NTD trực thuộc, và đưa MST vào blacklist.',
  })
  @ApiParam({ name: 'id', description: 'Company UUID' })
  @ApiOkResponse({ description: 'Ban công ty thành công.' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, AdminPermissionsGuard)
  @Roles(ActorType.ADMIN)
  @AdminPermissions('companies:verify')
  @Post(':id/ban-fraud')
  banCompanyForFraud(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: BanCompanyFraudDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.banCompanyForFraud(id, dto.reason, user);
  }

  /**
   * Xem lịch sử biến động điểm uy tín của công ty.
   * @param id ID (UUID) của công ty
   * @param user Thông tin user đang đăng nhập
   */
  @ApiOperation({
    summary: 'Xem lịch sử điểm uy tín',
    description:
      'Lấy danh sách lịch sử thay đổi điểm uy tín của doanh nghiệp. Chỉ cho phép Recruiter thuộc công ty đó hoặc Admin.',
  })
  @ApiParam({ name: 'id', description: 'Company UUID' })
  @ApiOkResponse({
    description: 'Lấy lịch sử thành công.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @AllowWhenRestricted()
  @Get(':id/reputation-activities')
  getReputationActivities(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.getReputationActivities(id, user);
  }

  @ApiOperation({
    summary: 'Lấy danh sách địa điểm của công ty',
  })
  @ApiParam({ name: 'id', description: 'Company UUID' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @Get(':id/locations')
  getLocations(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.getLocations(id, user);
  }

  @ApiOperation({
    summary: 'Thêm địa điểm cho công ty',
  })
  @ApiParam({ name: 'id', description: 'Company UUID' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @Post(':id/locations')
  createLocation(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateJobLocationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.createLocation(id, dto, user);
  }

  @ApiOperation({
    summary: 'Cập nhật địa điểm của công ty',
  })
  @ApiParam({ name: 'id', description: 'Company UUID' })
  @ApiParam({ name: 'locationId', description: 'Location UUID' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @Patch(':id/locations/:locationId')
  updateLocation(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('locationId', new ParseUUIDPipe()) locationId: string,
    @Body() dto: UpdateJobLocationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.updateLocation(id, locationId, dto, user);
  }

  @ApiOperation({
    summary: 'Xóa địa điểm của công ty',
  })
  @ApiParam({ name: 'id', description: 'Company UUID' })
  @ApiParam({ name: 'locationId', description: 'Location UUID' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER, ActorType.ADMIN)
  @HttpCode(204)
  @Delete(':id/locations/:locationId')
  removeLocation(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('locationId', new ParseUUIDPipe()) locationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.removeLocation(id, locationId, user);
  }
}
