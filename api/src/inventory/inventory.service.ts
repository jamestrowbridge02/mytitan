import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { ActivityService } from '../events/activity.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdjustInventoryStockDto,
  AllocateToJobDto,
  CreateStockMovementDto,
  JobPartQuantityActionDto,
  PatchJobPartDto,
  ReceivePurchaseOrderDto,
  UpsertInventoryLocationDto,
  UpsertJobPartDto,
  UpsertPurchaseOrderDto,
  UpsertStockItemDto,
} from './dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly activity: ActivityService,
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
    return result.updatedStock;
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

  async createJobPart(tenantId: string, userId: string, jobId: string, dto: UpsertJobPartDto) {
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

  async patchJobPart(tenantId: string, userId: string, jobId: string, jobPartId: string, dto: PatchJobPartDto) {
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

  async reserveJobPart(tenantId: string, userId: string, jobId: string, jobPartId: string, dto: JobPartQuantityActionDto) {
    const row = await this.resolveJobPart(tenantId, jobId, jobPartId);
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

  async useJobPart(tenantId: string, userId: string, jobId: string, jobPartId: string, dto: JobPartQuantityActionDto) {
    const row = await this.resolveJobPart(tenantId, jobId, jobPartId);
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
    return this.serializeJobPart(result.updated);
  }

  async releaseJobPart(tenantId: string, userId: string, jobId: string, jobPartId: string, dto: JobPartQuantityActionDto) {
    const row = await this.resolveJobPart(tenantId, jobId, jobPartId);
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
      supplierName: row.supplierName || row.supplier?.name || null,
      locationId: row.locationId || null,
      inventoryLocationId: row.inventoryLocationId || null,
      inventoryLocationName: row.inventoryLocation?.name || null,
      businessLocationId: row.inventoryLocation?.businessLocationId || row.locationId || null,
      orderedAt: row.orderedAt,
      receivedAt: row.receivedAt,
      notesJson: row.notesJson ?? null,
      lines: (row.lines || []).map((line: any) => ({
        id: line.id,
        partId: line.stockItemId,
        sku: line.stockItem?.sku || null,
        name: line.stockItem?.name || null,
        quantityOrdered: this.toNumber(line.qtyOrdered),
        quantityReceived: this.toNumber(line.qtyReceived),
        unitCostCents: Math.round(this.toNumber(line.unitCost) * 100),
      })),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async createPurchaseOrder(tenantId: string, userId: string, dto: UpsertPurchaseOrderDto) {
    if (dto.inventoryLocationId) {
      await this.resolveInventoryLocation(tenantId, dto.inventoryLocationId);
    }
    const lines = Array.isArray(dto.lines) ? dto.lines : [];
    await Promise.all(lines.map((line) => this.resolvePart(tenantId, line.stockItemId)));
    if (lines.some((line) => Number(line.qtyOrdered || 0) <= 0)) {
      throw new BadRequestException('Purchase order lines must have a positive quantity');
    }

    const po = await this.db().stockPurchaseOrder.create({
      data: {
        tenantId,
        locationId: dto.locationId || null,
        inventoryLocationId: dto.inventoryLocationId || null,
        supplierId: dto.supplierId || null,
        supplierName: dto.supplierName?.trim() || null,
        status: dto.status || 'DRAFT',
        orderedAt: dto.status === 'ORDERED' ? new Date() : null,
        notesJson: dto.notesJson ?? null,
        lines: lines.length
          ? {
              create: lines.map((line) => ({
                stockItemId: line.stockItemId,
                qtyOrdered: this.decimal(line.qtyOrdered),
                qtyReceived: this.decimal(line.qtyReceived ?? 0),
                unitCost: this.decimal(line.unitCost ?? 0),
              })),
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
    });
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
    if (Array.isArray(dto.lines)) {
      await Promise.all(dto.lines.map((line) => this.resolvePart(tenantId, line.stockItemId)));
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
          orderedAt: dto.status === 'ORDERED' && !existing.orderedAt ? new Date() : existing.orderedAt,
          notesJson: dto.notesJson !== undefined ? dto.notesJson ?? null : undefined,
        },
      });
      if (Array.isArray(dto.lines)) {
        await tx.stockPOLine.deleteMany({ where: { poId: id } });
        if (dto.lines.length) {
          await tx.stockPOLine.createMany({
            data: dto.lines.map((line) => ({
              poId: id,
              stockItemId: line.stockItemId,
              qtyOrdered: this.decimal(line.qtyOrdered),
              qtyReceived: this.decimal(line.qtyReceived ?? 0),
              unitCost: this.decimal(line.unitCost ?? 0),
            })),
          });
        }
      }
    });
    await this.audit.log(tenantId, 'inventory.po.update', `Updated purchase order ${id}`, userId);
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

    const lineReceipts = new Map((dto?.lines || []).map((line) => [line.lineId, Number(line.quantityReceived || 0)]));

    await this.db().$transaction(async (tx: any) => {
      for (const line of po.lines) {
        const remaining = this.toNumber(line.qtyOrdered) - this.toNumber(line.qtyReceived);
        const receiveQty = lineReceipts.has(line.id) ? Number(lineReceipts.get(line.id) || 0) : remaining;
        if (receiveQty < 0 || receiveQty > remaining) {
          throw new BadRequestException('Received quantity exceeds remaining ordered quantity');
        }
        if (receiveQty === 0) continue;
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
          receivedAt: anyReceived ? new Date() : po.receivedAt,
        },
      });
    });

    await this.audit.log(tenantId, 'inventory.po.receive', `Received purchase order ${id}`, userId);
    await this.pushInventoryActivity(tenantId, 'inventory.purchase_order.received', `Received purchase order ${id.slice(0, 12)}`, {
      purchaseOrderId: id,
    });
    return (await this.listPurchaseOrders(tenantId)).find((row: any) => row.id === id);
  }

  async listMovements(tenantId: string) {
    const rows = await this.db().stockMovement.findMany({
      where: { tenantId },
      include: {
        stockItem: true,
        location: true,
        inventoryLocation: true,
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
    return this.createPurchaseOrder(tenantId, userId, {
      inventoryLocationId: chosenLocationId,
      supplierId: item.supplierId || undefined,
      status: 'DRAFT',
      lines: [
        {
          stockItemId: item.id,
          qtyOrdered: Math.max(1, Number(qtyOrdered || this.toNumber(item.minLevel) || 1)),
          unitCost: this.toNumber(item.avgUnitCost),
        },
      ],
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
