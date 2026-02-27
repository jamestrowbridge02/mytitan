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
exports.TenantController = exports.TenantPublicAssetsController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const path_1 = require("path");
const fs_1 = require("fs");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const roles_decorator_1 = require("../common/roles.decorator");
const roles_guard_1 = require("../common/roles.guard");
const tenant_dto_1 = require("./tenant.dto");
const tenant_service_1 = require("./tenant.service");
const LOGO_MAX_BYTES = Number(process.env.TENANT_LOGO_MAX_BYTES ?? 2 * 1024 * 1024);
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
function safeFileName(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}
let TenantPublicAssetsController = class TenantPublicAssetsController {
    async getPublicLogo(tenantId, fileName, res) {
        const safeTenantId = safeFileName(tenantId);
        const safeName = safeFileName(fileName);
        const filePath = (0, path_1.join)(process.cwd(), 'uploads', 'tenants', safeTenantId, safeName);
        try {
            await fs_1.promises.access(filePath);
        }
        catch {
            throw new common_1.NotFoundException('Logo not found');
        }
        return res.sendFile(filePath);
    }
};
exports.TenantPublicAssetsController = TenantPublicAssetsController;
__decorate([
    (0, common_1.Get)('public-logo/:tenantId/:fileName'),
    __param(0, (0, common_1.Param)('tenantId')),
    __param(1, (0, common_1.Param)('fileName')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], TenantPublicAssetsController.prototype, "getPublicLogo", null);
exports.TenantPublicAssetsController = TenantPublicAssetsController = __decorate([
    (0, common_1.Controller)('tenant')
], TenantPublicAssetsController);
let TenantController = class TenantController {
    constructor(tenantService) {
        this.tenantService = tenantService;
    }
    getSettings(user) {
        return this.tenantService.getSettings(user.companyId);
    }
    updateSettings(user, dto) {
        return this.tenantService.updateSettings(user.companyId, user.sub, user.role, dto);
    }
    patchSettings(user, dto) {
        return this.tenantService.updateSettings(user.companyId, user.sub, user.role, dto);
    }
    async uploadLogo(user, file, dto) {
        if (file) {
            return this.tenantService.saveUploadedLogo(user.companyId, user.sub, file.filename);
        }
        if (dto.logoUrl) {
            return this.tenantService.setLogoUrl(user.companyId, user.sub, dto.logoUrl);
        }
        throw new common_1.BadRequestException('Provide a valid logo URL or file');
    }
};
exports.TenantController = TenantController;
__decorate([
    (0, common_1.Get)('settings'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], TenantController.prototype, "getSettings", null);
__decorate([
    (0, common_1.Put)('settings'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, tenant_dto_1.UpdateTenantSettingsDto]),
    __metadata("design:returntype", void 0)
], TenantController.prototype, "updateSettings", null);
__decorate([
    (0, common_1.Patch)('settings'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, tenant_dto_1.UpdateTenantSettingsDto]),
    __metadata("design:returntype", void 0)
], TenantController.prototype, "patchSettings", null);
__decorate([
    (0, common_1.Post)('settings/logo'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        storage: (0, multer_1.diskStorage)({
            destination: async (req, file, cb) => {
                try {
                    const user = req.user;
                    const dir = (0, path_1.join)(process.cwd(), 'uploads', 'tenants', safeFileName(user.companyId));
                    await fs_1.promises.mkdir(dir, { recursive: true });
                    cb(null, dir);
                }
                catch (error) {
                    cb(error, '');
                }
            },
            filename: (req, file, cb) => {
                const suffix = `${Date.now()}${(0, path_1.extname)(file.originalname || '') || '.png'}`;
                cb(null, `logo-${safeFileName(suffix)}`);
            },
        }),
        fileFilter: (_req, file, cb) => {
            if (!ALLOWED_MIME.has(file.mimetype)) {
                return cb(new common_1.ForbiddenException('Unsupported file type'), false);
            }
            cb(null, true);
        },
        limits: {
            fileSize: LOGO_MAX_BYTES,
        },
    })),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, tenant_dto_1.SetLogoUrlDto]),
    __metadata("design:returntype", Promise)
], TenantController.prototype, "uploadLogo", null);
exports.TenantController = TenantController = __decorate([
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('tenant'),
    __metadata("design:paramtypes", [tenant_service_1.TenantService])
], TenantController);
//# sourceMappingURL=tenant.controller.js.map