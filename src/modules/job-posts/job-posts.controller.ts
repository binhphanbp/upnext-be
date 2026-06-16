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
} from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JobStatus } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateJobPostWithContextDto } from './dto/create-job-post-with-context.dto';
import { UpdateJobPostDto } from './dto/update-job-post.dto';
import {
  AddLocationToJobDto,
  AddSkillToJobDto,
  AddSpecializationToJobDto,
} from './dto/job-post-relations.dto';
import { JobPostsService } from './job-posts.service';

@ApiTags('job-posts')
@Controller('job-posts')
export class JobPostsController {
  constructor(private readonly jobPostsService: JobPostsService) {}

  @ApiOperation({ summary: 'Create job post' })
  @Post()
  create(@Body() dto: CreateJobPostWithContextDto) {
    const { recruiterId, companyId, ...rest } = dto;
    return this.jobPostsService.create(recruiterId, companyId, rest);
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

  @ApiOperation({ summary: 'Update job post' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @ApiQuery({ name: 'recruiterId', description: 'Recruiter account UUID (owner)', required: true })
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('recruiterId', new ParseUUIDPipe()) recruiterId: string,
    @Body() dto: UpdateJobPostDto,
  ) {
    return this.jobPostsService.update(id, recruiterId, dto);
  }

  @ApiOperation({ summary: 'Delete job post' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @ApiQuery({ name: 'recruiterId', description: 'Recruiter account UUID (owner)', required: true })
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('recruiterId', new ParseUUIDPipe()) recruiterId: string,
  ) {
    await this.jobPostsService.remove(id, recruiterId);
  }

  @ApiOperation({ summary: 'Publish job post' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @ApiQuery({ name: 'recruiterId', description: 'Recruiter account UUID (owner)', required: true })
  @Patch(':id/publish')
  publish(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('recruiterId', new ParseUUIDPipe()) recruiterId: string,
  ) {
    return this.jobPostsService.updateStatus(id, recruiterId, JobStatus.PUBLISHED);
  }

  @ApiOperation({ summary: 'Close job post' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @ApiQuery({ name: 'recruiterId', description: 'Recruiter account UUID (owner)', required: true })
  @Patch(':id/close')
  close(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('recruiterId', new ParseUUIDPipe()) recruiterId: string,
  ) {
    return this.jobPostsService.updateStatus(id, recruiterId, JobStatus.CLOSED);
  }

  @ApiOperation({ summary: 'Reopen job post' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @ApiQuery({ name: 'recruiterId', description: 'Recruiter account UUID (owner)', required: true })
  @Patch(':id/reopen')
  reopen(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('recruiterId', new ParseUUIDPipe()) recruiterId: string,
  ) {
    return this.jobPostsService.updateStatus(id, recruiterId, JobStatus.PUBLISHED);
  }

  // ─── Relations ────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Add skill to job post' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @ApiQuery({ name: 'recruiterId', required: true })
  @Post(':id/skills')
  addSkill(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('recruiterId', new ParseUUIDPipe()) recruiterId: string,
    @Body() dto: AddSkillToJobDto,
  ) {
    return this.jobPostsService.addSkillToJob(id, recruiterId, dto);
  }

  @ApiOperation({ summary: 'Remove skill from job post' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @ApiParam({ name: 'skillId', description: 'Skill UUID' })
  @ApiQuery({ name: 'recruiterId', required: true })
  @Delete(':id/skills/:skillId')
  @HttpCode(204)
  async removeSkill(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('skillId', new ParseUUIDPipe()) skillId: string,
    @Query('recruiterId', new ParseUUIDPipe()) recruiterId: string,
  ) {
    await this.jobPostsService.removeSkillFromJob(id, skillId, recruiterId);
  }

  @ApiOperation({ summary: 'Add location to job post' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @ApiQuery({ name: 'recruiterId', required: true })
  @Post(':id/locations')
  addLocation(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('recruiterId', new ParseUUIDPipe()) recruiterId: string,
    @Body() dto: AddLocationToJobDto,
  ) {
    return this.jobPostsService.addLocationToJob(id, recruiterId, dto);
  }

  @ApiOperation({ summary: 'Remove location from job post' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @ApiParam({ name: 'locationId', description: 'Job location UUID' })
  @ApiQuery({ name: 'recruiterId', required: true })
  @Delete(':id/locations/:locationId')
  @HttpCode(204)
  async removeLocation(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('locationId', new ParseUUIDPipe()) locationId: string,
    @Query('recruiterId', new ParseUUIDPipe()) recruiterId: string,
  ) {
    await this.jobPostsService.removeLocationFromJob(id, locationId, recruiterId);
  }

  @ApiOperation({ summary: 'Add specialization to job post' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @ApiQuery({ name: 'recruiterId', required: true })
  @Post(':id/specializations')
  addSpecialization(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('recruiterId', new ParseUUIDPipe()) recruiterId: string,
    @Body() dto: AddSpecializationToJobDto,
  ) {
    return this.jobPostsService.addSpecializationToJob(id, recruiterId, dto);
  }

  @ApiOperation({ summary: 'Remove specialization from job post' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @ApiParam({ name: 'specializationId', description: 'Specialization UUID' })
  @ApiQuery({ name: 'recruiterId', required: true })
  @Delete(':id/specializations/:specializationId')
  @HttpCode(204)
  async removeSpecialization(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('specializationId', new ParseUUIDPipe()) specializationId: string,
    @Query('recruiterId', new ParseUUIDPipe()) recruiterId: string,
  ) {
    await this.jobPostsService.removeSpecializationFromJob(id, specializationId, recruiterId);
  }

  // ─── Views ───────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Record Job View' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @ApiQuery({ name: 'candidateId', required: false, description: 'Optional candidate UUID' })
  @Post(':id/views')
  recordView(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: Request,
    @Query('candidateId') candidateId?: string,
  ) {
    return this.jobPostsService.recordView(
      id,
      req.ip,
      req.headers['user-agent'],
      candidateId,
    );
  }

  @ApiOperation({ summary: 'Get Job View Stats' })
  @ApiParam({ name: 'id', description: 'Job post UUID' })
  @ApiQuery({ name: 'recruiterId', required: true })
  @Get(':id/views/stats')
  getViewStats(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('recruiterId', new ParseUUIDPipe()) recruiterId: string,
  ) {
    return this.jobPostsService.getViewStats(id, recruiterId);
  }
}

@ApiTags('job-posts')
@Controller('recruiter/job-posts')
export class RecruiterJobPostsController {
  constructor(private readonly jobPostsService: JobPostsService) {}

  @ApiOperation({ summary: 'Get my job posts' })
  @ApiQuery({ name: 'recruiterId', description: 'Recruiter account UUID', required: true })
  @Get()
  getMyJobPosts(@Query('recruiterId', new ParseUUIDPipe()) recruiterId: string) {
    return this.jobPostsService.getMyJobPosts(recruiterId);
  }
}
