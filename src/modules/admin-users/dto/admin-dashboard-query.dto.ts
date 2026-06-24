import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export type DashboardChartPeriod = 'week' | 'month' | 'year';

export class AdminDashboardQueryDto {
  @ApiPropertyOptional({
    enum: ['week', 'month', 'year'],
    default: 'year',
    description: 'Khoảng thời gian gom nhóm doanh thu cho biểu đồ.',
  })
  @IsOptional()
  @IsIn(['week', 'month', 'year'])
  chartPeriod?: DashboardChartPeriod = 'year';

  @ApiPropertyOptional({
    example: 2026,
    description: 'Năm cần xem biểu đồ. Mặc định là năm hiện tại.',
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({
    example: 6,
    description: 'Tháng cần xem khi chartPeriod=month. Giá trị 1-12.',
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional({
    example: '2026-06-22',
    description: 'Ngày đầu tuần khi chartPeriod=week. Nếu bỏ trống sẽ lấy tuần hiện tại.',
  })
  @IsOptional()
  @IsDateString()
  weekStart?: string;

  @ApiPropertyOptional({
    example: 10,
    default: 10,
    description: 'Số activity mới nhất trả về.',
  })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(50)
  activityLimit?: number = 10;
}
