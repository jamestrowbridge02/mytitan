import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

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
  @IsString()
  name!: string;

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
