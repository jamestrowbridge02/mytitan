export declare class UpsertStockItemDto {
    sku: string;
    name: string;
    unit: string;
    locationId?: string;
    supplierId?: string;
    minLevel?: number;
    avgUnitCost?: number;
}
export declare class CreateStockMovementDto {
    stockItemId: string;
    locationId?: string;
    type: 'IN' | 'OUT' | 'ADJUST';
    qty: number;
    reason?: string;
    jobId?: string;
}
export declare class CreatePoLineDto {
    stockItemId: string;
    qtyOrdered: number;
    unitCost?: number;
}
export declare class UpsertPurchaseOrderDto {
    locationId?: string;
    supplierId?: string;
    status?: 'DRAFT' | 'ORDERED' | 'RECEIVED' | 'CANCELLED';
    lines?: CreatePoLineDto[];
}
export declare class AllocateToJobDto {
    jobId: string;
    qty: number;
    locationId?: string;
    reason?: string;
}
