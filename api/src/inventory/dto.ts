import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

export class UpsertStockItemDto {
  @IsString()
  sku!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsString()
  unit!: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minLevel?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  avgUnitCost?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  unitPriceCents?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsObject()
  metadataJson?: Record<string, any>;
}

export class UpsertInventoryLocationDto {
  @IsString()
  name!: string;

  @IsIn(['WAREHOUSE', 'VAN', 'OFFICE', 'SUPPLIER_VIRTUAL'])
  kind!: 'WAREHOUSE' | 'VAN' | 'OFFICE' | 'SUPPLIER_VIRTUAL';

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  businessLocationId?: string;
}

export class CreateStockMovementDto {
  @IsString()
  stockItemId!: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  inventoryLocationId?: string;

  @IsIn(['IN', 'OUT', 'ADJUST', 'RESERVE', 'RELEASE', 'USE'])
  type!: 'IN' | 'OUT' | 'ADJUST' | 'RESERVE' | 'RELEASE' | 'USE';

  @IsNumber()
  qty!: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  jobId?: string;
}

export class AdjustInventoryStockDto {
  @IsString()
  stockItemId!: string;

  @IsString()
  inventoryLocationId!: string;

  @IsNumber()
  quantityDelta!: number;

  @IsOptional()
  @IsNumber()
  reorderPoint?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CreatePoLineDto {
  @IsString()
  stockItemId!: string;

  @IsNumber()
  @Min(0.01)
  qtyOrdered!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  qtyReceived?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;
}

export class UpsertPurchaseOrderDto {
  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  inventoryLocationId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  supplierName?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'])
  status?: 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';

  @IsOptional()
  @IsObject()
  notesJson?: Record<string, any>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePoLineDto)
  lines?: CreatePoLineDto[];
}

export class ReceivePurchaseOrderLineDto {
  @IsString()
  lineId!: string;

  @IsNumber()
  @Min(0)
  quantityReceived!: number;
}

export class ReceivePurchaseOrderDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivePurchaseOrderLineDto)
  lines?: ReceivePurchaseOrderLineDto[];
}

export class UpsertJobPartDto {
  @IsString()
  stockItemId!: string;

  @IsNumber()
  @Min(0.01)
  quantityPlanned!: number;

  @IsOptional()
  @IsString()
  sourceLocationId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  unitCostCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  unitPriceCents?: number;
}

export class PatchJobPartDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantityPlanned?: number;

  @IsOptional()
  @IsString()
  sourceLocationId?: string;

  @IsOptional()
  @IsIn(['PLANNED', 'RESERVED', 'USED', 'CANCELLED'])
  status?: 'PLANNED' | 'RESERVED' | 'USED' | 'CANCELLED';
}

export class JobPartQuantityActionDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  quantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AllocateToJobDto {
  @IsString()
  jobId!: string;

  @IsNumber()
  @Min(0.01)
  qty!: number;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
