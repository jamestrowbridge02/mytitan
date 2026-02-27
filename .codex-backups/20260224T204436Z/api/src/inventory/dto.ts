import { IsArray, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertStockItemDto {
  @IsString()
  sku!: string;

  @IsString()
  name!: string;

  @IsString()
  unit!: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minLevel?: number;
}

export class CreateStockMovementDto {
  @IsString()
  stockItemId!: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsIn(['IN', 'OUT', 'ADJUST'])
  type!: 'IN' | 'OUT' | 'ADJUST';

  @IsNumber()
  qty!: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  jobId?: string;
}

export class CreatePoLineDto {
  @IsString()
  stockItemId!: string;

  @IsNumber()
  qtyOrdered!: number;

  @IsOptional()
  @IsNumber()
  unitCost?: number;
}

export class UpsertPurchaseOrderDto {
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'ORDERED', 'RECEIVED', 'CANCELLED'])
  status?: 'DRAFT' | 'ORDERED' | 'RECEIVED' | 'CANCELLED';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePoLineDto)
  lines?: CreatePoLineDto[];
}

export class AllocateToJobDto {
  @IsString()
  jobId!: string;

  @IsNumber()
  qty!: number;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

