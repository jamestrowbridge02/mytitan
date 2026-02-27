import { IsIn, IsOptional, IsString } from 'class-validator';
import { EMAIL_TEMPLATE_TYPES } from '../common/constants';

export class UpsertEmailTemplateDto {
  @IsIn(EMAIL_TEMPLATE_TYPES)
  type!: (typeof EMAIL_TEMPLATE_TYPES)[number];

  @IsString()
  subject!: string;

  @IsOptional()
  @IsString()
  bodyHtml?: string;

  @IsOptional()
  @IsString()
  bodyText?: string;
}
