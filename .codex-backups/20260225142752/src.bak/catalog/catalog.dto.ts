import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpsertCatalogItemDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  key?: string;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  defaultQty?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  vatEligible?: boolean;
}
