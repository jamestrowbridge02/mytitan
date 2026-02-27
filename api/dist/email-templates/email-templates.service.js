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
exports.EmailTemplatesService = void 0;
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../audit/audit.service");
const prisma_service_1 = require("../prisma/prisma.service");
let EmailTemplatesService = class EmailTemplatesService {
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    list(tenantId) {
        const db = this.prisma;
        return db.emailTemplate.findMany({
            where: { tenantId },
            orderBy: { type: 'asc' },
        });
    }
    async getById(tenantId, id) {
        const db = this.prisma;
        const template = await db.emailTemplate.findFirst({ where: { id, tenantId } });
        if (!template) {
            throw new common_1.NotFoundException('Email template not found');
        }
        return template;
    }
    async create(tenantId, userId, dto) {
        const db = this.prisma;
        const existing = await db.emailTemplate.findFirst({
            where: { tenantId, type: dto.type },
        });
        if (existing) {
            throw new common_1.BadRequestException(`Template for type ${dto.type} already exists. Use update.`);
        }
        const created = await db.emailTemplate.create({
            data: {
                tenantId,
                type: dto.type,
                subject: dto.subject,
                bodyHtml: dto.bodyHtml,
                bodyText: dto.bodyText,
            },
        });
        await this.audit.log(tenantId, 'email-template.create', `Created template ${created.type}`, userId);
        return created;
    }
    async update(tenantId, userId, id, dto) {
        const db = this.prisma;
        const existing = await db.emailTemplate.findFirst({ where: { id, tenantId } });
        if (!existing) {
            throw new common_1.NotFoundException('Email template not found');
        }
        const updated = await db.emailTemplate.update({
            where: { id },
            data: {
                type: dto.type,
                subject: dto.subject,
                bodyHtml: dto.bodyHtml,
                bodyText: dto.bodyText,
            },
        });
        await this.audit.log(tenantId, 'email-template.update', `Updated template ${updated.type}`, userId);
        return updated;
    }
    async remove(tenantId, userId, id) {
        const db = this.prisma;
        const existing = await db.emailTemplate.findFirst({ where: { id, tenantId } });
        if (!existing) {
            throw new common_1.NotFoundException('Email template not found');
        }
        await db.emailTemplate.delete({ where: { id } });
        await this.audit.log(tenantId, 'email-template.delete', `Deleted template ${existing.type}`, userId);
        return { deleted: true };
    }
};
exports.EmailTemplatesService = EmailTemplatesService;
exports.EmailTemplatesService = EmailTemplatesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService])
], EmailTemplatesService);
//# sourceMappingURL=email-templates.service.js.map