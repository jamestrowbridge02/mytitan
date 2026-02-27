"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const audit_service_1 = require("../audit/audit.service");
const prisma_service_1 = require("../prisma/prisma.service");
let InventoryService = class InventoryService {
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    async listItems(companyId, query) {
        const db = this.prisma;
        const where = { tenantId: companyId, isActive: true };
        if (query.locationId && query.locationId !== 'all')
            where.locationId = query.locationId;
        if (query.q) {
            const q = query.q.trim();
            where.OR = [{ sku: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }];
        }
        return db.stockItem.findMany({ where, orderBy: { createdAt: 'desc' } });
    }
    async createItem(companyId, userId, dto) {
        const db = this.prisma;
        const item = await db.stockItem.create({
            data: {
                tenantId: companyId,
                locationId: dto.locationId || null,
                supplierId: dto.supplierId || null,
                sku: dto.sku,
                name: dto.name,
                unit: dto.unit,
                minLevel: new client_1.Prisma.Decimal(dto.minLevel ?? 0),
                avgUnitCost: new client_1.Prisma.Decimal(dto.avgUnitCost ?? 0),
            },
        });
        await this.audit.log(companyId, 'inventory.item.create', `Created stock item ${item.sku}`, userId);
        return item;
    }
    async patchItem(companyId, userId, id, dto) {
        const db = this.prisma;
        const item = await db.stockItem.findFirst({ where: { id, tenantId: companyId } });
        if (!item)
            throw new common_1.NotFoundException('Stock item not found');
        const updated = await db.stockItem.update({
            where: { id },
            data: {
                sku: dto.sku ?? undefined,
                name: dto.name ?? undefined,
                unit: dto.unit ?? undefined,
                locationId: dto.locationId ?? undefined,
                supplierId: dto.supplierId ?? undefined,
                minLevel: dto.minLevel !== undefined ? new client_1.Prisma.Decimal(dto.minLevel) : undefined,
                avgUnitCost: dto.avgUnitCost !== undefined ? new client_1.Prisma.Decimal(dto.avgUnitCost) : undefined,
            },
        });
        await this.audit.log(companyId, 'inventory.item.update', `Updated stock item ${updated.sku}`, userId);
        return updated;
    }
    async levels(companyId, locationId) {
        const db = this.prisma;
        const items = await db.stockItem.findMany({
            where: { tenantId: companyId, isActive: true, ...(locationId && locationId !== 'all' ? { locationId } : {}) },
            orderBy: { name: 'asc' },
        });
        const movements = await db.stockMovement.groupBy({
            by: ['stockItemId', 'type'],
            where: { tenantId: companyId, ...(locationId && locationId !== 'all' ? { locationId } : {}) },
            _sum: { qty: true },
        });
        const map = {};
        for (const m of movements) {
            if (!map[m.stockItemId])
                map[m.stockItemId] = { in: 0, out: 0, adjust: 0 };
            const value = Number(m?._sum?.qty || 0);
            if (m.type === 'IN')
                map[m.stockItemId].in += value;
            if (m.type === 'OUT')
                map[m.stockItemId].out += value;
            if (m.type === 'ADJUST')
                map[m.stockItemId].adjust += value;
        }
        return items.map((item) => {
            const agg = map[item.id] || { in: 0, out: 0, adjust: 0 };
            const currentLevel = agg.in - agg.out + agg.adjust;
            return {
                item,
                currentLevel,
                lowStock: currentLevel <= Number(item.minLevel || 0),
            };
        });
    }
    async addMovement(companyId, userId, dto) {
        const db = this.prisma;
        const item = await db.stockItem.findFirst({ where: { id: dto.stockItemId, tenantId: companyId } });
        if (!item)
            throw new common_1.NotFoundException('Stock item not found');
        const movement = await db.stockMovement.create({
            data: {
                tenantId: companyId,
                locationId: dto.locationId || item.locationId || null,
                stockItemId: dto.stockItemId,
                type: dto.type,
                qty: new client_1.Prisma.Decimal(dto.qty),
                reason: dto.reason || null,
                jobId: dto.jobId || null,
            },
        });
        await this.audit.log(companyId, 'inventory.movement.create', `Stock movement ${dto.type} for ${item.sku}`, userId);
        return movement;
    }
    async listMovements(companyId) {
        const db = this.prisma;
        return db.stockMovement.findMany({
            where: { tenantId: companyId },
            include: { stockItem: true, location: true, job: { select: { id: true, jobRef: true } } },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
    }
    async listPurchaseOrders(companyId) {
        const db = this.prisma;
        return db.stockPurchaseOrder.findMany({
            where: { tenantId: companyId },
            include: { lines: { include: { stockItem: true } }, supplier: true, location: true },
            orderBy: { createdAt: 'desc' },
        });
    }
    async createPurchaseOrder(companyId, userId, dto) {
        const db = this.prisma;
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
                            qtyOrdered: new client_1.Prisma.Decimal(line.qtyOrdered),
                            unitCost: new client_1.Prisma.Decimal(line.unitCost ?? 0),
                        })),
                    }
                    : undefined,
            },
            include: { lines: true },
        });
        await this.audit.log(companyId, 'inventory.po.create', `Created PO ${po.id}`, userId);
        return po;
    }
    async patchPurchaseOrder(companyId, userId, id, dto) {
        const db = this.prisma;
        const po = await db.stockPurchaseOrder.findFirst({ where: { id, tenantId: companyId } });
        if (!po)
            throw new common_1.NotFoundException('PO not found');
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
                    qtyOrdered: new client_1.Prisma.Decimal(line.qtyOrdered),
                    unitCost: new client_1.Prisma.Decimal(line.unitCost ?? 0),
                })),
            });
        }
        await this.audit.log(companyId, 'inventory.po.update', `Updated PO ${id}`, userId);
        return db.stockPurchaseOrder.findFirst({ where: { id }, include: { lines: true } });
    }
    async receivePurchaseOrder(companyId, userId, id) {
        const db = this.prisma;
        const po = await db.stockPurchaseOrder.findFirst({
            where: { id, tenantId: companyId },
            include: { lines: true },
        });
        if (!po)
            throw new common_1.NotFoundException('PO not found');
        await db.$transaction(async (tx) => {
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
    async allocateToJob(companyId, userId, itemId, dto) {
        const db = this.prisma;
        const item = await db.stockItem.findFirst({ where: { id: itemId, tenantId: companyId } });
        if (!item)
            throw new common_1.NotFoundException('Stock item not found');
        const job = await db.job.findFirst({ where: { id: dto.jobId, companyId } });
        if (!job)
            throw new common_1.NotFoundException('Job not found');
        const movement = await db.stockMovement.create({
            data: {
                tenantId: companyId,
                locationId: dto.locationId || job.locationId || item.locationId || null,
                stockItemId: itemId,
                type: 'OUT',
                qty: new client_1.Prisma.Decimal(dto.qty),
                reason: dto.reason || `Allocated to job ${job.jobRef || job.id}`,
                jobId: job.id,
            },
        });
        const pricingEnabled = Boolean(job.formData?.pricingEnabled ?? job.formData?.vatEnabled ?? true);
        if (pricingEnabled) {
            const qty = Number(dto.qty || 0);
            const unitPrice = Number(item.avgUnitCost || 0);
            await db.jobLineItem.create({
                data: {
                    companyId,
                    jobId: job.id,
                    stockItemId: item.id,
                    description: `${item.sku} - ${item.name}`,
                    qty: new client_1.Prisma.Decimal(qty),
                    unitPrice: new client_1.Prisma.Decimal(unitPrice),
                    total: new client_1.Prisma.Decimal(qty * unitPrice),
                },
            });
        }
        await this.audit.log(companyId, 'inventory.allocate', `Allocated ${item.sku} to ${job.jobRef || job.id}`, userId);
        return movement;
    }
    async lowStockAlerts(companyId) {
        const levels = await this.levels(companyId, 'all');
        return levels.filter((row) => row.lowStock);
    }
    async valuation(companyId) {
        const levels = await this.levels(companyId, 'all');
        const items = levels.map((row) => {
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
        const totalValue = items.reduce((sum, item) => sum + item.value, 0);
        return { totalValue, items };
    }
    async createReorderDraft(companyId, userId, itemId, qtyOrdered, locationId) {
        const db = this.prisma;
        const item = await db.stockItem.findFirst({ where: { id: itemId, tenantId: companyId } });
        if (!item)
            throw new common_1.NotFoundException('Stock item not found');
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
                            qtyOrdered: new client_1.Prisma.Decimal(Math.max(1, Number(qtyOrdered || Number(item.minLevel || 1) || 1))),
                            unitCost: new client_1.Prisma.Decimal(Number(item.avgUnitCost || 0)),
                        },
                    ],
                },
            },
            include: { lines: true },
        });
        await this.audit.log(companyId, 'inventory.po.reorder-draft', `Created reorder draft for ${item.sku}`, userId);
        return po;
    }
};
exports.InventoryService = InventoryService;
exports.InventoryService = InventoryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], InventoryService);
//# sourceMappingURL=inventory.service.js.map