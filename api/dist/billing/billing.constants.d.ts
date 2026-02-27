import type { BillingInterval, PlanCode } from '@prisma/client';
export declare const FEATURE_KEYS: readonly ["bookings_enabled", "accounting_enabled", "payments_enabled", "social_enabled", "ai_enabled"];
export type FeatureKey = (typeof FEATURE_KEYS)[number];
export declare const DEFAULT_PLAN_CODE: PlanCode;
export declare const DEFAULT_INTERVAL: BillingInterval;
export declare const PLAN_DEFINITIONS: Record<PlanCode, {
    code: PlanCode;
    name: string;
    features: Record<string, boolean | number | null>;
    aiRequestsLimitMonthly: number;
    aiTokensLimitMonthly: number | null;
}>;
