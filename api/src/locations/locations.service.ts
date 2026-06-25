import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PatchLocationMembershipDto, UpsertLocationDto, UpsertLocationMembershipDto } from './dto';
import { buildApiUrl } from '../common/public-url';

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

  private normalizeHours(hours: UpsertLocationDto['hours']) {
    if (!Array.isArray(hours) || hours.length === 0) return null;
    const seen = new Set<number>();
    return hours.map((hour) => {
      if (seen.has(hour.weekday)) {
        throw new BadRequestException('Each weekday can only appear once');
      }
      seen.add(hour.weekday);
      if (hour.isClosed) {
        return { weekday: hour.weekday, startMinute: null, endMinute: null, isClosed: true };
      }
      const startMinute = hour.startMinute;
      const endMinute = hour.endMinute;
      if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute)) {
        throw new BadRequestException('Add both an opening and closing time, or mark the day closed');
      }
      if (startMinute! < 0 || startMinute! >= 24 * 60 || endMinute! <= 0 || endMinute! > 24 * 60) {
        throw new BadRequestException('Opening hours must be valid times within one day');
      }
      if (endMinute! <= startMinute!) {
        throw new BadRequestException('Closing time must be later than opening time');
      }
      return { weekday: hour.weekday, startMinute, endMinute, isClosed: false };
    });
  }

  async getAccessibleLocations(companyId: string, userId: string, role?: string) {
    const db = this.prisma as any;
    const membershipRows = await db.locationMembership.findMany({
      where: {
        tenantId: companyId,
        userId,
        active: true,
        location: { companyId, isActive: true },
      },
      include: {
        location: {
          select: {
            id: true,
            name: true,
            code: true,
            kind: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (role === 'OWNER' || role === 'ADMIN' || membershipRows.length === 0) {
      return db.location.findMany({
        where: { companyId, isActive: true },
        select: { id: true, name: true, code: true, kind: true, isActive: true },
        orderBy: { name: 'asc' },
      });
    }
    return membershipRows.map((row: any) => row.location);
  }

  async list(companyId: string) {
    const db = this.prisma as any;
    return db.location.findMany({
      where: { companyId },
      include: {
        businessHours: { orderBy: { weekday: 'asc' } },
        staffAssignments: { include: { user: { select: { id: true, email: true, role: true } } } },
        memberships: {
          include: {
            user: { select: { id: true, email: true, role: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        defaultAssignee: { select: { id: true, email: true } },
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async create(companyId: string, userId: string, dto: UpsertLocationDto) {
    const db = this.prisma as any;
    const normalizedHours = this.normalizeHours(dto.hours);
    const created = await db.location.create({
      data: {
        companyId,
        code: dto.code?.trim() || null,
        name: dto.name,
        kind: (dto.kind as any) || 'BRANCH',
        addressLine1: dto.addressLine1 || '-',
        addressLine2: dto.addressLine2 || null,
        city: dto.city || '-',
        state: dto.state || null,
        postalCode: dto.postalCode || null,
        country: dto.country || 'United Kingdom',
        phone: dto.phone || null,
        email: dto.email || null,
        isActive: dto.isActive ?? true,
        timezone: dto.timezone || null,
        metadataJson: dto.metadataJson ?? null,
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
      await db.locationMembership.createMany({
        data: dto.staffUserIds.map((uid) => ({
          tenantId: companyId,
          userId: uid,
          locationId: created.id,
          active: true,
        })),
        skipDuplicates: true,
      });
    }

    if (normalizedHours) {
      await db.locationBusinessHour.deleteMany({ where: { companyId, locationId: created.id } });
      await db.locationBusinessHour.createMany({
        data: normalizedHours.map((hour) => ({
          companyId,
          locationId: created.id,
          weekday: hour.weekday,
          startMinute: hour.startMinute,
          endMinute: hour.endMinute,
          isClosed: hour.isClosed,
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
    const normalizedHours = this.normalizeHours(dto.hours);
    const updated = await db.location.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        code: dto.code !== undefined ? dto.code?.trim() || null : undefined,
        kind: dto.kind !== undefined ? (dto.kind as any) : undefined,
        addressLine1: dto.addressLine1 ?? undefined,
        addressLine2: dto.addressLine2 ?? undefined,
        city: dto.city ?? undefined,
        state: dto.state ?? undefined,
        postalCode: dto.postalCode ?? undefined,
        country: dto.country ?? undefined,
        phone: dto.phone ?? undefined,
        email: dto.email ?? undefined,
        isActive: dto.isActive ?? undefined,
        timezone: dto.timezone ?? undefined,
        metadataJson: dto.metadataJson !== undefined ? dto.metadataJson ?? null : undefined,
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
      await db.locationMembership.updateMany({
        where: { tenantId: companyId, locationId: id },
        data: { active: false },
      });
      if (dto.staffUserIds.length > 0) {
        await db.locationMembership.createMany({
          data: dto.staffUserIds.map((uid) => ({
            tenantId: companyId,
            userId: uid,
            locationId: id,
            active: true,
          })),
          skipDuplicates: true,
        });
        await db.locationMembership.updateMany({
          where: {
            tenantId: companyId,
            locationId: id,
            userId: { in: dto.staffUserIds },
          },
          data: { active: true },
        });
      }
    }

    if (normalizedHours) {
      await db.locationBusinessHour.deleteMany({ where: { companyId, locationId: id } });
      await db.locationBusinessHour.createMany({
        data: normalizedHours.map((hour) => ({
          companyId,
          locationId: id,
          weekday: hour.weekday,
          startMinute: hour.startMinute,
          endMinute: hour.endMinute,
          isClosed: hour.isClosed,
        })),
      });
    }

    await this.audit.log(companyId, 'location.update', `Updated location ${updated.name}`, userId);
    return db.location.findFirst({
      where: { id, companyId },
      include: {
        businessHours: { orderBy: { weekday: 'asc' } },
        staffAssignments: { include: { user: { select: { id: true, email: true, role: true } } } },
        memberships: {
          include: {
            user: { select: { id: true, email: true, role: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        defaultAssignee: { select: { id: true, email: true } },
      },
    });
  }

  async savePublicImage(companyId: string, userId: string, id: string, fileName: string) {
    const db = this.prisma as any;
    const location = await db.location.findFirst({ where: { id, companyId } });
    if (!location) throw new NotFoundException('Location not found');
    const metadata = location.metadataJson && typeof location.metadataJson === 'object' && !Array.isArray(location.metadataJson)
      ? location.metadataJson
      : {};
    const imageUrl = buildApiUrl(`/tenant/public-booking-media/${companyId}/${encodeURIComponent(fileName)}`);
    await db.location.update({
      where: { id },
      data: { metadataJson: { ...metadata, imageUrl } },
    });
    await this.audit.log(companyId, 'location.image.upload', `Updated public image for ${location.name}`, userId);
    return { imageUrl };
  }

  async applyHoursToAll(companyId: string, userId: string, sourceLocationId: string) {
    const db = this.prisma as any;
    const source = await db.location.findFirst({
      where: { id: sourceLocationId, companyId, isActive: true },
      include: { businessHours: { orderBy: { weekday: 'asc' } } },
    });
    if (!source) throw new NotFoundException('Source location not found');
    const normalizedHours = this.normalizeHours(source.businessHours);
    if (!normalizedHours) throw new BadRequestException('The source location has no opening hours to copy');
    const locations = await db.location.findMany({
      where: { companyId, isActive: true, id: { not: sourceLocationId } },
      select: { id: true },
    });
    await db.$transaction(
      locations.flatMap((location: { id: string }) => [
        db.locationBusinessHour.deleteMany({ where: { companyId, locationId: location.id } }),
        db.locationBusinessHour.createMany({
          data: normalizedHours.map((hour) => ({
            companyId,
            locationId: location.id,
            weekday: hour.weekday,
            startMinute: hour.startMinute,
            endMinute: hour.endMinute,
            isClosed: hour.isClosed,
          })),
        }),
      ]),
    );
    await this.audit.log(
      companyId,
      'location.hours.apply_all',
      `Applied opening hours from ${source.name} to ${locations.length} active locations`,
      userId,
    );
    return { ok: true, updatedLocations: locations.length };
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

  async listMemberships(companyId: string) {
    const db = this.prisma as any;
    return db.locationMembership.findMany({
      where: { tenantId: companyId },
      include: {
        user: { select: { id: true, email: true, role: true } },
        location: { select: { id: true, name: true, code: true, kind: true, isActive: true } },
      },
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async createMembership(companyId: string, actorUserId: string, dto: UpsertLocationMembershipDto) {
    const db = this.prisma as any;
    const [user, location] = await Promise.all([
      db.user.findFirst({ where: { id: dto.userId, companyId }, select: { id: true, email: true } }),
      db.location.findFirst({ where: { id: dto.locationId, companyId }, select: { id: true, name: true } }),
    ]);
    if (!user) throw new BadRequestException('User not found for this tenant');
    if (!location) throw new BadRequestException('Location not found for this tenant');

    const membership = await db.locationMembership.upsert({
      where: {
        tenantId_userId_locationId: {
          tenantId: companyId,
          userId: dto.userId,
          locationId: dto.locationId,
        },
      },
      update: {
        active: dto.active ?? true,
        roleOverride: dto.roleOverride || null,
      },
      create: {
        tenantId: companyId,
        userId: dto.userId,
        locationId: dto.locationId,
        active: dto.active ?? true,
        roleOverride: dto.roleOverride || null,
      },
      include: {
        user: { select: { id: true, email: true, role: true } },
        location: { select: { id: true, name: true, code: true, kind: true, isActive: true } },
      },
    });

    await db.locationStaffAssignment.upsert({
      where: {
        locationId_userId: {
          locationId: dto.locationId,
          userId: dto.userId,
        },
      },
      update: {},
      create: {
        companyId,
        locationId: dto.locationId,
        userId: dto.userId,
      },
    });

    await this.audit.log(companyId, 'location.membership.create', `Assigned ${user.email} to ${location.name}`, actorUserId);
    return membership;
  }

  async patchMembership(companyId: string, actorUserId: string, id: string, dto: PatchLocationMembershipDto) {
    const db = this.prisma as any;
    const membership = await db.locationMembership.findFirst({
      where: { id, tenantId: companyId },
      include: {
        user: { select: { email: true } },
        location: { select: { name: true } },
      },
    });
    if (!membership) throw new NotFoundException('Location membership not found');

    const updated = await db.locationMembership.update({
      where: { id },
      data: {
        active: dto.active ?? undefined,
        roleOverride: dto.roleOverride !== undefined ? dto.roleOverride || null : undefined,
      },
      include: {
        user: { select: { id: true, email: true, role: true } },
        location: { select: { id: true, name: true, code: true, kind: true, isActive: true } },
      },
    });

    if (dto.active === false) {
      await db.locationStaffAssignment.deleteMany({
        where: {
          companyId,
          locationId: membership.locationId,
          userId: membership.userId,
        },
      });
    } else if (dto.active === true) {
      await db.locationStaffAssignment.upsert({
        where: {
          locationId_userId: {
            locationId: membership.locationId,
            userId: membership.userId,
          },
        },
        update: {},
        create: {
          companyId,
          locationId: membership.locationId,
          userId: membership.userId,
        },
      });
    }

    await this.audit.log(
      companyId,
      'location.membership.update',
      `Updated location membership for ${membership.user.email} at ${membership.location.name}`,
      actorUserId,
    );
    return updated;
  }

  async getSummary(companyId: string) {
    const db = this.prisma as any;
    const [locations, memberships, jobs, bookings, customers, servicePlans, inventoryLocations] = await Promise.all([
      db.location.findMany({
        where: { companyId },
        select: { id: true, name: true, code: true, kind: true, isActive: true },
        orderBy: { name: 'asc' },
      }),
      db.locationMembership.findMany({
        where: { tenantId: companyId, active: true },
        select: { locationId: true },
      }),
      db.job.groupBy({
        by: ['locationId'],
        where: { companyId, locationId: { not: null } },
        _count: { _all: true },
      }),
      db.booking.groupBy({
        by: ['locationId'],
        where: { companyId, locationId: { not: null } },
        _count: { _all: true },
      }),
      db.customer.groupBy({
        by: ['homeLocationId'],
        where: { companyId, homeLocationId: { not: null } },
        _count: { _all: true },
      }),
      db.servicePlan.groupBy({
        by: ['locationId'],
        where: { tenantId: companyId, locationId: { not: null } },
        _count: { _all: true },
      }),
      db.inventoryLocation.groupBy({
        by: ['businessLocationId'],
        where: { tenantId: companyId, businessLocationId: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const countsByKey = (rows: any[], key: string) =>
      new Map(rows.map((row: any) => [String(row[key]), Number(row._count?._all || 0)]));

    const membershipMap = new Map<string, number>();
    for (const row of memberships) {
      membershipMap.set(String(row.locationId), (membershipMap.get(String(row.locationId)) || 0) + 1);
    }

    const jobMap = countsByKey(jobs, 'locationId');
    const bookingMap = countsByKey(bookings, 'locationId');
    const customerMap = countsByKey(customers, 'homeLocationId');
    const planMap = countsByKey(servicePlans, 'locationId');
    const inventoryMap = countsByKey(inventoryLocations, 'businessLocationId');

    return {
      totals: {
        locations: locations.length,
        activeLocations: locations.filter((location: any) => location.isActive).length,
        memberships: memberships.length,
      },
      locations: locations.map((location: any) => ({
        ...location,
        membershipCount: membershipMap.get(location.id) || 0,
        jobsCount: jobMap.get(location.id) || 0,
        bookingsCount: bookingMap.get(location.id) || 0,
        customersCount: customerMap.get(location.id) || 0,
        servicePlansCount: planMap.get(location.id) || 0,
        inventoryLocationsCount: inventoryMap.get(location.id) || 0,
      })),
    };
  }
}
