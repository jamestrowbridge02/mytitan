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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const bcrypt = require("bcryptjs");
const crypto_1 = require("crypto");
const net_1 = require("net");
const tls_1 = require("tls");
const audit_service_1 = require("../audit/audit.service");
const billing_constants_1 = require("../billing/billing.constants");
const prisma_service_1 = require("../prisma/prisma.service");
let AuthService = class AuthService {
    constructor(prisma, jwt, audit) {
        this.prisma = prisma;
        this.jwt = jwt;
        this.audit = audit;
    }
    tokenHash(token) {
        return crypto_1.default.createHash('sha256').update(token).digest('hex');
    }
    makeToken(prefix) {
        return `${prefix}_${crypto_1.default.randomBytes(24).toString('hex')}`;
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
    async sendViaSmtp(to, subject, text) {
        const host = (process.env.SMTP_HOST || '').trim();
        const port = Number(process.env.SMTP_PORT || 587);
        const user = (process.env.SMTP_USER || '').trim();
        const pass = process.env.SMTP_PASS || '';
        const from = (process.env.SMTP_FROM || process.env.SUPPORT_EMAIL || 'support@mytitan.co.uk').trim();
        if (!host) {
            return { delivered: false, mode: 'log' };
        }
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
            await this.sendSmtpCommand(socket, `EHLO mytitan.local`, ['250']);
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
            return { delivered: true, mode: 'smtp' };
        }
        catch (err) {
            socket.end();
            throw err;
        }
    }
    async sendOrLogEmail(to, subject, text) {
        try {
            const sent = await this.sendViaSmtp(to, subject, text);
            if (sent.mode === 'smtp' && sent.delivered) {
                return sent;
            }
        }
        catch (err) {
            return { delivered: false, mode: 'smtp', error: err?.message || 'SMTP send failed' };
        }
        console.log(`[email:safe-log] to=${to} subject=${subject} msg="${text.slice(0, 120)}"`);
        return { delivered: false, mode: 'log' };
    }
    async createEmailVerificationToken(companyId, userId, email) {
        const db = this.prisma;
        const rawToken = this.makeToken('verify');
        const tokenHash = this.tokenHash(rawToken);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await db.emailVerificationToken.create({
            data: { companyId, userId, tokenHash, expiresAt },
        });
        const appUrl = process.env.APP_PUBLIC_URL || 'https://app.mytitan.co.uk';
        const result = await this.sendOrLogEmail(email, 'Verify your MyTitan email', `Open this link to verify your email: ${appUrl}/verify-email?token=${rawToken}`);
        if (!result.delivered) {
            await this.audit.log(companyId, 'auth.email.not-configured', 'Verification email not delivered', userId);
        }
    }
    async signup(dto) {
        const db = this.prisma;
        const email = dto.email.toLowerCase().trim();
        const existing = await db.user.findFirst({ where: { email } });
        if (existing) {
            throw new common_1.BadRequestException('Email already in use');
        }
        const passwordHash = await bcrypt.hash(dto.password, 10);
        const result = await db.$transaction(async (tx) => {
            let company;
            try {
                company = await tx.company.create({
                    data: {
                        name: dto.companyName.trim(),
                        timezone: dto.timezone ?? 'UTC',
                        currency: (dto.currency ?? 'USD').toUpperCase(),
                    },
                });
            }
            catch {
                company = await tx.company.create({ data: { name: dto.companyName.trim() } });
            }
            const user = await tx.user.create({
                data: {
                    companyId: company.id,
                    email,
                    emailVerified: false,
                    tokenVersion: 0,
                    passwordHash,
                    role: 'OWNER',
                },
            });
            const currentYear = new Date().getUTCFullYear();
            try {
                await tx.invoiceCounter.create({
                    data: {
                        companyId: company.id,
                        year: currentYear,
                        current: 0,
                    },
                });
            }
            catch {
                await tx.invoiceCounter.upsert({
                    where: { companyId: company.id },
                    create: { companyId: company.id, prefix: `INV-${currentYear}`, nextNumber: 1 },
                    update: {},
                });
            }
            try {
                const defaultPlan = await tx.plan.findFirst({ where: { code: billing_constants_1.DEFAULT_PLAN_CODE } });
                await tx.tenantSetting.create({
                    data: {
                        tenantId: company.id,
                        planId: defaultPlan?.id ?? null,
                        companyName: company.name,
                        defaultCurrency: company.currency ?? 'USD',
                        defaultTimezone: company.timezone ?? 'UTC',
                    },
                });
            }
            catch {
                const defaultPlan = await tx.plan.findFirst({ where: { code: billing_constants_1.DEFAULT_PLAN_CODE } });
                await tx.tenantSetting.upsert({
                    where: { tenantId: company.id },
                    create: {
                        tenantId: company.id,
                        planId: defaultPlan?.id ?? null,
                        companyName: company.name,
                        defaultCurrency: company.currency ?? 'USD',
                        defaultTimezone: company.timezone ?? 'UTC',
                    },
                    update: {},
                });
            }
            return { company, user };
        });
        await this.audit.log(result.company.id, 'signup', 'Company and admin user created', result.user.id);
        await this.createEmailVerificationToken(result.company.id, result.user.id, result.user.email);
        const payload = {
            sub: result.user.id,
            companyId: result.user.companyId,
            role: result.user.role,
            email: result.user.email,
            tokenVersion: Number(result.user.tokenVersion ?? 0),
            emailVerified: false,
        };
        return {
            token: await this.jwt.signAsync(payload),
            user: {
                id: result.user.id,
                companyId: result.user.companyId,
                email: result.user.email,
                emailVerified: false,
                role: result.user.role,
                createdAt: result.user.createdAt,
            },
            company: {
                id: result.company.id,
                name: result.company.name,
                timezone: result.company.timezone ?? 'UTC',
                currency: result.company.currency ?? 'USD',
            },
            emailVerificationRequired: true,
        };
    }
    async login(dto) {
        const db = this.prisma;
        const email = dto.email.toLowerCase().trim();
        const user = await db.user.findFirst({ where: { email } });
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
        if (!passwordValid) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        await db.user.update({
            where: { id: user.id },
            data: { lastActiveAt: new Date(), lastLoginAt: new Date() },
        });
        const payload = {
            sub: user.id,
            companyId: user.companyId,
            role: user.role,
            email: user.email,
            tokenVersion: Number(user.tokenVersion ?? 0),
            emailVerified: Boolean(user.emailVerified),
            demoUser: user.email === 'demo@mytitan.co.uk',
        };
        await this.audit.log(user.companyId, 'login', 'User logged in', user.id);
        return {
            token: await this.jwt.signAsync(payload),
            user: {
                id: user.id,
                companyId: user.companyId,
                email: user.email,
                emailVerified: Boolean(user.emailVerified),
                role: user.role,
                createdAt: user.createdAt,
                lastLoginAt: new Date().toISOString(),
            },
        };
    }
    async forgotPassword(dto) {
        const db = this.prisma;
        const email = dto.email.toLowerCase().trim();
        const user = await db.user.findFirst({ where: { email } });
        if (!user) {
            return { ok: true };
        }
        const token = this.makeToken('reset');
        const tokenHash = this.tokenHash(token);
        await db.passwordResetToken.create({
            data: {
                companyId: user.companyId,
                userId: user.id,
                tokenHash,
                expiresAt: new Date(Date.now() + 30 * 60 * 1000),
            },
        });
        const appUrl = process.env.APP_PUBLIC_URL || 'https://app.mytitan.co.uk';
        const result = await this.sendOrLogEmail(user.email, 'Reset your MyTitan password', `Reset link: ${appUrl}/reset-password?token=${token}`);
        if (!result.delivered) {
            await this.audit.log(user.companyId, 'auth.email.not-configured', 'Reset email not delivered', user.id);
        }
        return { ok: true };
    }
    async resetPassword(dto) {
        const db = this.prisma;
        const tokenHash = this.tokenHash(dto.token);
        const token = await db.passwordResetToken.findFirst({
            where: { tokenHash, consumedAt: null, expiresAt: { gt: new Date() } },
            include: { user: true },
        });
        if (!token) {
            throw new common_1.BadRequestException('Invalid or expired token');
        }
        const passwordHash = await bcrypt.hash(dto.newPassword, 10);
        await db.$transaction([
            db.user.update({ where: { id: token.userId }, data: { passwordHash, tokenVersion: { increment: 1 } } }),
            db.passwordResetToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } }),
        ]);
        await this.audit.log(token.companyId, 'auth.reset-password', 'Password reset completed', token.userId);
        return { ok: true };
    }
    async verifyEmail(dto) {
        const db = this.prisma;
        const tokenHash = this.tokenHash(dto.token);
        const token = await db.emailVerificationToken.findFirst({
            where: { tokenHash, consumedAt: null, expiresAt: { gt: new Date() } },
        });
        if (!token) {
            throw new common_1.BadRequestException('Invalid or expired verification token');
        }
        await db.$transaction([
            db.user.update({ where: { id: token.userId }, data: { emailVerified: true } }),
            db.emailVerificationToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } }),
        ]);
        await this.audit.log(token.companyId, 'auth.verify-email', 'Email verified', token.userId);
        return { ok: true };
    }
    async resendVerificationForUser(companyId, userId, dto) {
        const db = this.prisma;
        const where = dto?.email
            ? { companyId, email: dto.email.toLowerCase().trim() }
            : { companyId, id: userId };
        const user = await db.user.findFirst({ where });
        if (!user)
            return { ok: true };
        if (user.emailVerified)
            return { ok: true, alreadyVerified: true };
        await this.createEmailVerificationToken(user.companyId, user.id, user.email);
        return { ok: true };
    }
    async signOutAll(companyId, userId) {
        const db = this.prisma;
        await db.user.update({
            where: { id: userId },
            data: { tokenVersion: { increment: 1 } },
        });
        await this.audit.log(companyId, 'auth.logout-all', 'User signed out all sessions', userId);
        return { ok: true };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        audit_service_1.AuditService])
], AuthService);
//# sourceMappingURL=auth.service.js.map