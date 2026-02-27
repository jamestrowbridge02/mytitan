"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLAN_DEFINITIONS = exports.DEFAULT_INTERVAL = exports.DEFAULT_PLAN_CODE = exports.FEATURE_KEYS = void 0;
exports.FEATURE_KEYS = [
    'bookings_enabled',
    'accounting_enabled',
    'payments_enabled',
    'social_enabled',
    'ai_enabled',
];
exports.DEFAULT_PLAN_CODE = 'SOLE_TRADER';
exports.DEFAULT_INTERVAL = 'MONTHLY';
exports.PLAN_DEFINITIONS = {
    SOLE_TRADER: {
        code: 'SOLE_TRADER',
        name: 'Sole Trader',
        features: {
            bookings_enabled: true,
            accounting_enabled: false,
            payments_enabled: true,
            social_enabled: false,
            ai_enabled: true,
            storage_bytes_limit: 1_000_000_000,
            jobs_created_limit: 200,
        },
        aiRequestsLimitMonthly: 200,
        aiTokensLimitMonthly: 100000,
    },
    BUSINESS: {
        code: 'BUSINESS',
        name: 'Business',
        features: {
            bookings_enabled: true,
            accounting_enabled: true,
            payments_enabled: true,
            social_enabled: false,
            ai_enabled: true,
            storage_bytes_limit: 10_000_000_000,
            jobs_created_limit: 2000,
        },
        aiRequestsLimitMonthly: 1000,
        aiTokensLimitMonthly: 500000,
    },
    ENTERPRISE: {
        code: 'ENTERPRISE',
        name: 'Enterprise',
        features: {
            bookings_enabled: true,
            accounting_enabled: true,
            payments_enabled: true,
            social_enabled: true,
            ai_enabled: true,
            storage_bytes_limit: 100_000_000_000,
            jobs_created_limit: 100000,
        },
        aiRequestsLimitMonthly: 10000,
        aiTokensLimitMonthly: null,
    },
};
//# sourceMappingURL=billing.constants.js.map