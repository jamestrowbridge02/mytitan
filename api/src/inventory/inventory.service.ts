import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtPayload } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { EnterpriseFeatureFlagsService } from '../enterprise/enterprise-feature-flags.service';
import { ActivityService } from '../events/activity.service';
import { PrismaService } from '../prisma/prisma.service';
import { InternalOnlySupplierPurchasingProvider } from './supplier-purchasing.provider';
import {
  AdjustInventoryStockDto,
  AssignTechnicianStockDto,
  AllocateToJobDto,
  CreatePurchaseOrderFromJobDto,
  CreateStockMovementDto,
  JobPartQuantityActionDto,
  PatchJobPartDto,
  PurchaseOrderTransitionDto,
  ReceiveStockDto,
  ReceivePurchaseOrderDto,
  TransferStockDto,
  UpsertInventoryCategoryDto,
  UpsertInventoryLocationDto,
  UpsertJobPartDto,
  UpsertPurchaseOrderDto,
  UpsertSupplierItemMappingDto,
  UpsertStockItemDto,
} from './dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly activity: ActivityService,
    private readonly enterpriseFlags: EnterpriseFeatureFlagsService,
    private readonly supplierPurchasingProvider: InternalOnlySupplierPurchasingProvider,
  ) {}

  private db() {
    return this.prisma as any;
  }

  private decimal(value: number | string | Prisma.Decimal | null | undefined) {
    return new Prisma.Decimal(Number(value || 0));
  }

  private toNumber(value: Prisma.Decimal | number | string | null | undefined) {
    return Number(value || 0);
  }

  private jsonObject(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
  }

  async assertTruckStockEnabled(tenantId: string, actor?: string | JwtPayload | null) {
    if (actor && typeof actor === 'object' && actor.platformAdmin) {
      throw new ForbiddenException('Platform admins cannot operate tenant stock');
    }
    const userId = typeof actor === 'string' ? actor : actor?.sub;
    return this.enterpriseFlags.assertEnabled({ tenantId, userId: userId || null, key: 'truck_stock_v1' });
  }

  private async resolvePart(tenantId: string, partId: string) {
    const item = await this.db().stockItem.findFirst({
      where: { id: partId, tenantId },
    });
    if (!item) throw new NotFoundException('Part not found');
    return item;
  }

  private async resolveInventoryLocation(tenantId: string, inventoryLocationId: string) {
    const location = await this.db().inventoryLocation.findFirst({
      where: { id: inventoryLocationId, tenantId },
    });
    if (!location) throw new NotFoundException('Inventory location not found');
    return location;
  }

  private async ensureTechnicianLocationScope(tenantId: string, actor: Pick<JwtPayload, 'sub' | 'role'> | null | undefined, inventoryLocationId?: string | null) {
    if (!actor || actor.role !== 'TECHNICIAN' || !inventoryLocationId) return;
    const assignment = await this.db().technicianStockAssignment.findFirst({
      where: {
        tenantId,
        technicianId: actor.sub,
        inventoryLocationId,
        active: true,
      },
      select: { id: true },
    });
    if (!assignment) {
      throw new BadRequestException('Technicians can only operate stock assigned to them');
    }
  }

  private async ensureTechnicianJobScope(tenantId: string, actor: Pick<JwtPayload, 'sub' | 'role'> | null | undefined, jobId: string) {
    if (!actor || actor.role !== 'TECHNICIAN') return;
    const job = await this.db().job.findFirst({
      where: { id: jobId, companyId: tenantId, assignedUserId: actor.sub },
      select: { id: true },
    });
    if (!job) {
      throw new BadRequestException('Technicians can only manage parts for assigned jobs');
    }
  }

  private async createInventoryNotification(tenantId: string, actorUserId: string, payload: { type: string; title: string; body: string; entityId: string; idempotencyKey: string; metaJson?: Record<string, any> }) {
    const recipients = await this.db().user.findMany({
      where: {
        companyId: tenantId,
        isActive: true,
        role: { in: ['OWNER', 'ADMIN', 'DISPATCHER'] },
      },
      select: { id: true },
      take: 20,
    });
    const rows = recipients.map((recipient: any) => ({
      companyId: tenantId,
      userId: recipient.id,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      entityType: 'inventory',
      entityId: payload.entityId,
      idempotencyKey: `${payload.idempotencyKey}:${recipient.id}`,
      metaJson: payload.metaJson || null,
    }));
    if (!rows.length) {
      rows.push({
        companyId: tenantId,
        userId: actorUserId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        entityType: 'inventory',
        entityId: payload.entityId,
        idempotencyKey: `${payload.idempotencyKey}:${actorUserId}`,
        metaJson: payload.metaJson || null,
      });
    }
    await this.db().notification.createMany({ data: rows, skipDuplicates: true });
  }

  private async createPurchaseNotification(tenantId: string, actorUserId: string, payload: { type: string; title: string; body: string; purchaseOrderId: string; status?: string; idempotencyKey: string }) {
    await this.createInventoryNotification(tenantId, actorUserId, {
      type: payload.type,
      title: payload.title,
      body: payload.body,
      entityId: payload.purchaseOrderId,
      idempotencyKey: payload.idempotencyKey,
      metaJson: {
        href: '/dashboard/purchase-orders',
        purchaseOrderId: payload.purchaseOrderId,
        status: payload.status || null,
        internalOnly: true,
      },
    });
  }

  private async resolveSupplier(tenantId: string, supplierId?: string | null) {
    if (!supplierId) return null;
    const supplier = await this.db().stockSupplier.findFirst({
      where: { id: supplierId, tenantId },
      select: { id: true, name: true, email: true, phone: true, capabilityMetadataJson: true, internalOnly: true },
    });
    if (!supplier) throw new BadRequestException('Supplier not found');
    return supplier;
  }

  private sanitizeSupplierSnapshot(supplier: any, fallbackName?: string | null) {
    if (!supplier && !fallbackName) return null;
    return {
      supplierId: supplier?.id || null,
      name: supplier?.name || fallbackName || null,
      capabilityMetadata: supplier?.capabilityMetadataJson || { internalPoOnly: true, liveOrdering: false },
      internalOnly: true,
      liveOrdering: false,
    };
  }

  supplierBridgeReadiness() {
    return {
      label: 'Internal PO only',
      provider: this.supplierPurchasingProvider.capabilities(),
      liveSupplierOrdering: false,
      dryRunOnly: true,
      credentialsExposed: false,
    };
  }

  private async resolveSupplierMappingSnapshot(tenantId: string, stockItemId: string, supplierId?: string | null, supplied?: { supplierSku?: string | null; supplierReference?: string | null }) {
    if (supplied?.supplierSku || supplied?.supplierReference) {
      return {
        supplierSku: supplied.supplierSku || null,
        supplierReference: supplied.supplierReference || null,
      };
    }
    const mapping = await this.db().supplierItemMapping.findFirst({
      where: {
        tenantId,
        stockItemId,
        active: true,
        ...(supplierId ? { supplierId } : {}),
      },
      orderBy: [{ preferred: 'desc' }, { updatedAt: 'desc' }],
      select: { supplierSku: true, supplierReference: true, supplierId: true, supplierName: true, preferred: true },
    });
    return {
      supplierSku: mapping?.supplierSku || null,
      supplierReference: mapping?.supplierReference || null,
      mappingPreferred: Boolean(mapping?.preferred),
      mappingSupplierId: mapping?.supplierId || null,
      mappingSupplierName: mapping?.supplierName || null,
    };
  }

  private async notifyIfLowStock(tenantId: string, actorUserId: string, stockItemId: string, inventoryLocationId: string) {
    const stock = await this.db().inventoryStock.findFirst({
      where: { tenantId, stockItemId, inventoryLocationId },
      include: { stockItem: true, inventoryLocation: true },
    });
    if (!stock) return;
    const quantityOnHand = this.toNumber(stock.quantityOnHand);
    const quantityReserved = this.toNumber(stock.quantityReserved);
    const reorderPoint = this.toNumber(stock.reorderPoint);
    const available = quantityOnHand - quantityReserved;
    const isCritical = available <= 0;
    const isLow = quantityOnHand <= reorderPoint || available <= reorderPoint;
    const isTruckLow = stock.inventoryLocation?.kind === 'VAN' && isLow;
    if (!isLow && !isCritical) return;
    const severity = isCritical ? 'critical' : 'low';
    await this.createInventoryNotification(tenantId, actorUserId, {
      type: isTruckLow ? 'inventory.truck_stock.low' : `inventory.stock.${severity}`,
      title: isCritical ? 'Critical stock attention needed' : isTruckLow ? 'Truck stock below threshold' : 'Low stock attention needed',
      body: `${stock.stockItem?.sku || 'Stock item'} at ${stock.inventoryLocation?.name || 'location'} has ${available.toFixed(2)} available.`,
      entityId: stock.id,
      idempotencyKey: `inventory:${severity}:${stock.id}:${Math.floor(Date.now() / 86_400_000)}`,
      metaJson: {
        href: '/dashboard/inventory',
        stockItemId,
        inventoryLocationId,
        quantityOnHand,
        quantityReserved,
        reorderPoint,
        availableQuantity: available,
      },
    });
  }

  private async resolveJob(tenantId: string, jobId: string) {
    const job = await this.db().job.findFirst({
      where: { id: jobId, companyId: tenantId },
      select: {
        id: true,
        jobRef: true,
        companyId: true,
        customerId: true,
        customerName: true,
        status: true,
        locationId: true,
        assignedUserId: true,
      },
    });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  private async resolveJobPart(tenantId: string, jobId: string, jobPartId: string) {
    const row = await this.db().jobPart.findFirst({
      where: {
        id: jobPartId,
        tenantId,
        jobId,
      },
      include: {
        stockItem: true,
        sourceLocation: true,
        job: {
          select: {
            id: true,
            jobRef: true,
            customerId: true,
            customerName: true,
            status: true,
            assignedUserId: true,
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Job part not found');
    return row;
  }

  private async ensureInventoryStock(tenantId: string, stockItemId: string, inventoryLocationId: string, tx?: any) {
    const client = tx || this.db();
    const existing = await client.inventoryStock.findFirst({
      where: {
        tenantId,
        stockItemId,
        inventoryLocationId,
      },
    });
    if (existing) return existing;
    const item = await this.resolvePart(tenantId, stockItemId);
    return client.inventoryStock.create({
      data: {
        tenantId,
        stockItemId,
        inventoryLocationId,
        quantityOnHand: this.decimal(0),
        quantityReserved: this.decimal(0),
        reorderPoint: item.minLevel || this.decimal(0),
      },
    });
  }

  private async pushInventoryActivity(
    tenantId: string,
    type: string,
    label: string,
    payloadJson: Record<string, any>,
    context?: { jobId?: string | null; jobRef?: string | null; customerId?: string | null; customerName?: string | null; status?: string | null },
  ) {
    await this.activity.push({
      tenantId,
      type,
      label,
      jobId: context?.jobId || null,
      jobRef: context?.jobRef || null,
      customerId: context?.customerId || null,
      customerName: context?.customerName || null,
      status: context?.status || null,
      payloadJson,
    });
  }

  private serializePart(item: any, stocks: any[] = []) {
    const quantityOnHand = stocks.reduce((sum, row) => sum + this.toNumber(row.quantityOnHand), 0);
    const quantityReserved = stocks.reduce((sum, row) => sum + this.toNumber(row.quantityReserved), 0);
    return {
      id: item.id,
      sku: item.sku,
      name: item.name,
      description: item.description || null,
      category: item.category || null,
      unit: item.unit,
      minLevel: this.toNumber(item.minLevel),
      avgUnitCost: this.toNumber(item.avgUnitCost),
      unitCostCents: Math.round(this.toNumber(item.avgUnitCost) * 100),
      unitPriceCents: Number(item.unitPriceCents || 0),
      active: Boolean(item.isActive),
      metadataJson: item.metadataJson ?? null,
      quantityOnHand,
      quantityReserved,
      availableQuantity: quantityOnHand - quantityReserved,
      stocks: stocks.map((row) => ({
        id: row.id,
        inventoryLocationId: row.inventoryLocationId,
        locationName: row.inventoryLocation?.name || null,
        locationKind: row.inventoryLocation?.kind || null,
        quantityOnHand: this.toNumber(row.quantityOnHand),
        quantityReserved: this.toNumber(row.quantityReserved),
        reorderPoint: this.toNumber(row.reorderPoint),
      })),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private serializeJobPart(row: any) {
    return {
      id: row.id,
      jobId: row.jobId,
      partId: row.stockItemId,
      part: row.stockItem
        ? {
            id: row.stockItem.id,
            sku: row.stockItem.sku,
            name: row.stockItem.name,
            unit: row.stockItem.unit,
          }
        : null,
      quantityPlanned: this.toNumber(row.quantityPlanned),
      quantityReserved: this.toNumber(row.quantityReserved),
      quantityUsed: this.toNumber(row.quantityUsed),
      unitCostCents: Number(row.unitCostCents || 0),
      unitPriceCents: Number(row.unitPriceCents || 0),
      sourceLocationId: row.sourceLocationId || null,
      sourceLocationName: row.sourceLocation?.name || null,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async listParts(tenantId: string, query: { q?: string; active?: string }) {
    const where: any = { tenantId };
    if (query.active === 'true') where.isActive = true;
    if (query.active === 'false') where.isActive = false;
    if (query.q) {
      const q = String(query.q || '').trim();
      where.OR = [
        { sku: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } },
      ];
    }

    const items = await this.db().stockItem.findMany({
      where,
      include: {
        inventoryStocks: {
          include: {
            inventoryLocation: true,
          },
        },
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });

    return items.map((item: any) => this.serializePart(item, item.inventoryStocks || []));
  }

  async createPart(tenantId: string, userId: string, dto: UpsertStockItemDto) {
    const item = await this.db().stockItem.create({
      data: {
        tenantId,
        sku: dto.sku.trim(),
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        category: dto.category?.trim() || null,
        unit: dto.unit.trim(),
        locationId: dto.locationId || null,
        supplierId: dto.supplierId || null,
        minLevel: this.decimal(dto.minLevel ?? 0),
        avgUnitCost: this.decimal((dto.avgUnitCost ?? 0)),
        unitPriceCents: Number(dto.unitPriceCents || 0),
        isActive: dto.active ?? true,
        metadataJson: dto.metadataJson ?? null,
      },
    });
    await this.audit.log(tenantId, 'inventory.part.create', `Created part ${item.sku}`, userId);
    await this.pushInventoryActivity(tenantId, 'inventory.part.created', `Created part ${item.sku}`, {
      partId: item.id,
      sku: item.sku,
      name: item.name,
    });
    return this.serializePart(item, []);
  }

  async patchPart(tenantId: string, userId: string, id: string, dto: Partial<UpsertStockItemDto>) {
    await this.resolvePart(tenantId, id);
    const updated = await this.db().stockItem.update({
      where: { id },
      data: {
        sku: dto.sku?.trim(),
        name: dto.name?.trim(),
        description: dto.description !== undefined ? dto.description?.trim() || null : undefined,
        category: dto.category !== undefined ? dto.category?.trim() || null : undefined,
        unit: dto.unit?.trim(),
        locationId: dto.locationId !== undefined ? dto.locationId || null : undefined,
        supplierId: dto.supplierId !== undefined ? dto.supplierId || null : undefined,
        minLevel: dto.minLevel !== undefined ? this.decimal(dto.minLevel) : undefined,
        avgUnitCost: dto.avgUnitCost !== undefined ? this.decimal(dto.avgUnitCost) : undefined,
        unitPriceCents: dto.unitPriceCents !== undefined ? Number(dto.unitPriceCents || 0) : undefined,
        isActive: dto.active !== undefined ? Boolean(dto.active) : undefined,
        metadataJson: dto.metadataJson !== undefined ? dto.metadataJson ?? null : undefined,
      },
      include: {
        inventoryStocks: {
          include: {
            inventoryLocation: true,
          },
        },
      },
    });
    await this.audit.log(tenantId, 'inventory.part.update', `Updated part ${updated.sku}`, userId);
    return this.serializePart(updated, updated.inventoryStocks || []);
  }

  async listInventoryLocations(tenantId: string, locationId?: string) {
    const rows = await this.db().inventoryLocation.findMany({
      where: {
        tenantId,
        ...(locationId && locationId !== 'all' ? { businessLocationId: locationId } : {}),
      },
      include: {
        businessLocation: {
          select: { id: true, name: true, code: true, kind: true },
        },
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
    return rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      businessLocationId: row.businessLocationId || null,
      businessLocationName: row.businessLocation?.name || null,
      active: Boolean(row.active),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async createInventoryLocation(tenantId: string, userId: string, dto: UpsertInventoryLocationDto) {
    if (dto.businessLocationId) {
      const businessLocation = await this.db().location.findFirst({
        where: { id: dto.businessLocationId, companyId: tenantId },
        select: { id: true },
      });
      if (!businessLocation) throw new BadRequestException('Business location not found');
    }
    const row = await this.db().inventoryLocation.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        kind: dto.kind,
        active: dto.active ?? true,
        businessLocationId: dto.businessLocationId || null,
      },
    });
    await this.audit.log(tenantId, 'inventory.location.create', `Created inventory location ${row.name}`, userId);
    return row;
  }

  async patchInventoryLocation(tenantId: string, userId: string, id: string, dto: Partial<UpsertInventoryLocationDto>) {
    await this.resolveInventoryLocation(tenantId, id);
    if (dto.businessLocationId) {
      const businessLocation = await this.db().location.findFirst({
        where: { id: dto.businessLocationId, companyId: tenantId },
        select: { id: true },
      });
      if (!businessLocation) throw new BadRequestException('Business location not found');
    }
    const updated = await this.db().inventoryLocation.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        kind: dto.kind,
        active: dto.active !== undefined ? Boolean(dto.active) : undefined,
        businessLocationId: dto.businessLocationId !== undefined ? dto.businessLocationId || null : undefined,
      },
    });
    await this.audit.log(tenantId, 'inventory.location.update', `Updated inventory location ${updated.name}`, userId);
    return updated;
  }

  async listStock(tenantId: string, query: { inventoryLocationId?: string; locationId?: string; q?: string }) {
    const where: any = { tenantId };
    if (query.inventoryLocationId && query.inventoryLocationId !== 'all') {
      where.inventoryLocationId = query.inventoryLocationId;
    }
    if (query.locationId && query.locationId !== 'all') {
      where.inventoryLocation = { ...(where.inventoryLocation || {}), businessLocationId: query.locationId };
    }
    if (query.q) {
      const q = String(query.q).trim();
      where.stockItem = {
        OR: [
          { sku: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
          { category: { contains: q, mode: 'insensitive' } },
        ],
      };
    }
    const rows = await this.db().inventoryStock.findMany({
      where,
      include: {
        stockItem: true,
        inventoryLocation: {
          include: {
            businessLocation: {
              select: { id: true, name: true, code: true, kind: true },
            },
          },
        },
      },
      orderBy: [{ inventoryLocation: { name: 'asc' } }, { stockItem: { name: 'asc' } }],
    });
    return rows.map((row: any) => {
      const quantityOnHand = this.toNumber(row.quantityOnHand);
      const quantityReserved = this.toNumber(row.quantityReserved);
      const reorderPoint = this.toNumber(row.reorderPoint);
      return {
        id: row.id,
        inventoryLocationId: row.inventoryLocationId,
        locationName: row.inventoryLocation?.name || null,
        locationKind: row.inventoryLocation?.kind || null,
        businessLocationId: row.inventoryLocation?.businessLocationId || null,
        businessLocationName: row.inventoryLocation?.businessLocation?.name || null,
        partId: row.stockItemId,
        sku: row.stockItem?.sku || null,
        name: row.stockItem?.name || null,
        category: row.stockItem?.category || null,
        quantityOnHand,
        quantityReserved,
        availableQuantity: quantityOnHand - quantityReserved,
        reorderPoint,
        lowStock: quantityOnHand <= reorderPoint,
        shortage: quantityOnHand - quantityReserved < 0,
        updatedAt: row.updatedAt,
      };
    });
  }

  async dashboard(tenantId: string) {
    const [stock, movements, jobParts, valuation, purchaseOrders, supplierMappings] = await Promise.all([
      this.listStock(tenantId, { inventoryLocationId: 'all' }),
      this.listMovements(tenantId),
      this.db().jobPart.findMany({
        where: { tenantId, status: { in: ['PLANNED', 'RESERVED', 'USED'] } },
        include: {
          stockItem: true,
          sourceLocation: true,
          job: { select: { id: true, jobRef: true, status: true, assignedUserId: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 25,
      }),
      this.valuation(tenantId),
      this.listPurchaseOrders(tenantId),
      this.listSupplierMappings(tenantId),
    ]);
    const truckStock = stock.filter((row: any) => row.locationKind === 'VAN');
    const warehouseStock = stock.filter((row: any) => row.locationKind === 'WAREHOUSE');
    const used = await this.db().stockMovement.groupBy({
      by: ['stockItemId'],
      where: { tenantId, type: 'USE' },
      _sum: { qty: true },
      orderBy: { _sum: { qty: 'desc' } },
      take: 10,
    });
    const usedItems = used.length
      ? await this.db().stockItem.findMany({
          where: { tenantId, id: { in: used.map((row: any) => row.stockItemId) } },
          select: { id: true, sku: true, name: true },
        })
      : [];
    const itemMap = new Map<string, any>(usedItems.map((item: any) => [item.id, item]));
    return {
      stockOnHand: stock.reduce((sum: number, row: any) => sum + Number(row.quantityOnHand || 0), 0),
      lowStock: stock.filter((row: any) => row.lowStock),
      criticalStock: stock.filter((row: any) => row.shortage || Number(row.availableQuantity || 0) <= 0),
      truckStock,
      warehouseStock,
      recentMovements: movements.slice(0, 20),
      topUsedItems: used.map((row: any) => ({
        stockItemId: row.stockItemId,
        sku: itemMap.get(row.stockItemId)?.sku || null,
        name: itemMap.get(row.stockItemId)?.name || null,
        quantityUsed: this.toNumber(row._sum?.qty),
      })),
      stockAssignedToJobs: jobParts.map((row: any) => this.serializeJobPart(row)),
      purchaseOrders: {
        open: purchaseOrders.filter((po: any) => !['RECEIVED', 'CANCELLED'].includes(String(po.status || ''))),
        pendingApproval: purchaseOrders.filter((po: any) => po.status === 'SUBMITTED_INTERNAL'),
        approvedAwaitingReceipt: purchaseOrders.filter((po: any) => ['APPROVED', 'ORDERED'].includes(String(po.status || ''))),
        partialReceipts: purchaseOrders.filter((po: any) => po.status === 'PARTIALLY_RECEIVED'),
      },
      supplierMappingStatus: {
        mappedItems: new Set(supplierMappings.map((row: any) => row.stockItemId)).size,
        missingLowStock: stock.filter((row: any) => row.lowStock && !supplierMappings.some((mapping: any) => mapping.stockItemId === row.partId)),
      },
      valuation,
    };
  }

  async listCategories(tenantId: string) {
    return this.db().inventoryCategory.findMany({
      where: { tenantId },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async upsertCategory(tenantId: string, userId: string, dto: UpsertInventoryCategoryDto) {
    const name = dto.name.trim();
    const row = await this.db().inventoryCategory.upsert({
      where: { tenantId_name: { tenantId, name } },
      create: {
        tenantId,
        name,
        description: dto.description?.trim() || null,
        active: dto.active ?? true,
      },
      update: {
        description: dto.description !== undefined ? dto.description?.trim() || null : undefined,
        active: dto.active !== undefined ? Boolean(dto.active) : undefined,
      },
    });
    await this.audit.log(tenantId, 'inventory.category.upsert', `Upserted inventory category ${name}`, userId);
    return row;
  }

  async listSupplierMappings(tenantId: string, stockItemId?: string) {
    return this.db().supplierItemMapping.findMany({
      where: { tenantId, ...(stockItemId ? { stockItemId } : {}) },
      include: { stockItem: { select: { id: true, sku: true, name: true } }, supplier: { select: { id: true, name: true } } },
      orderBy: [{ preferred: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async upsertSupplierMapping(tenantId: string, userId: string, dto: UpsertSupplierItemMappingDto) {
    await this.resolvePart(tenantId, dto.stockItemId);
    if (dto.supplierId) {
      const supplier = await this.db().stockSupplier.findFirst({ where: { tenantId, id: dto.supplierId }, select: { id: true } });
      if (!supplier) throw new BadRequestException('Supplier not found');
    }
    const supplierSku = dto.supplierSku.trim();
    const row = await this.db().supplierItemMapping.upsert({
      where: { tenantId_stockItemId_supplierSku: { tenantId, stockItemId: dto.stockItemId, supplierSku } },
      create: {
        tenantId,
        stockItemId: dto.stockItemId,
        supplierId: dto.supplierId || null,
        supplierName: dto.supplierName?.trim() || null,
        supplierSku,
        supplierReference: dto.supplierReference?.trim() || null,
        preferred: Boolean(dto.preferred),
        active: dto.active ?? true,
        metadataJson: dto.metadataJson ?? null,
      },
      update: {
        supplierId: dto.supplierId !== undefined ? dto.supplierId || null : undefined,
        supplierName: dto.supplierName !== undefined ? dto.supplierName?.trim() || null : undefined,
        supplierReference: dto.supplierReference !== undefined ? dto.supplierReference?.trim() || null : undefined,
        preferred: dto.preferred !== undefined ? Boolean(dto.preferred) : undefined,
        active: dto.active !== undefined ? Boolean(dto.active) : undefined,
        metadataJson: dto.metadataJson !== undefined ? dto.metadataJson ?? null : undefined,
      },
    });
    await this.audit.log(tenantId, 'inventory.supplier_mapping.upsert', `Updated supplier mapping for ${supplierSku}`, userId);
    return row;
  }

  async listTechnicianAssignments(tenantId: string) {
    return this.db().technicianStockAssignment.findMany({
      where: { tenantId },
      include: {
        technician: { select: { id: true, email: true, role: true, isActive: true } },
        inventoryLocation: true,
      },
      orderBy: [{ active: 'desc' }, { assignedAt: 'desc' }],
    });
  }

  async assignTechnicianStock(tenantId: string, userId: string, dto: AssignTechnicianStockDto) {
    const [technician] = await Promise.all([
      this.db().user.findFirst({ where: { id: dto.technicianId, companyId: tenantId, role: 'TECHNICIAN', isActive: true, isAssignable: true }, select: { id: true } }),
      this.resolveInventoryLocation(tenantId, dto.inventoryLocationId),
    ]);
    if (!technician) throw new BadRequestException('Technician not found');
    const row = await this.db().technicianStockAssignment.upsert({
      where: {
        tenantId_technicianId_inventoryLocationId: {
          tenantId,
          technicianId: dto.technicianId,
          inventoryLocationId: dto.inventoryLocationId,
        },
      },
      create: {
        tenantId,
        technicianId: dto.technicianId,
        inventoryLocationId: dto.inventoryLocationId,
        active: dto.active ?? true,
        notesJson: dto.notesJson ?? null,
      },
      update: {
        active: dto.active ?? true,
        releasedAt: dto.active === false ? new Date() : null,
        notesJson: dto.notesJson !== undefined ? dto.notesJson ?? null : undefined,
      },
    });
    await this.audit.log(tenantId, 'inventory.truck_stock.assign', `Assigned technician stock location ${dto.inventoryLocationId}`, userId);
    return row;
  }

  async adjustStock(tenantId: string, userId: string, dto: AdjustInventoryStockDto) {
    const item = await this.resolvePart(tenantId, dto.stockItemId);
    const inventoryLocation = await this.resolveInventoryLocation(tenantId, dto.inventoryLocationId);
    const db = this.db();

    const result = await db.$transaction(async (tx: any) => {
      const stock = await this.ensureInventoryStock(tenantId, item.id, inventoryLocation.id, tx);
      const nextOnHand = this.toNumber(stock.quantityOnHand) + Number(dto.quantityDelta || 0);
      if (nextOnHand < 0) {
        throw new BadRequestException('Stock adjustment would result in negative inventory');
      }
      const updatedStock = await tx.inventoryStock.update({
        where: { id: stock.id },
        data: {
          quantityOnHand: this.decimal(nextOnHand),
          reorderPoint: dto.reorderPoint !== undefined ? this.decimal(dto.reorderPoint) : stock.reorderPoint,
        },
        include: {
          stockItem: true,
          inventoryLocation: true,
        },
      });
      const movement = await tx.stockMovement.create({
        data: {
          tenantId,
          stockItemId: item.id,
          inventoryLocationId: inventoryLocation.id,
          type: 'ADJUST',
          qty: this.decimal(dto.quantityDelta),
          reason: dto.reason || 'Manual stock adjustment',
        },
      });
      return { updatedStock, movement };
    });

    await this.audit.log(tenantId, 'inventory.stock.adjust', `Adjusted stock for ${item.sku}`, userId);
    await this.pushInventoryActivity(tenantId, 'inventory.stock.adjusted', `Adjusted stock for ${item.sku}`, {
      partId: item.id,
      inventoryLocationId: inventoryLocation.id,
      quantityDelta: dto.quantityDelta,
      movementId: result.movement.id,
    });
    await this.notifyIfLowStock(tenantId, userId, item.id, inventoryLocation.id);
    return result.updatedStock;
  }

  async receiveStock(tenantId: string, userId: string, dto: ReceiveStockDto) {
    return this.adjustStock(tenantId, userId, {
      stockItemId: dto.stockItemId,
      inventoryLocationId: dto.inventoryLocationId,
      quantityDelta: dto.quantity,
      reason: dto.reason || 'Manual stock receipt',
    });
  }

  async returnStock(tenantId: string, userId: string, dto: ReceiveStockDto, actor?: Pick<JwtPayload, 'sub' | 'role'>) {
    await this.ensureTechnicianLocationScope(tenantId, actor, dto.inventoryLocationId);
    const result = await this.adjustStock(tenantId, userId, {
      stockItemId: dto.stockItemId,
      inventoryLocationId: dto.inventoryLocationId,
      quantityDelta: dto.quantity,
      reason: dto.reason || 'Returned unused stock',
    });
    await this.audit.log(tenantId, 'inventory.stock.return', `Returned stock ${dto.stockItemId}`, userId);
    return result;
  }

  async transferStock(tenantId: string, userId: string, dto: TransferStockDto, actor?: Pick<JwtPayload, 'sub' | 'role'>) {
    if (dto.fromInventoryLocationId === dto.toInventoryLocationId) {
      throw new BadRequestException('Transfer source and destination must be different');
    }
    await this.ensureTechnicianLocationScope(tenantId, actor, dto.fromInventoryLocationId);
    const [item, fromLocation, toLocation] = await Promise.all([
      this.resolvePart(tenantId, dto.stockItemId),
      this.resolveInventoryLocation(tenantId, dto.fromInventoryLocationId),
      this.resolveInventoryLocation(tenantId, dto.toInventoryLocationId),
    ]);
    const quantity = Number(dto.quantity || 0);
    if (quantity <= 0) throw new BadRequestException('Transfer quantity must be greater than zero');

    const result = await this.db().$transaction(async (tx: any) => {
      const fromStock = await this.ensureInventoryStock(tenantId, item.id, fromLocation.id, tx);
      const toStock = await this.ensureInventoryStock(tenantId, item.id, toLocation.id, tx);
      const available = this.toNumber(fromStock.quantityOnHand) - this.toNumber(fromStock.quantityReserved);
      if (available < quantity) throw new BadRequestException('Not enough available stock to transfer');
      const updatedFrom = await tx.inventoryStock.update({
        where: { id: fromStock.id },
        data: { quantityOnHand: this.decimal(this.toNumber(fromStock.quantityOnHand) - quantity) },
      });
      const updatedTo = await tx.inventoryStock.update({
        where: { id: toStock.id },
        data: { quantityOnHand: this.decimal(this.toNumber(toStock.quantityOnHand) + quantity) },
      });
      const movement = await tx.stockMovement.create({
        data: {
          tenantId,
          stockItemId: item.id,
          inventoryLocationId: toLocation.id,
          fromInventoryLocationId: fromLocation.id,
          toInventoryLocationId: toLocation.id,
          type: 'TRANSFER',
          qty: this.decimal(quantity),
          reason: dto.reason || `Transferred from ${fromLocation.name} to ${toLocation.name}`,
        },
      });
      return { updatedFrom, updatedTo, movement };
    });

    await this.audit.log(tenantId, 'inventory.stock.transfer', `Transferred ${quantity} of ${item.sku}`, userId);
    await this.pushInventoryActivity(tenantId, 'inventory.stock.transferred', `Transferred ${item.sku}`, {
      partId: item.id,
      fromInventoryLocationId: fromLocation.id,
      toInventoryLocationId: toLocation.id,
      quantity,
      movementId: result.movement.id,
    });
    await Promise.all([
      this.notifyIfLowStock(tenantId, userId, item.id, fromLocation.id),
      this.notifyIfLowStock(tenantId, userId, item.id, toLocation.id),
    ]);
    return result;
  }

  async listJobParts(tenantId: string, jobId: string) {
    await this.resolveJob(tenantId, jobId);
    const rows = await this.db().jobPart.findMany({
      where: { tenantId, jobId },
      include: {
        stockItem: true,
        sourceLocation: true,
      },
      orderBy: [{ createdAt: 'asc' }],
    });
    return rows.map((row: any) => this.serializeJobPart(row));
  }

  async createJobPart(tenantId: string, userId: string, jobId: string, dto: UpsertJobPartDto, actor?: Pick<JwtPayload, 'sub' | 'role'>) {
    await this.ensureTechnicianJobScope(tenantId, actor, jobId);
    await this.ensureTechnicianLocationScope(tenantId, actor, dto.sourceLocationId);
    const [job, item] = await Promise.all([this.resolveJob(tenantId, jobId), this.resolvePart(tenantId, dto.stockItemId)]);
    if (dto.sourceLocationId) {
      await this.resolveInventoryLocation(tenantId, dto.sourceLocationId);
    }
    const row = await this.db().jobPart.create({
      data: {
        tenantId,
        jobId: job.id,
        stockItemId: item.id,
        quantityPlanned: this.decimal(dto.quantityPlanned),
        quantityReserved: this.decimal(0),
        quantityUsed: this.decimal(0),
        unitCostCents: dto.unitCostCents ?? Math.round(this.toNumber(item.avgUnitCost) * 100),
        unitPriceCents: dto.unitPriceCents ?? Number(item.unitPriceCents || 0),
        sourceLocationId: dto.sourceLocationId || null,
        status: 'PLANNED',
      },
      include: {
        stockItem: true,
        sourceLocation: true,
      },
    });
    await this.audit.log(tenantId, 'inventory.job_part.create', `Added part ${item.sku} to ${job.jobRef || job.id}`, userId);
    await this.pushInventoryActivity(tenantId, 'inventory.job_part.planned', `Planned ${item.sku} for ${job.jobRef || job.id}`, {
      jobPartId: row.id,
      partId: item.id,
      quantityPlanned: dto.quantityPlanned,
    }, job);
    return this.serializeJobPart(row);
  }

  async patchJobPart(tenantId: string, userId: string, jobId: string, jobPartId: string, dto: PatchJobPartDto, actor?: Pick<JwtPayload, 'sub' | 'role'>) {
    await this.ensureTechnicianJobScope(tenantId, actor, jobId);
    await this.ensureTechnicianLocationScope(tenantId, actor, dto.sourceLocationId);
    const row = await this.resolveJobPart(tenantId, jobId, jobPartId);
    if (dto.sourceLocationId) {
      await this.resolveInventoryLocation(tenantId, dto.sourceLocationId);
    }
    if (dto.status === 'CANCELLED' && this.toNumber(row.quantityReserved) > 0) {
      throw new BadRequestException('Release reserved quantity before cancelling this job part');
    }
    const updated = await this.db().jobPart.update({
      where: { id: row.id },
      data: {
        quantityPlanned: dto.quantityPlanned !== undefined ? this.decimal(dto.quantityPlanned) : undefined,
        sourceLocationId: dto.sourceLocationId !== undefined ? dto.sourceLocationId || null : undefined,
        status: dto.status,
      },
      include: {
        stockItem: true,
        sourceLocation: true,
      },
    });
    await this.audit.log(tenantId, 'inventory.job_part.update', `Updated job part ${row.stockItem.sku}`, userId);
    return this.serializeJobPart(updated);
  }

  async reserveJobPart(tenantId: string, userId: string, jobId: string, jobPartId: string, dto: JobPartQuantityActionDto, actor?: Pick<JwtPayload, 'sub' | 'role'>) {
    await this.ensureTechnicianJobScope(tenantId, actor, jobId);
    const row = await this.resolveJobPart(tenantId, jobId, jobPartId);
    await this.ensureTechnicianLocationScope(tenantId, actor, row.sourceLocationId);
    if (!row.sourceLocationId) {
      throw new BadRequestException('A source inventory location is required before reservation');
    }
    const quantity = Number(dto.quantity || Math.max(0, this.toNumber(row.quantityPlanned) - this.toNumber(row.quantityReserved) - this.toNumber(row.quantityUsed)));
    if (quantity <= 0) {
      throw new BadRequestException('No quantity is available to reserve');
    }

    const result = await this.db().$transaction(async (tx: any) => {
      const stock = await this.ensureInventoryStock(tenantId, row.stockItemId, row.sourceLocationId, tx);
      const available = this.toNumber(stock.quantityOnHand) - this.toNumber(stock.quantityReserved);
      if (available < quantity) {
        throw new ConflictException('Not enough available stock to reserve this quantity');
      }
      await tx.inventoryStock.update({
        where: { id: stock.id },
        data: {
          quantityReserved: this.decimal(this.toNumber(stock.quantityReserved) + quantity),
        },
      });
      const updated = await tx.jobPart.update({
        where: { id: row.id },
        data: {
          quantityReserved: this.decimal(this.toNumber(row.quantityReserved) + quantity),
          status: 'RESERVED',
        },
        include: {
          stockItem: true,
          sourceLocation: true,
        },
      });
      const movement = await tx.stockMovement.create({
        data: {
          tenantId,
          stockItemId: row.stockItemId,
          inventoryLocationId: row.sourceLocationId,
          type: 'RESERVE',
          qty: this.decimal(quantity),
          reason: dto.reason || `Reserved for ${row.job.jobRef || row.job.id}`,
          jobId,
        },
      });
      return { updated, movement };
    });

    await this.audit.log(tenantId, 'inventory.job_part.reserve', `Reserved ${quantity} of ${row.stockItem.sku}`, userId);
    await this.pushInventoryActivity(tenantId, 'inventory.job_part.reserved', `Reserved ${row.stockItem.sku} for ${row.job.jobRef || row.job.id}`, {
      jobPartId: row.id,
      quantity,
      movementId: result.movement.id,
    }, row.job);
    return this.serializeJobPart(result.updated);
  }

  async useJobPart(tenantId: string, userId: string, jobId: string, jobPartId: string, dto: JobPartQuantityActionDto, actor?: Pick<JwtPayload, 'sub' | 'role'>) {
    await this.ensureTechnicianJobScope(tenantId, actor, jobId);
    const row = await this.resolveJobPart(tenantId, jobId, jobPartId);
    await this.ensureTechnicianLocationScope(tenantId, actor, row.sourceLocationId);
    if (!row.sourceLocationId) {
      throw new BadRequestException('A source inventory location is required before parts can be used');
    }
    const remainingPlanned = Math.max(0, this.toNumber(row.quantityPlanned) - this.toNumber(row.quantityUsed));
    const quantity = Number(dto.quantity || remainingPlanned);
    if (quantity <= 0) throw new BadRequestException('No quantity is available to mark as used');

    const result = await this.db().$transaction(async (tx: any) => {
      const stock = await this.ensureInventoryStock(tenantId, row.stockItemId, row.sourceLocationId, tx);
      const onHand = this.toNumber(stock.quantityOnHand);
      const reserved = this.toNumber(stock.quantityReserved);
      if (onHand < quantity) {
        throw new ConflictException('Not enough stock on hand to mark this quantity as used');
      }
      const reservedToConsume = Math.min(quantity, this.toNumber(row.quantityReserved));
      const nextReserved = reserved - reservedToConsume;
      if (nextReserved < 0) {
        throw new ConflictException('Reserved stock is inconsistent for this part');
      }
      await tx.inventoryStock.update({
        where: { id: stock.id },
        data: {
          quantityOnHand: this.decimal(onHand - quantity),
          quantityReserved: this.decimal(nextReserved),
        },
      });
      const nextUsed = this.toNumber(row.quantityUsed) + quantity;
      const nextRowReserved = Math.max(0, this.toNumber(row.quantityReserved) - reservedToConsume);
      const updated = await tx.jobPart.update({
        where: { id: row.id },
        data: {
          quantityUsed: this.decimal(nextUsed),
          quantityReserved: this.decimal(nextRowReserved),
          status: nextUsed >= this.toNumber(row.quantityPlanned) ? 'USED' : (nextRowReserved > 0 ? 'RESERVED' : 'PLANNED'),
        },
        include: {
          stockItem: true,
          sourceLocation: true,
        },
      });
      const movement = await tx.stockMovement.create({
        data: {
          tenantId,
          stockItemId: row.stockItemId,
          inventoryLocationId: row.sourceLocationId,
          type: 'USE',
          qty: this.decimal(quantity),
          reason: dto.reason || `Used on ${row.job.jobRef || row.job.id}`,
          jobId,
        },
      });
      return { updated, movement };
    });

    const unitPrice = Number(row.unitPriceCents || 0) / 100;
    await this.db().jobLineItem.create({
      data: {
        companyId: tenantId,
        jobId,
        stockItemId: row.stockItemId,
        description: `${row.stockItem.sku} - ${row.stockItem.name}`,
        qty: this.decimal(quantity),
        unitPrice: this.decimal(unitPrice),
        total: this.decimal(quantity * unitPrice),
      },
    });

    await this.audit.log(tenantId, 'inventory.job_part.use', `Marked ${quantity} of ${row.stockItem.sku} as used`, userId);
    await this.pushInventoryActivity(tenantId, 'inventory.job_part.used', `Used ${row.stockItem.sku} on ${row.job.jobRef || row.job.id}`, {
      jobPartId: row.id,
      quantity,
      movementId: result.movement.id,
    }, row.job);
    await this.notifyIfLowStock(tenantId, userId, row.stockItemId, row.sourceLocationId);
    return this.serializeJobPart(result.updated);
  }

  async releaseJobPart(tenantId: string, userId: string, jobId: string, jobPartId: string, dto: JobPartQuantityActionDto, actor?: Pick<JwtPayload, 'sub' | 'role'>) {
    await this.ensureTechnicianJobScope(tenantId, actor, jobId);
    const row = await this.resolveJobPart(tenantId, jobId, jobPartId);
    await this.ensureTechnicianLocationScope(tenantId, actor, row.sourceLocationId);
    if (!row.sourceLocationId) {
      throw new BadRequestException('A source inventory location is required before release');
    }
    const quantity = Number(dto.quantity || this.toNumber(row.quantityReserved));
    if (quantity <= 0) throw new BadRequestException('No reserved quantity is available to release');
    if (quantity > this.toNumber(row.quantityReserved)) throw new BadRequestException('Release quantity exceeds reserved quantity');

    const result = await this.db().$transaction(async (tx: any) => {
      const stock = await this.ensureInventoryStock(tenantId, row.stockItemId, row.sourceLocationId, tx);
      const nextStockReserved = this.toNumber(stock.quantityReserved) - quantity;
      if (nextStockReserved < 0) {
        throw new ConflictException('Reserved stock is inconsistent for this part');
      }
      await tx.inventoryStock.update({
        where: { id: stock.id },
        data: {
          quantityReserved: this.decimal(nextStockReserved),
        },
      });
      const nextRowReserved = this.toNumber(row.quantityReserved) - quantity;
      const updated = await tx.jobPart.update({
        where: { id: row.id },
        data: {
          quantityReserved: this.decimal(nextRowReserved),
          status: this.toNumber(row.quantityUsed) > 0 ? 'USED' : (nextRowReserved > 0 ? 'RESERVED' : 'PLANNED'),
        },
        include: {
          stockItem: true,
          sourceLocation: true,
        },
      });
      const movement = await tx.stockMovement.create({
        data: {
          tenantId,
          stockItemId: row.stockItemId,
          inventoryLocationId: row.sourceLocationId,
          type: 'RELEASE',
          qty: this.decimal(quantity),
          reason: dto.reason || `Released from ${row.job.jobRef || row.job.id}`,
          jobId,
        },
      });
      return { updated, movement };
    });

    await this.audit.log(tenantId, 'inventory.job_part.release', `Released ${quantity} of ${row.stockItem.sku}`, userId);
    await this.pushInventoryActivity(tenantId, 'inventory.job_part.released', `Released ${row.stockItem.sku} for ${row.job.jobRef || row.job.id}`, {
      jobPartId: row.id,
      quantity,
      movementId: result.movement.id,
    }, row.job);
    return this.serializeJobPart(result.updated);
  }

  async listPurchaseOrders(tenantId: string, locationId?: string) {
    const rows = await this.db().stockPurchaseOrder.findMany({
      where: {
        tenantId,
        ...(locationId && locationId !== 'all' ? { OR: [{ locationId }, { inventoryLocation: { businessLocationId: locationId } }] } : {}),
      },
      include: {
        inventoryLocation: true,
        supplier: true,
        lines: {
          include: {
            stockItem: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return rows.map((row: any) => ({
      id: row.id,
      status: row.status,
      internalOnly: row.internalOnly !== false,
      supplierName: row.supplierName || row.supplier?.name || null,
      supplierId: row.supplierId || null,
      supplierSnapshotJson: row.supplierSnapshotJson || null,
      locationId: row.locationId || null,
      inventoryLocationId: row.inventoryLocationId || null,
      inventoryLocationName: row.inventoryLocation?.name || null,
      businessLocationId: row.inventoryLocation?.businessLocationId || row.locationId || null,
      createdByUserId: row.createdByUserId || null,
      approvedByUserId: row.approvedByUserId || null,
      receivedByUserId: row.receivedByUserId || null,
      submittedAt: row.submittedAt || null,
      approvedAt: row.approvedAt || null,
      cancelledAt: row.cancelledAt || null,
      orderedAt: row.orderedAt,
      receivedAt: row.receivedAt,
      notesJson: row.notesJson ?? null,
      lines: (row.lines || []).map((line: any) => ({
        id: line.id,
        partId: line.stockItemId,
        sourceJobId: line.sourceJobId || null,
        sku: line.stockItem?.sku || null,
        name: line.stockItem?.name || null,
        quantityOrdered: this.toNumber(line.qtyOrdered),
        quantityReceived: this.toNumber(line.qtyReceived),
        unitCostCents: Math.round(this.toNumber(line.unitCost) * 100),
        supplierSku: line.supplierSku || null,
        supplierReference: line.supplierReference || null,
        pricingSnapshotJson: line.pricingSnapshotJson || null,
        notesJson: line.notesJson || null,
      })),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async createPurchaseOrder(tenantId: string, userId: string, dto: UpsertPurchaseOrderDto) {
    if (dto.inventoryLocationId) {
      await this.resolveInventoryLocation(tenantId, dto.inventoryLocationId);
    }
    const supplier = await this.resolveSupplier(tenantId, dto.supplierId);
    const lines = Array.isArray(dto.lines) ? dto.lines : [];
    const parts = await Promise.all(lines.map((line) => this.resolvePart(tenantId, line.stockItemId)));
    if (lines.some((line) => Number(line.qtyOrdered || 0) <= 0)) {
      throw new BadRequestException('Purchase order lines must have a positive quantity');
    }
    const status = dto.status || 'DRAFT';
    const lineSnapshots = await Promise.all(lines.map(async (line, index) => {
      const part = parts[index];
      const mapping = await this.resolveSupplierMappingSnapshot(tenantId, line.stockItemId, dto.supplierId, line);
      return {
        stockItemId: line.stockItemId,
        sourceJobId: line.sourceJobId || null,
        qtyOrdered: this.decimal(line.qtyOrdered),
        qtyReceived: this.decimal(line.qtyReceived ?? 0),
        unitCost: this.decimal(line.unitCost ?? this.toNumber(part.avgUnitCost)),
        supplierSku: mapping.supplierSku || null,
        supplierReference: mapping.supplierReference || null,
        notesJson: line.notesJson ?? null,
        pricingSnapshotJson: {
          stockItemId: part.id,
          sku: part.sku,
          name: part.name,
          unit: part.unit,
          expectedUnitCost: Number(line.unitCost ?? this.toNumber(part.avgUnitCost)),
          supplierSku: mapping.supplierSku || null,
          supplierReference: mapping.supplierReference || null,
          internalPoOnly: true,
        },
      };
    }));

    const po = await this.db().stockPurchaseOrder.create({
      data: {
        tenantId,
        locationId: dto.locationId || null,
        inventoryLocationId: dto.inventoryLocationId || null,
        supplierId: dto.supplierId || null,
        supplierName: dto.supplierName?.trim() || null,
        status,
        createdByUserId: userId,
        submittedAt: status === 'SUBMITTED_INTERNAL' ? new Date() : null,
        approvedAt: ['APPROVED', 'ORDERED'].includes(status) ? new Date() : null,
        orderedAt: ['APPROVED', 'ORDERED'].includes(status) ? new Date() : null,
        notesJson: dto.notesJson ?? null,
        supplierSnapshotJson: this.sanitizeSupplierSnapshot(supplier, dto.supplierName?.trim() || null),
        internalOnly: true,
        lines: lines.length
          ? {
              create: lineSnapshots,
            }
          : undefined,
      },
      include: {
        inventoryLocation: true,
        supplier: true,
        lines: { include: { stockItem: true } },
      },
    });
    await this.audit.log(tenantId, 'inventory.po.create', `Created purchase order ${po.id}`, userId);
    await this.pushInventoryActivity(tenantId, 'inventory.purchase_order.created', `Created purchase order ${po.id.slice(0, 12)}`, {
      purchaseOrderId: po.id,
      status: po.status,
      internalOnly: true,
    });
    if (!lineSnapshots.every((line) => line.supplierSku || line.supplierReference)) {
      await this.createPurchaseNotification(tenantId, userId, {
        type: 'inventory.purchase_order.supplier_mapping_missing',
        title: 'Supplier mapping missing',
        body: 'One or more internal PO lines do not have a supplier SKU mapping yet.',
        purchaseOrderId: po.id,
        status: po.status,
        idempotencyKey: `inventory:po:${po.id}:mapping-missing`,
      });
    }
    return (await this.listPurchaseOrders(tenantId)).find((row: any) => row.id === po.id);
  }

  async patchPurchaseOrder(tenantId: string, userId: string, id: string, dto: UpsertPurchaseOrderDto) {
    const existing = await this.db().stockPurchaseOrder.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!existing) throw new NotFoundException('Purchase order not found');
    if (dto.inventoryLocationId) {
      await this.resolveInventoryLocation(tenantId, dto.inventoryLocationId);
    }
    const supplier = dto.supplierId !== undefined ? await this.resolveSupplier(tenantId, dto.supplierId) : undefined;
    let nextLineData: any[] | undefined;
    if (Array.isArray(dto.lines)) {
      const parts = await Promise.all(dto.lines.map((line) => this.resolvePart(tenantId, line.stockItemId)));
      nextLineData = await Promise.all(dto.lines.map(async (line, index) => {
        const part = parts[index];
        const mapping = await this.resolveSupplierMappingSnapshot(tenantId, line.stockItemId, dto.supplierId ?? existing.supplierId, line);
        return {
          poId: id,
          stockItemId: line.stockItemId,
          sourceJobId: line.sourceJobId || null,
          qtyOrdered: this.decimal(line.qtyOrdered),
          qtyReceived: this.decimal(line.qtyReceived ?? 0),
          unitCost: this.decimal(line.unitCost ?? this.toNumber(part.avgUnitCost)),
          supplierSku: mapping.supplierSku || null,
          supplierReference: mapping.supplierReference || null,
          notesJson: line.notesJson ?? null,
          pricingSnapshotJson: {
            stockItemId: part.id,
            sku: part.sku,
            name: part.name,
            unit: part.unit,
            expectedUnitCost: Number(line.unitCost ?? this.toNumber(part.avgUnitCost)),
            supplierSku: mapping.supplierSku || null,
            supplierReference: mapping.supplierReference || null,
            internalPoOnly: true,
          },
        };
      }));
    }

    await this.db().$transaction(async (tx: any) => {
      await tx.stockPurchaseOrder.update({
        where: { id },
        data: {
          locationId: dto.locationId !== undefined ? dto.locationId || null : undefined,
          inventoryLocationId: dto.inventoryLocationId !== undefined ? dto.inventoryLocationId || null : undefined,
          supplierId: dto.supplierId !== undefined ? dto.supplierId || null : undefined,
          supplierName: dto.supplierName !== undefined ? dto.supplierName?.trim() || null : undefined,
          status: dto.status,
          submittedAt: dto.status === 'SUBMITTED_INTERNAL' && !existing.submittedAt ? new Date() : existing.submittedAt,
          approvedAt: dto.status && ['APPROVED', 'ORDERED'].includes(dto.status) && !existing.approvedAt ? new Date() : existing.approvedAt,
          orderedAt: dto.status && ['APPROVED', 'ORDERED'].includes(dto.status) && !existing.orderedAt ? new Date() : existing.orderedAt,
          cancelledAt: dto.status === 'CANCELLED' && !existing.cancelledAt ? new Date() : existing.cancelledAt,
          notesJson: dto.notesJson !== undefined ? dto.notesJson ?? null : undefined,
          supplierSnapshotJson: dto.supplierId !== undefined || dto.supplierName !== undefined
            ? this.sanitizeSupplierSnapshot(supplier, dto.supplierName?.trim() || existing.supplierName || null)
            : undefined,
        },
      });
      if (Array.isArray(dto.lines)) {
        await tx.stockPOLine.deleteMany({ where: { poId: id } });
        if (nextLineData?.length) {
          await tx.stockPOLine.createMany({
            data: nextLineData,
          });
        }
      }
    });
    await this.audit.log(tenantId, 'inventory.po.update', `Updated purchase order ${id}`, userId);
    return (await this.listPurchaseOrders(tenantId)).find((row: any) => row.id === id);
  }

  async submitPurchaseOrder(tenantId: string, userId: string, id: string, dto?: PurchaseOrderTransitionDto) {
    const existing = await this.db().stockPurchaseOrder.findFirst({ where: { id, tenantId }, include: { lines: true } });
    if (!existing) throw new NotFoundException('Purchase order not found');
    if (['RECEIVED', 'CANCELLED'].includes(existing.status)) throw new BadRequestException('This purchase order cannot be submitted');
    if (!existing.lines.length) throw new BadRequestException('Purchase order must include at least one line before submission');
    const updated = await this.db().stockPurchaseOrder.update({
      where: { id },
      data: {
        status: 'SUBMITTED_INTERNAL',
        submittedAt: existing.submittedAt || new Date(),
        notesJson: dto?.note ? { ...this.jsonObject(existing.notesJson), submitNote: dto.note } : existing.notesJson,
      },
    });
    await this.audit.log(tenantId, 'inventory.po.submit', `Submitted purchase order ${id} for internal approval`, userId);
    await this.createPurchaseNotification(tenantId, userId, {
      type: 'inventory.purchase_order.submitted',
      title: 'Purchase order submitted',
      body: `Internal PO ${id.slice(0, 12)} is ready for approval.`,
      purchaseOrderId: id,
      status: updated.status,
      idempotencyKey: `inventory:po:${id}:submitted:${updated.updatedAt?.getTime?.() || Date.now()}`,
    });
    return (await this.listPurchaseOrders(tenantId)).find((row: any) => row.id === id);
  }

  async approvePurchaseOrder(tenantId: string, userId: string, id: string, dto?: PurchaseOrderTransitionDto) {
    const existing = await this.db().stockPurchaseOrder.findFirst({ where: { id, tenantId }, include: { lines: true } });
    if (!existing) throw new NotFoundException('Purchase order not found');
    if (['RECEIVED', 'CANCELLED'].includes(existing.status)) throw new BadRequestException('This purchase order cannot be approved');
    if (!existing.lines.length) throw new BadRequestException('Purchase order must include at least one line before approval');
    const updated = await this.db().stockPurchaseOrder.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedByUserId: userId,
        approvedAt: existing.approvedAt || new Date(),
        orderedAt: existing.orderedAt || new Date(),
        notesJson: dto?.note ? { ...this.jsonObject(existing.notesJson), approvalNote: dto.note } : existing.notesJson,
      },
    });
    await this.audit.log(tenantId, 'inventory.po.approve', `Approved internal purchase order ${id}`, userId);
    await this.createPurchaseNotification(tenantId, userId, {
      type: 'inventory.purchase_order.approved',
      title: 'Purchase order approved',
      body: `Internal PO ${id.slice(0, 12)} is approved and awaiting receipt.`,
      purchaseOrderId: id,
      status: updated.status,
      idempotencyKey: `inventory:po:${id}:approved:${updated.updatedAt?.getTime?.() || Date.now()}`,
    });
    return (await this.listPurchaseOrders(tenantId)).find((row: any) => row.id === id);
  }

  async cancelPurchaseOrder(tenantId: string, userId: string, id: string, dto?: PurchaseOrderTransitionDto) {
    const existing = await this.db().stockPurchaseOrder.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Purchase order not found');
    if (existing.status === 'RECEIVED') throw new BadRequestException('Received purchase orders cannot be cancelled');
    const updated = await this.db().stockPurchaseOrder.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: existing.cancelledAt || new Date(),
        notesJson: dto?.note ? { ...this.jsonObject(existing.notesJson), cancellationNote: dto.note } : existing.notesJson,
      },
    });
    await this.audit.log(tenantId, 'inventory.po.cancel', `Cancelled internal purchase order ${id}`, userId);
    await this.createPurchaseNotification(tenantId, userId, {
      type: 'inventory.purchase_order.cancelled',
      title: 'Purchase order cancelled',
      body: `Internal PO ${id.slice(0, 12)} has been cancelled.`,
      purchaseOrderId: id,
      status: updated.status,
      idempotencyKey: `inventory:po:${id}:cancelled:${updated.updatedAt?.getTime?.() || Date.now()}`,
    });
    return (await this.listPurchaseOrders(tenantId)).find((row: any) => row.id === id);
  }

  async receivePurchaseOrder(tenantId: string, userId: string, id: string, dto?: ReceivePurchaseOrderDto) {
    const po = await this.db().stockPurchaseOrder.findFirst({
      where: { id, tenantId },
      include: {
        lines: true,
      },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (!po.inventoryLocationId) {
      throw new BadRequestException('Purchase order must target an inventory location before receiving');
    }
    if (po.status === 'CANCELLED') {
      throw new BadRequestException('Cancelled purchase orders cannot be received');
    }
    if (!['APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
      throw new BadRequestException('Purchase order must be approved before receiving stock');
    }
    if (po.lines.every((line: any) => this.toNumber(line.qtyReceived) >= this.toNumber(line.qtyOrdered))) {
      throw new BadRequestException('Purchase order has already been fully received');
    }

    const lineReceipts = new Map((dto?.lines || []).map((line) => [line.lineId, Number(line.quantityReceived || 0)]));
    let totalReceivedNow = 0;

    await this.db().$transaction(async (tx: any) => {
      for (const line of po.lines) {
        const remaining = this.toNumber(line.qtyOrdered) - this.toNumber(line.qtyReceived);
        const receiveQty = lineReceipts.has(line.id) ? Number(lineReceipts.get(line.id) || 0) : remaining;
        if (receiveQty < 0 || receiveQty > remaining) {
          throw new BadRequestException('Received quantity exceeds remaining ordered quantity');
        }
        if (receiveQty === 0) continue;
        totalReceivedNow += receiveQty;
        const stock = await this.ensureInventoryStock(tenantId, line.stockItemId, po.inventoryLocationId as string, tx);
        await tx.stockPOLine.update({
          where: { id: line.id },
          data: {
            qtyReceived: this.decimal(this.toNumber(line.qtyReceived) + receiveQty),
          },
        });
        await tx.inventoryStock.update({
          where: { id: stock.id },
          data: {
            quantityOnHand: this.decimal(this.toNumber(stock.quantityOnHand) + receiveQty),
          },
        });
        await tx.stockMovement.create({
          data: {
            tenantId,
            stockItemId: line.stockItemId,
            inventoryLocationId: po.inventoryLocationId,
            type: 'IN',
            qty: this.decimal(receiveQty),
            reason: `Purchase order ${id} received`,
          },
        });
      }

      const refreshedLines = await tx.stockPOLine.findMany({ where: { poId: id } });
      const allReceived = refreshedLines.every((line: any) => this.toNumber(line.qtyReceived) >= this.toNumber(line.qtyOrdered));
      const anyReceived = refreshedLines.some((line: any) => this.toNumber(line.qtyReceived) > 0);
      await tx.stockPurchaseOrder.update({
        where: { id },
        data: {
          status: allReceived ? 'RECEIVED' : anyReceived ? 'PARTIALLY_RECEIVED' : po.status,
          orderedAt: po.orderedAt || new Date(),
          receivedByUserId: userId,
          receivedAt: allReceived ? new Date() : po.receivedAt,
        },
      });
    });
    if (totalReceivedNow <= 0) {
      throw new BadRequestException('No stock was received');
    }

    await this.audit.log(tenantId, 'inventory.po.receive', `Received purchase order ${id}`, userId);
    const refreshed = (await this.listPurchaseOrders(tenantId)).find((row: any) => row.id === id);
    const partial = refreshed?.status === 'PARTIALLY_RECEIVED';
    await this.pushInventoryActivity(tenantId, partial ? 'inventory.purchase_order.partial_received' : 'inventory.purchase_order.received', `Received purchase order ${id.slice(0, 12)}`, {
      purchaseOrderId: id,
      quantityReceived: totalReceivedNow,
      status: refreshed?.status,
    });
    await this.createPurchaseNotification(tenantId, userId, {
      type: partial ? 'inventory.purchase_order.partial_received' : 'inventory.purchase_order.received',
      title: partial ? 'Purchase order partially received' : 'Purchase order received',
      body: `Internal PO ${id.slice(0, 12)} receipt posted ${totalReceivedNow.toFixed(2)} units to stock.`,
      purchaseOrderId: id,
      status: refreshed?.status,
      idempotencyKey: `inventory:po:${id}:received:${Date.now()}`,
    });
    await Promise.all(
      po.lines.map((line: any) => this.notifyIfLowStock(tenantId, userId, line.stockItemId, po.inventoryLocationId as string)),
    );
    return refreshed;
  }

  async listMovements(tenantId: string) {
    const rows = await this.db().stockMovement.findMany({
      where: { tenantId },
      include: {
        stockItem: true,
        location: true,
        inventoryLocation: true,
        fromInventoryLocation: true,
        toInventoryLocation: true,
        job: { select: { id: true, jobRef: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row: any) => ({
      id: row.id,
      type: row.type,
      qty: this.toNumber(row.qty),
      reason: row.reason || null,
      stockItem: row.stockItem
        ? {
            id: row.stockItem.id,
            sku: row.stockItem.sku,
            name: row.stockItem.name,
          }
        : null,
      inventoryLocation: row.inventoryLocation
        ? {
            id: row.inventoryLocation.id,
            name: row.inventoryLocation.name,
          }
        : null,
      fromInventoryLocation: row.fromInventoryLocation
        ? {
            id: row.fromInventoryLocation.id,
            name: row.fromInventoryLocation.name,
          }
        : null,
      toInventoryLocation: row.toInventoryLocation
        ? {
            id: row.toInventoryLocation.id,
            name: row.toInventoryLocation.name,
          }
        : null,
      job: row.job || null,
      createdAt: row.createdAt,
    }));
  }

  async lowStockAlerts(tenantId: string, locationId?: string) {
    const rows = await this.listStock(tenantId, { inventoryLocationId: 'all', locationId });
    return rows.filter((row: any) => row.lowStock || row.availableQuantity <= 0);
  }

  async valuation(tenantId: string) {
    const rows = await this.listStock(tenantId, { inventoryLocationId: 'all' });
    const items = rows.map((row: any) => {
      const partUnitCost = Math.round(this.toNumber(row.quantityOnHand) * 100) === 0 ? 0 : 0;
      return {
        stockItemId: row.partId,
        sku: row.sku,
        name: row.name,
        qty: row.quantityOnHand,
        value: 0,
        inventoryLocationName: row.locationName,
        unitCostCents: partUnitCost,
      };
    });

    const parts = await this.listParts(tenantId, {});
    const costMap = new Map(parts.map((part: any) => [part.id, Number(part.unitCostCents || 0)]));
    for (const item of items) {
      item.unitCostCents = costMap.get(item.stockItemId) || 0;
      item.value = (item.qty || 0) * (item.unitCostCents / 100);
    }

    return {
      totalValue: items.reduce((sum: number, item: any) => sum + Number(item.value || 0), 0),
      items,
    };
  }

  async createReorderDraft(tenantId: string, userId: string, itemId: string, qtyOrdered?: number, inventoryLocationId?: string) {
    const item = await this.resolvePart(tenantId, itemId);
    const stockRows = await this.db().inventoryStock.findMany({
      where: {
        tenantId,
        stockItemId: item.id,
      },
      orderBy: { quantityOnHand: 'asc' },
      take: 1,
    });
    const chosenLocationId = inventoryLocationId || stockRows[0]?.inventoryLocationId || null;
    if (!chosenLocationId) {
      throw new BadRequestException('Create an inventory location before generating a reorder draft');
    }
    const draft = await this.createPurchaseOrder(tenantId, userId, {
      inventoryLocationId: chosenLocationId,
      supplierId: item.supplierId || undefined,
      status: 'DRAFT',
      notesJson: { source: 'low_stock_reorder', internalPoOnly: true },
      lines: [
        {
          stockItemId: item.id,
          qtyOrdered: Math.max(1, Number(qtyOrdered || this.toNumber(item.minLevel) || 1)),
          unitCost: this.toNumber(item.avgUnitCost),
        },
      ],
    });
    await this.createPurchaseNotification(tenantId, userId, {
      type: 'inventory.purchase_order.low_stock_ready',
      title: 'Low stock ready for PO',
      body: `${item.sku} has an internal purchase draft ready for review.`,
      purchaseOrderId: draft.id,
      status: draft.status,
      idempotencyKey: `inventory:po:${draft.id}:low-stock-ready`,
    });
    return draft;
  }

  async createPurchaseOrderFromJobNeed(tenantId: string, userId: string, dto: CreatePurchaseOrderFromJobDto, actor?: Pick<JwtPayload, 'sub' | 'role'> | null) {
    const job = await this.resolveJob(tenantId, dto.jobId);
    await this.ensureTechnicianJobScope(tenantId, actor, job.id);
    const parts = await this.db().jobPart.findMany({
      where: {
        tenantId,
        jobId: job.id,
        status: { in: ['PLANNED', 'RESERVED'] },
      },
      include: { stockItem: true, sourceLocation: true },
      orderBy: { createdAt: 'asc' },
    });
    const shortageLines: any[] = [];
    for (const part of parts) {
      const planned = this.toNumber(part.quantityPlanned);
      const used = this.toNumber(part.quantityUsed);
      const reserved = this.toNumber(part.quantityReserved);
      const needed = Math.max(0, planned - used - reserved);
      if (needed <= 0) continue;
      const stockRows = await this.db().inventoryStock.findMany({
        where: { tenantId, stockItemId: part.stockItemId },
      });
      const available = stockRows.reduce((sum: number, row: any) => sum + this.toNumber(row.quantityOnHand) - this.toNumber(row.quantityReserved), 0);
      const shortage = Math.max(0, needed - available);
      if (shortage <= 0) continue;
      shortageLines.push({
        stockItemId: part.stockItemId,
        sourceJobId: job.id,
        qtyOrdered: shortage,
        unitCost: this.toNumber(part.stockItem?.avgUnitCost),
        notesJson: { source: 'job_material_shortage', jobId: job.id, jobRef: job.jobRef || null },
      });
    }
    if (!shortageLines.length) {
      throw new BadRequestException('No job material shortage found for this job');
    }
    const targetLocation = dto.inventoryLocationId || parts.find((part: any) => part.sourceLocationId)?.sourceLocationId;
    if (!targetLocation) {
      throw new BadRequestException('Choose a receiving inventory location for the job material purchase order');
    }
    return this.createPurchaseOrder(tenantId, userId, {
      inventoryLocationId: targetLocation,
      supplierId: dto.supplierId,
      supplierName: dto.supplierName,
      status: 'DRAFT',
      notesJson: { source: 'job_material_shortage', jobId: job.id, jobRef: job.jobRef || null, internalPoOnly: true },
      lines: shortageLines,
    });
  }

  async listItems(companyId: string, query: { locationId?: string; q?: string }) {
    return this.listParts(companyId, { q: query.q, active: 'true' });
  }

  async createItem(companyId: string, userId: string, dto: UpsertStockItemDto) {
    return this.createPart(companyId, userId, dto);
  }

  async patchItem(companyId: string, userId: string, id: string, dto: Partial<UpsertStockItemDto>) {
    return this.patchPart(companyId, userId, id, dto);
  }

  async levels(companyId: string, inventoryLocationId?: string) {
    const rows = await this.listStock(companyId, { inventoryLocationId: inventoryLocationId || 'all' });
    return rows.map((row: any) => ({
      item: {
        id: row.partId,
        sku: row.sku,
        name: row.name,
        minLevel: row.reorderPoint,
      },
      currentLevel: row.quantityOnHand,
      lowStock: row.lowStock,
      inventoryLocationId: row.inventoryLocationId,
      inventoryLocationName: row.locationName,
      quantityReserved: row.quantityReserved,
      availableQuantity: row.availableQuantity,
    }));
  }

  async addMovement(companyId: string, userId: string, dto: CreateStockMovementDto) {
    if (dto.type === 'RETURN') {
      if (!dto.inventoryLocationId) {
        throw new BadRequestException('inventoryLocationId is required for stock return');
      }
      return this.returnStock(companyId, userId, {
        stockItemId: dto.stockItemId,
        inventoryLocationId: dto.inventoryLocationId,
        quantity: dto.qty,
        reason: dto.reason,
      });
    }
    if (dto.type === 'ADJUST') {
      if (!dto.inventoryLocationId) {
        throw new BadRequestException('inventoryLocationId is required for stock adjustment');
      }
      return this.adjustStock(companyId, userId, {
        stockItemId: dto.stockItemId,
        inventoryLocationId: dto.inventoryLocationId,
        quantityDelta: dto.qty,
        reason: dto.reason,
      });
    }
    const item = await this.resolvePart(companyId, dto.stockItemId);
    const locationId = dto.inventoryLocationId || null;
    if (!locationId) throw new BadRequestException('inventoryLocationId is required');
    await this.resolveInventoryLocation(companyId, locationId);

    const result = await this.db().$transaction(async (tx: any) => {
      const stock = await this.ensureInventoryStock(companyId, item.id, locationId, tx);
      const onHand = this.toNumber(stock.quantityOnHand);
      const reserved = this.toNumber(stock.quantityReserved);
      const qty = Number(dto.qty || 0);
      if ((dto.type === 'OUT' || dto.type === 'USE') && onHand < qty) {
        throw new BadRequestException('Not enough stock on hand');
      }
      if (dto.type === 'RESERVE' && onHand - reserved < qty) {
        throw new BadRequestException('Not enough available stock to reserve');
      }
      const nextOnHand = dto.type === 'IN' ? onHand + qty : dto.type === 'OUT' || dto.type === 'USE' ? onHand - qty : onHand;
      const nextReserved = dto.type === 'RESERVE' ? reserved + qty : dto.type === 'RELEASE' ? reserved - qty : reserved;
      if (nextReserved < 0) {
        throw new BadRequestException('Reserved stock cannot become negative');
      }
      await tx.inventoryStock.update({
        where: { id: stock.id },
        data: {
          quantityOnHand: this.decimal(nextOnHand),
          quantityReserved: this.decimal(nextReserved),
        },
      });
      return tx.stockMovement.create({
        data: {
          tenantId: companyId,
          stockItemId: dto.stockItemId,
          inventoryLocationId: locationId,
          locationId: dto.locationId || null,
          type: dto.type,
          qty: this.decimal(qty),
          reason: dto.reason || null,
          jobId: dto.jobId || null,
        },
      });
    });
    await this.audit.log(companyId, 'inventory.movement.create', `Stock movement ${dto.type} for ${item.sku}`, userId);
    return result;
  }

  async allocateToJob(companyId: string, userId: string, itemId: string, dto: AllocateToJobDto) {
    await this.assertTruckStockEnabled(companyId, userId);
    const [job, item] = await Promise.all([
      this.resolveJob(companyId, dto.jobId),
      this.resolvePart(companyId, itemId),
    ]);
    const created = await this.createJobPart(companyId, userId, job.id, {
      stockItemId: item.id,
      quantityPlanned: Number(dto.qty || 0),
      sourceLocationId: dto.locationId || undefined,
      unitCostCents: Math.round(this.toNumber(item.avgUnitCost) * 100),
      unitPriceCents: Number(item.unitPriceCents || 0),
    });
    return this.useJobPart(companyId, userId, job.id, created.id, {
      quantity: Number(dto.qty || 0),
      reason: dto.reason || `Allocated to ${job.jobRef || job.id}`,
    });
  }
}
