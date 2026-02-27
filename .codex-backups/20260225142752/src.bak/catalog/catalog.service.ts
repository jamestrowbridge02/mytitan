import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertCatalogItemDto } from './catalog.dto';

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(tenantId: string) {
    const db = this.prisma as any;
    return db.serviceCatalogItem.findMany({
      where: { tenantId },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async getById(tenantId: string, id: string) {
    const db = this.prisma as any;
    const item = await db.serviceCatalogItem.findFirst({ where: { id, tenantId } });
    if (!item) {
      throw new NotFoundException('Catalog item not found');
    }
    return item;
  }

  async create(tenantId: string, userId: string, dto: UpsertCatalogItemDto) {
    const db = this.prisma as any;
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

  async update(tenantId: string, userId: string, id: string, dto: UpsertCatalogItemDto) {
    const db = this.prisma as any;
    const existing = await db.serviceCatalogItem.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new NotFoundException('Catalog item not found');
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

  async remove(tenantId: string, userId: string, id: string) {
    const db = this.prisma as any;
    const existing = await db.serviceCatalogItem.findFirst({ where: { id, tenantId } });
    if (!existing) {
      throw new NotFoundException('Catalog item not found');
    }

    await db.serviceCatalogItem.delete({ where: { id } });
    await this.audit.log(tenantId, 'catalog.item.delete', `Deleted catalog item ${existing.name}`, userId);

    return { deleted: true };
  }
}
