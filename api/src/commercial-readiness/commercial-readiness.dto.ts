import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SubmitBespokeEnquiryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  businessName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  contactName!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsInt()
  @Min(1)
  @Max(1000000)
  estimatedMonthlyJobs!: number;

  @IsInt()
  @Min(1)
  @Max(10000)
  locationsCount!: number;

  @IsString()
  @MinLength(12)
  @MaxLength(4000)
  message!: string;

  @IsBoolean()
  consentToContact!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(0)
  website?: string;
}

export class SubmitMarketingReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsString()
  @MinLength(12)
  @MaxLength(500)
  quote!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  businessName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reviewerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reviewerTitle?: string;

  @IsBoolean()
  consentToPublish!: boolean;
}

export class ModerateMarketingReviewDto {
  @IsIn(['APPROVED', 'REJECTED', 'ARCHIVED'])
  status!: 'APPROVED' | 'REJECTED' | 'ARCHIVED';

  @IsOptional()
  @IsString()
  @MinLength(12)
  @MaxLength(500)
  displayQuote?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  displayBusinessName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayReviewerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayReviewerTitle?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsInt()
  @Min(-100000)
  @Max(100000)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  moderationNote?: string;
}

export class UpdateBespokeEnquiryDto {
  @IsIn(['NEW', 'CONTACTED', 'CLOSED', 'ARCHIVED'])
  status!: 'NEW' | 'CONTACTED' | 'CLOSED' | 'ARCHIVED';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNote?: string;
}
