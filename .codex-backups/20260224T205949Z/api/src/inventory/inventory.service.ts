import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AllocateToJobDto, CreateStockMovementDto, UpsertPurchaseOrderDto, UpsertStockItemDto } from './dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listItems(companyId: string, query: { locationId?: string; q?: string }) {
    const db = this.prisma as any;
    const where: any = { tenantId: companyId, isActive: true };
    if (query.locationId && query.locationId !== 'all') where.locationId = query.locationId;
    if (query.q) {
      const q = query.q.trim();
      where.OR = [{ sku: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }];
    }
    return db.stockItem.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async createItem(companyId: string, userId: string, dto: UpsertStockItemDto) {
    const db = this.prisma as any;
    const item = await db.stockItem.create({
      data: {
        tenantId: companyId,
        locationId: dto.locationId || null,
        supplierId: dto.supplierId || null,
        sku: dto.sku,
        name: dto.name,
        unit: dto.unit,
        minLevel: new Prisma.Decimal(dto.minLevel ?? 0),
        avgUnitCost: new Prisma.Decimal(dto.avgUnitCost ?? 0),
      },
    });
    await this.audit.log(companyId, 'inventory.item.create', `Created stock item ${item.sku}`, userId);
    return item;
  }

  async patchItem(companyId: string, userId: string, id: string, dto: Partial<UpsertStockItemDto>) {
    const db = this.prisma as any;
    const item = await db.stockItem.findFirst({ where: { id, tenantId: companyId } });
    if (!item) throw new NotFoundException('Stock item not found');
    const updated = await db.stockItem.update({
      where: { id },
      data: {
        sku: dto.sku ?? undefined,
        name: dto.name ?? undefined,
        unit: dto.unit ?? undefined,
        locationId: dto.locationId ?? undefined,
        supplierId: dto.supplierId ?? undefined,
        minLevel: dto.minLevel !== undefined ? new Prisma.Decimal(dto.minLevel) : undefined,
        avgUnitCost: dto.avgUnitCost !== undefined ? new Prisma.Decimal(dto.avgUnitCost) : undefined,
      },
    });
    await this.audit.log(companyId, 'inventory.item.update', `Updated stock item ${updated.sku}`, userId);
    return updated;
  }

  async levels(companyId: string, locationId?: string) {
    const db = this.prisma as any;
    const items = await db.stockItem.findMany({
      where: { tenantId: companyId, isActive: true, ...(locationId && locationId !== 'all' ? { locationId } : {}) },
      orderBy: { name: 'asc' },
    });

    const movements = await db.stockMovement.groupBy({
      by: ['stockItemId', 'type'],
      where: { tenantId: companyId, ...(locationId && locationId !== 'all' ? { locationId } : {}) },
      _sum: { qty: true },
    });

    const map: Record<string, { in: number; out: number; adjust: number }> = {};
    for (const m of movements) {
      if (!map[m.stockItemId]) map[m.stockItemId] = { in: 0, out: 0, adjust: 0 };
      const value = Number(m?._sum?.qty || 0);
      if (m.type === 'IN') map[m.stockItemId].in += value;
      if (m.type === 'OUT') map[m.stockItemId].out += value;
      if (m.type === 'ADJUST') map[m.stockItemId].adjust += value;
    }

    return items.map((item: any) => {
      const agg = map[item.id] || { in: 0, out: 0, adjust: 0 };
      const currentLevel = agg.in - agg.out + agg.adjust;
      return {
        item,
        currentLevel,
        lowStock: currentLevel <= Number(item.minLevel || 0),
      };
    });
  }

  async addMovement(companyId: string, userId: string, dto: CreateStockMovementDto) {
    const db = this.prisma as any;
    const item = await db.stockItem.findFirst({ where: { id: dto.stockItemId, tenantId: companyId } });
    if (!item) throw new NotFoundException('Stock item not found');
    const movement = await db.stockMovement.create({
      data: {
        tenantId: companyId,
        locationId: dto.locationId || item.locationId || null,
        stockItemId: dto.stockItemId,
        type: dto.type,
        qty: new Prisma.Decimal(dto.qty),
        reason: dto.reason || null,
        jobId: dto.jobId || null,
      },
    });
    await this.audit.log(companyId, 'inventory.movement.create', `Stock movement ${dto.type} for ${item.sku}`, userId);
    return movement;
  }

  async listMovements(companyId: string) {
    const db = this.prisma as any;
    return db.stockMovement.findMany({
      where: { tenantId: companyId },
      include: { stockItem: true, location: true, job: { select: { id: true, jobRef: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async listPurchaseOrders(companyId: string) {
    const db = this.prisma as any;
    return db.stockPurchaseOrder.findMany({
      where: { tenantId: companyId },
      include: { lines: { include: { stockItem: true } }, supplier: true, location: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPurchaseOrder(companyId: string, userId: string, dto: UpsertPurchaseOrderDto) {
    const db = this.prisma as any;
    const po = await db.stockPurchaseOrder.create({
      data: {
        tenantId: companyId,
        locationId: dto.locationId || null,
        supplierId: dto.supplierId || null,
        status: dto.status || 'DRAFT',
        lines: dto.lines?.length
          ? {
              create: dto.lines.map((line) => ({
                stockItemId: line.stockItemId,
                qtyOrdered: new Prisma.Decimal(line.qtyOrdered),
                unitCost: new Prisma.Decimal(line.unitCost ?? 0),
              })),
            }
          : undefined,
      },
      include: { lines: true },
    });
    await this.audit.log(companyId, 'inventory.po.create', `Created PO ${po.id}`, userId);
    return po;
  }

  async patchPurchaseOrder(companyId: string, userId: string, id: string, dto: UpsertPurchaseOrderDto) {
    const db = this.prisma as any;
    const po = await db.stockPurchaseOrder.findFirst({ where: { id, tenantId: companyId } });
    if (!po) throw new NotFoundException('PO not found');
    const updated = await db.stockPurchaseOrder.update({
      where: { id },
      data: {
        status: dto.status ?? undefined,
        locationId: dto.locationId ?? undefined,
        supplierId: dto.supplierId ?? undefined,
      },
    });
    if (dto.lines?.length) {
      await db.stockPOLine.createMany({
        data: dto.lines.map((line) => ({
          poId: id,
          stockItemId: line.stockItemId,
          qtyOrdered: new Prisma.Decimal(line.qtyOrdered),
          unitCost: new Prisma.Decimal(line.unitCost ?? 0),
        })),
      });
    }
    await this.audit.log(companyId, 'inventory.po.update', `Updated PO ${id}`, userId);
    return db.stockPurchaseOrder.findFirst({ where: { id }, include: { lines: true } });
  }

  async receivePurchaseOrder(companyId: string, userId: string, id: string) {
    const db = this.prisma as any;
    const po = await db.stockPurchaseOrder.findFirst({
      where: { id, tenantId: companyId },
      include: { lines: true },
    });
    if (!po) throw new NotFoundException('PO not found');
    await db.$transaction(async (tx: any) => {
      await tx.stockPurchaseOrder.update({ where: { id }, data: { status: 'RECEIVED' } });
      for (const line of po.lines) {
        await tx.stockItem.update({
          where: { id: line.stockItemId },
          data: { avgUnitCost: line.unitCost },
        });
        await tx.stockMovement.create({
          data: {
            tenantId: companyId,
            locationId: po.locationId || null,
            stockItemId: line.stockItemId,
            type: 'IN',
            qty: line.qtyOrdered,
            reason: `PO ${id} received`,
          },
        });
      }
    });
    await this.audit.log(companyId, 'inventory.po.receive', `Received PO ${id}`, userId);
    return { ok: true };
  }

  async allocateToJob(companyId: string, userId: string, itemId: string, dto: AllocateToJobDto) {
    const db = this.prisma as any;
    const item = await db.stockItem.findFirst({ where: { id: itemId, tenantId: companyId } });
    if (!item) throw new NotFoundException('Stock item not found');
    const job = await db.job.findFirst({ where: { id: dto.jobId, companyId } });
    if (!job) throw new NotFoundException('Job not found');

    const movement = await db.stockMovement.create({
      data: {
        tenantId: companyId,
        locationId: dto.locationId || job.locationId || item.locationId || null,
        stockItemId: itemId,
        type: 'OUT',
        qty: new Prisma.Decimal(dto.qty),
        reason: dto.reason || `Allocated to job ${job.jobRef || job.id}`,
        jobId: job.id,
      },
    });
    const pricingEnabled = Boolean((job.formData as any)?.pricingEnabled ?? (job.formData as any)?.vatEnabled ?? true);
    if (pricingEnabled) {
      const qty = Number(dto.qty || 0);
      const unitPrice = Number(item.avgUnitCost || 0);
      await db.jobLineItem.create({
        data: {
          companyId,
          jobId: job.id,
          stockItemId: item.id,
          description: `${item.sku} - ${item.name}`,
          qty: new Prisma.Decimal(qty),
          unitPrice: new Prisma.Decimal(unitPrice),
          total: new Prisma.Decimal(qty * unitPrice),
        },
      });
    }
    await this.audit.log(companyId, 'inventory.allocate', `Allocated ${item.sku} to ${job.jobRef || job.id}`, userId);
    return movement;
  }

  async lowStockAlerts(companyId: string) {
    const levels = await this.levels(companyId, 'all');
    return levels.filter((row: any) => row.lowStock);
  }

  async valuation(companyId: string) {
    const levels = await this.levels(companyId, 'all');
    const items = levels.map((row: any) => {
      const avgUnitCost = Number(row.item.avgUnitCost || 0);
      const qty = Number(row.currentLevel || 0);
      const value = avgUnitCost * qty;
      return {
        stockItemId: row.item.id,
        sku: row.item.sku,
        name: row.item.name,
        qty,
        avgUnitCost,
        value,
      };
    });
    const totalValue = items.reduce((sum: number, item: any) => sum + item.value, 0);
    return { totalValue, items };
  }

  async createReorderDraft(companyId: string, userId: string, itemId: string, qtyOrdered?: number, locationId?: string) {
    const db = this.prisma as any;
    const item = await db.stockItem.findFirst({ where: { id: itemId, tenantId: companyId } });
    if (!item) throw new NotFoundException('Stock item not found');
    const po = await db.stockPurchaseOrder.create({
      data: {
        tenantId: companyId,
        locationId: locationId || item.locationId || null,
        supplierId: item.supplierId || null,
        status: 'DRAFT',
        lines: {
          create: [
            {
              stockItemId: item.id,
              qtyOrdered: new Prisma.Decimal(Math.max(1, Number(qtyOrdered || Number(item.minLevel || 1) || 1))),
              unitCost: new Prisma.Decimal(Number(item.avgUnitCost || 0)),
            },
          ],
        },
      },
      include: { lines: true },
    });
    await this.audit.log(companyId, 'inventory.po.reorder-draft', `Created reorder draft for ${item.sku}`, userId);
    return po;
  }
}
