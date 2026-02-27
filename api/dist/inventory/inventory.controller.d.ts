import { JwtPayload } from '../auth/auth.types';
import { AllocateToJobDto, CreateStockMovementDto, UpsertPurchaseOrderDto, UpsertStockItemDto } from './dto';
import { InventoryService } from './inventory.service';
export declare class InventoryController {
    private readonly inventoryService;
    constructor(inventoryService: InventoryService);
    items(user: JwtPayload, locationId?: string, q?: string): any[] | Promise<any>;
    createItem(user: JwtPayload, dto: UpsertStockItemDto): Promise<any>;
    patchItem(user: JwtPayload, id: string, dto: Partial<UpsertStockItemDto>): Promise<any>;
    levels(user: JwtPayload, locationId?: string): any[] | Promise<any>;
    movements(user: JwtPayload, dto: CreateStockMovementDto): Promise<any>;
    listMovements(user: JwtPayload): any[] | Promise<any>;
    purchaseOrders(user: JwtPayload): any[] | Promise<any>;
    createPo(user: JwtPayload, dto: UpsertPurchaseOrderDto): Promise<any>;
    patchPo(user: JwtPayload, id: string, dto: UpsertPurchaseOrderDto): Promise<any>;
    receivePo(user: JwtPayload, id: string): Promise<{
        ok: boolean;
    }>;
    allocate(user: JwtPayload, id: string, dto: AllocateToJobDto): Promise<any>;
    alerts(user: JwtPayload): any[] | Promise<any>;
    valuation(user: JwtPayload): {
        totalValue: number;
        items: any[];
    } | Promise<{
        totalValue: any;
        items: any;
    }>;
    reorderDraft(user: JwtPayload, id: string, body: {
        qtyOrdered?: number;
        locationId?: string;
    }): Promise<any>;
}
