"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLE_PERMISSIONS = exports.PERMISSIONS = void 0;
exports.hasPermission = hasPermission;
exports.assertPermission = assertPermission;
const common_1 = require("@nestjs/common");
exports.PERMISSIONS = [
    'BILLING_MANAGE',
    'USER_INVITE',
    'USER_ROLE_ASSIGN',
    'USER_MANAGE',
    'EXPORT_DATA',
    'REFUND_MANAGE',
    'WEBHOOK_ADMIN',
    'AUTOMATIONS_ADMIN',
];
exports.ROLE_PERMISSIONS = {
    OWNER: [...exports.PERMISSIONS],
    ADMIN: ['USER_INVITE', 'USER_MANAGE', 'AUTOMATIONS_ADMIN'],
    STAFF: [],
    READ_ONLY: [],
};
function hasPermission(role, permission) {
    if (!role)
        return false;
    return exports.ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
async function assertPermission({ user, permission, audit, requestId, action, }) {
    if (!user?.role) {
        throw new common_1.ForbiddenException('Missing role context');
    }
    if (hasPermission(user.role, permission)) {
        return;
    }
    const logger = new common_1.Logger('Permissions');
    const message = `permission_denied permission=${permission} role=${user.role} action=${action || 'unknown'} requestId=${requestId || 'unknown'}`;
    try {
        await audit?.log(user.companyId, 'permission_denied', message, user.sub);
    }
    catch (error) {
        logger.warn(`${message} audit_error=${error instanceof Error ? error.message : String(error)}`);
    }
    throw new common_1.ForbiddenException('Insufficient permissions');
}
//# sourceMappingURL=permissions.js.map