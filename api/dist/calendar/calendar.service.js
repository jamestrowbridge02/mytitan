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
exports.CalendarService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const MAX_RANGE_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
let CalendarService = class CalendarService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async listBookings(tenantId, input) {
        const from = this.parseRequiredDate(input.from, 'from');
        const to = this.parseRequiredDate(input.to, 'to');
        if (to.getTime() <= from.getTime()) {
            throw new common_1.BadRequestException('`to` must be greater than `from`.');
        }
        const maxTo = new Date(from.getTime() + MAX_RANGE_DAYS * MS_PER_DAY);
        const effectiveTo = to.getTime() > maxTo.getTime() ? maxTo : to;
        const db = this.prisma;
        const [technicians, bookings] = await Promise.all([
            db.user.findMany({
                where: {
                    companyId: tenantId,
                    role: { in: ['OWNER', 'ADMIN', 'STAFF'] },
                },
                select: { id: true, email: true },
                orderBy: { email: 'asc' },
            }),
            db.booking.findMany({
                where: {
                    companyId: tenantId,
                    ...(input.techId ? { assignedUserId: input.techId } : {}),
                    ...(input.locationId ? { locationId: input.locationId } : {}),
                    startsAt: { lt: effectiveTo },
                    endsAt: { gt: from },
                },
                include: {
                    assignedUser: { select: { id: true, email: true } },
                    location: { select: { id: true, name: true } },
                    job: {
                        select: {
                            id: true,
                            jobRef: true,
                            status: true,
                            customerName: true,
                            customerEmail: true,
                            customerPhone: true,
                        },
                    },
                },
                orderBy: [{ startsAt: 'asc' }, { endsAt: 'asc' }],
            }),
        ]);
        const blocks = bookings.map((booking) => ({
            id: booking.id,
            startsAt: booking.startsAt,
            endsAt: booking.endsAt,
            status: booking.status,
            source: booking.source,
            customer: {
                name: booking.customerName || null,
                email: booking.customerEmail || null,
                phone: booking.customerPhone || null,
            },
            technician: booking.assignedUser
                ? {
                    id: booking.assignedUser.id,
                    name: booking.assignedUser.email,
                    email: booking.assignedUser.email,
                }
                : null,
            location: booking.location
                ? {
                    id: booking.location.id,
                    name: booking.location.name,
                }
                : null,
            jobSummary: booking.job
                ? {
                    id: booking.job.id,
                    jobRef: booking.job.jobRef,
                    status: booking.job.status,
                    customerName: booking.job.customerName,
                    customerEmail: booking.job.customerEmail,
                    customerPhone: booking.job.customerPhone,
                }
                : null,
        }));
        return {
            from: from.toISOString(),
            to: to.toISOString(),
            effectiveTo: effectiveTo.toISOString(),
            clamped: effectiveTo.getTime() !== to.getTime(),
            technicians: technicians.map((tech) => ({
                id: tech.id,
                name: tech.email,
                email: tech.email,
            })),
            blocks,
        };
    }
    parseRequiredDate(value, key) {
        if (!value) {
            throw new common_1.BadRequestException(`Missing required query parameter: ${key}`);
        }
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
            throw new common_1.BadRequestException(`Invalid date for query parameter: ${key}`);
        }
        return parsed;
    }
};
exports.CalendarService = CalendarService;
exports.CalendarService = CalendarService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CalendarService);
//# sourceMappingURL=calendar.service.js.map