import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class LocationHourDto {
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  startMinute?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  endMinute?: number;

  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;
}

export class UpsertLocationDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsIn(['BRANCH', 'WAREHOUSE', 'SERVICE_REGION', 'FRANCHISE'])
  kind?: string;

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
  state?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  bookingLeadTimeMins?: number;

  @IsOptional()
  metadataJson?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  defaultAssigneeId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  staffUserIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LocationHourDto)
  hours?: LocationHourDto[];
}

export class UpsertLocationMembershipDto {
  @IsString()
  userId!: string;

  @IsString()
  locationId!: string;

  @IsOptional()
  @IsIn(['OWNER', 'ADMIN', 'STAFF', 'READ_ONLY', 'TECHNICIAN', 'FINANCE'])
  roleOverride?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class PatchLocationMembershipDto {
  @IsOptional()
  @IsIn(['OWNER', 'ADMIN', 'STAFF', 'READ_ONLY', 'TECHNICIAN', 'FINANCE'])
  roleOverride?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
