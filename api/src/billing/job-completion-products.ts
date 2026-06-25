export const JOB_COMPLETION_PACK_CATALOG_KEY = 'job_completion_packs';

export const JOB_COMPLETION_PACK_DEFINITIONS = [
  {
    code: 'job_completion_pack_1',
    label: '10 extra job completions',
    jobCount: 10,
    amountCents: 500,
    envPriceId: 'STRIPE_JOB_COMPLETION_PACK_1_PRICE_ID',
    envProductId: 'STRIPE_JOB_COMPLETION_PACK_1_PRODUCT_ID',
  },
  {
    code: 'job_completion_pack_2',
    label: '25 extra job completions',
    jobCount: 25,
    amountCents: 1250,
    envPriceId: 'STRIPE_JOB_COMPLETION_PACK_2_PRICE_ID',
    envProductId: 'STRIPE_JOB_COMPLETION_PACK_2_PRODUCT_ID',
  },
  {
    code: 'job_completion_pack_3',
    label: '50 extra job completions',
    jobCount: 50,
    amountCents: 2500,
    envPriceId: 'STRIPE_JOB_COMPLETION_PACK_3_PRICE_ID',
    envProductId: 'STRIPE_JOB_COMPLETION_PACK_3_PRODUCT_ID',
  },
  {
    code: 'job_completion_pack_4',
    label: '100 extra job completions',
    jobCount: 100,
    amountCents: 5000,
    envPriceId: 'STRIPE_JOB_COMPLETION_PACK_4_PRICE_ID',
    envProductId: 'STRIPE_JOB_COMPLETION_PACK_4_PRODUCT_ID',
  },
  {
    code: 'job_completion_pack_5',
    label: '250 extra job completions',
    jobCount: 250,
    amountCents: 12500,
    envPriceId: 'STRIPE_JOB_COMPLETION_PACK_5_PRICE_ID',
    envProductId: 'STRIPE_JOB_COMPLETION_PACK_5_PRODUCT_ID',
  },
  {
    code: 'job_completion_pack_6',
    label: '500 extra job completions',
    jobCount: 500,
    amountCents: 25000,
    envPriceId: 'STRIPE_JOB_COMPLETION_PACK_6_PRICE_ID',
    envProductId: 'STRIPE_JOB_COMPLETION_PACK_6_PRODUCT_ID',
  },
] as const;

export type JobCompletionPackCode = (typeof JOB_COMPLETION_PACK_DEFINITIONS)[number]['code'];
export type JobCompletionPackLookupSource = 'lookup_key' | 'metadata' | 'env_fallback' | 'none';
export type JobCompletionPackSyncStatus = 'missing' | 'found' | 'inactive' | 'currency_mismatch' | 'job_count_mismatch' | 'price_mismatch' | 'ready';
export type JobCompletionPackCatalogStatus = 'setup_needed' | 'partial' | 'ready';
export type JobCompletionPackGrantingReadinessStatus = 'ready' | 'setup_required';

export type JobCompletionPackGrantingReadiness = {
  status: JobCompletionPackGrantingReadinessStatus;
  purchaseVerification: boolean;
  duplicateProtection: boolean;
  refundReversal: boolean;
  allowanceLedger: boolean;
  webhookIdempotency: boolean;
  message: string;
};

export type JobCompletionPackSnapshotRow = {
  code: JobCompletionPackCode;
  label: string;
  jobCount: number;
  status: JobCompletionPackSyncStatus;
  source: JobCompletionPackLookupSource;
  active: boolean;
  currency: string | null;
  displayPrice: string | null;
  productName: string | null;
  productId: string | null;
  priceId: string | null;
  message: string;
};

export type JobCompletionPackSnapshot = {
  key: string;
  status: JobCompletionPackCatalogStatus;
  checkoutEnabled: boolean;
  checkoutStatus: 'setup_required' | 'not_enabled' | 'enabled';
  grantingReadiness: JobCompletionPackGrantingReadiness;
  enablementSteps: string[];
  canary: {
    status: 'blocked' | 'not_run' | 'ready_for_monitored_canary' | 'last_run_ok' | 'last_run_attention';
    message: string;
    lastResult: string | null;
  };
  summary: string;
  lastCheckedAt: string | null;
  expectedCurrency: string;
  packs: JobCompletionPackSnapshotRow[];
};

export function normalizeJobCompletionPackCode(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function extractJobCompletionPackCodeFromMetadata(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata || typeof metadata !== 'object') return '';
  const candidates = [
    metadata.lookup_key,
    metadata.mytitan_lookup_key,
    metadata.mytitan_code,
    metadata.job_completion_pack_code,
    metadata.job_completion_pack_key,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeJobCompletionPackCode(candidate);
    if (normalized) return normalized;
  }
  return '';
}

export function formatJobCompletionPackPrice(amountCents: number | null | undefined, currency: string | null | undefined) {
  if (!Number.isFinite(Number(amountCents)) || amountCents == null || !currency) return null;
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: String(currency).toUpperCase(),
      maximumFractionDigits: 2,
    }).format(Number(amountCents) / 100);
  } catch {
    return `${String(currency).toUpperCase()} ${(Number(amountCents) / 100).toFixed(2)}`;
  }
}

export function summarizeJobCompletionPackSnapshot(packs: JobCompletionPackSnapshotRow[]) {
  const readyCount = packs.filter((pack) => pack.status === 'ready').length;
  if (readyCount === packs.length && packs.length > 0) return 'ready' as const;
  if (readyCount > 0 || packs.some((pack) => pack.status !== 'missing')) return 'partial' as const;
  return 'setup_needed' as const;
}

export function buildDefaultJobCompletionPackSnapshot(input?: {
  expectedCurrency?: string;
  message?: string;
  lastCheckedAt?: string | null;
}) {
  const expectedCurrency = String(input?.expectedCurrency || 'GBP').trim().toUpperCase() || 'GBP';
  const packs = JOB_COMPLETION_PACK_DEFINITIONS.map<JobCompletionPackSnapshotRow>((definition) => ({
      code: definition.code,
      label: definition.label,
      jobCount: definition.jobCount,
      status: 'missing',
      source: 'none',
    active: false,
    currency: null,
    displayPrice: null,
    productName: null,
    productId: null,
    priceId: null,
    message: input?.message || 'Stripe product sync has not been completed for this add-on yet.',
  }));

  return {
    key: JOB_COMPLETION_PACK_CATALOG_KEY,
    status: 'setup_needed' as const,
    checkoutEnabled: false,
    checkoutStatus: 'setup_required' as const,
    grantingReadiness: {
      status: 'setup_required' as const,
      purchaseVerification: false,
      duplicateProtection: false,
      refundReversal: false,
      allowanceLedger: false,
      webhookIdempotency: false,
      message: 'Webhook-backed granting has not been audited yet.',
    },
    enablementSteps: [
      'Sync all six Stripe job-pack products and prices.',
      'Confirm webhook-backed granting and refund reversal remain audit-ready.',
      'Set MYTITAN_CONFIRM_JOB_PACK_CHECKOUT=1 only after operator approval.',
    ],
    canary: {
      status: 'blocked' as const,
      message: 'Job-pack canaries stay blocked until checkout is explicitly confirmed for this runtime.',
      lastResult: null,
    },
    summary:
      input?.message ||
      'Extra job completion packs remain setup-required until Stripe product mappings and webhook-backed granting are fully ready.',
    lastCheckedAt: input?.lastCheckedAt || null,
    expectedCurrency,
    packs,
  };
}

export function sanitizeJobCompletionPackSnapshot(snapshot: JobCompletionPackSnapshot | null | undefined) {
  const safe = snapshot || buildDefaultJobCompletionPackSnapshot();
  return {
    key: safe.key,
    status: safe.status,
    checkoutEnabled: safe.checkoutEnabled,
    checkoutStatus: safe.checkoutStatus,
    grantingReadiness: safe.grantingReadiness,
    enablementSteps: safe.enablementSteps,
    canary: safe.canary,
    summary: safe.summary,
    lastCheckedAt: safe.lastCheckedAt,
    expectedCurrency: safe.expectedCurrency,
    packs: safe.packs.map((pack) => ({
      code: pack.code,
      label: pack.label,
      jobCount: pack.jobCount,
      status: pack.status,
      source: pack.source,
      active: pack.active,
      currency: pack.currency,
      displayPrice: pack.displayPrice,
      productName: pack.productName,
      message: pack.message,
    })),
  };
}
