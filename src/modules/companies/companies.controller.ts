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
  UseInterceptors,
} from '@nestjs/common';
import {
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
import { FileInterceptor } from '@nestjs/platform-express';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { ListCompaniesQueryDto } from './dto/list-companies-query.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

type UploadedFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

@ApiTags('companies')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @ApiOperation({
    summary: 'Create company',
    description: 'Tao moi mot cong ty voi thong tin co ban.',
  })
  @ApiCreatedResponse({
    description: 'Company created successfully',
    schema: {
      example: {
        id: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf',
        name: 'UpNext Labs',
        type: 'PRODUCT',
        taxCode: '0312345678',
        address: '123 Nguyen Hue, District 1, Ho Chi Minh City',
        email: 'hello@upnext.dev',
        phone: '+84-28-1234-5678',
        website: 'https://upnext.dev',
        description: 'Technology company focused on hiring platform products.',
        companySize: '51-200 employees',
        verificationStatus: 'UNVERIFIED',
        reputationScore: '0',
        status: 'ACTIVE',
        createdAt: '2026-06-09T08:00:00.000Z',
        updatedAt: '2026-06-09T08:00:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid request payload' })
  @Post()
  create(@Body() createCompanyDto: CreateCompanyDto) {
    return this.companiesService.create(createCompanyDto);
  }

  @ApiOperation({
    summary: 'List companies',
    description: 'Lay danh sach cong ty, co ho tro tim kiem, filter va pagination.',
  })
  @ApiOkResponse({
    description: 'Companies fetched successfully',
    schema: {
      example: {
        items: [
          {
            id: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf',
            name: 'UpNext Labs',
            type: 'PRODUCT',
            email: 'hello@upnext.dev',
            website: 'https://upnext.dev',
            status: 'ACTIVE',
            verificationStatus: 'VERIFIED',
            createdAt: '2026-06-09T08:00:00.000Z',
            updatedAt: '2026-06-09T08:00:00.000Z',
          },
        ],
        meta: {
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        },
      },
    },
  })
  @Get()
  findAll(@Query() query: ListCompaniesQueryDto) {
    return this.companiesService.findAll(query);
  }

  @ApiOperation({
    summary: 'Get company detail',
    description: 'Lay chi tiet ho so cong ty kem recruiter, member va job gan day.',
  })
  @ApiParam({ name: 'id', description: 'Company UUID' })
  @ApiOkResponse({
    description: 'Company detail fetched successfully',
    schema: {
      example: {
        id: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf',
        name: 'UpNext Labs',
        type: 'PRODUCT',
        description: 'Technology company focused on hiring platform products.',
        members: [],
        recruiterAccounts: [],
        jobPosts: [],
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Company not found' })
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.companiesService.findOne(id);
  }

  @ApiOperation({
    summary: 'Get company jobs',
    description: 'Lay danh sach job dang thuoc mot cong ty.',
  })
  @ApiParam({ name: 'id', description: 'Company UUID' })
  @ApiOkResponse({
    description: 'Company jobs fetched successfully',
    schema: {
      example: [
        {
          id: '5c4c2613-912b-4d98-99e9-0f8fe7d0f7be',
          title: 'Backend NestJS Engineer',
          slug: 'backend-nestjs-engineer',
          status: 'PUBLISHED',
          salaryMin: '15000000',
          salaryMax: '30000000',
          employmentType: {
            id: 'f2d32130-4f55-4517-b8f4-f0ac59a8b2cb',
            name: 'Full-time',
          },
          experienceLevel: {
            id: 'b11eaeff-087f-4677-b8bd-c29ac7e59693',
            name: 'Junior',
            code: 'junior',
          },
        },
      ],
    },
  })
  @ApiNotFoundResponse({ description: 'Company not found' })
  @Get(':id/jobs')
  findJobs(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.companiesService.findJobs(id);
  }

  @ApiOperation({
    summary: 'Update company',
    description: 'Cap nhat thong tin cong ty theo company id.',
  })
  @ApiParam({ name: 'id', description: 'Company UUID' })
  @ApiOkResponse({
    description: 'Company updated successfully',
    schema: {
      example: {
        id: '1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf',
        name: 'UpNext Labs Vietnam',
        website: 'https://upnext.dev',
        updatedAt: '2026-06-09T09:00:00.000Z',
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid request payload' })
  @ApiNotFoundResponse({ description: 'Company not found' })
  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateCompanyDto: UpdateCompanyDto,
  ) {
    return this.companiesService.update(id, updateCompanyDto);
  }

  @ApiOperation({
    summary: 'Upload company logo',
    description: 'Upload logo cong ty bang multipart/form-data voi field `file`.',
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
    description: 'Company logo uploaded successfully',
    schema: {
      example: {
        message: 'Company logo uploaded successfully',
        file: {
          id: '08a32cbe-6078-4313-b916-358a922d4cfe',
          originalName: 'logo.png',
          mimeType: 'image/png',
          sizeBytes: '24567',
          storageKey: 'uploads/companies/1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf/logo-uuid.png',
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'File is required or invalid UUID' })
  @ApiNotFoundResponse({ description: 'Company not found' })
  @Post(':id/logo')
  @UseInterceptors(FileInterceptor('file'))
  uploadLogo(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: UploadedFile,
  ) {
    return this.companiesService.uploadLogo(id, file);
  }

  @ApiOperation({
    summary: 'Upload company cover',
    description: 'Upload anh bia cong ty bang multipart/form-data voi field `file`.',
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
    description: 'Company cover uploaded successfully',
    schema: {
      example: {
        message: 'Company cover uploaded successfully',
        file: {
          id: '548c4264-e7e3-4ccc-97dd-f6df9c020494',
          originalName: 'cover.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: '98012',
          storageKey: 'uploads/companies/1f5f4a65-50d7-4f24-a65f-4f2a4d42f9cf/cover-uuid.jpg',
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'File is required or invalid UUID' })
  @ApiNotFoundResponse({ description: 'Company not found' })
  @Post(':id/cover')
  @UseInterceptors(FileInterceptor('file'))
  uploadCover(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file: UploadedFile,
  ) {
    return this.companiesService.uploadCover(id, file);
  }

  @ApiOperation({
    summary: 'Delete company',
    description: 'Xoa mot cong ty theo company id.',
  })
  @ApiParam({ name: 'id', description: 'Company UUID' })
  @ApiNoContentResponse({ description: 'Company deleted successfully' })
  @ApiNotFoundResponse({ description: 'Company not found' })
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', new ParseUUIDPipe()) id: string) {
    await this.companiesService.remove(id);
  }
}
