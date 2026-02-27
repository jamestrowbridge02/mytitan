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
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const net_1 = require("net");
const tls_1 = require("tls");
const audit_service_1 = require("../audit/audit.service");
const automations_service_1 = require("../automations/automations.service");
const feature_flags_1 = require("../common/feature-flags");
const prisma_service_1 = require("../prisma/prisma.service");
let NotificationsService = class NotificationsService {
    constructor(prisma, audit, automations) {
        this.prisma = prisma;
        this.audit = audit;
        this.automations = automations;
    }
    async waitLine(socket) {
        return await new Promise((resolve, reject) => {
            const onData = (buf) => {
                cleanup();
                resolve(String(buf || '').trim());
            };
            const onError = (err) => {
                cleanup();
                reject(err);
            };
            const onTimeout = () => {
                cleanup();
                reject(new Error('SMTP timeout'));
            };
            const cleanup = () => {
                socket.off('data', onData);
                socket.off('error', onError);
                socket.off('timeout', onTimeout);
            };
            socket.once('data', onData);
            socket.once('error', onError);
            socket.once('timeout', onTimeout);
        });
    }
    async sendSmtpCommand(socket, command, expectedPrefixes) {
        socket.write(`${command}\r\n`);
        const line = await this.waitLine(socket);
        const ok = expectedPrefixes.some((prefix) => line.startsWith(prefix));
        if (!ok) {
            throw new Error(`SMTP command failed (${command}): ${line}`);
        }
        return line;
    }
    async sendViaSmtp(host, port, user, pass, from, to, subject, text) {
        const isTls = port === 465;
        const socket = isTls
            ? tls_1.default.connect({ host, port, rejectUnauthorized: false })
            : net_1.default.connect({ host, port });
        socket.setTimeout(10_000);
        await new Promise((resolve, reject) => {
            socket.once('connect', () => resolve());
            socket.once('error', reject);
        });
        try {
            const banner = await this.waitLine(socket);
            if (!banner.startsWith('220')) {
                throw new Error(`SMTP banner invalid: ${banner}`);
            }
            await this.sendSmtpCommand(socket, 'EHLO mytitan.local', ['250']);
            if (user && pass) {
                await this.sendSmtpCommand(socket, 'AUTH LOGIN', ['334']);
                await this.sendSmtpCommand(socket, Buffer.from(user).toString('base64'), ['334']);
                await this.sendSmtpCommand(socket, Buffer.from(pass).toString('base64'), ['235']);
            }
            await this.sendSmtpCommand(socket, `MAIL FROM:<${from}>`, ['250']);
            await this.sendSmtpCommand(socket, `RCPT TO:<${to}>`, ['250', '251']);
            await this.sendSmtpCommand(socket, 'DATA', ['354']);
            const body = [
                `From: ${from}`,
                `To: ${to}`,
                `Subject: ${subject}`,
                'MIME-Version: 1.0',
                'Content-Type: text/plain; charset=utf-8',
                '',
                text,
                '.',
            ].join('\r\n');
            socket.write(`${body}\r\n`);
            const dataResponse = await this.waitLine(socket);
            if (!dataResponse.startsWith('250')) {
                throw new Error(`SMTP DATA failed: ${dataResponse}`);
            }
            await this.sendSmtpCommand(socket, 'QUIT', ['221']);
            socket.end();
            return true;
        }
        catch {
            socket.end();
            return false;
        }
    }
    async sendNotificationEmail(companyId, to, subject, text) {
        const db = this.prisma;
        const tenant = await db.tenantSetting.findUnique({ where: { tenantId: companyId } });
        const host = String(tenant?.smtpHost || process.env.SMTP_HOST || '').trim();
        const port = Number(tenant?.smtpPort || process.env.SMTP_PORT || 587);
        const user = String(tenant?.smtpUsername || process.env.SMTP_USER || '').trim();
        const pass = String(process.env.SMTP_PASS || '').trim();
        const from = String(process.env.SMTP_FROM || process.env.SUPPORT_EMAIL || 'support@mytitan.co.uk').trim();
        if (!host) {
            await this.audit.log(companyId, 'notification.email.missing', 'Email not configured', null);
            return { delivered: false, reason: 'Email not configured' };
        }
        if ((0, feature_flags_1.isAutomationsV1Enabled)()) {
            const mode = await this.automations.getDeliveryMode(companyId);
            if (mode !== 'live_send') {
                await this.audit.log(companyId, 'notification.email.skipped', 'Delivery mode metadata_only', null);
                return { delivered: false, reason: 'Delivery mode metadata_only' };
            }
        }
        const delivered = await this.sendViaSmtp(host, port, user, pass, from, to, subject, text);
        if (!delivered) {
            await this.audit.log(companyId, 'notification.email.failed', `Failed notification email to ${to}`, null);
            return { delivered: false, reason: 'SMTP send failed' };
        }
        return { delivered: true };
    }
    async getPreferences(companyId, userId) {
        const db = this.prisma;
        const pref = await db.notificationPreference.upsert({
            where: { userId },
            update: {},
            create: {
                companyId,
                userId,
            },
        });
        return pref;
    }
    async updatePreferences(companyId, userId, dto) {
        const db = this.prisma;
        await this.getPreferences(companyId, userId);
        return db.notificationPreference.update({
            where: { userId },
            data: {
                ...(typeof dto.jobComplete === 'boolean' ? { jobComplete: dto.jobComplete } : {}),
                ...(typeof dto.paymentReceived === 'boolean' ? { paymentReceived: dto.paymentReceived } : {}),
                ...(typeof dto.emailEnabled === 'boolean' ? { emailEnabled: dto.emailEnabled } : {}),
            },
        });
    }
    async listRecent(companyId, userId, take = 30) {
        const db = this.prisma;
        return db.notification.findMany({
            where: { companyId, userId },
            orderBy: { createdAt: 'desc' },
            take: Math.max(1, Math.min(50, Number(take || 30))),
        });
    }
    async markRead(companyId, userId, id, read) {
        const db = this.prisma;
        const existing = await db.notification.findFirst({ where: { id, companyId, userId } });
        if (!existing)
            return { ok: false, message: 'Notification not found' };
        return db.notification.update({
            where: { id },
            data: {
                isRead: read,
                readAt: read ? new Date() : null,
            },
        });
    }
    async createForUsers(companyId, userIds, input) {
        if (!(0, feature_flags_1.isNotificationsV1Enabled)())
            return;
        const db = this.prisma;
        const unique = Array.from(new Set((userIds || []).filter(Boolean)));
        if (unique.length === 0)
            return;
        await db.notification.createMany({
            data: unique.map((userId) => ({
                companyId,
                userId,
                type: input.type,
                title: input.title,
                body: input.body || null,
                entityType: input.entityType || null,
                entityId: input.entityId || null,
                metaJson: input.metaJson || null,
            })),
            skipDuplicates: false,
        });
    }
    async notifyJobCompleted(companyId, jobId) {
        if (!(0, feature_flags_1.isNotificationsV1Enabled)())
            return;
        const db = this.prisma;
        const job = await db.job.findFirst({
            where: { id: jobId, companyId },
            include: { company: true, assignedUser: true, createdByUser: true },
        });
        if (!job)
            return;
        const owners = await db.user.findMany({
            where: { companyId, role: 'OWNER' },
            select: { id: true, email: true },
        });
        const recipientMap = new Map();
        owners.forEach((o) => recipientMap.set(o.id, o.email));
        if (job.assignedUserId && job.assignedUser?.email)
            recipientMap.set(job.assignedUserId, job.assignedUser.email);
        const recipientIds = Array.from(recipientMap.keys());
        await this.createForUsers(companyId, recipientIds, {
            type: 'job.complete',
            title: `Job completed: ${job.jobRef || job.id}`,
            body: `${job.customerName || 'Customer'} job is now completed.`,
            entityType: 'job',
            entityId: job.id,
            metaJson: { jobRef: job.jobRef, status: job.status },
        });
        const prefs = await db.notificationPreference.findMany({ where: { companyId, userId: { in: recipientIds } } });
        const prefMap = new Map(prefs.map((p) => [p.userId, p]));
        const pdfPath = job.invoicePdfUrl || null;
        const apiPublic = String(process.env.API_PUBLIC_URL || '').trim().replace(/\/$/, '');
        const pdfUrl = pdfPath ? (pdfPath.startsWith('http') ? pdfPath : `${apiPublic}${pdfPath}`) : null;
        for (const [userId, email] of recipientMap.entries()) {
            const pref = prefMap.get(userId);
            const emailEnabled = Boolean(pref?.emailEnabled);
            const eventEnabled = pref?.jobComplete !== false;
            if (!emailEnabled || !eventEnabled || !email)
                continue;
            const textLines = [
                `Job ${job.jobRef || job.id} is complete.`,
                `Customer: ${job.customerName || 'N/A'}`,
            ];
            if (pdfUrl)
                textLines.push(`PDF: ${pdfUrl}`);
            await this.sendNotificationEmail(companyId, email, `Job complete: ${job.jobRef || job.id}`, textLines.join('\n'));
        }
    }
    async notifyPaymentReceived(companyId, jobId) {
        if (!(0, feature_flags_1.isNotificationsV1Enabled)())
            return;
        const db = this.prisma;
        const job = await db.job.findFirst({
            where: { id: jobId, companyId },
            include: { createdByUser: true },
        });
        if (!job)
            return;
        const owners = await db.user.findMany({
            where: { companyId, role: 'OWNER' },
            select: { id: true, email: true },
        });
        const recipientMap = new Map();
        owners.forEach((o) => recipientMap.set(o.id, o.email));
        if (job.createdByUserId && job.createdByUser?.email)
            recipientMap.set(job.createdByUserId, job.createdByUser.email);
        const recipientIds = Array.from(recipientMap.keys());
        await this.createForUsers(companyId, recipientIds, {
            type: 'payment.received',
            title: `Payment received: ${job.jobRef || job.id}`,
            body: `${job.customerName || 'Customer'} payment marked as received.`,
            entityType: 'job',
            entityId: job.id,
            metaJson: {
                jobRef: job.jobRef,
                totalCents: job.totalCents,
                currency: job.currency,
            },
        });
        const prefs = await db.notificationPreference.findMany({ where: { companyId, userId: { in: recipientIds } } });
        const prefMap = new Map(prefs.map((p) => [p.userId, p]));
        for (const [userId, email] of recipientMap.entries()) {
            const pref = prefMap.get(userId);
            const emailEnabled = Boolean(pref?.emailEnabled);
            const eventEnabled = pref?.paymentReceived !== false;
            if (!emailEnabled || !eventEnabled || !email)
                continue;
            await this.sendNotificationEmail(companyId, email, `Payment received: ${job.jobRef || job.id}`, `Payment has been received for ${job.jobRef || job.id}.`);
        }
    }
    async listByEntity(companyId, entityType, entityId) {
        const db = this.prisma;
        const rows = await db.notification.findMany({
            where: { companyId, entityType, entityId },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
        return rows.map((row) => ({
            ...this.mapNotification(row),
            title: row.title,
        }));
    }
    mapNotification(row) {
        return {
            id: row.id,
            entityType: row.entityType,
            entityId: row.entityId,
            channel: row?.metaJson?.channel || 'in_app',
            status: row?.metaJson?.status || 'sent',
            reasonKey: row?.metaJson?.reasonKey || row.type,
            createdAt: row.createdAt,
        };
    }
    async findByIdempotency(companyId, idempotencyKey) {
        const db = this.prisma;
        const row = await db.notification.findFirst({
            where: { companyId, idempotencyKey },
        });
        if (!row)
            return null;
        return this.mapNotification(row);
    }
    async listCommsByTenant(companyId, options) {
        const db = this.prisma;
        const since = options.since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const take = Math.max(1, Math.min(100, Number(options.take || 100)));
        const where = {
            companyId,
            createdAt: { gte: since },
        };
        const metaFilters = [];
        if (options.reasonKey) {
            metaFilters.push({ metaJson: { path: ['reasonKey'], equals: options.reasonKey } });
        }
        if (options.reasonKeyPrefix) {
            metaFilters.push({ metaJson: { path: ['reasonKey'], string_starts_with: options.reasonKeyPrefix } });
        }
        if (options.status) {
            metaFilters.push({ metaJson: { path: ['status'], equals: options.status } });
        }
        if (metaFilters.length > 0) {
            where.AND = metaFilters;
        }
        const rows = await db.notification.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take,
        });
        return rows.map((row) => ({
            id: row.id,
            entityType: row.entityType,
            entityId: row.entityId,
            channel: row?.metaJson?.channel || 'in_app',
            status: row?.metaJson?.status || 'queued',
            reasonKey: row?.metaJson?.reasonKey || row.type,
            createdAt: row.createdAt,
            scheduledFor: row?.metaJson?.context?.scheduledFor || null,
        }));
    }
    async listCommsAutomationsAggregate(companyId, options) {
        const db = this.prisma;
        const since = options.since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const baseWhere = {
            companyId,
            createdAt: { gte: since },
        };
        const reminders = await db.notification.count({
            where: {
                ...baseWhere,
                AND: [{ metaJson: { path: ['reasonKey'], string_starts_with: 'booking_reminder_' } }],
            },
        });
        const approval = await db.notification.count({
            where: {
                ...baseWhere,
                AND: [{ metaJson: { path: ['reasonKey'], equals: 'approval_request' } }],
            },
        });
        const reviews = await db.notification.count({
            where: {
                ...baseWhere,
                AND: [{ metaJson: { path: ['reasonKey'], equals: 'review_request' } }],
            },
        });
        const failed = await db.notification.count({
            where: {
                ...baseWhere,
                AND: [{ metaJson: { path: ['status'], equals: 'failed' } }],
                OR: [
                    { metaJson: { path: ['reasonKey'], string_starts_with: 'booking_reminder_' } },
                    { metaJson: { path: ['reasonKey'], equals: 'approval_request' } },
                    { metaJson: { path: ['reasonKey'], equals: 'review_request' } },
                ],
            },
        });
        return {
            since: since.toISOString(),
            reminders,
            approval,
            reviews,
            failed,
        };
    }
    async sendEntityUpdate(companyId, actorUserId, payload) {
        const db = this.prisma;
        if (payload.idempotencyKey) {
            const existing = await this.findByIdempotency(companyId, payload.idempotencyKey);
            if (existing)
                return existing;
        }
        const templateKey = payload.templateKey;
        const channel = payload.channel || 'in_app';
        const note = payload.note ? String(payload.note).slice(0, 500) : null;
        const metaJson = {
            channel,
            status: 'queued',
            reasonKey: templateKey,
            to: payload.to || null,
            context: payload.context || null,
            note,
        };
        let created;
        try {
            created = await db.notification.create({
                data: {
                    companyId,
                    userId: actorUserId,
                    type: templateKey,
                    title: `${templateKey.replace(/[_\.]/g, ' ')} queued`,
                    body: null,
                    entityType: payload.entityType,
                    entityId: payload.entityId,
                    idempotencyKey: payload.idempotencyKey || null,
                    metaJson,
                },
            });
        }
        catch (error) {
            if (payload.idempotencyKey && error?.code === 'P2002') {
                const existing = await this.findByIdempotency(companyId, payload.idempotencyKey);
                if (existing)
                    return existing;
            }
            throw error;
        }
        return {
            id: created.id,
            entityType: created.entityType,
            entityId: created.entityId,
            channel,
            status: 'queued',
            reasonKey: templateKey,
            createdAt: created.createdAt,
        };
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        audit_service_1.AuditService,
        automations_service_1.AutomationsService])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map