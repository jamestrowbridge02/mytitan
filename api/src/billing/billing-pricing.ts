import type { BillingInterval, PlanCode } from '@prisma/client';
import { DEFAULT_INTERVAL, DEFAULT_PLAN_CODE, PLAN_DEFINITIONS } from './billing.constants';

export type PricingAdjustmentType = 'percentage' | 'fixed';
export type PricingAdjustmentDuration = 'one_time' | 'recurring' | 'until_date';
export type PricingAdjustmentStatus = 'active' | 'consumed' | 'expired';

export type StoredPricingAdjustment = {
  type: PricingAdjustmentType;
  value: number;
  duration: PricingAdjustmentDuration;
  expiresAt?: string | null;
  reason?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  appliedByUserId?: string | null;
};

export type PricingAdjustmentSummary = StoredPricingAdjustment & {
  status: PricingAdjustmentStatus;
  isActive: boolean;
  consumedAt?: string | null;
  discountCents: number;
  adjustedPriceCents: number;
  appliesToNextPayment: boolean;
  appliesToFuturePayments: boolean;
};

export type PricingState = {
  currency: string;
  interval: BillingInterval;
  planCode: PlanCode;
  planName: string;
  basePriceCents: number;
  adjustedPriceCents: number;
  discountCents: number;
  adjustment: PricingAdjustmentSummary | null;
};

export function formatCurrencyMinorUnits(cents: number | null | undefined, currency = 'GBP') {
  const safeCents = Number.isFinite(Number(cents)) ? Number(cents) : 0;
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: normalizeCurrency(currency),
  }).format(safeCents / 100);
}

export function parseCurrencyToMinorUnits(
  rawValue: unknown,
  options: { allowZero?: boolean; currency?: string; fieldLabel?: string } = {},
) {
  const fieldLabel = options.fieldLabel || 'Amount';
  if (typeof rawValue === 'number') {
    if (!Number.isFinite(rawValue)) {
      throw new Error(`${fieldLabel} must be a valid currency amount.`);
    }
    if (rawValue < 0) {
      throw new Error(`${fieldLabel} cannot be negative.`);
    }
    const cents = Math.round(rawValue * 100);
    if (cents === 0 && options.allowZero !== true) {
      throw new Error(`${fieldLabel} must be greater than £0.00. Enter £19.00.`);
    }
    return cents;
  }

  const normalizedCurrency = normalizeCurrency(options.currency);
  const symbol = normalizedCurrency === 'GBP' ? '£' : '';
  const value = String(rawValue ?? '').trim();
  if (!value) {
    throw new Error(`${fieldLabel} is required. Enter ${symbol || normalizedCurrency}19.00.`);
  }
  const withoutSymbol = value.replace(/^£\s*/, '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(withoutSymbol)) {
    throw new Error(`${fieldLabel} must be a currency amount like ${symbol || normalizedCurrency}19.00.`);
  }
  const [poundsPart, pencePart = ''] = withoutSymbol.split('.');
  const pounds = Number(poundsPart);
  if (!Number.isSafeInteger(pounds)) {
    throw new Error(`${fieldLabel} must be a valid currency amount.`);
  }
  const cents = pounds * 100 + Number((pencePart || '').padEnd(2, '0'));
  if (cents === 0 && options.allowZero !== true) {
    throw new Error(`${fieldLabel} must be greater than £0.00. Enter £19.00.`);
  }
  return cents;
}

function toIsoString(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const next = new Date(value);
  if (Number.isNaN(next.getTime())) return null;
  return next.toISOString();
}

function normalizePlanCode(value: string | null | undefined): PlanCode {
  if (value && value in PLAN_DEFINITIONS) {
    return value as PlanCode;
  }
  return DEFAULT_PLAN_CODE;
}

function normalizeInterval(value: string | null | undefined): BillingInterval {
  if (value === 'ANNUAL' || value === 'MONTHLY') {
    return value;
  }
  return DEFAULT_INTERVAL;
}

function normalizeCurrency(value: unknown) {
  if (typeof value !== 'string') return 'GBP';
  const next = value.trim().toUpperCase();
  return next || 'GBP';
}

export function getPlanBasePriceCents(planCode: string | null | undefined, interval: BillingInterval) {
  const normalizedPlanCode = normalizePlanCode(planCode);
  return PLAN_DEFINITIONS[normalizedPlanCode].pricesCents[interval];
}

export function normalizeStoredPricingAdjustment(raw: unknown): StoredPricingAdjustment | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  const type = candidate.type === 'percentage' || candidate.type === 'fixed' ? candidate.type : null;
  const duration =
    candidate.duration === 'one_time' || candidate.duration === 'recurring' || candidate.duration === 'until_date'
      ? candidate.duration
      : null;
  const value = Number(candidate.value);

  if (!type || !duration || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  const expiresAtRaw = candidate.expiresAt;
  const expiresAt =
    typeof expiresAtRaw === 'string' && expiresAtRaw.trim() ? toIsoString(expiresAtRaw) : null;
  const reason = typeof candidate.reason === 'string' ? candidate.reason.trim() || null : null;
  const createdAt = toIsoString(candidate.createdAt);
  const updatedAt = toIsoString(candidate.updatedAt);
  const appliedByUserId =
    typeof candidate.appliedByUserId === 'string' && candidate.appliedByUserId.trim() ? candidate.appliedByUserId.trim() : null;

  return {
    type,
    value,
    duration,
    expiresAt,
    reason,
    createdAt,
    updatedAt,
    appliedByUserId,
  };
}

export function resolvePricingState({
  planCode,
  planName,
  interval,
  currency,
  adjustment,
  consumedAt,
  basePriceCentsOverride,
  now = new Date(),
}: {
  planCode?: string | null;
  planName?: string | null;
  interval?: string | null;
  currency?: unknown;
  adjustment?: unknown;
  consumedAt?: Date | string | null;
  basePriceCentsOverride?: number | null;
  now?: Date;
}): PricingState {
  const normalizedPlanCode = normalizePlanCode(planCode);
  const normalizedInterval = normalizeInterval(interval);
  const standardBasePriceCents = getPlanBasePriceCents(normalizedPlanCode, normalizedInterval);
  const basePriceCents = basePriceCentsOverride !== null &&
    basePriceCentsOverride !== undefined &&
    Number.isFinite(Number(basePriceCentsOverride)) &&
    Number(basePriceCentsOverride) >= 0
    ? Math.round(Number(basePriceCentsOverride))
    : standardBasePriceCents;
  const normalizedAdjustment = normalizeStoredPricingAdjustment(adjustment);
  const normalizedConsumedAt =
    typeof consumedAt === 'string' ? toIsoString(consumedAt) : consumedAt instanceof Date ? consumedAt.toISOString() : null;

  if (!normalizedAdjustment) {
    return {
      currency: normalizeCurrency(currency),
      interval: normalizedInterval,
      planCode: normalizedPlanCode,
      planName: planName || PLAN_DEFINITIONS[normalizedPlanCode].name,
      basePriceCents,
      adjustedPriceCents: basePriceCents,
      discountCents: 0,
      adjustment: null,
    };
  }

  const expiresAtDate = normalizedAdjustment.expiresAt ? new Date(normalizedAdjustment.expiresAt) : null;
  const isExpired = normalizedAdjustment.duration === 'until_date' && expiresAtDate ? expiresAtDate.getTime() <= now.getTime() : false;
  const isConsumed = normalizedAdjustment.duration === 'one_time' && Boolean(normalizedConsumedAt);
  const isActive = !isExpired && !isConsumed;

  const rawDiscountCents = normalizedAdjustment.type === 'percentage'
    ? Math.round(basePriceCents * (normalizedAdjustment.value / 100))
    : Math.round(normalizedAdjustment.value * 100);
  const discountCents = isActive ? Math.max(0, Math.min(basePriceCents, rawDiscountCents)) : 0;
  const adjustedPriceCents = Math.max(0, basePriceCents - discountCents);

  return {
    currency: normalizeCurrency(currency),
    interval: normalizedInterval,
    planCode: normalizedPlanCode,
    planName: planName || PLAN_DEFINITIONS[normalizedPlanCode].name,
    basePriceCents,
    adjustedPriceCents,
    discountCents,
    adjustment: {
      ...normalizedAdjustment,
      status: isConsumed ? 'consumed' : isExpired ? 'expired' : 'active',
      isActive,
      consumedAt: normalizedConsumedAt,
      discountCents,
      adjustedPriceCents,
      appliesToNextPayment: isActive,
      appliesToFuturePayments: isActive && normalizedAdjustment.duration !== 'one_time',
    },
  };
}
