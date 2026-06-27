import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ActorType } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CvTemplatesService } from './cv-templates.service';
import { CreateCvTemplateDto } from './dto/create-cv-template.dto';
import { ListCvTemplatesQueryDto } from './dto/list-cv-templates-query.dto';
import { UpdateCvTemplateDto } from './dto/update-cv-template.dto';
import { CvTemplateEntity, CvTemplateList } from './entities/cv-template.entity';

@ApiTags('Cv - Templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ActorType.ADMIN)
@Controller('cv-templates')
export class CvTemplatesController {
  constructor(private readonly cvTemplatesService: CvTemplatesService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo mẫu CV' })
  @ApiCreatedResponse({ type: CvTemplateEntity, description: 'Tạo mẫu CV thành công.' })
  @ApiBadRequestResponse({ description: 'Body không hợp lệ.' })
  @ApiConflictResponse({ description: 'Mẫu CV với layoutKey này đã tồn tại.' })
  create(@Body() createCvTemplateDto: CreateCvTemplateDto) {
    return this.cvTemplatesService.create(createCvTemplateDto);
  }

  @Get()
  @Roles(ActorType.ADMIN, ActorType.CANDIDATE)
  @ApiOperation({ summary: 'Lấy danh sách mẫu CV' })
  @ApiOkResponse({ type: CvTemplateList, description: 'Danh sách mẫu CV.' })
  @ApiBadRequestResponse({ description: 'Tham số truy vấn không hợp lệ.' })
  findAll(@Query() query: ListCvTemplatesQueryDto) {
    return this.cvTemplatesService.findAll(query);
  }

  @Get(':id')
  @Roles(ActorType.ADMIN, ActorType.CANDIDATE)
  @ApiOperation({ summary: 'Xem chi tiết mẫu CV' })
  @ApiParam({ name: 'id', description: 'UUID của mẫu CV' })
  @ApiOkResponse({ type: CvTemplateEntity, description: 'Thông tin chi tiết mẫu CV.' })
  @ApiBadRequestResponse({ description: 'UUID của mẫu CV không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy mẫu CV.' })
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.cvTemplatesService.findOne(id);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Bật mẫu CV' })
  @ApiParam({ name: 'id', description: 'UUID của mẫu CV' })
  @ApiOkResponse({ type: CvTemplateEntity, description: 'Bật mẫu CV thành công.' })
  @ApiBadRequestResponse({ description: 'UUID của mẫu CV không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy mẫu CV.' })
  activate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.cvTemplatesService.activate(id);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Tắt mẫu CV' })
  @ApiParam({ name: 'id', description: 'UUID của mẫu CV' })
  @ApiOkResponse({ type: CvTemplateEntity, description: 'Tắt mẫu CV thành công.' })
  @ApiBadRequestResponse({ description: 'UUID của mẫu CV không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy mẫu CV.' })
  deactivate(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.cvTemplatesService.deactivate(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật mẫu CV' })
  @ApiParam({ name: 'id', description: 'UUID của mẫu CV' })
  @ApiOkResponse({ type: CvTemplateEntity, description: 'Cập nhật mẫu CV thành công.' })
  @ApiBadRequestResponse({ description: 'Body hoặc UUID của mẫu CV không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy mẫu CV.' })
  @ApiConflictResponse({ description: 'Mẫu CV với layoutKey này đã tồn tại.' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateCvTemplateDto: UpdateCvTemplateDto,
  ) {
    return this.cvTemplatesService.update(id, updateCvTemplateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa mẫu CV' })
  @ApiParam({ name: 'id', description: 'UUID của mẫu CV' })
  @ApiOkResponse({ type: CvTemplateEntity, description: 'Xóa mẫu CV thành công.' })
  @ApiBadRequestResponse({ description: 'UUID của mẫu CV không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy mẫu CV.' })
  @ApiConflictResponse({ description: 'Mẫu CV đang được phiên bản CV sử dụng.' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.cvTemplatesService.remove(id);
  }
}
