import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { CRM_TASK_STATUS_INPUTS, TRADE_ACCOUNT_STATUSES } from '../common/constants';

const CRM_CONTACT_PREF_EVENTS = ['JOB_COMPLETION', 'INVOICE', 'UPDATE_CALL', 'GENERAL_NOTIFICATION'] as const;
const CRM_CONTACT_PREF_CHANNELS = ['EMAIL', 'WHATSAPP', 'PHONE'] as const;
const CRM_LOCATION_KINDS = ['BUSINESS', 'BILLING', 'SERVICE', 'OTHER'] as const;

export class TradeAccountContactPreferenceInputDto {
  @IsIn(CRM_CONTACT_PREF_EVENTS)
  event!: (typeof CRM_CONTACT_PREF_EVENTS)[number];

  @IsIn(CRM_CONTACT_PREF_CHANNELS)
  channel!: (typeof CRM_CONTACT_PREF_CHANNELS)[number];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class TradeAccountLocationInputDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  linkedLocationId?: string;

  @IsOptional()
  @IsIn(CRM_LOCATION_KINDS)
  kind?: (typeof CRM_LOCATION_KINDS)[number];

  @IsOptional()
  @IsString()
  addressLine1?: string;

  @IsOptional()
  @IsString()
  addressLine2?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  postcode?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsBoolean()
  isBilling?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class TradeAccountContactInputDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  tradeAccountLocationId?: string;

  @IsOptional()
  @IsString()
  roleLabel?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsBoolean()
  isBilling?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TradeAccountContactPreferenceInputDto)
  preferences?: TradeAccountContactPreferenceInputDto[];
}

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

  @IsOptional()
  @IsString()
  contactMobile?: string;

  @IsOptional()
  @IsString()
  secondaryContactName?: string;

  @IsOptional()
  @IsEmail()
  secondaryContactEmail?: string;

  @IsOptional()
  @IsString()
  secondaryContactPhone?: string;

  @IsOptional()
  @IsString()
  secondaryContactMobile?: string;

  @IsOptional()
  @IsString()
  vatNumber?: string;

  @IsOptional()
  @IsString()
  companyNumber?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTermsDays?: number;

  @IsOptional()
  @IsBoolean()
  portalEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedServiceIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedLocationIds?: string[];

  @IsOptional()
  @IsString()
  businessAddressLine1?: string;

  @IsOptional()
  @IsString()
  businessAddressLine2?: string;

  @IsOptional()
  @IsString()
  businessCity?: string;

  @IsOptional()
  @IsString()
  businessPostcode?: string;

  @IsOptional()
  @IsString()
  businessCountry?: string;

  @IsOptional()
  @IsString()
  billingContactName?: string;

  @IsOptional()
  @IsEmail()
  billingEmail?: string;

  @IsOptional()
  @IsString()
  billingPhone?: string;

  @IsOptional()
  @IsString()
  billingMobile?: string;

  @IsOptional()
  @IsString()
  billingAddressLine1?: string;

  @IsOptional()
  @IsString()
  billingAddressLine2?: string;

  @IsOptional()
  @IsString()
  billingCity?: string;

  @IsOptional()
  @IsString()
  billingPostcode?: string;

  @IsOptional()
  @IsString()
  billingCountry?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TradeAccountLocationInputDto)
  locations?: TradeAccountLocationInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TradeAccountContactInputDto)
  contacts?: TradeAccountContactInputDto[];
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

  @IsOptional()
  @IsIn(CRM_TASK_STATUS_INPUTS)
  status?: (typeof CRM_TASK_STATUS_INPUTS)[number];
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
  @IsString()
  contactMobile?: string;

  @IsOptional()
  @IsString()
  secondaryContactName?: string;

  @IsOptional()
  @IsEmail()
  secondaryContactEmail?: string;

  @IsOptional()
  @IsString()
  secondaryContactPhone?: string;

  @IsOptional()
  @IsString()
  secondaryContactMobile?: string;

  @IsOptional()
  @IsString()
  vatNumber?: string;

  @IsOptional()
  @IsString()
  companyNumber?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  paymentTermsDays?: number;

  @IsOptional()
  @IsBoolean()
  portalEnabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedServiceIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedLocationIds?: string[];

  @IsOptional()
  @IsString()
  businessAddressLine1?: string;

  @IsOptional()
  @IsString()
  businessAddressLine2?: string;

  @IsOptional()
  @IsString()
  businessCity?: string;

  @IsOptional()
  @IsString()
  businessPostcode?: string;

  @IsOptional()
  @IsString()
  businessCountry?: string;

  @IsOptional()
  @IsString()
  billingContactName?: string;

  @IsOptional()
  @IsEmail()
  billingEmail?: string;

  @IsOptional()
  @IsString()
  billingPhone?: string;

  @IsOptional()
  @IsString()
  billingMobile?: string;

  @IsOptional()
  @IsString()
  billingAddressLine1?: string;

  @IsOptional()
  @IsString()
  billingAddressLine2?: string;

  @IsOptional()
  @IsString()
  billingCity?: string;

  @IsOptional()
  @IsString()
  billingPostcode?: string;

  @IsOptional()
  @IsString()
  billingCountry?: string;

  @IsOptional()
  @IsIn(TRADE_ACCOUNT_STATUSES)
  status?: (typeof TRADE_ACCOUNT_STATUSES)[number];

  @IsOptional()
  @IsDateString()
  lastContactedAt?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TradeAccountLocationInputDto)
  locations?: TradeAccountLocationInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TradeAccountContactInputDto)
  contacts?: TradeAccountContactInputDto[];
}

export class TradePortalInviteDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  contactId?: string;
}

export class TradeApplicationSettingsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsArray()
  fields?: Array<Record<string, unknown>>;
}

export class SubmitTradeApplicationDto {
  @IsString()
  businessName!: string;

  @IsString()
  contactName!: string;

  @IsEmail()
  contactEmail!: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  companyNumber?: string;

  @IsOptional()
  @IsString()
  taxRegistrationNumber?: string;

  @IsOptional()
  @IsObject()
  answers?: Record<string, unknown>;
}

export class ReviewTradeApplicationDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  reviewNote?: string;

  @IsOptional()
  @IsBoolean()
  sendPortalInvite?: boolean;
}
