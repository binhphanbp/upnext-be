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
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { ActorType, JobStatus } from "@prisma/client";
import type { Request } from "express";
import { AuthenticatedUser, CurrentUser } from "../../common/decorators/current-user.decorator";
import { AdminPermissions } from "../../common/decorators/admin-permissions.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { AdminPermissionsGuard } from "../auth/guards/admin-permissions.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { RestrictedModeGuard } from "../auth/guards/restricted-mode.guard";
import { AllowWhenRestricted } from "../../common/decorators/allow-when-restricted.decorator";
import { CreateJobPostDto } from "./dto/create-job-post.dto";
import { ApproveJobPostDto } from "./dto/approve-job-post.dto";
import { RejectJobPostDto } from "./dto/reject-job-post.dto";
import { UpdateJobPostVisibilityDto } from "./dto/update-job-post-visibility.dto";
import {
  AddLocationToJobDto,
  AddSkillToJobDto,
  AddSpecializationToJobDto,
  SetJobLocationsDto,
  SetJobSkillsDto,
  SetJobSpecializationsDto,
} from "./dto/job-post-relations.dto";
import { ListAdminJobPostsQueryDto } from "./dto/list-admin-job-posts-query.dto";
import { UpdateJobPostDto } from "./dto/update-job-post.dto";
import { UpdateJobPostMemberAccessDto } from "./dto/update-job-post-member-access.dto";
import { PublicJobPostQueryDto } from "./dto/public-job-post-query.dto";
import { JobPostsService } from "./job-posts.service";

@ApiTags("Job - Posts")
@Controller("job-posts")
export class JobPostsController {
  constructor(private readonly jobPostsService: JobPostsService) {}

  @ApiOperation({
    summary: "Tạo bản nháp tin tuyển dụng",
    description:
      "Recruiter tạo tin tuyển dụng dạng nháp cho công ty đang gắn với tài khoản của mình.",
  })
  @ApiCreatedResponse({ description: "Tạo bản nháp tin tuyển dụng thành công." })
  @ApiBadRequestResponse({
    description: "Payload không hợp lệ hoặc công ty chưa có giấy phép kinh doanh.",
  })
  @ApiForbiddenResponse({ description: "Chỉ tài khoản recruiter mới có thể tạo tin tuyển dụng." })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER)
  @Post()
  create(@Body() dto: CreateJobPostDto, @CurrentUser() user: AuthenticatedUser) {
    return this.jobPostsService.create(user, dto);
  }

  @ApiOperation({
    summary: "Danh sách tin tuyển dụng đã đăng",
    description: "Lấy danh sách các tin tuyển dụng đang public cho candidate xem.",
  })
  @ApiOkResponse({ description: "Lấy danh sách tin tuyển dụng thành công." })
  @Get()
  findAll(@Query() query: PublicJobPostQueryDto) {
    return this.jobPostsService.findAll(query);
  }

  @ApiOperation({
    summary: "Chi tiết tin tuyển dụng",
    description: "Lấy chi tiết một tin tuyển dụng đã được đăng.",
  })
  @ApiParam({ name: "id", description: "UUID của tin tuyển dụng" })
  @ApiOkResponse({ description: "Lấy chi tiết tin tuyển dụng thành công." })
  @ApiNotFoundResponse({ description: "Không tìm thấy tin tuyển dụng." })
  @Get(":id")
  findOne(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.jobPostsService.findOne(id);
  }

  @ApiOperation({
    summary: "Cập nhật tin tuyển dụng của tôi",
    description: "Recruiter cập nhật tin tuyển dụng do chính mình tạo.",
  })
  @ApiParam({ name: "id", description: "UUID của tin tuyển dụng" })
  @ApiOkResponse({ description: "Cập nhật tin tuyển dụng thành công." })
  @ApiBadRequestResponse({ description: "Payload hoặc UUID không hợp lệ." })
  @ApiForbiddenResponse({ description: "Recruiter không có quyền cập nhật tin tuyển dụng này." })
  @ApiNotFoundResponse({ description: "Không tìm thấy tin tuyển dụng." })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER)
  @Patch(":id")
  update(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateJobPostDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobPostsService.update(id, user.id, dto);
  }

  @ApiOperation({
    summary: "Xóa tin tuyển dụng của tôi",
    description: "Recruiter xóa mềm tin tuyển dụng do chính mình tạo.",
  })
  @ApiParam({ name: "id", description: "UUID của tin tuyển dụng" })
  @ApiNoContentResponse({ description: "Xóa tin tuyển dụng thành công." })
  @ApiForbiddenResponse({ description: "Recruiter không có quyền xóa tin tuyển dụng này." })
  @ApiNotFoundResponse({ description: "Không tìm thấy tin tuyển dụng." })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER)
  @Delete(":id")
  @HttpCode(204)
  async remove(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.jobPostsService.remove(id, user.id);
  }

  @ApiOperation({
    summary: "Đăng tin tuyển dụng",
    description:
      "Chuyển tin tuyển dụng của recruiter sang trạng thái đã đăng. Công ty phải có giấy phép kinh doanh và đã được xác thực.",
  })
  @ApiParam({ name: "id", description: "UUID của tin tuyển dụng" })
  @ApiOkResponse({ description: "Đăng tin tuyển dụng thành công." })
  @ApiBadRequestResponse({ description: "Công ty chưa có giấy phép kinh doanh." })
  @ApiForbiddenResponse({
    description: "Recruiter không có quyền hoặc công ty chưa được xác thực.",
  })
  @ApiNotFoundResponse({ description: "Không tìm thấy tin tuyển dụng." })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER)
  @Patch(":id/publish")
  publish(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.jobPostsService.updateStatus(id, user.id, JobStatus.PUBLISHED);
  }

  @ApiOperation({
    summary: "Đóng tin tuyển dụng",
    description: "Recruiter chuyển tin tuyển dụng của mình sang trạng thái đã đóng.",
  })
  @ApiParam({ name: "id", description: "UUID của tin tuyển dụng" })
  @ApiOkResponse({ description: "Đóng tin tuyển dụng thành công." })
  @ApiForbiddenResponse({ description: "Recruiter không có quyền đóng tin tuyển dụng này." })
  @ApiNotFoundResponse({ description: "Không tìm thấy tin tuyển dụng." })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER)
  @Patch(":id/close")
  close(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.jobPostsService.updateStatus(id, user.id, JobStatus.CLOSED);
  }

  @ApiOperation({
    summary: "Mở lại tin tuyển dụng",
    description: "Recruiter mở lại tin tuyển dụng đã đóng. Công ty phải đủ điều kiện đăng tin.",
  })
  @ApiParam({ name: "id", description: "UUID của tin tuyển dụng" })
  @ApiOkResponse({ description: "Mở lại tin tuyển dụng thành công." })
  @ApiBadRequestResponse({ description: "Công ty chưa có giấy phép kinh doanh." })
  @ApiForbiddenResponse({
    description: "Recruiter không có quyền hoặc công ty chưa được xác thực.",
  })
  @ApiNotFoundResponse({ description: "Không tìm thấy tin tuyển dụng." })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER)
  @Patch(":id/reopen")
  reopen(@Param("id", new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.jobPostsService.updateStatus(id, user.id, JobStatus.PUBLISHED);
  }

  @ApiOperation({
    summary: "Thêm kỹ năng vào tin tuyển dụng",
    description: "Recruiter gắn một kỹ năng vào tin tuyển dụng do chính mình tạo.",
  })
  @ApiParam({ name: "id", description: "UUID của tin tuyển dụng" })
  @ApiCreatedResponse({ description: "Thêm kỹ năng vào tin tuyển dụng thành công." })
  @ApiBadRequestResponse({ description: "Payload hoặc UUID không hợp lệ." })
  @ApiForbiddenResponse({ description: "Recruiter không có quyền cập nhật tin tuyển dụng này." })
  @ApiNotFoundResponse({ description: "Không tìm thấy tin tuyển dụng." })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER)
  @Post(":id/skills")
  addSkill(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: AddSkillToJobDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobPostsService.addSkillToJob(id, user.id, dto);
  }

  @ApiOperation({
    summary: "Xóa kỹ năng khỏi tin tuyển dụng",
    description: "Recruiter gỡ một kỹ năng khỏi tin tuyển dụng do chính mình tạo.",
  })
  @ApiParam({ name: "id", description: "UUID của tin tuyển dụng" })
  @ApiParam({ name: "skillId", description: "UUID của kỹ năng" })
  @ApiNoContentResponse({ description: "Xóa kỹ năng khỏi tin tuyển dụng thành công." })
  @ApiForbiddenResponse({ description: "Recruiter không có quyền cập nhật tin tuyển dụng này." })
  @ApiNotFoundResponse({ description: "Không tìm thấy tin tuyển dụng hoặc kỹ năng liên kết." })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER)
  @Delete(":id/skills/:skillId")
  @HttpCode(204)
  async removeSkill(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("skillId", new ParseUUIDPipe()) skillId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.jobPostsService.removeSkillFromJob(id, skillId, user.id);
  }

  @ApiOperation({
    summary: "Thêm địa điểm làm việc vào tin tuyển dụng",
    description: "Recruiter gắn địa điểm làm việc vào tin tuyển dụng do chính mình tạo.",
  })
  @ApiParam({ name: "id", description: "UUID của tin tuyển dụng" })
  @ApiCreatedResponse({ description: "Thêm địa điểm vào tin tuyển dụng thành công." })
  @ApiBadRequestResponse({ description: "Payload hoặc UUID không hợp lệ." })
  @ApiForbiddenResponse({ description: "Recruiter không có quyền cập nhật tin tuyển dụng này." })
  @ApiNotFoundResponse({ description: "Không tìm thấy tin tuyển dụng." })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER)
  @Post(":id/locations")
  addLocation(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: AddLocationToJobDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobPostsService.addLocationToJob(id, user.id, dto);
  }

  @ApiOperation({
    summary: "Xóa địa điểm làm việc khỏi tin tuyển dụng",
    description: "Recruiter gỡ địa điểm làm việc khỏi tin tuyển dụng do chính mình tạo.",
  })
  @ApiParam({ name: "id", description: "UUID của tin tuyển dụng" })
  @ApiParam({ name: "locationId", description: "UUID của địa điểm làm việc" })
  @ApiNoContentResponse({ description: "Xóa địa điểm khỏi tin tuyển dụng thành công." })
  @ApiForbiddenResponse({ description: "Recruiter không có quyền cập nhật tin tuyển dụng này." })
  @ApiNotFoundResponse({ description: "Không tìm thấy tin tuyển dụng hoặc địa điểm liên kết." })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER)
  @Delete(":id/locations/:locationId")
  @HttpCode(204)
  async removeLocation(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("locationId", new ParseUUIDPipe()) locationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.jobPostsService.removeLocationFromJob(id, locationId, user.id);
  }

  @ApiOperation({
    summary: "Thêm chuyên ngành vào tin tuyển dụng",
    description: "Recruiter gắn chuyên ngành vào tin tuyển dụng do chính mình tạo.",
  })
  @ApiParam({ name: "id", description: "UUID của tin tuyển dụng" })
  @ApiCreatedResponse({ description: "Thêm chuyên ngành vào tin tuyển dụng thành công." })
  @ApiBadRequestResponse({ description: "Payload hoặc UUID không hợp lệ." })
  @ApiForbiddenResponse({ description: "Recruiter không có quyền cập nhật tin tuyển dụng này." })
  @ApiNotFoundResponse({ description: "Không tìm thấy tin tuyển dụng." })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER)
  @Post(":id/specializations")
  addSpecialization(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: AddSpecializationToJobDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobPostsService.addSpecializationToJob(id, user.id, dto);
  }

  @ApiOperation({
    summary: "Xóa chuyên ngành khỏi tin tuyển dụng",
    description: "Recruiter gỡ chuyên ngành khỏi tin tuyển dụng do chính mình tạo.",
  })
  @ApiParam({ name: "id", description: "UUID của tin tuyển dụng" })
  @ApiParam({ name: "specializationId", description: "UUID của chuyên ngành" })
  @ApiNoContentResponse({ description: "Xóa chuyên ngành khỏi tin tuyển dụng thành công." })
  @ApiForbiddenResponse({ description: "Recruiter không có quyền cập nhật tin tuyển dụng này." })
  @ApiNotFoundResponse({ description: "Không tìm thấy tin tuyển dụng hoặc chuyên ngành liên kết." })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER)
  @Delete(":id/specializations/:specializationId")
  @HttpCode(204)
  async removeSpecialization(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("specializationId", new ParseUUIDPipe()) specializationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.jobPostsService.removeSpecializationFromJob(id, specializationId, user.id);
  }

  @ApiOperation({
    summary: "Đặt lại toàn bộ danh sách kỹ năng của tin tuyển dụng",
    description: "Thay thế toàn bộ danh sách kỹ năng hiện có bằng danh sách UUID được gửi lên.",
  })
  @ApiParam({ name: "id", description: "UUID của tin tuyển dụng" })
  @ApiOkResponse({ description: "Cập nhật danh sách kỹ năng thành công." })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER)
  @Put(":id/skills")
  async setSkills(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: SetJobSkillsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.jobPostsService.setJobSkills(id, user.id, dto.skillIds);
  }

  @ApiOperation({
    summary: "Đặt lại toàn bộ danh sách địa điểm làm việc của tin tuyển dụng",
    description: "Thay thế toàn bộ danh sách địa điểm hiện có bằng danh sách UUID được gửi lên.",
  })
  @ApiParam({ name: "id", description: "UUID của tin tuyển dụng" })
  @ApiOkResponse({ description: "Cập nhật danh sách địa điểm thành công." })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER)
  @Put(":id/locations")
  async setLocations(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: SetJobLocationsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.jobPostsService.setJobLocations(id, user.id, dto.jobLocationIds);
  }

  @ApiOperation({
    summary: "Đặt lại toàn bộ danh sách chuyên ngành của tin tuyển dụng",
    description:
      "Thay thế toàn bộ danh sách chuyên ngành hiện có bằng danh sách UUID được gửi lên.",
  })
  @ApiParam({ name: "id", description: "UUID của tin tuyển dụng" })
  @ApiOkResponse({ description: "Cập nhật danh sách chuyên ngành thành công." })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER)
  @Put(":id/specializations")
  async setSpecializations(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: SetJobSpecializationsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.jobPostsService.setJobSpecializations(id, user.id, dto.specializationIds);
  }

  @ApiOperation({
    summary: "Ghi nhận lượt xem tin tuyển dụng",
    description: "Ghi nhận một lượt xem cho tin tuyển dụng đang public.",
  })
  @ApiParam({ name: "id", description: "UUID của tin tuyển dụng" })
  @ApiQuery({
    name: "candidateId",
    required: false,
    description: "UUID tài khoản candidate nếu người xem đã đăng nhập.",
  })
  @ApiCreatedResponse({ description: "Ghi nhận lượt xem thành công." })
  @ApiNotFoundResponse({ description: "Không tìm thấy tin tuyển dụng." })
  @Post(":id/views")
  recordView(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Req() req: Request,
    @Query("candidateId") candidateId?: string,
  ) {
    return this.jobPostsService.recordView(id, req.ip, req.headers["user-agent"], candidateId);
  }

  @ApiOperation({
    summary: "Thống kê lượt xem tin tuyển dụng",
    description: "Recruiter xem tổng số lượt xem của tin tuyển dụng do chính mình tạo.",
  })
  @ApiParam({ name: "id", description: "UUID của tin tuyển dụng" })
  @ApiOkResponse({
    description: "Lấy thống kê lượt xem thành công.",
    schema: {
      example: {
        views: 128,
      },
    },
  })
  @ApiForbiddenResponse({ description: "Recruiter không có quyền xem thống kê tin này." })
  @ApiNotFoundResponse({ description: "Không tìm thấy tin tuyển dụng." })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER)
  @AllowWhenRestricted()
  @Get(":id/views/stats")
  getViewStats(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobPostsService.getViewStats(id, user.id);
  }
}

@ApiTags("Job - Posts")
@Controller("recruiter/job-posts")
export class RecruiterJobPostsController {
  constructor(private readonly jobPostsService: JobPostsService) {}

  @ApiOperation({
    summary: "Danh sách thành viên có quyền truy cập tin tuyển dụng",
    description:
      "Mọi thành viên công ty có quyền mặc định; kết quả thể hiện các ngoại lệ đã bị thu hồi theo từng tin.",
  })
  @ApiOkResponse({ description: "Lấy danh sách quyền truy cập thành công." })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER)
  @AllowWhenRestricted()
  @Get(":id/access-members")
  listAccessMembers(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobPostsService.listJobPostAccessMembers(id, user);
  }

  @ApiOperation({
    summary: "Cấp hoặc thu hồi quyền truy cập tin tuyển dụng của thành viên",
  })
  @ApiOkResponse({ description: "Cập nhật quyền truy cập thành công." })
  @ApiBadRequestResponse({ description: "Không thể thu hồi quyền của người tạo tin." })
  @ApiForbiddenResponse({ description: "Không có quyền quản lý truy cập tin tuyển dụng." })
  @ApiNotFoundResponse({ description: "Không tìm thấy tin hoặc thành viên công ty." })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER)
  @Patch(":id/access-members/:recruiterAccountId")
  updateMemberAccess(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("recruiterAccountId", new ParseUUIDPipe()) recruiterAccountId: string,
    @Body() dto: UpdateJobPostMemberAccessDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobPostsService.updateJobPostMemberAccess(
      id,
      recruiterAccountId,
      dto.hasAccess,
      user,
    );
  }

  @ApiOperation({
    summary: "Danh sách tin tuyển dụng của công ty",
    description:
      "Recruiter lấy danh sách tin tuyển dụng trong cùng công ty, bao gồm thông tin người đăng để lọc và phân quyền thao tác.",
  })
  @ApiOkResponse({ description: "Lấy danh sách tin tuyển dụng của công ty thành công." })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard, RestrictedModeGuard)
  @Roles(ActorType.RECRUITER)
  @AllowWhenRestricted()
  @Get()
  getMyJobPosts(@CurrentUser() user: AuthenticatedUser) {
    return this.jobPostsService.getCompanyJobPosts(user.id);
  }
}

@ApiTags("Admin - Job Posts")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, AdminPermissionsGuard)
@Roles(ActorType.ADMIN)
@Controller("admin/job-posts")
export class AdminJobPostsController {
  constructor(private readonly jobPostsService: JobPostsService) {}

  @ApiOperation({
    summary: "Danh sách tin tuyển dụng cho admin",
    description:
      "Admin lấy danh sách tin tuyển dụng, hỗ trợ phân trang, tìm kiếm theo tiêu đề/công ty/recruiter và filter trạng thái.",
  })
  @ApiOkResponse({
    description: "Lấy danh sách tin tuyển dụng thành công.",
    schema: {
      example: {
        items: [
          {
            id: "1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf",
            title: "Senior Backend Developer",
            status: "PUBLISHED",
            moderationStatus: "APPROVED",
            company: {
              id: "8e10280c-ae2d-4579-a048-c25279447a3e",
              name: "UpNext Labs",
              status: "ACTIVE",
              verificationStatus: "VERIFIED",
            },
            createdByRecruiter: {
              id: "5a5bf82c-02c0-41b1-b41c-95f29aa3dfd7",
              email: "recruiter@upnext.dev",
              profile: {
                id: "6f30df7d-1d53-4d6d-8df9-5c28925f14ed",
                fullName: "Nguyen Van A",
              },
            },
            _count: {
              applications: 12,
              views: 128,
              savedJobs: 5,
            },
            createdAt: "2026-06-25T08:00:00.000Z",
          },
        ],
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: "Tham số truy vấn không hợp lệ." })
  @ApiForbiddenResponse({ description: "Chỉ admin mới có thể gọi endpoint này." })
  @Get()
  findAll(@Query() query: ListAdminJobPostsQueryDto) {
    return this.jobPostsService.findAllForAdmin(query);
  }

  @ApiOperation({
    summary: "Phê duyệt tin tuyển dụng (ADMIN)",
    description:
      "Phê duyệt trạng thái kiểm duyệt của tin tuyển dụng thành APPROVED. Chỉ cho phép khi trạng thái hiện tại là PENDING.",
  })
  @ApiParam({ name: "id", description: "UUID của tin tuyển dụng" })
  @ApiOkResponse({
    description: "Phê duyệt tin tuyển dụng thành công.",
    schema: {
      example: {
        message: "Phê duyệt tin tuyển dụng thành công.",
        jobPost: {
          id: "1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf",
          title: "Senior Backend Developer",
          moderationStatus: "APPROVED",
          moderationNote: "Tin tuyển dụng hợp lệ.",
          reason: null,
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: "Tin tuyển dụng đã được duyệt hoặc từ chối trước đó." })
  @ApiNotFoundResponse({ description: "Không tìm thấy tin tuyển dụng." })
  @AdminPermissions("jobs:moderate")
  @Patch(":id/approve")
  approve(@Param("id", new ParseUUIDPipe()) id: string, @Body() dto: ApproveJobPostDto) {
    return this.jobPostsService.approveJobPost(id, dto);
  }

  @ApiOperation({
    summary: "Từ chối duyệt tin tuyển dụng (ADMIN)",
    description:
      "Từ chối duyệt tin tuyển dụng, chuyển trạng thái kiểm duyệt thành REJECTED. Chỉ cho phép khi trạng thái hiện tại là PENDING.",
  })
  @ApiParam({ name: "id", description: "UUID của tin tuyển dụng" })
  @ApiOkResponse({
    description: "Từ chối duyệt tin tuyển dụng thành công.",
    schema: {
      example: {
        message: "Từ chối duyệt tin tuyển dụng thành công.",
        jobPost: {
          id: "1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf",
          title: "Senior Backend Developer",
          moderationStatus: "REJECTED",
          moderationNote: null,
          reason: "Lý do từ chối tuyển dụng.",
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: "Tin tuyển dụng đã được duyệt hoặc từ chối trước đó." })
  @ApiNotFoundResponse({ description: "Không tìm thấy tin tuyển dụng." })
  @AdminPermissions("jobs:moderate")
  @Patch(":id/reject")
  reject(@Param("id", new ParseUUIDPipe()) id: string, @Body() dto: RejectJobPostDto) {
    return this.jobPostsService.rejectJobPost(id, dto);
  }

  @ApiOperation({
    summary: "Ẩn hoặc hiển thị tin tuyển dụng (ADMIN)",
    description:
      "Admin ẩn hoặc hiển thị một tin tuyển dụng bằng cách thay đổi giá trị trường isHidden.",
  })
  @ApiParam({ name: "id", description: "UUID của tin tuyển dụng" })
  @ApiOkResponse({
    description: "Cập nhật trạng thái ẩn/hiển thị tin tuyển dụng thành công.",
    schema: {
      example: {
        message: "Cập nhật trạng thái ẩn/hiển thị tin tuyển dụng thành công.",
        jobPost: {
          id: "1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf",
          title: "Senior Backend Developer",
          isHidden: true,
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: "Không tìm thấy tin tuyển dụng." })
  @Patch(":id/visibility")
  updateVisibility(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateJobPostVisibilityDto,
  ) {
    return this.jobPostsService.updateVisibility(id, dto);
  }
}
