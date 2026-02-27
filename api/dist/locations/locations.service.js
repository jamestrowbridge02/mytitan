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
exports.LocationsService = void 0;
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../audit/audit.service");
const prisma_service_1 = require("../prisma/prisma.service");
let LocationsService = class LocationsService {
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    defaultHours(companyId, locationId) {
        return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
            companyId,
            locationId,
            weekday,
            startMinute: weekday === 0 || weekday === 6 ? null : 9 * 60,
            endMinute: weekday === 0 || weekday === 6 ? null : 17 * 60,
            isClosed: weekday === 0 || weekday === 6,
        }));
    }
    async list(companyId) {
        const db = this.prisma;
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
    async create(companyId, userId, dto) {
        const db = this.prisma;
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
    async update(companyId, userId, id, dto) {
        const db = this.prisma;
        const location = await db.location.findFirst({ where: { id, companyId } });
        if (!location)
            throw new common_1.NotFoundException('Location not found');
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
    async archive(companyId, userId, id) {
        const db = this.prisma;
        const location = await db.location.findFirst({ where: { id, companyId } });
        if (!location)
            throw new common_1.NotFoundException('Location not found');
        const updated = await db.location.update({
            where: { id },
            data: { isActive: false },
        });
        await this.audit.log(companyId, 'location.archive', `Archived location ${updated.name}`, userId);
        return updated;
    }
    async setOnlyMyLocation(companyId, userId, enabled) {
        const db = this.prisma;
        await db.user.update({
            where: { id: userId },
            data: { onlyMyLocation: Boolean(enabled) },
        });
        await this.audit.log(companyId, 'location.restriction', `Set only-my-location=${Boolean(enabled)}`, userId);
        return { ok: true, onlyMyLocation: Boolean(enabled) };
    }
};
exports.LocationsService = LocationsService;
exports.LocationsService = LocationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], LocationsService);
//# sourceMappingURL=locations.service.js.map