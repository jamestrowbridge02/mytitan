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
exports.MetricsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let MetricsService = class MetricsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    getMonthStart(date) {
        return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    }
    async getOverview(tenantId) {
        const db = this.prisma;
        const now = new Date();
        const monthStart = this.getMonthStart(now);
        const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const [jobsCreated, bookingsUpcoming, outstandingAgg, revenueAgg, usage] = await Promise.all([
            db.job.count({
                where: { companyId: tenantId, createdAt: { gte: monthStart } },
            }),
            db.booking.count({
                where: { companyId: tenantId, startsAt: { gte: now, lte: weekEnd }, status: { not: 'CANCELLED' } },
            }),
            db.job.aggregate({
                where: {
                    companyId: tenantId,
                    invoiceIssuedAt: { not: null },
                    invoicePaidAt: null,
                },
                _count: { id: true },
                _sum: { totalCents: true },
            }),
            db.job.aggregate({
                where: {
                    companyId: tenantId,
                    invoicePaidAt: { gte: monthStart },
                },
                _sum: { totalCents: true },
            }),
            db.usageMeter.findUnique({
                where: { tenantId_periodStart: { tenantId, periodStart: monthStart } },
            }),
        ]);
        return {
            jobsCreatedThisMonth: jobsCreated,
            bookingsNext7Days: bookingsUpcoming,
            outstandingInvoices: {
                count: outstandingAgg?._count?.id ?? 0,
                totalCents: outstandingAgg?._sum?.totalCents ?? 0,
            },
            revenueThisMonth: revenueAgg?._sum?.totalCents ?? 0,
            aiUsageThisMonth: {
                requests: usage?.aiRequestsUsed ?? 0,
                tokens: usage?.aiTokensUsed ?? 0,
            },
            storageUsageBytes: usage?.storageBytesUsed ?? null,
        };
    }
};
exports.MetricsService = MetricsService;
exports.MetricsService = MetricsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], MetricsService);
//# sourceMappingURL=metrics.service.js.map