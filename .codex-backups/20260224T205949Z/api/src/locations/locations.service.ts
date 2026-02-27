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

  private defaultHours(companyId: string, locationId: string) {
    return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      companyId,
      locationId,
      weekday,
      startMinute: weekday === 0 || weekday === 6 ? null : 9 * 60,
      endMinute: weekday === 0 || weekday === 6 ? null : 17 * 60,
      isClosed: weekday === 0 || weekday === 6,
    }));
  }

  async list(companyId: string) {
    const db = this.prisma as any;
    return db.location.findMany({
      where: { companyId },
      include: {
        businessHours: { orderBy: { weekday: 'asc' } },
        staffAssignments: { include: { user: { select: { id: true, email: true, role: true } } } },
        defaultAssignee: { select: { id: true, email: true } },
      },
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
        timezone: dto.timezone || null,
        bookingLeadTimeMins: dto.bookingLeadTimeMins ?? 0,
        defaultAssigneeId: dto.defaultAssigneeId || null,
      },
    });

    await db.locationBusinessHour.createMany({ data: this.defaultHours(companyId, created.id) });

    if (Array.isArray(dto.staffUserIds) && dto.staffUserIds.length) {
      await db.locationStaffAssignment.createMany({
        data: dto.staffUserIds.map((uid) => ({ companyId, locationId: created.id, userId: uid })),
        skipDuplicates: true,
      });
    }

    if (Array.isArray(dto.hours) && dto.hours.length > 0) {
      await db.locationBusinessHour.deleteMany({ where: { companyId, locationId: created.id } });
      await db.locationBusinessHour.createMany({
        data: dto.hours.map((hour) => ({
          companyId,
          locationId: created.id,
          weekday: hour.weekday,
          startMinute: hour.isClosed ? null : hour.startMinute ?? 9 * 60,
          endMinute: hour.isClosed ? null : hour.endMinute ?? 17 * 60,
          isClosed: Boolean(hour.isClosed),
        })),
      });
    }

    await this.audit.log(companyId, 'location.create', `Created location ${created.name}`, userId);
    return this.list(companyId);
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
        timezone: dto.timezone ?? undefined,
        bookingLeadTimeMins: dto.bookingLeadTimeMins ?? undefined,
        defaultAssigneeId: dto.defaultAssigneeId !== undefined ? dto.defaultAssigneeId || null : undefined,
      },
    });

    if (Array.isArray(dto.staffUserIds)) {
      await db.locationStaffAssignment.deleteMany({ where: { companyId, locationId: id } });
      if (dto.staffUserIds.length > 0) {
        await db.locationStaffAssignment.createMany({
          data: dto.staffUserIds.map((uid) => ({ companyId, locationId: id, userId: uid })),
          skipDuplicates: true,
        });
      }
    }

    if (Array.isArray(dto.hours) && dto.hours.length > 0) {
      await db.locationBusinessHour.deleteMany({ where: { companyId, locationId: id } });
      await db.locationBusinessHour.createMany({
        data: dto.hours.map((hour) => ({
          companyId,
          locationId: id,
          weekday: hour.weekday,
          startMinute: hour.isClosed ? null : hour.startMinute ?? 9 * 60,
          endMinute: hour.isClosed ? null : hour.endMinute ?? 17 * 60,
          isClosed: Boolean(hour.isClosed),
        })),
      });
    }

    await this.audit.log(companyId, 'location.update', `Updated location ${updated.name}`, userId);
    return db.location.findFirst({
      where: { id, companyId },
      include: {
        businessHours: { orderBy: { weekday: 'asc' } },
        staffAssignments: { include: { user: { select: { id: true, email: true, role: true } } } },
        defaultAssignee: { select: { id: true, email: true } },
      },
    });
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

  async setOnlyMyLocation(companyId: string, userId: string, enabled: boolean) {
    const db = this.prisma as any;
    await db.user.update({
      where: { id: userId },
      data: { onlyMyLocation: Boolean(enabled) },
    });
    await this.audit.log(companyId, 'location.restriction', `Set only-my-location=${Boolean(enabled)}`, userId);
    return { ok: true, onlyMyLocation: Boolean(enabled) };
  }
}
