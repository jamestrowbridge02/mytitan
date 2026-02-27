"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMAIL_TEMPLATE_TYPES = exports.WHEEL_PRICING_MODES = exports.CRM_TASK_STATUS_INPUTS = exports.CRM_TASK_STATUSES = exports.TRADE_ACCOUNT_STATUSES = exports.BOOKING_STATUSES = exports.JOB_STATUS_ALIASES = exports.JOB_STATUSES = exports.ROLES = void 0;
exports.normalizeJobStatusInput = normalizeJobStatusInput;
exports.ROLES = ['OWNER', 'ADMIN', 'STAFF', 'READ_ONLY'];
exports.JOB_STATUSES = [
    'DRAFT',
    'OPEN',
    'SCHEDULED',
    'IN_PROGRESS',
    'COMPLETED',
    'INVOICED',
    'CANCELLED',
];
exports.JOB_STATUS_ALIASES = {
    DONE: 'COMPLETED',
    INPROGRESS: 'IN_PROGRESS',
    CANCELED: 'CANCELLED',
};
function normalizeJobStatusInput(value) {
    if (typeof value !== 'string')
        return null;
    const raw = value.trim();
    if (!raw)
        return null;
    const upper = raw.toUpperCase();
    if (exports.JOB_STATUSES.includes(upper))
        return upper;
    const compact = upper.replace(/[^A-Z]/g, '');
    const alias = exports.JOB_STATUS_ALIASES[upper] ?? exports.JOB_STATUS_ALIASES[compact];
    return alias ?? null;
}
exports.BOOKING_STATUSES = ['PENDING', 'PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
exports.TRADE_ACCOUNT_STATUSES = ['ACTIVE', 'ON_HOLD', 'CLOSED'];
exports.CRM_TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
exports.CRM_TASK_STATUS_INPUTS = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DONE', 'CLOSED', 'CANCELED'];
exports.WHEEL_PRICING_MODES = ['PER_WHEEL', 'SET'];
exports.EMAIL_TEMPLATE_TYPES = ['JOB_NOTIFICATION', 'INVOICE', 'BOOKING_CONFIRMATION'];
//# sourceMappingURL=constants.js.map