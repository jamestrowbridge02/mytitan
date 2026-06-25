import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export const QUOTE_STATUSES = ["DRAFT", "SENT", "APPROVED", "DECLINED", "EXPIRED", "CONVERTED"] as const;
export const QUOTE_LINE_ITEM_TYPES = ["LABOUR", "PART", "FEE", "DISCOUNT", "OTHER"] as const;

export class QuoteLineItemDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsIn(QUOTE_LINE_ITEM_TYPES)
  type!: (typeof QUOTE_LINE_ITEM_TYPES)[number];

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity!: number;

  @Type(() => Number)
  @IsInt()
  unitPriceCents!: number;

  @IsOptional()
  @IsObject()
  metadataJson?: Record<string, any>;
}

export class UpsertQuoteDto {
  @IsString()
  customerId!: string;

  @IsOptional()
  @IsString()
  jobId?: string;

  @IsOptional()
  @IsString()
  bookingId?: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  taxCents?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsObject()
  notesJson?: Record<string, any>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteLineItemDto)
  lineItems!: QuoteLineItemDto[];
}

export class JobEstimateDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  taxCents?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsObject()
  notesJson?: Record<string, any>;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteLineItemDto)
  lineItems!: QuoteLineItemDto[];
}

export class PatchQuoteDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  jobId?: string;

  @IsOptional()
  @IsString()
  bookingId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  taxCents?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsIn(["DRAFT", "EXPIRED"])
  status?: "DRAFT" | "EXPIRED";

  @IsOptional()
  @IsObject()
  notesJson?: Record<string, any>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteLineItemDto)
  lineItems?: QuoteLineItemDto[];
}

export class QuoteInventoryLineItemDto {
  @IsString()
  stockItemId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity!: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  unitPriceCents?: number;

  @IsOptional()
  @IsString()
  description?: string;
}
