import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AllocateToJobDto, CreateStockMovementDto, UpsertPurchaseOrderDto, UpsertStockItemDto } from './dto';
export declare class InventoryService {
    private readonly prisma;
    private readonly audit;
    constructor(prisma: PrismaService, audit: AuditService);
    listItems(companyId: string, query: {
        locationId?: string;
        q?: string;
    }): Promise<any>;
    createItem(companyId: string, userId: string, dto: UpsertStockItemDto): Promise<any>;
    patchItem(companyId: string, userId: string, id: string, dto: Partial<UpsertStockItemDto>): Promise<any>;
    levels(companyId: string, locationId?: string): Promise<any>;
    addMovement(companyId: string, userId: string, dto: CreateStockMovementDto): Promise<any>;
    listMovements(companyId: string): Promise<any>;
    listPurchaseOrders(companyId: string): Promise<any>;
    createPurchaseOrder(companyId: string, userId: string, dto: UpsertPurchaseOrderDto): Promise<any>;
    patchPurchaseOrder(companyId: string, userId: string, id: string, dto: UpsertPurchaseOrderDto): Promise<any>;
    receivePurchaseOrder(companyId: string, userId: string, id: string): Promise<{
        ok: boolean;
    }>;
    allocateToJob(companyId: string, userId: string, itemId: string, dto: AllocateToJobDto): Promise<any>;
    lowStockAlerts(companyId: string): Promise<any>;
    valuation(companyId: string): Promise<{
        totalValue: any;
        items: any;
    }>;
    createReorderDraft(companyId: string, userId: string, itemId: string, qtyOrdered?: number, locationId?: string): Promise<any>;
}
