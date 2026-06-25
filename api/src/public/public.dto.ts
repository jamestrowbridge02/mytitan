import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

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
  @IsString()
  signatureDataUrl?: string;
}

class CompletionChecklistItemDto {
  @IsString()
  key!: string;

  @IsString()
  label!: string;

  @IsBoolean()
  completed!: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}

export class SaveCompletionQuickLinkDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  summary?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CompletionChecklistItemDto)
  @IsArray()
  checklist?: CompletionChecklistItemDto[];

  @IsOptional()
  @IsObject()
  notesJson?: Record<string, any>;
}

export class SubmitCompletionQuickLinkDto extends SaveCompletionQuickLinkDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  evidenceNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  signatureName?: string;

  @IsOptional()
  @IsString()
  signatureDataUrl?: string;
}
