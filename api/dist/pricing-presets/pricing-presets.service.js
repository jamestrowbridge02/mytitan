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
exports.PricingPresetsService = void 0;
const common_1 = require("@nestjs/common");
const feature_flags_1 = require("../common/feature-flags");
const prisma_service_1 = require("../prisma/prisma.service");
let PricingPresetsService = class PricingPresetsService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async list(tenantId) {
        (0, feature_flags_1.requireWheelsAutomationV1Enabled)();
        const db = this.prisma;
        const presets = await db.templatePreset.findMany({
            where: {
                tenantId,
                type: 'PRICING_PRESET',
                isActive: true,
            },
            orderBy: { updatedAt: 'desc' },
            take: 25,
        });
        const grouped = await db.job.groupBy({
            by: ['serviceName'],
            where: {
                companyId: tenantId,
                serviceName: { not: null },
            },
            _count: { _all: true },
        });
        const usageByName = new Map();
        for (const row of grouped) {
            const key = (row.serviceName || '').trim().toLowerCase();
            if (!key)
                continue;
            usageByName.set(key, Number(row._count?._all || 0));
        }
        const items = presets.map((preset) => {
            const data = (preset.dataJson || {});
            const rawPrice = data.unitPrice ?? data.price ?? null;
            const parsedPrice = rawPrice === null || rawPrice === undefined ? null : Number(rawPrice);
            const unitPrice = Number.isFinite(parsedPrice) ? parsedPrice : null;
            const candidates = [preset.name, data.label, preset.key]
                .map((value) => String(value || '').trim().toLowerCase())
                .filter(Boolean);
            const useCount = candidates.reduce((max, candidate) => Math.max(max, usageByName.get(candidate) || 0), 0);
            return {
                name: preset.name,
                key: preset.key,
                unitPrice,
                useCount,
            };
        });
        return { items };
    }
};
exports.PricingPresetsService = PricingPresetsService;
exports.PricingPresetsService = PricingPresetsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PricingPresetsService);
//# sourceMappingURL=pricing-presets.service.js.map