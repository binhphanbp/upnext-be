import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CandidateAccountService } from './candidate-account.service';
import { CreateCandidateAccountDto } from './dto/create-candidate-account.dto';
import { UpdateCandidateAccountDto } from './dto/update-candidate-account.dto';
import { CandidateAccount, CandidateAccountList } from './entities/candidate-account.entity';

@ApiTags('Candidate Accounts')
@Controller('candidate-accounts')
export class CandidateAccountController {
  constructor(private readonly candidateAccountService: CandidateAccountService) {}

  @Post()
  @ApiOperation({ summary: 'Tạo tài khoản ứng viên' })
  @ApiCreatedResponse({ type: CandidateAccount })
  @ApiBadRequestResponse({ description: 'Yêu cầu body không hợp lệ.' })
  @ApiConflictResponse({ description: 'Tài khoản ứng viên với cùng một trường duy nhất đã tồn tại.' })
  create(@Body() createCandidateAccountDto: CreateCandidateAccountDto) {
    return this.candidateAccountService.create(createCandidateAccountDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách tài khoản ứng viên' })
  @ApiOkResponse({ type: CandidateAccountList })
  @ApiBadRequestResponse({ description: 'Tham số truy vấn không hợp lệ.' })
  findAll(@Query() query: PaginationQueryDto) {
    return this.candidateAccountService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin tài khoản ứng viên' })
  @ApiParam({ name: 'id', example: 'clx4q8z1j0000u8p4e1o9v6m2' })
  @ApiOkResponse({ type: CandidateAccount })
  @ApiNotFoundResponse({ description: 'Không tìm thấy tài khoản ứng viên.' })
  findOne(@Param('id') id: string) {
    return this.candidateAccountService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cập nhật thông tin tài khoản ứng viên' })
  @ApiParam({ name: 'id', example: 'clx4q8z1j0000u8p4e1o9v6m2' })
  @ApiOkResponse({ type: CandidateAccount })
  @ApiBadRequestResponse({ description: 'Yêu cầu body không hợp lệ.' })
  @ApiNotFoundResponse({ description: 'Không tìm thấy tài khoản ứng viên.' })
  @ApiConflictResponse({ description: 'Tài khoản ứng viên với cùng một trường duy nhất đã tồn tại.' })
  update(@Param('id') id: string, @Body() updateCandidateAccountDto: UpdateCandidateAccountDto) {
    return this.candidateAccountService.update(id, updateCandidateAccountDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa tài khoản ứng viên' })
  @ApiParam({ name: 'id', example: 'clx4q8z1j0000u8p4e1o9v6m2' })
  @ApiOkResponse({ type: CandidateAccount })
  @ApiNotFoundResponse({ description: 'Không tìm thấy tài khoản ứng viên.' })
  remove(@Param('id') id: string) {
    return this.candidateAccountService.remove(id);
  }
}
