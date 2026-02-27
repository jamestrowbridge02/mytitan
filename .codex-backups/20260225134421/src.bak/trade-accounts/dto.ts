import { IsDateString, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
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

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;
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

export class CrmSearchQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  segmentId?: string;

  @IsOptional()
  @IsString()
  tag?: string;
}

export class AddCrmNoteDto {
  @IsOptional()
  bodyJson?: Record<string, any>;

  @IsOptional()
  attachmentsJson?: Record<string, any>;
}

export class AddCrmTaskDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  details?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  assigneeUserId?: string;
}

export class PatchCrmAccountDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsIn(TRADE_ACCOUNT_STATUSES)
  status?: (typeof TRADE_ACCOUNT_STATUSES)[number];

  @IsOptional()
  @IsDateString()
  lastContactedAt?: string;
}
