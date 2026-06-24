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
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ActorType, JobStatus } from '@prisma/client';
import { Request } from 'express';
import { AuthenticatedUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateJobPostDto } from './dto/create-job-post.dto';
import {
  AddLocationToJobDto,
  AddSkillToJobDto,
  AddSpecializationToJobDto,
} from './dto/job-post-relations.dto';
import { UpdateJobPostDto } from './dto/update-job-post.dto';
import { JobPostsService } from './job-posts.service';

@ApiTags('Job - Posts')
@Controller('job-posts')
export class JobPostsController {
  constructor(private readonly jobPostsService: JobPostsService) {}

  @ApiOperation({ summary: 'Create a recruiter job post draft' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER)
  @Post()
  create(@Body() dto: CreateJobPostDto, @CurrentUser() user: AuthenticatedUser) {
    return this.jobPostsService.create(user, dto);
  }

  @ApiOperation({ summary: 'List published job posts' })
  @Get()
  findAll() {
    return this.jobPostsService.findAll();
  }

  @ApiOperation({ summary: 'Get job post detail' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.jobPostsService.findOne(id);
  }

  @ApiOperation({ summary: 'Update owned job post' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER)
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateJobPostDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobPostsService.update(id, user.id, dto);
  }

  @ApiOperation({ summary: 'Delete owned job post' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER)
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.jobPostsService.remove(id, user.id);
  }

  @ApiOperation({ summary: 'Publish owned job post' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER)
  @Patch(':id/publish')
  publish(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.jobPostsService.updateStatus(id, user.id, JobStatus.PUBLISHED);
  }

  @ApiOperation({ summary: 'Close owned job post' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER)
  @Patch(':id/close')
  close(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.jobPostsService.updateStatus(id, user.id, JobStatus.CLOSED);
  }

  @ApiOperation({ summary: 'Reopen owned job post' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER)
  @Patch(':id/reopen')
  reopen(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.jobPostsService.updateStatus(id, user.id, JobStatus.PUBLISHED);
  }

  @ApiOperation({ summary: 'Add skill to owned job post' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER)
  @Post(':id/skills')
  addSkill(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddSkillToJobDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobPostsService.addSkillToJob(id, user.id, dto);
  }

  @ApiOperation({ summary: 'Remove skill from owned job post' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @ApiParam({ name: 'skillId', description: 'Skill UUID' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER)
  @Delete(':id/skills/:skillId')
  @HttpCode(204)
  async removeSkill(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('skillId', new ParseUUIDPipe()) skillId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.jobPostsService.removeSkillFromJob(id, skillId, user.id);
  }

  @ApiOperation({ summary: 'Add location to owned job post' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER)
  @Post(':id/locations')
  addLocation(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddLocationToJobDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobPostsService.addLocationToJob(id, user.id, dto);
  }

  @ApiOperation({ summary: 'Remove location from owned job post' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @ApiParam({ name: 'locationId', description: 'Job location UUID' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER)
  @Delete(':id/locations/:locationId')
  @HttpCode(204)
  async removeLocation(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('locationId', new ParseUUIDPipe()) locationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.jobPostsService.removeLocationFromJob(id, locationId, user.id);
  }

  @ApiOperation({ summary: 'Add specialization to owned job post' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER)
  @Post(':id/specializations')
  addSpecialization(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddSpecializationToJobDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobPostsService.addSpecializationToJob(id, user.id, dto);
  }

  @ApiOperation({ summary: 'Remove specialization from owned job post' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @ApiParam({ name: 'specializationId', description: 'Specialization UUID' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER)
  @Delete(':id/specializations/:specializationId')
  @HttpCode(204)
  async removeSpecialization(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('specializationId', new ParseUUIDPipe()) specializationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.jobPostsService.removeSpecializationFromJob(id, specializationId, user.id);
  }

  @ApiOperation({ summary: 'Record job post view' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @ApiQuery({ name: 'candidateId', required: false, description: 'Optional candidate UUID' })
  @Post(':id/views')
  recordView(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
    @Query('candidateId') candidateId?: string,
  ) {
    return this.jobPostsService.recordView(id, req.ip, req.headers['user-agent'], candidateId);
  }

  @ApiOperation({ summary: 'Get owned job post view stats' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER)
  @Get(':id/views/stats')
  getViewStats(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.jobPostsService.getViewStats(id, user.id);
  }
}

@ApiTags('Job - Posts')
@Controller('recruiter/job-posts')
export class RecruiterJobPostsController {
  constructor(private readonly jobPostsService: JobPostsService) {}

  @ApiOperation({ summary: 'List my recruiter job posts' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(ActorType.RECRUITER)
  @Get()
  getMyJobPosts(@CurrentUser() user: AuthenticatedUser) {
    return this.jobPostsService.getMyJobPosts(user.id);
  }
}
