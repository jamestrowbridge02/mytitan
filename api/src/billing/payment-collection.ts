export const LIVE_COLLECTION_PROVIDERS = ['STRIPE', 'MANUAL', 'SUMUP', 'WORLDPAY'] as const;
export const PROVIDER_READY_COLLECTION_PROVIDERS = ['SUMUP', 'WORLDPAY'] as const;
export const CUSTOMER_COLLECTION_PROVIDERS = LIVE_COLLECTION_PROVIDERS as readonly string[];

export type LiveCollectionProvider = (typeof LIVE_COLLECTION_PROVIDERS)[number];
export type ProviderReadyCollectionProvider = (typeof PROVIDER_READY_COLLECTION_PROVIDERS)[number];
export type CustomerCollectionProvider = (typeof CUSTOMER_COLLECTION_PROVIDERS)[number];
export type CustomerCollectionReadinessStatus =
  | 'manual_collection'
  | 'live_provider'
  | 'setup_needed'
  | 'requested'
  | 'not_enabled';

type PaymentCollectionConfig = {
  preferredProvider?: string | null;
  requestedProviders?: unknown;
};

function uniqueProviders(input: unknown, allowed: readonly string[]) {
  if (!Array.isArray(input)) return [] as string[];
  return Array.from(
    new Set(
      input
        .map((value) => String(value || '').trim().toUpperCase())
        .filter((value) => allowed.includes(value)),
    ),
  );
}

export function readPaymentCollectionConfig(settings?: { businessConfigJson?: any } | null) {
  const raw = (settings?.businessConfigJson && typeof settings.businessConfigJson === 'object'
    ? settings.businessConfigJson.paymentCollection
    : null) as PaymentCollectionConfig | null;
  const preferredProvider = String(raw?.preferredProvider || '').trim().toUpperCase();
  const requestedProviders = uniqueProviders(raw?.requestedProviders, PROVIDER_READY_COLLECTION_PROVIDERS);

  return {
    preferredProvider: LIVE_COLLECTION_PROVIDERS.includes(preferredProvider as LiveCollectionProvider)
      ? (preferredProvider as LiveCollectionProvider)
      : null,
    requestedProviders: requestedProviders as ProviderReadyCollectionProvider[],
  };
}

export function writePaymentCollectionConfig(settings: { businessConfigJson?: any } | null | undefined, next: {
  preferredProvider: LiveCollectionProvider;
  requestedProviders: ProviderReadyCollectionProvider[];
}) {
  const currentBusinessConfig =
    settings?.businessConfigJson && typeof settings.businessConfigJson === 'object' ? settings.businessConfigJson : {};
  return {
    ...currentBusinessConfig,
    paymentCollection: {
      preferredProvider: next.preferredProvider,
      requestedProviders: next.requestedProviders,
    },
  };
}

export function getDefaultPreferredCollectionProvider(input: {
  paymentsEnabled?: boolean | null;
  stripeConfigured: boolean;
}) {
  return 'MANUAL';
}

export function buildPaymentCollectionOptions(input: {
  paymentsEnabled?: boolean | null;
  stripeConfigured: boolean;
  settings?: { businessConfigJson?: any } | null;
  providerStatuses?: Partial<Record<string, string>>;
}) {
  const config = readPaymentCollectionConfig(input.settings);
  const preferredProvider = config.preferredProvider || getDefaultPreferredCollectionProvider(input);
  const paymentsEnabled = Boolean(input.paymentsEnabled);
  const providerStatuses = input.providerStatuses || {};
  const stripeCustomerStatus = String(providerStatuses.STRIPE || 'setup_needed').toLowerCase();
  const sumupStatus = String(providerStatuses.SUMUP || (config.requestedProviders.includes('SUMUP') ? 'requested' : 'coming_soon')).toLowerCase();
  const worldpayStatus = String(providerStatuses.WORLDPAY || (config.requestedProviders.includes('WORLDPAY') ? 'requested' : 'coming_soon')).toLowerCase();

  return {
    subscriptionBilling: {
      provider: 'STRIPE',
      label: 'Stripe',
      status: input.stripeConfigured ? 'connected' : 'setup_needed',
      usage: 'MyTitan subscriptions and job packs',
      summary: input.stripeConfigured
        ? 'MyTitan Stripe remains the authoritative billing path for subscriptions and extra job packs only.'
        : 'Subscription billing is still Stripe-based, but server-side Stripe setup is incomplete here.',
    },
    customerCollection: {
      preferredProvider,
      requestedProviders: config.requestedProviders,
      providers: [
        {
          provider: 'STRIPE',
          label: 'Business Stripe setup',
          usage: 'Your business card payments',
          live: stripeCustomerStatus === 'connected',
          status: paymentsEnabled ? stripeCustomerStatus : 'not_enabled',
          summary: paymentsEnabled
            ? 'Customer card payments use the payment setup owned by this business.'
            : 'Customer card collection is not enabled for this workspace yet.',
          selectable: true,
          selected: preferredProvider === 'STRIPE',
        },
        {
          provider: 'MANUAL',
          label: 'Manual follow-up',
          usage: 'Offline, bank transfer, cash, or operator-recorded payment',
          live: true,
          status: 'connected',
          summary: 'Use this when your business collects payment manually or outside MyTitan until a real customer payment provider is connected.',
          selectable: true,
          selected: preferredProvider === 'MANUAL',
        },
        {
          provider: 'SUMUP',
          label: 'SumUp',
          usage: 'Provider-ready customer payments',
          live: sumupStatus === 'connected',
          status: sumupStatus,
          summary:
            sumupStatus === 'connected'
              ? 'A tenant-owned SumUp setup is stored for this workspace.'
              : config.requestedProviders.includes('SUMUP')
                ? 'This workspace has marked SumUp as a requested next provider.'
                : 'Provider-ready path reserved for future customer payment collection wiring.',
          selectable: true,
          selected: preferredProvider === 'SUMUP',
        },
        {
          provider: 'WORLDPAY',
          label: 'Worldpay',
          usage: 'Provider-ready customer payments',
          live: worldpayStatus === 'connected',
          status: worldpayStatus,
          summary:
            worldpayStatus === 'connected'
              ? 'A tenant-owned Worldpay setup is stored for this workspace.'
              : config.requestedProviders.includes('WORLDPAY')
                ? 'This workspace has marked Worldpay as a requested next provider.'
                : 'Provider-ready path reserved for future customer payment collection wiring.',
          selectable: true,
          selected: preferredProvider === 'WORLDPAY',
        },
      ],
    },
  };
}

export function summarizeCustomerCollectionReadiness(input: {
  paymentsEnabled?: boolean | null;
  stripeConfigured: boolean;
  settings?: { businessConfigJson?: any } | null;
}) {
  const options = buildPaymentCollectionOptions(input);
  const preferredProvider = options.customerCollection.preferredProvider || 'MANUAL';
  const preferred =
    options.customerCollection.providers.find((provider) => provider.provider === preferredProvider) || null;
  const paymentsEnabled = Boolean(input.paymentsEnabled);

  if (!paymentsEnabled) {
    return {
      status: 'not_enabled' as CustomerCollectionReadinessStatus,
      label: 'Manual collection',
      detail: 'Customer payment setup is not switched on here yet. Collect manually or finish setup in Settings.',
      ready: true,
      live: false,
      preferredProvider,
    };
  }

  if (preferred?.live || ['connected', 'live'].includes(String(preferred?.status || '').toLowerCase())) {
    return {
      status: preferredProvider === 'MANUAL' ? ('manual_collection' as CustomerCollectionReadinessStatus) : ('live_provider' as CustomerCollectionReadinessStatus),
      label: preferred?.label || (preferredProvider === 'MANUAL' ? 'Manual collection' : 'Payment provider live'),
      detail:
        preferredProvider === 'MANUAL'
          ? 'Collect directly through your business process until you connect your own payment provider.'
          : preferred?.summary || 'Customer payments go through the workspace payment provider.',
      ready: true,
      live: preferredProvider !== 'MANUAL',
      preferredProvider,
    };
  }

  if (String(preferred?.status || '').toLowerCase() === 'requested') {
    return {
      status: 'requested' as CustomerCollectionReadinessStatus,
      label: `${preferred?.label || preferredProvider} requested`,
      detail: preferred?.summary || 'This provider has been requested, but it is not live yet.',
      ready: false,
      live: false,
      preferredProvider,
    };
  }

  return {
    status: 'setup_needed' as CustomerCollectionReadinessStatus,
    label: preferredProvider === 'STRIPE' ? 'Business Stripe setup needed' : 'Payment setup needed',
    detail:
      preferred?.summary ||
      'Customer payments require a verified business payment setup.',
    ready: false,
    live: false,
    preferredProvider,
  };
}
