import { Type } from "class-transformer";
import { Allow, IsArray, IsBoolean, IsIn, IsOptional, IsString, ValidateNested } from "class-validator";

export const CUSTOM_FIELD_ENTITY_TYPES = ["job", "booking", "customer", "technician"] as const;
export const CUSTOM_FIELD_TYPES = ["text", "number", "select", "boolean", "date"] as const;

export class CreateCustomFieldDto {
  @IsString()
  @IsIn(CUSTOM_FIELD_ENTITY_TYPES)
  entityType!: (typeof CUSTOM_FIELD_ENTITY_TYPES)[number];

  @IsString()
  key!: string;

  @IsString()
  label!: string;

  @IsString()
  @IsIn(CUSTOM_FIELD_TYPES)
  type!: (typeof CUSTOM_FIELD_TYPES)[number];

  @IsOptional()
  @IsArray()
  optionsJson?: string[];

  @IsOptional()
  @IsBoolean()
  visible?: boolean;
}

export class UpdateCustomFieldDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsArray()
  optionsJson?: string[];

  @IsOptional()
  @IsBoolean()
  visible?: boolean;
}

export class CustomFieldValueEntryDto {
  @IsString()
  fieldId!: string;

  @Allow()
  valueJson!: unknown;
}

export class UpsertCustomFieldValuesDto {
  @IsString()
  @IsIn(CUSTOM_FIELD_ENTITY_TYPES)
  entityType!: (typeof CUSTOM_FIELD_ENTITY_TYPES)[number];

  @IsString()
  entityId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomFieldValueEntryDto)
  values!: CustomFieldValueEntryDto[];
}

export class CustomFieldValuesQueryDto {
  @IsString()
  @IsIn(CUSTOM_FIELD_ENTITY_TYPES)
  entityType!: (typeof CUSTOM_FIELD_ENTITY_TYPES)[number];

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsString()
  entityIds?: string;
}
