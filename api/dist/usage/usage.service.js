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
exports.UsageService = void 0;
const common_1 = require("@nestjs/common");
const billing_constants_1 = require("../billing/billing.constants");
const prisma_service_1 = require("../prisma/prisma.service");
let UsageService = class UsageService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getUsage(tenantId) {
        const db = this.prisma;
        const periodStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
        const usage = await db.usageMeter.findUnique({
            where: { tenantId_periodStart: { tenantId, periodStart } },
        });
        const subscription = await db.tenantSubscription.findUnique({
            where: { tenantId },
            include: { plan: true },
        });
        const plan = subscription?.plan ?? (await db.plan.findFirst({ where: { code: billing_constants_1.DEFAULT_PLAN_CODE } }));
        const features = (plan?.featuresJson ?? billing_constants_1.PLAN_DEFINITIONS[billing_constants_1.DEFAULT_PLAN_CODE].features);
        return {
            periodStart,
            usage: usage ?? {
                aiRequestsUsed: 0,
                aiTokensUsed: 0,
                storageBytesUsed: 0,
                jobsCreatedCount: 0,
            },
            limits: {
                aiRequestsLimitMonthly: plan?.aiRequestsLimitMonthly ?? billing_constants_1.PLAN_DEFINITIONS[billing_constants_1.DEFAULT_PLAN_CODE].aiRequestsLimitMonthly,
                aiTokensLimitMonthly: plan?.aiTokensLimitMonthly ?? billing_constants_1.PLAN_DEFINITIONS[billing_constants_1.DEFAULT_PLAN_CODE].aiTokensLimitMonthly,
                storageBytesLimit: features.storage_bytes_limit ?? null,
                jobsCreatedLimit: features.jobs_created_limit ?? null,
            },
        };
    }
};
exports.UsageService = UsageService;
exports.UsageService = UsageService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UsageService);
//# sourceMappingURL=usage.service.js.map