import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class RecordBoostDeliveryDto {
  @ApiProperty({ description: 'Token nhận từ GET /public/sponsored-jobs cho đúng thẻ này.' })
  @IsString()
  @MaxLength(500)
  deliveryToken: string;
}
