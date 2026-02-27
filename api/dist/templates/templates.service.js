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
exports.TemplatesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const feature_flags_1 = require("../common/feature-flags");
const wheels_template_data_1 = require("./wheels-template.data");
let TemplatesService = class TemplatesService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    requireFeature() {
        if (!(0, feature_flags_1.isWheelsFormV1Enabled)()) {
            throw new common_1.ServiceUnavailableException("Wheels form v1 is not enabled");
        }
    }
    async ensureWheelsDefaultTemplate() {
        const db = this.prisma;
        const template = await db.formTemplate.upsert({
            where: {
                tradeCode_version: {
                    tradeCode: wheels_template_data_1.WHEELS_TEMPLATE_META.tradeCode,
                    version: wheels_template_data_1.WHEELS_TEMPLATE_META.version,
                },
            },
            update: {
                name: wheels_template_data_1.WHEELS_TEMPLATE_META.name,
                isDefault: true,
            },
            create: {
                tradeCode: wheels_template_data_1.WHEELS_TEMPLATE_META.tradeCode,
                version: wheels_template_data_1.WHEELS_TEMPLATE_META.version,
                name: wheels_template_data_1.WHEELS_TEMPLATE_META.name,
                isDefault: true,
            },
        });
        await Promise.all(wheels_template_data_1.WHEELS_TEMPLATE_FIELDS.map((field, index) => db.formField.upsert({
            where: {
                templateId_key: {
                    templateId: template.id,
                    key: field.key,
                },
            },
            update: {
                label: field.label,
                type: field.type,
                required: Boolean(field.required),
                optionsJson: field.options ?? null,
                fieldOrder: index,
                group: field.group,
            },
            create: {
                templateId: template.id,
                key: field.key,
                label: field.label,
                type: field.type,
                required: Boolean(field.required),
                optionsJson: field.options ?? null,
                fieldOrder: index,
                group: field.group,
            },
        })));
        return template;
    }
    async getDefaultTemplate(tenantId, trade = wheels_template_data_1.WHEELS_TEMPLATE_TRADE) {
        this.requireFeature();
        const db = this.prisma;
        if (trade !== wheels_template_data_1.WHEELS_TEMPLATE_TRADE) {
            return { template: null, fields: [] };
        }
        const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
        if (settings?.primaryTrade !== wheels_template_data_1.WHEELS_TEMPLATE_TRADE) {
            return { template: null, fields: [], reason: "Primary trade is not WHEELS" };
        }
        const template = await this.ensureWheelsDefaultTemplate();
        const fields = await db.formField.findMany({
            where: { templateId: template.id },
            orderBy: { fieldOrder: "asc" },
        });
        return {
            template,
            fields,
        };
    }
};
exports.TemplatesService = TemplatesService;
exports.TemplatesService = TemplatesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TemplatesService);
//# sourceMappingURL=templates.service.js.map