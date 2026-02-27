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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../audit/audit.service");
const feature_flags_1 = require("../common/feature-flags");
const auth_guard_1 = require("./auth.guard");
const current_user_decorator_1 = require("./current-user.decorator");
const auth_service_1 = require("./auth.service");
const dto_1 = require("./dto");
let AuthController = class AuthController {
    constructor(auth, audit) {
        this.auth = auth;
        this.audit = audit;
        this.buckets = new Map();
        this.maxRequests = 10;
        this.windowMs = 60 * 1000;
    }
    enforceRateLimit(req) {
        const key = `${req.ip || 'unknown'}`;
        const now = Date.now();
        const current = this.buckets.get(key);
        if (!current || current.resetAt <= now) {
            this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
            return;
        }
        if (current.count >= this.maxRequests) {
            throw new common_1.HttpException('Too many auth attempts. Try again shortly.', common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        current.count += 1;
        this.buckets.set(key, current);
    }
    signup(req, dto) {
        this.enforceRateLimit(req);
        return this.auth.signup(dto);
    }
    login(req, dto) {
        this.enforceRateLimit(req);
        return this.auth.login(dto);
    }
    forgotPassword(req, dto) {
        this.enforceRateLimit(req);
        return this.auth.forgotPassword(dto);
    }
    resetPassword(req, dto) {
        this.enforceRateLimit(req);
        return this.auth.resetPassword(dto);
    }
    verifyEmail(req, dto) {
        this.enforceRateLimit(req);
        return this.auth.verifyEmail(dto);
    }
    resendVerification(req, user, dto) {
        this.enforceRateLimit(req);
        return this.auth.resendVerificationForUser(user.companyId, user.sub, dto);
    }
    async logout(user) {
        if ((0, feature_flags_1.isLogoutV1Enabled)()) {
            await this.audit.log(user.companyId, 'auth.logout', 'User signed out', user.sub);
        }
        return { ok: true };
    }
    async logoutAll(user) {
        if ((0, feature_flags_1.isLogoutV1Enabled)()) {
            await this.audit.log(user.companyId, 'auth.logout-all.requested', 'User requested sign out all sessions', user.sub);
        }
        return this.auth.signOutAll(user.companyId, user.sub);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('signup'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.SignupDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "signup", null);
__decorate([
    (0, common_1.Post)('login'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.LoginDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('forgot-password'),
    (0, common_1.HttpCode)(202),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.ForgotPasswordDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "forgotPassword", null);
__decorate([
    (0, common_1.Post)('reset-password'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.ResetPasswordDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "resetPassword", null);
__decorate([
    (0, common_1.Post)('verify-email'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.VerifyEmailDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "verifyEmail", null);
__decorate([
    (0, common_1.Post)('resend-verification'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(202),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, dto_1.ResendVerificationDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "resendVerification", null);
__decorate([
    (0, common_1.Post)('logout'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, common_1.Post)('logout-all'),
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logoutAll", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        audit_service_1.AuditService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map