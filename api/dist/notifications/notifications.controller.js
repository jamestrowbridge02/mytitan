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
exports.NotificationsController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const feature_flags_1 = require("../common/feature-flags");
const roles_decorator_1 = require("../common/roles.decorator");
const roles_guard_1 = require("../common/roles.guard");
const dto_1 = require("./dto");
const notifications_service_1 = require("./notifications.service");
let NotificationsController = class NotificationsController {
    constructor(notifications) {
        this.notifications = notifications;
    }
    list(user) {
        (0, feature_flags_1.requireNotificationsV1Enabled)();
        return this.notifications.listRecent(user.companyId, user.sub, 30);
    }
    listByEntity(user, entityType, entityId) {
        (0, feature_flags_1.requireNotificationsV1Enabled)();
        if (!entityType || !entityId) {
            throw new common_1.BadRequestException('entityType and entityId are required');
        }
        return this.notifications.listByEntity(user.companyId, entityType, entityId);
    }
    listComms(user, scope, since, reasonKey, reasonKeyPrefix, status, aggregate, limit) {
        (0, feature_flags_1.requireNotificationsV1Enabled)();
        const scopeValue = String(scope || '').trim();
        if (scopeValue !== 'tenant') {
            throw new common_1.BadRequestException('scope=tenant is required');
        }
        const normalize = (value) => String(value || '').trim();
        const isValidToken = (value) => /^[a-z0-9_.:-]+$/i.test(value);
        const maxLen = 64;
        const reasonKeyValue = normalize(reasonKey);
        const reasonKeyPrefixValue = normalize(reasonKeyPrefix);
        const statusValue = normalize(status);
        const aggregateValue = normalize(aggregate);
        if (reasonKeyValue && reasonKeyPrefixValue) {
            throw new common_1.BadRequestException('reasonKey and reasonKeyPrefix are mutually exclusive');
        }
        if (reasonKeyValue && (reasonKeyValue.length > maxLen || !isValidToken(reasonKeyValue))) {
            throw new common_1.BadRequestException('reasonKey is invalid');
        }
        if (reasonKeyPrefixValue && (reasonKeyPrefixValue.length > maxLen || !isValidToken(reasonKeyPrefixValue))) {
            throw new common_1.BadRequestException('reasonKeyPrefix is invalid');
        }
        if (statusValue && !['queued', 'sent', 'failed'].includes(statusValue)) {
            throw new common_1.BadRequestException('status must be queued, sent, or failed');
        }
        let sinceDate;
        if (since) {
            const parsed = new Date(String(since));
            if (Number.isNaN(parsed.getTime())) {
                throw new common_1.BadRequestException('since must be a valid ISO timestamp');
            }
            sinceDate = parsed;
        }
        else {
            sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        }
        if (aggregateValue) {
            if (aggregateValue !== 'automations') {
                throw new common_1.BadRequestException('aggregate must be automations');
            }
            if (reasonKeyValue || reasonKeyPrefixValue || statusValue) {
                throw new common_1.BadRequestException('reasonKey, reasonKeyPrefix, and status are not supported with aggregate');
            }
            return this.notifications.listCommsAutomationsAggregate(user.companyId, { since: sinceDate });
        }
        return this.notifications.listCommsByTenant(user.companyId, {
            since: sinceDate,
            reasonKey: reasonKeyValue || undefined,
            reasonKeyPrefix: reasonKeyPrefixValue || undefined,
            status: statusValue || undefined,
            take: limit ? Number(limit) : 100,
        });
    }
    send(user, idempotencyKey, body) {
        (0, feature_flags_1.requireNotificationsV1Enabled)();
        if (!body?.entityType || !body?.entityId || !body?.templateKey) {
            throw new common_1.BadRequestException('entityType, entityId, templateKey are required');
        }
        const keyValue = String(idempotencyKey || '').trim();
        if (keyValue) {
            const isValid = /^[a-z0-9_.:-]+$/i.test(keyValue);
            if (!isValid || keyValue.length < 6 || keyValue.length > 128) {
                throw new common_1.BadRequestException('Idempotency-Key is invalid');
            }
        }
        return this.notifications.sendEntityUpdate(user.companyId, user.sub, {
            entityType: body.entityType,
            entityId: body.entityId,
            templateKey: body.templateKey,
            channel: body.channel,
            note: body.note,
            to: body.to,
            context: body.context,
            idempotencyKey: keyValue || undefined,
        });
    }
    preferences(user) {
        (0, feature_flags_1.requireNotificationsV1Enabled)();
        return this.notifications.getPreferences(user.companyId, user.sub);
    }
    updatePreferences(user, dto) {
        (0, feature_flags_1.requireNotificationsV1Enabled)();
        return this.notifications.updatePreferences(user.companyId, user.sub, dto);
    }
    markRead(user, id, dto) {
        (0, feature_flags_1.requireNotificationsV1Enabled)();
        return this.notifications.markRead(user.companyId, user.sub, id, dto.read ?? true);
    }
};
exports.NotificationsController = NotificationsController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('entity'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('entityType')),
    __param(2, (0, common_1.Query)('entityId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "listByEntity", null);
__decorate([
    (0, common_1.Get)('comms'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('scope')),
    __param(2, (0, common_1.Query)('since')),
    __param(3, (0, common_1.Query)('reasonKey')),
    __param(4, (0, common_1.Query)('reasonKeyPrefix')),
    __param(5, (0, common_1.Query)('status')),
    __param(6, (0, common_1.Query)('aggregate')),
    __param(7, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String, String, String, String]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "listComms", null);
__decorate([
    (0, common_1.Post)('send'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('idempotency-key')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "send", null);
__decorate([
    (0, common_1.Get)('preferences'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "preferences", null);
__decorate([
    (0, common_1.Patch)('preferences'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, dto_1.UpdateNotificationPreferenceDto]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "updatePreferences", null);
__decorate([
    (0, common_1.Patch)(':id/read'),
    (0, roles_decorator_1.Roles)('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, dto_1.MarkNotificationReadDto]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "markRead", null);
exports.NotificationsController = NotificationsController = __decorate([
    (0, common_1.UseGuards)(auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('notifications'),
    __metadata("design:paramtypes", [notifications_service_1.NotificationsService])
], NotificationsController);
//# sourceMappingURL=notifications.controller.js.map