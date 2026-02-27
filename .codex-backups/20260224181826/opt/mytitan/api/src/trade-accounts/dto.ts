import { IsDateString, IsEmail, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { TRADE_ACCOUNT_STATUSES } from '../common/constants';

export class UpsertTradeAccountDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsNumber()
  @Min(0)
  creditLimit!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  outstandingBalance?: number;

  @IsOptional()
  @IsIn(TRADE_ACCOUNT_STATUSES)
  status?: (typeof TRADE_ACCOUNT_STATUSES)[number];

  @IsOptional()
  @IsIn(['CALL', 'EMAIL', 'WHATSAPP', 'FOLLOW_UP', 'MEETING'])
  nextActionType?: 'CALL' | 'EMAIL' | 'WHATSAPP' | 'FOLLOW_UP' | 'MEETING';

  @IsOptional()
  @IsDateString()
  nextActionDueAt?: string;

  @IsOptional()
  @IsString()
  nextActionUserId?: string;
}

export class TradeAccountsQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(TRADE_ACCOUNT_STATUSES)
  status?: (typeof TRADE_ACCOUNT_STATUSES)[number];
}

export class AddTradeAccountNoteDto {
  @IsString()
  body!: string;

  @IsOptional()
  attachmentsMeta?: Record<string, any>;
}

export class UpdateNextActionDto {
  @IsOptional()
  @IsIn(['CALL', 'EMAIL', 'WHATSAPP', 'FOLLOW_UP', 'MEETING'])
  type?: 'CALL' | 'EMAIL' | 'WHATSAPP' | 'FOLLOW_UP' | 'MEETING';

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  assignedUserId?: string;
}
