import { IsDateString, IsIn, IsOptional, IsString } from "class-validator";

export class UpsertPerformancePeriodDto {
  @IsString()
  name!: string;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  @IsOptional()
  @IsIn(["OPEN", "CLOSED"])
  status?: string;
}

export class ListPerformanceScorecardsDto {
  @IsOptional()
  @IsString()
  periodId?: string;

  @IsOptional()
  @IsIn(["TECHNICIAN", "DISPATCHER", "FINANCE", "MANAGER"])
  roleType?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;
}

export class ListPerformanceLeaderboardDto {
  @IsOptional()
  @IsString()
  periodId?: string;

  @IsOptional()
  @IsIn(["TECHNICIAN", "DISPATCHER", "FINANCE", "MANAGER"])
  roleType?: string;

  @IsOptional()
  @IsString()
  locationId?: string;
}

export class ListPerformanceRisksDto {
  @IsOptional()
  @IsString()
  periodId?: string;

  @IsOptional()
  @IsIn(["TECHNICIAN", "DISPATCHER", "FINANCE", "MANAGER"])
  roleType?: string;

  @IsOptional()
  @IsString()
  locationId?: string;
}
