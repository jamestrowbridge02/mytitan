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
exports.CatalogService = void 0;
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../audit/audit.service");
const prisma_service_1 = require("../prisma/prisma.service");
let CatalogService = class CatalogService {
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    list(tenantId) {
        const db = this.prisma;
        return db.serviceCatalogItem.findMany({
            where: { tenantId },
            orderBy: [{ active: 'desc' }, { name: 'asc' }],
        });
    }
    async getById(tenantId, id) {
        const db = this.prisma;
        const item = await db.serviceCatalogItem.findFirst({ where: { id, tenantId } });
        if (!item) {
            throw new common_1.NotFoundException('Catalog item not found');
        }
        return item;
    }
    async create(tenantId, userId, dto) {
        const db = this.prisma;
        const created = await db.serviceCatalogItem.create({
            data: {
                tenantId,
                key: dto.key ?? null,
                name: dto.name,
                unitPrice: dto.unitPrice,
                defaultQty: dto.defaultQty ?? 1,
                active: dto.active ?? true,
                vatEligible: dto.vatEligible ?? false,
            },
        });
        await this.audit.log(tenantId, 'catalog.item.create', `Created catalog item ${created.name}`, userId);
        return created;
    }
    async update(tenantId, userId, id, dto) {
        const db = this.prisma;
        const existing = await db.serviceCatalogItem.findFirst({ where: { id, tenantId } });
        if (!existing) {
            throw new common_1.NotFoundException('Catalog item not found');
        }
        const updated = await db.serviceCatalogItem.update({
            where: { id },
            data: {
                key: dto.key ?? existing.key ?? null,
                name: dto.name,
                unitPrice: dto.unitPrice,
                defaultQty: dto.defaultQty ?? existing.defaultQty ?? 1,
                active: dto.active ?? existing.active,
                vatEligible: dto.vatEligible ?? existing.vatEligible ?? false,
            },
        });
        await this.audit.log(tenantId, 'catalog.item.update', `Updated catalog item ${updated.name}`, userId);
        return updated;
    }
    async remove(tenantId, userId, id) {
        const db = this.prisma;
        const existing = await db.serviceCatalogItem.findFirst({ where: { id, tenantId } });
        if (!existing) {
            throw new common_1.NotFoundException('Catalog item not found');
        }
        await db.serviceCatalogItem.delete({ where: { id } });
        await this.audit.log(tenantId, 'catalog.item.delete', `Deleted catalog item ${existing.name}`, userId);
        return { deleted: true };
    }
};
exports.CatalogService = CatalogService;
exports.CatalogService = CatalogService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], CatalogService);
//# sourceMappingURL=catalog.service.js.map