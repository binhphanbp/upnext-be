import { IsIn } from 'class-validator';

export class RespondOfferDto {
  @IsIn(['ACCEPT', 'DECLINE'])
  action!: 'ACCEPT' | 'DECLINE';
}
