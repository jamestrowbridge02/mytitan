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
exports.TradeAccountsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const audit_service_1 = require("../audit/audit.service");
const prisma_service_1 = require("../prisma/prisma.service");
const constants_1 = require("../common/constants");
function normalizeCrmTaskStatus(value) {
    if (!value)
        return constants_1.CRM_TASK_STATUSES[0];
    const normalized = String(value).trim().toUpperCase();
    if (normalized === 'INPROGRESS')
        return 'IN_PROGRESS';
    if (normalized === 'DONE')
        return 'COMPLETED';
    if (normalized === 'CLOSED' || normalized === 'CANCELED')
        return 'CANCELLED';
    if (constants_1.CRM_TASK_STATUSES.includes(normalized)) {
        return normalized;
    }
    return constants_1.CRM_TASK_STATUSES[0];
}
let TradeAccountsService = class TradeAccountsService {
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    async upsert(companyId, userId, dto) {
        const db = this.prisma;
        const payload = {
            name: dto.name,
            contactName: dto.contactName,
            contactEmail: dto.contactEmail,
            contactPhone: dto.contactPhone,
            creditLimit: new client_1.Prisma.Decimal(dto.creditLimit),
            outstandingBalance: new client_1.Prisma.Decimal(dto.outstandingBalance ?? 0),
            status: dto.status ?? 'ACTIVE',
            nextActionType: dto.nextActionType ?? null,
            nextActionDueAt: dto.nextActionDueAt ? new Date(dto.nextActionDueAt) : null,
            nextActionUserId: dto.nextActionUserId ?? null,
        };
        let account;
        if (dto.id) {
            const existing = await db.tradeAccount.findFirst({ where: { id: dto.id, companyId } });
            if (!existing) {
                throw new common_1.NotFoundException('Trade account not found');
            }
            account = await db.tradeAccount.update({
                where: { id: existing.id },
                data: payload,
            });
            await this.audit.log(companyId, 'trade.upsert', `Updated trade account ${account.name}`, userId);
            return account;
        }
        account = await db.tradeAccount.create({
            data: {
                companyId,
                ...payload,
            },
        });
        await this.audit.log(companyId, 'trade.upsert', `Created trade account ${account.name}`, userId);
        return account;
    }
    async list(companyId, query) {
        const db = this.prisma;
        const page = Math.max(1, Number(query?.page || 1));
        const pageSize = Math.min(100, Math.max(1, Number(query?.pageSize || 30)));
        const where = { companyId };
        if (query?.status)
            where.status = query.status;
        if (query?.q) {
            const q = query.q.trim();
            where.OR = [
                { name: { contains: q, mode: 'insensitive' } },
                { contactName: { contains: q, mode: 'insensitive' } },
                { contactEmail: { contains: q, mode: 'insensitive' } },
                { contactPhone: { contains: q, mode: 'insensitive' } },
            ];
        }
        const accounts = await db.tradeAccount.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
        });
        const withBalance = await Promise.all(accounts.map(async (account) => {
            const unpaid = await db.job.findMany({
                where: {
                    companyId,
                    OR: [{ tradeAccountId: account.id }, { customerEmail: account.contactEmail || undefined }],
                    invoiceIssuedAt: { not: null },
                    invoicePaidAt: null,
                },
                select: { totalCents: true },
            });
            const computedOutstandingCents = unpaid.reduce((sum, row) => sum + Number(row.totalCents || 0), 0);
            return { ...account, computedOutstandingCents };
        }));
        return withBalance;
    }
    async get(companyId, id) {
        const db = this.prisma;
        const account = await db.tradeAccount.findFirst({ where: { companyId, id } });
        if (!account)
            throw new common_1.NotFoundException('Trade account not found');
        const recentJobs = await db.job.findMany({
            where: { companyId, tradeAccountId: id },
            orderBy: { createdAt: 'desc' },
            take: 8,
        });
        const recentBookings = await db.booking.findMany({
            where: { companyId, tradeAccountId: id },
            orderBy: { startsAt: 'desc' },
            take: 8,
        });
        const notes = await db.tradeAccountNote.findMany({
            where: { companyId, tradeAccountId: id },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
        const [unpaidSummary, paidSummary] = await Promise.all([
            db.job.aggregate({
                _sum: { totalCents: true },
                _count: { _all: true },
                where: {
                    companyId,
                    OR: [{ tradeAccountId: id }, { customerEmail: account.contactEmail || undefined }],
                    invoiceIssuedAt: { not: null },
                    invoicePaidAt: null,
                },
            }),
            db.job.aggregate({
                _sum: { totalCents: true },
                where: {
                    companyId,
                    OR: [{ tradeAccountId: id }, { customerEmail: account.contactEmail || undefined }],
                    invoicePaidAt: { not: null },
                },
            }),
        ]);
        return {
            account,
            recentJobs,
            recentBookings,
            notes,
            summary: {
                unpaidCount: Number(unpaidSummary?._count?._all || 0),
                unpaidTotalCents: Number(unpaidSummary?._sum?.totalCents || 0),
                paidTotalCents: Number(paidSummary?._sum?.totalCents || 0),
            },
        };
    }
    async addNote(companyId, userId, accountId, dto) {
        const db = this.prisma;
        const account = await db.tradeAccount.findFirst({ where: { companyId, id: accountId } });
        if (!account)
            throw new common_1.NotFoundException('Trade account not found');
        const mentionHandles = Array.from(new Set((dto.body.match(/@[a-zA-Z0-9_.-]+/g) || []).map((m) => m.slice(1))));
        const note = await db.tradeAccountNote.create({
            data: {
                companyId,
                tradeAccountId: accountId,
                authorUserId: userId,
                body: dto.body,
                mentionHandles,
                attachmentsJson: dto.attachmentsMeta || null,
            },
        });
        await this.audit.log(companyId, 'trade.note.add', `Added note for ${account.name}`, userId);
        return note;
    }
    async updateNextAction(companyId, userId, accountId, dto) {
        const db = this.prisma;
        const account = await db.tradeAccount.findFirst({ where: { companyId, id: accountId } });
        if (!account)
            throw new common_1.NotFoundException('Trade account not found');
        const updated = await db.tradeAccount.update({
            where: { id: accountId },
            data: {
                nextActionType: dto.type ?? null,
                nextActionDueAt: dto.dueAt ? new Date(dto.dueAt) : null,
                nextActionUserId: dto.assignedUserId ?? null,
            },
        });
        await this.audit.log(companyId, 'trade.next-action.update', `Updated next action for ${account.name}`, userId);
        return updated;
    }
    async timeline(companyId, accountId, page = 1, pageSize = 25) {
        const db = this.prisma;
        const account = await db.tradeAccount.findFirst({ where: { companyId, id: accountId } });
        if (!account)
            throw new common_1.NotFoundException('Trade account not found');
        const normalizedPage = Math.max(1, Number(page || 1));
        const normalizedPageSize = Math.min(100, Math.max(1, Number(pageSize || 25)));
        const [jobs, bookings, notes, payments, audits] = await Promise.all([
            db.job.findMany({
                where: { companyId, tradeAccountId: accountId },
                orderBy: { createdAt: 'desc' },
                take: normalizedPageSize * 2,
            }),
            db.booking.findMany({
                where: { companyId, tradeAccountId: accountId },
                orderBy: { createdAt: 'desc' },
                take: normalizedPageSize * 2,
            }),
            db.tradeAccountNote.findMany({
                where: { companyId, tradeAccountId: accountId },
                orderBy: { createdAt: 'desc' },
                take: normalizedPageSize * 2,
            }),
            db.job.findMany({
                where: { companyId, tradeAccountId: accountId, invoicePaidAt: { not: null } },
                orderBy: { invoicePaidAt: 'desc' },
                take: normalizedPageSize * 2,
                select: { id: true, jobRef: true, invoicePaidAt: true, totalCents: true, paymentMethod: true },
            }),
            db.auditLog.findMany({
                where: { companyId, event: { startsWith: 'trade.' } },
                orderBy: { createdAt: 'desc' },
                take: normalizedPageSize * 2,
            }),
        ]);
        const timeline = [
            ...jobs.map((j) => ({ type: 'job', createdAt: j.createdAt, data: j })),
            ...bookings.map((b) => ({ type: 'booking', createdAt: b.createdAt, data: b })),
            ...notes.map((n) => ({ type: 'note', createdAt: n.createdAt, data: n })),
            ...payments.map((p) => ({ type: 'payment', createdAt: p.invoicePaidAt, data: p })),
            ...audits.map((a) => ({ type: 'system', createdAt: a.createdAt, data: a })),
        ]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice((normalizedPage - 1) * normalizedPageSize, normalizedPage * normalizedPageSize);
        return { account, timeline, page: normalizedPage, pageSize: normalizedPageSize };
    }
    async crmSearch(companyId, query) {
        const db = this.prisma;
        const where = { companyId };
        if (query?.q?.trim()) {
            const q = query.q.trim();
            where.OR = [
                { name: { contains: q, mode: 'insensitive' } },
                { contactName: { contains: q, mode: 'insensitive' } },
                { contactEmail: { contains: q, mode: 'insensitive' } },
            ];
        }
        if (query?.tag) {
            where.customerTags = { some: { label: query.tag } };
        }
        const accounts = await db.tradeAccount.findMany({
            where,
            orderBy: [{ lastContactedAt: 'desc' }, { createdAt: 'desc' }],
            include: {
                customerTags: true,
            },
            take: 100,
        });
        if (!query?.segmentId)
            return accounts;
        const segment = await db.customerSegment.findFirst({ where: { id: query.segmentId, companyId } });
        if (!segment?.rulesJson || typeof segment.rulesJson !== 'object')
            return accounts;
        const statusIn = Array.isArray(segment.rulesJson.statusIn) ? segment.rulesJson.statusIn : null;
        if (!statusIn)
            return accounts;
        return accounts.filter((acc) => statusIn.includes(acc.status));
    }
    async crmFull(companyId, accountId) {
        const db = this.prisma;
        const account = await db.tradeAccount.findFirst({
            where: { companyId, id: accountId },
            include: { customerTags: true },
        });
        if (!account)
            throw new common_1.NotFoundException('Trade account not found');
        const [jobs, bookings, notes, tasks] = await Promise.all([
            db.job.findMany({ where: { companyId, tradeAccountId: accountId }, orderBy: { createdAt: 'desc' }, take: 20 }),
            db.booking.findMany({ where: { companyId, tradeAccountId: accountId }, orderBy: { startsAt: 'desc' }, take: 20 }),
            db.cRMNote.findMany({ where: { companyId, tradeAccountId: accountId }, orderBy: { createdAt: 'desc' }, take: 100 }),
            db.cRMTask.findMany({ where: { companyId, tradeAccountId: accountId }, orderBy: [{ status: 'asc' }, { dueAt: 'asc' }] }),
        ]);
        const [unpaidSummary, paidSummary] = await Promise.all([
            db.job.aggregate({
                _sum: { totalCents: true },
                _count: { _all: true },
                where: { companyId, tradeAccountId: accountId, invoiceIssuedAt: { not: null }, invoicePaidAt: null },
            }),
            db.job.aggregate({
                _sum: { totalCents: true },
                where: { companyId, tradeAccountId: accountId, invoicePaidAt: { not: null } },
            }),
        ]);
        return {
            account,
            financialSummary: {
                unpaidCount: Number(unpaidSummary?._count?._all || 0),
                unpaidTotalCents: Number(unpaidSummary?._sum?.totalCents || 0),
                paidTotalCents: Number(paidSummary?._sum?.totalCents || 0),
            },
            timeline: [
                ...jobs.map((j) => ({ type: 'job', createdAt: j.createdAt, data: j })),
                ...bookings.map((b) => ({ type: 'booking', createdAt: b.createdAt, data: b })),
                ...notes.map((n) => ({ type: 'note', createdAt: n.createdAt, data: n })),
                ...tasks.map((t) => ({ type: 'task', createdAt: t.createdAt, data: t })),
            ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
            notes,
            tasks,
            attachments: notes
                .map((note) => note.attachmentsJson)
                .filter(Boolean),
            tags: account.customerTags,
        };
    }
    async addCrmNote(companyId, userId, accountId, dto) {
        const db = this.prisma;
        const account = await db.tradeAccount.findFirst({ where: { companyId, id: accountId } });
        if (!account)
            throw new common_1.NotFoundException('Trade account not found');
        const note = await db.cRMNote.create({
            data: {
                companyId,
                tradeAccountId: accountId,
                authorUserId: userId,
                bodyJson: dto.bodyJson || { text: '' },
                attachmentsJson: dto.attachmentsJson || null,
            },
        });
        await db.tradeAccount.update({
            where: { id: accountId },
            data: { lastContactedAt: new Date() },
        });
        await this.audit.log(companyId, 'crm.note.add', `Added CRM note for ${account.name}`, userId);
        return note;
    }
    async addCrmTask(companyId, userId, accountId, dto) {
        const db = this.prisma;
        const account = await db.tradeAccount.findFirst({ where: { companyId, id: accountId } });
        if (!account)
            throw new common_1.NotFoundException('Trade account not found');
        const task = await db.cRMTask.create({
            data: {
                companyId,
                tradeAccountId: accountId,
                title: dto.title,
                details: dto.details || null,
                dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
                assigneeUserId: dto.assigneeUserId || userId,
                status: normalizeCrmTaskStatus(dto.status),
            },
        });
        await this.audit.log(companyId, 'crm.task.add', `Added CRM task for ${account.name}`, userId);
        return task;
    }
    async patchCrmAccount(companyId, userId, accountId, dto) {
        const db = this.prisma;
        const account = await db.tradeAccount.findFirst({ where: { companyId, id: accountId } });
        if (!account)
            throw new common_1.NotFoundException('Trade account not found');
        const updated = await db.tradeAccount.update({
            where: { id: accountId },
            data: {
                name: dto.name ?? undefined,
                contactName: dto.contactName ?? undefined,
                contactEmail: dto.contactEmail ?? undefined,
                contactPhone: dto.contactPhone ?? undefined,
                status: dto.status ?? undefined,
                lastContactedAt: dto.lastContactedAt ? new Date(dto.lastContactedAt) : undefined,
            },
        });
        await this.audit.log(companyId, 'crm.account.patch', `Updated CRM account ${updated.name}`, userId);
        return updated;
    }
};
exports.TradeAccountsService = TradeAccountsService;
exports.TradeAccountsService = TradeAccountsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService])
], TradeAccountsService);
//# sourceMappingURL=trade-accounts.service.js.map