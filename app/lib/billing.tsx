import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, getToken } from './api';

type Plan = {
  name: string;
  code: string;
  completedJobsPerMonth?: number | null;
  completedJobsLabel?: string | null;
  extraJobCompletionPacksStatus?: string | null;
};

type PricingTier = {
  code: string;
  publicName: string;
  summary: string;
  idealFor: string;
  checkoutMode?: string;
  priceMonthlyLabel?: string | null;
  priceAnnualLabel?: string | null;
  configuredIntervals?: {
    MONTHLY: boolean;
    ANNUAL: boolean;
  } | null;
  completedJobsPerMonth?: number | null;
  completedJobsLabel?: string | null;
  extraJobCompletionPacks?: {
    status: string;
    message: string;
  } | null;
  includedGroups: Array<{ key: string; label: string }>;
  naturalUpgradeTriggers: Array<{ key: string; label: string }>;
};

type PricingModel = {
  tiers: PricingTier[];
  usageTracking?: {
    authoritative: boolean;
    message: string;
  } | null;
  subscriptionPricingReadiness?: {
    status: string;
    message: string;
    checkedAt?: string | null;
    prices?: Array<{
      planCode: string;
      planName: string;
      interval: "MONTHLY" | "ANNUAL";
      status: string;
      active: boolean;
      displayExpectedPrice?: string | null;
      displayObservedPrice?: string | null;
      detail: string;
      action: string;
    }> | null;
  } | null;
};

type JobCompletionPack = {
  code: string;
  label: string;
  jobCount: number;
  status: string;
  source: string;
  active: boolean;
  currency?: string | null;
  displayPrice?: string | null;
  productName?: string | null;
  message: string;
};

type JobCompletionPackSummary = {
  key: string;
  status: string;
  checkoutEnabled: boolean;
  checkoutStatus: string;
  enablementSteps?: string[];
  canary?: {
    status: string;
    message: string;
    lastResult?: string | null;
  } | null;
  summary: string;
  lastCheckedAt?: string | null;
  expectedCurrency?: string | null;
  packs: JobCompletionPack[];
};

type JobCompletionAllowanceSummary = {
  periodStart: string;
  periodEnd: string;
  resetDate?: string;
  completedJobsCount: number;
  monthlyIncludedAllowance?: number;
  planIncludedAllowance?: number;
  unlimitedJobs?: boolean;
  enterprisePlanNote?: string | null;
  manualCreditsTotal?: number;
  temporaryCreditsTotal?: number;
  webhookBackedCreditsTotal?: number;
  monthlyIncludedUsed?: number;
  monthlyIncludedRemaining?: number;
  purchasedCreditsTotal?: number;
  purchasedCreditsUsed?: number;
  purchasedCreditsUsedThisMonth?: number;
  purchasedCreditsRemaining?: number;
  purchasedCreditsDeficit?: number;
  totalAvailableNow?: number;
  includedAllowance: number | null;
  includedRemaining: number;
  purchasedExtraAllowance: number;
  pendingExtraAllowance: number;
  remainingAllowance: number;
  extraRemaining: number;
  purchaseStateSummary?: string;
  expiredPurchases: number;
  cancelledPurchases: number;
  pendingPurchases: Array<{
    id: string;
    packCode: string;
    jobCompletionCount: number;
    amountCents: number;
    currency: string;
    status: string;
    createdAt: string;
  }>;
};

type TrialState = {
  status: "active" | "expired" | "converted" | "not_applicable";
  isActive: boolean;
  startedAt?: string | null;
  endsAt?: string | null;
  daysRemaining: number;
};

type Subscription = {
  status?: string | null;
  currentPeriodEnd?: string | null;
  planId?: string | null;
  cancelAtPeriodEnd?: boolean | null;
};

type BillingViewer = {
  role?: string;
  emailVerified?: boolean;
  canManageSubscription?: boolean;
  canManageCollectionSettings?: boolean;
};

type PaymentCollectionProvider = {
  provider: string;
  label: string;
  usage: string;
  live: boolean;
  status: string;
  summary: string;
  selectable: boolean;
  selected: boolean;
};

type PaymentCollectionState = {
  subscriptionBilling: {
    provider: string;
    label: string;
    status: string;
    usage: string;
    summary: string;
  };
  customerCollection: {
    preferredProvider: string;
    requestedProviders: string[];
    providers: PaymentCollectionProvider[];
  };
};

type PaymentProviderCanaryFramework = {
  automatedLiveCanariesEnabled: boolean;
  summary: string;
  providers: Array<{
    provider: string;
    label: string;
    status: string;
    message: string;
    liveCollection: boolean;
    liveCanaryAllowed: boolean;
  }>;
};

type BillingState = {
  plan: Plan | null;
  subscription: Subscription | null;
  trial: TrialState | null;
  interval: 'MONTHLY' | 'ANNUAL';
  stripeConfigured: boolean;
  paymentCollection: PaymentCollectionState | null;
  tenantPaymentReadiness: any | null;
  providerCanaries: PaymentProviderCanaryFramework | null;
  pricingModel: PricingModel | null;
  jobCompletionPacks: JobCompletionPackSummary | null;
  jobCompletionAllowance: JobCompletionAllowanceSummary | null;
  viewer: BillingViewer | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
};

const BillingContext = createContext<BillingState | undefined>(undefined);

export function BillingProvider({ children }: { children: React.ReactNode }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [trial, setTrial] = useState<TrialState | null>(null);
  const [interval, setInterval] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [paymentCollection, setPaymentCollection] = useState<PaymentCollectionState | null>(null);
  const [tenantPaymentReadiness, setTenantPaymentReadiness] = useState<any | null>(null);
  const [providerCanaries, setProviderCanaries] = useState<PaymentProviderCanaryFramework | null>(null);
  const [pricingModel, setPricingModel] = useState<PricingModel | null>(null);
  const [jobCompletionPacks, setJobCompletionPacks] = useState<JobCompletionPackSummary | null>(null);
  const [jobCompletionAllowance, setJobCompletionAllowance] = useState<JobCompletionAllowanceSummary | null>(null);
  const [viewer, setViewer] = useState<BillingViewer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    if (!getToken()) {
      setPlan(null);
      setSubscription(null);
      setTrial(null);
      setInterval('MONTHLY');
      setStripeConfigured(false);
      setPaymentCollection(null);
      setTenantPaymentReadiness(null);
      setProviderCanaries(null);
      setPricingModel(null);
      setJobCompletionPacks(null);
      setJobCompletionAllowance(null);
      setViewer(null);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/billing/me');
      setPlan(data?.plan ?? null);
      setSubscription(data?.subscription ?? null);
      setTrial(data?.trial ?? null);
      setInterval(data?.interval || 'MONTHLY');
      setStripeConfigured(Boolean(data?.stripeConfigured));
      setPaymentCollection(data?.paymentCollection ?? null);
      setTenantPaymentReadiness(data?.tenantPaymentReadiness ?? null);
      setProviderCanaries(data?.providerCanaries ?? null);
      setPricingModel(data?.pricingModel ?? null);
      setJobCompletionPacks(data?.jobCompletionPacks ?? null);
      setJobCompletionAllowance(data?.jobCompletionAllowance ?? null);
      setViewer(data?.viewer ?? null);
    } catch (err: any) {
      setError(err.message || 'Failed to load billing');
      setPlan(null);
      setSubscription(null);
      setTrial(null);
      setInterval('MONTHLY');
      setStripeConfigured(false);
      setPaymentCollection(null);
      setTenantPaymentReadiness(null);
      setProviderCanaries(null);
      setPricingModel(null);
      setJobCompletionPacks(null);
      setJobCompletionAllowance(null);
      setViewer(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const value = useMemo(
    () => ({
      plan,
      subscription,
      trial,
      interval,
      stripeConfigured,
      paymentCollection,
      tenantPaymentReadiness,
      providerCanaries,
      pricingModel,
      jobCompletionPacks,
      jobCompletionAllowance,
      viewer,
      loading,
      error,
      refresh,
    }),
    [plan, subscription, trial, interval, stripeConfigured, paymentCollection, tenantPaymentReadiness, providerCanaries, pricingModel, jobCompletionPacks, jobCompletionAllowance, viewer, loading, error],
  );

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling() {
  const context = useContext(BillingContext);
  if (!context) {
    throw new Error('useBilling must be used inside BillingProvider');
  }
  return context;
}
