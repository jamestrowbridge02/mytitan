import { IsOptional, IsString, IsUrl } from 'class-validator';

export class ApproveJobDto {
  @IsOptional()
  @IsString()
  name?: string;
}

export class DeclineJobDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class SignJobDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  signatureDataUrl?: string;
}
