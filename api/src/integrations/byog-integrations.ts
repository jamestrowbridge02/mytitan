import { IntegrationConnectionScope, IntegrationCredentialStatus, IntegrationCredentialType, TenantIntegrationProvider } from '@prisma/client';

export const BYOG_PROVIDER_ORDER: TenantIntegrationProvider[] = [
  'XERO',
  'STRIPE_CUSTOMER_PAYMENTS',
  'OPEN_BANKING',
  'GOCARDLESS',
  'WORLDPAY',
  'SUMUP',
  'ZETTLE',
  'SQUARE',
  'PAYPAL_BUSINESS',
  'REVOLUT_BUSINESS',
  'ADYEN',
  'MOLLIE',
  'KLARNA',
  'MANUAL_CARD_TERMINAL',
  'BANK_TRANSFER',
  'QUICKBOOKS',
  'SAGE',
  'TIDE',
  'WHATSAPP_BUSINESS',
  'DVLA_VES',
  'TELEMATICS',
  'GOOGLE_CALENDAR',
  'MICROSOFT_CALENDAR',
  'EMAIL_SENDER',
  'GENERIC_WEBHOOK',
  'GENERIC_API',
];

export type ByogProviderDescriptor = {
  provider: TenantIntegrationProvider;
  slug: string;
  safeName: string;
  category: 'payments' | 'accounting' | 'calendar' | 'email' | 'webhook' | 'api';
  defaultScope: IntegrationConnectionScope;
  credentialType: IntegrationCredentialType;
  supportsInboundWebhook: boolean;
  supportsClientFactory: boolean;
  supportsAutomation: boolean;
  requiredPermissions: string[];
  requiredScopes: string[];
  setupUrl: string;
  advancedLabel: string;
};

export const BYOG_PROVIDER_MAP: Record<TenantIntegrationProvider, ByogProviderDescriptor> = {
  XERO: {
    provider: 'XERO',
    slug: 'xero',
    safeName: 'Accounting connection',
    category: 'accounting',
    defaultScope: 'WORKSPACE',
    credentialType: 'ACCOUNTING_CONFIG',
    supportsInboundWebhook: false,
    supportsClientFactory: true,
    supportsAutomation: true,
    requiredPermissions: ['accounting access'],
    requiredScopes: ['accounting.access'],
    setupUrl: '/dashboard/settings/integrations/xero',
    advancedLabel: 'Xero',
  },
  STRIPE_CUSTOMER_PAYMENTS: {
    provider: 'STRIPE_CUSTOMER_PAYMENTS',
    slug: 'stripe-customer-payments',
    safeName: 'Business payment setup',
    category: 'payments',
    defaultScope: 'WORKSPACE',
    credentialType: 'MERCHANT_PAYMENT_GATEWAY_CONFIG',
    supportsInboundWebhook: true,
    supportsClientFactory: true,
    supportsAutomation: false,
    requiredPermissions: ['payments configuration', 'webhook signing secret'],
    requiredScopes: [],
    setupUrl: '/dashboard/settings/payments/stripe',
    advancedLabel: 'Tenant-owned Stripe customer payments',
  },
  OPEN_BANKING: {
    provider: 'OPEN_BANKING', slug: 'open-banking', safeName: 'Open Banking', category: 'payments',
    defaultScope: 'WORKSPACE', credentialType: 'MERCHANT_PAYMENT_GATEWAY_CONFIG', supportsInboundWebhook: true,
    supportsClientFactory: true, supportsAutomation: false, requiredPermissions: ['payments configuration', 'webhook signing secret'],
    requiredScopes: ['payments.create', 'payments.read'], setupUrl: '/dashboard/settings/payments', advancedLabel: 'Open Banking',
  },
  GOCARDLESS: {
    provider: 'GOCARDLESS', slug: 'gocardless', safeName: 'GoCardless', category: 'payments',
    defaultScope: 'WORKSPACE', credentialType: 'MERCHANT_PAYMENT_GATEWAY_CONFIG', supportsInboundWebhook: true,
    supportsClientFactory: true, supportsAutomation: false, requiredPermissions: ['payments configuration', 'webhook signing secret'],
    requiredScopes: ['payments.read_write'], setupUrl: '/dashboard/settings/payments', advancedLabel: 'GoCardless',
  },
  WORLDPAY: {
    provider: 'WORLDPAY',
    slug: 'worldpay',
    safeName: 'Business payment setup',
    category: 'payments',
    defaultScope: 'WORKSPACE',
    credentialType: 'MERCHANT_PAYMENT_GATEWAY_CONFIG',
    supportsInboundWebhook: true,
    supportsClientFactory: true,
    supportsAutomation: false,
    requiredPermissions: ['payments configuration', 'webhook signing secret'],
    requiredScopes: [],
    setupUrl: '/dashboard/settings/payments?provider=worldpay',
    advancedLabel: 'Worldpay',
  },
  SUMUP: {
    provider: 'SUMUP',
    slug: 'sumup',
    safeName: 'Business payment setup',
    category: 'payments',
    defaultScope: 'WORKSPACE',
    credentialType: 'MERCHANT_PAYMENT_GATEWAY_CONFIG',
    supportsInboundWebhook: true,
    supportsClientFactory: true,
    supportsAutomation: false,
    requiredPermissions: ['payments configuration', 'webhook signing secret'],
    requiredScopes: [],
    setupUrl: '/dashboard/settings/payments?provider=sumup',
    advancedLabel: 'SumUp',
  },
  ZETTLE: {
    provider: 'ZETTLE', slug: 'zettle', safeName: 'Zettle', category: 'payments',
    defaultScope: 'WORKSPACE', credentialType: 'MERCHANT_PAYMENT_GATEWAY_CONFIG', supportsInboundWebhook: true,
    supportsClientFactory: true, supportsAutomation: false, requiredPermissions: ['payments configuration', 'webhook signing secret'],
    requiredScopes: [], setupUrl: '/dashboard/settings/payments', advancedLabel: 'Zettle',
  },
  SQUARE: {
    provider: 'SQUARE', slug: 'square', safeName: 'Square', category: 'payments',
    defaultScope: 'WORKSPACE', credentialType: 'MERCHANT_PAYMENT_GATEWAY_CONFIG', supportsInboundWebhook: true,
    supportsClientFactory: true, supportsAutomation: false, requiredPermissions: ['payments configuration', 'webhook signing secret'],
    requiredScopes: [], setupUrl: '/dashboard/settings/payments', advancedLabel: 'Square',
  },
  PAYPAL_BUSINESS: {
    provider: 'PAYPAL_BUSINESS', slug: 'paypal-business', safeName: 'PayPal Business', category: 'payments',
    defaultScope: 'WORKSPACE', credentialType: 'MERCHANT_PAYMENT_GATEWAY_CONFIG', supportsInboundWebhook: true,
    supportsClientFactory: true, supportsAutomation: false, requiredPermissions: ['payments configuration', 'webhook signing secret'],
    requiredScopes: [], setupUrl: '/dashboard/settings/payments', advancedLabel: 'PayPal Business',
  },
  REVOLUT_BUSINESS: {
    provider: 'REVOLUT_BUSINESS', slug: 'revolut-business', safeName: 'Revolut Business', category: 'payments',
    defaultScope: 'WORKSPACE', credentialType: 'MERCHANT_PAYMENT_GATEWAY_CONFIG', supportsInboundWebhook: true,
    supportsClientFactory: true, supportsAutomation: false, requiredPermissions: ['payments configuration', 'webhook signing secret'],
    requiredScopes: [], setupUrl: '/dashboard/settings/payments', advancedLabel: 'Revolut Business',
  },
  ADYEN: {
    provider: 'ADYEN', slug: 'adyen', safeName: 'Adyen', category: 'payments',
    defaultScope: 'WORKSPACE', credentialType: 'MERCHANT_PAYMENT_GATEWAY_CONFIG', supportsInboundWebhook: true,
    supportsClientFactory: true, supportsAutomation: false, requiredPermissions: ['payments configuration', 'webhook signing secret'],
    requiredScopes: [], setupUrl: '/dashboard/settings/payments', advancedLabel: 'Adyen',
  },
  MOLLIE: {
    provider: 'MOLLIE', slug: 'mollie', safeName: 'Mollie', category: 'payments',
    defaultScope: 'WORKSPACE', credentialType: 'MERCHANT_PAYMENT_GATEWAY_CONFIG', supportsInboundWebhook: true,
    supportsClientFactory: true, supportsAutomation: false, requiredPermissions: ['payments configuration', 'webhook signing secret'],
    requiredScopes: [], setupUrl: '/dashboard/settings/payments', advancedLabel: 'Mollie',
  },
  KLARNA: {
    provider: 'KLARNA', slug: 'klarna', safeName: 'Klarna', category: 'payments',
    defaultScope: 'WORKSPACE', credentialType: 'MERCHANT_PAYMENT_GATEWAY_CONFIG', supportsInboundWebhook: true,
    supportsClientFactory: true, supportsAutomation: false, requiredPermissions: ['payments configuration', 'webhook signing secret'],
    requiredScopes: [], setupUrl: '/dashboard/settings/payments', advancedLabel: 'Klarna',
  },
  MANUAL_CARD_TERMINAL: {
    provider: 'MANUAL_CARD_TERMINAL', slug: 'manual-card-terminal', safeName: 'Manual card terminal', category: 'payments',
    defaultScope: 'WORKSPACE', credentialType: 'MERCHANT_PAYMENT_GATEWAY_CONFIG', supportsInboundWebhook: false,
    supportsClientFactory: true, supportsAutomation: false, requiredPermissions: ['payments configuration'],
    requiredScopes: [], setupUrl: '/dashboard/settings/payments', advancedLabel: 'Manual card terminal',
  },
  BANK_TRANSFER: {
    provider: 'BANK_TRANSFER', slug: 'bank-transfer', safeName: 'Bank transfer', category: 'payments',
    defaultScope: 'WORKSPACE', credentialType: 'MERCHANT_PAYMENT_GATEWAY_CONFIG', supportsInboundWebhook: false,
    supportsClientFactory: true, supportsAutomation: false, requiredPermissions: ['payments configuration'],
    requiredScopes: [], setupUrl: '/dashboard/settings/payments', advancedLabel: 'Bank transfer',
  },
  QUICKBOOKS: {
    provider: 'QUICKBOOKS',
    slug: 'quickbooks',
    safeName: 'Accounting connection',
    category: 'accounting',
    defaultScope: 'WORKSPACE',
    credentialType: 'ACCOUNTING_CONFIG',
    supportsInboundWebhook: true,
    supportsClientFactory: true,
    supportsAutomation: true,
    requiredPermissions: ['accounting access', 'customer sync access', 'webhook signing secret'],
    requiredScopes: ['accounting.access', 'customers.read', 'webhooks.verify'],
    setupUrl: '/dashboard/settings/integrations/quickbooks',
    advancedLabel: 'QuickBooks',
  },
  SAGE: {
    provider: 'SAGE',
    slug: 'sage',
    safeName: 'Accounting connection',
    category: 'accounting',
    defaultScope: 'WORKSPACE',
    credentialType: 'ACCOUNTING_CONFIG',
    supportsInboundWebhook: false,
    supportsClientFactory: true,
    supportsAutomation: true,
    requiredPermissions: ['accounting access'],
    requiredScopes: ['accounting.access'],
    setupUrl: '/dashboard/settings/integrations/sage',
    advancedLabel: 'Sage',
  },
  TIDE: {
    provider: 'TIDE',
    slug: 'tide',
    safeName: 'Accounting connection',
    category: 'accounting',
    defaultScope: 'WORKSPACE',
    credentialType: 'ACCOUNTING_CONFIG',
    supportsInboundWebhook: false,
    supportsClientFactory: true,
    supportsAutomation: true,
    requiredPermissions: ['accounting access'],
    requiredScopes: ['accounting.access'],
    setupUrl: '/dashboard/settings/integrations/tide',
    advancedLabel: 'Tide',
  },
  WHATSAPP_BUSINESS: {
    provider: 'WHATSAPP_BUSINESS', slug: 'whatsapp-business', safeName: 'WhatsApp Business', category: 'api',
    defaultScope: 'WORKSPACE', credentialType: 'API_KEY', supportsInboundWebhook: true,
    supportsClientFactory: true, supportsAutomation: true, requiredPermissions: ['business messaging credentials', 'webhook signing secret'],
    requiredScopes: ['messages.send', 'messages.read'], setupUrl: '/dashboard/settings/integrations/whatsapp-business', advancedLabel: 'WhatsApp Business',
  },
  DVLA_VES: {
    provider: 'DVLA_VES', slug: 'dvla-ves', safeName: 'Vehicle lookup', category: 'api',
    defaultScope: 'WORKSPACE', credentialType: 'API_KEY', supportsInboundWebhook: false,
    supportsClientFactory: true, supportsAutomation: false, requiredPermissions: ['DVLA VES API key'],
    requiredScopes: [], setupUrl: '/dashboard/settings/integrations/dvla-ves', advancedLabel: 'DVLA Vehicle Enquiry Service',
  },
  TELEMATICS: {
    provider: 'TELEMATICS', slug: 'telematics', safeName: 'Telematics bridge', category: 'api',
    defaultScope: 'WORKSPACE', credentialType: 'API_KEY', supportsInboundWebhook: true,
    supportsClientFactory: true, supportsAutomation: true, requiredPermissions: ['location provider credentials', 'operator consent'],
    requiredScopes: ['vehicles.read', 'locations.read'], setupUrl: '/dashboard/settings/integrations/telematics', advancedLabel: 'Telematics',
  },
  GOOGLE_CALENDAR: {
    provider: 'GOOGLE_CALENDAR',
    slug: 'google-calendar',
    safeName: 'My calendar',
    category: 'calendar',
    defaultScope: 'USER',
    credentialType: 'CALENDAR_CONFIG',
    supportsInboundWebhook: false,
    supportsClientFactory: true,
    supportsAutomation: true,
    requiredPermissions: ['calendar sync access'],
    requiredScopes: ['calendar.events'],
    setupUrl: '/dashboard/settings/integrations/google-calendar',
    advancedLabel: 'Google Calendar',
  },
  MICROSOFT_CALENDAR: {
    provider: 'MICROSOFT_CALENDAR',
    slug: 'microsoft-calendar',
    safeName: 'Team calendar',
    category: 'calendar',
    defaultScope: 'WORKSPACE',
    credentialType: 'CALENDAR_CONFIG',
    supportsInboundWebhook: false,
    supportsClientFactory: true,
    supportsAutomation: true,
    requiredPermissions: ['calendar sync access'],
    requiredScopes: ['calendar.events'],
    setupUrl: '/dashboard/settings/integrations/microsoft-calendar',
    advancedLabel: 'Microsoft Calendar',
  },
  EMAIL_SENDER: {
    provider: 'EMAIL_SENDER',
    slug: 'email-sender',
    safeName: 'Email sender',
    category: 'email',
    defaultScope: 'WORKSPACE',
    credentialType: 'API_KEY',
    supportsInboundWebhook: false,
    supportsClientFactory: true,
    supportsAutomation: true,
    requiredPermissions: ['sender credentials'],
    requiredScopes: [],
    setupUrl: '/dashboard/settings/integrations/email-sender',
    advancedLabel: 'Custom sending domain',
  },
  GENERIC_WEBHOOK: {
    provider: 'GENERIC_WEBHOOK',
    slug: 'generic-webhook',
    safeName: 'Webhook receiver',
    category: 'webhook',
    defaultScope: 'WORKSPACE',
    credentialType: 'WEBHOOK_SECRET',
    supportsInboundWebhook: true,
    supportsClientFactory: true,
    supportsAutomation: true,
    requiredPermissions: ['webhook signing secret'],
    requiredScopes: ['webhooks.verify'],
    setupUrl: '/dashboard/settings/developer-tools',
    advancedLabel: 'Generic webhook',
  },
  GENERIC_API: {
    provider: 'GENERIC_API',
    slug: 'generic-api',
    safeName: 'Connected tool',
    category: 'api',
    defaultScope: 'WORKSPACE',
    credentialType: 'API_KEY',
    supportsInboundWebhook: false,
    supportsClientFactory: true,
    supportsAutomation: true,
    requiredPermissions: ['API credentials'],
    requiredScopes: [],
    setupUrl: '/dashboard/settings/developer-tools',
    advancedLabel: 'Generic API',
  },
};

export const BYOG_PROVIDER_SLUG_MAP = Object.values(BYOG_PROVIDER_MAP).reduce<Record<string, TenantIntegrationProvider>>((acc, entry) => {
  acc[entry.slug] = entry.provider;
  return acc;
}, {});

export function resolveByogProvider(input: string | TenantIntegrationProvider) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if ((raw as TenantIntegrationProvider) in BYOG_PROVIDER_MAP) {
    return raw as TenantIntegrationProvider;
  }
  return BYOG_PROVIDER_SLUG_MAP[raw.toLowerCase()] || null;
}

export function toByogProviderSlug(provider: TenantIntegrationProvider) {
  return BYOG_PROVIDER_MAP[provider]?.slug || String(provider || '').toLowerCase();
}

export function toByogScopeLabel(scope: IntegrationConnectionScope) {
  return scope === 'USER' ? 'personal' : 'workspace';
}

export function isByogConnectedStatus(status: IntegrationCredentialStatus) {
  return status === 'CONNECTED';
}
