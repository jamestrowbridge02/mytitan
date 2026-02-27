import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertLocationDto } from './dto';

@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    const db = this.prisma as any;
    return db.location.findMany({
      where: { companyId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async create(companyId: string, userId: string, dto: UpsertLocationDto) {
    const db = this.prisma as any;
    const created = await db.location.create({
      data: {
        companyId,
        name: dto.name,
        addressLine1: dto.addressLine1 || '-',
        addressLine2: dto.addressLine2 || null,
        city: dto.city || '-',
        state: dto.state || null,
        postalCode: dto.postalCode || null,
        country: dto.country || 'UK',
        phone: dto.phone || null,
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit.log(companyId, 'location.create', `Created location ${created.name}`, userId);
    return created;
  }

  async update(companyId: string, userId: string, id: string, dto: UpsertLocationDto) {
    const db = this.prisma as any;
    const location = await db.location.findFirst({ where: { id, companyId } });
    if (!location) throw new NotFoundException('Location not found');
    const updated = await db.location.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        addressLine1: dto.addressLine1 ?? undefined,
        addressLine2: dto.addressLine2 ?? undefined,
        city: dto.city ?? undefined,
        state: dto.state ?? undefined,
        postalCode: dto.postalCode ?? undefined,
        country: dto.country ?? undefined,
        phone: dto.phone ?? undefined,
        isActive: dto.isActive ?? undefined,
      },
    });
    await this.audit.log(companyId, 'location.update', `Updated location ${updated.name}`, userId);
    return updated;
  }

  async archive(companyId: string, userId: string, id: string) {
    const db = this.prisma as any;
    const location = await db.location.findFirst({ where: { id, companyId } });
    if (!location) throw new NotFoundException('Location not found');
    const updated = await db.location.update({
      where: { id },
      data: { isActive: false },
    });
    await this.audit.log(companyId, 'location.archive', `Archived location ${updated.name}`, userId);
    return updated;
  }
}

