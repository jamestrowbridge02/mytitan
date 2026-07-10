import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { apiFetch } from '../../lib/api';
import { PlatformShell } from '../../components/platform-shell';
import { useSectionTargeting } from '../../lib/section-targeting';

type TenantSearchResult = {
  id: string;
  name: string;
  ownerEmail?: string | null;
  createdAt: string;
  timezone: string;
  currency: string;
};

type PricingAdjustment = {
  type: 'percentage' | 'fixed';
  value: number;
  duration: 'one_time' | 'recurring' | 'until_date';
  expiresAt?: string | null;
  reason?: string | null;
};

type TenantDetail = {
  ok: boolean;
  error?: string;
  company?: { id: string; name: string; createdAt: string; timezone: string; currency: string };
  owner?: { id: string; email: string | null; emailVerified: boolean; createdAt: string; lastLoginAt?: string | null; lastActiveAt?: string | null } | null;
  billing?: {
    plan?: { code?: string; name?: string } | null;
    subscription?: { status?: string | null; currentPeriodEnd?: string | null; cancelAtPeriodEnd?: boolean } | null;
    trial?: { status: string; isActive: boolean; startedAt?: string | null; endsAt?: string | null; daysRemaining: number } | null;
    paymentCollection?: {
      customerCollection?: {
        preferredProvider?: string;
        requestedProviders?: string[];
      };
    } | null;
  };
  pricingState?: {
    currency: string;
    basePriceCents: number;
    adjustedPriceCents: number;
    adjustment: PricingAdjustment | null;
  } | null;
  jobAllowanceControl?: {
    summary?: {
      monthlyIncludedAllowance?: number;
      planIncludedAllowance?: number;
      recurringExtraAllowance?: number;
      remainingAllowance?: number;
      totalAvailableNow?: number;
      unlimitedJobs?: boolean;
      manualCreditsTotal?: number;
      temporaryCreditsTotal?: number;
      enterprisePlanNote?: string | null;
    };
    override?: {
      monthlyJobAllowance?: number | null;
      recurringExtraAllowance?: number;
      unlimitedJobs?: boolean;
      enterprisePlanNote?: string | null;
      reason?: string | null;
    } | null;
  } | null;
  commercialControl?: {
    plan?: { code: string; name: string } | null;
    interval?: 'MONTHLY' | 'ANNUAL';
    controls?: {
      customMonthlyPriceCents?: number | null;
      customAnnualPriceCents?: number | null;
      grandfatheredPricing?: boolean;
      paused?: boolean;
      billingNote?: string | null;
    };
    plans?: Array<{ code: string; name: string }>;
    auditHistory?: Array<{ id: string; type: string; message: string; createdAt: string }>;
  } | null;
  operations?: {
    email: { status: string; canSend: boolean; source: string; guidance: string };
    integrations: {
      webhookPlatform: {
        state: string;
        endpointCount: number;
        activeEndpointCount: number;
        failedRecentDeliveries: number;
        lastSuccessAt?: string | null;
        guidance: string;
      };
      automationDelivery: {
        state: string;
        deliveryMode: string;
        smtpConfigured: boolean;
        guidance: string;
      };
      moduleFlags: {
        bookingsEnabled: boolean;
        accountingEnabled: boolean;
      };
    };
  };
  support?: {
    ownerEmailVerified: boolean;
    ownerLastLoginAt?: string | null;
    ownerLastActiveAt?: string | null;
    paymentsEnabled: boolean;
    stripeConfigured: boolean;
    nextAction: string;
    supportMode?: SupportModeSession | null;
  };
  links?: { customerBilling: string; customerSettings: string };
};

type SupportModeSession = {
  id: string;
  tenantId: string;
  reason: string;
  viewRole?: 'owner' | 'admin' | 'operator' | 'finance' | 'customer_portal';
  accessMode?: 'read_only' | 'write';
  startedAt: string;
  expiresAt: string;
  endedAt?: string | null;
  active: boolean;
  expired: boolean;
  secondsRemaining: number;
};

type MembershipRow = {
  userId: string;
  workspaceId: string | null;
  workspaceName: string;
  workspaceCreatedAt: string | null;
  workspaceTimezone: string;
  workspaceCurrency: string;
  email: string;
  emailVerified: boolean;
  role: string;
  createdAt: string;
  lastActiveAt: string | null;
  lastLoginAt: string | null;
  planCode: string;
  planName: string;
  billingInterval: 'MONTHLY' | 'ANNUAL';
  subscriptionStatus: string;
  cancelAtPeriodEnd: boolean;
  trialStatus: string;
  trialEndsAt: string | null;
  trialDaysRemaining: number;
  convertedAt: string | null;
  conversionSource: string | null;
  stripeLinked: boolean;
  stripeCustomerLinked: boolean;
  stripeSubscriptionLinked: boolean;
};

type MembershipsResponse = {
  ok: boolean;
  rows: MembershipRow[];
  summary: {
    members: number;
    workspaces: number;
    activePaidWorkspaces: number;
    activeTrials: number;
  };
};

type RevenueResponse = {
  ok: boolean;
  totals: {
    totalTrialWorkspaces: number;
    activePaidWorkspaces: number;
    expiredTrials: number;
    conversionCount: number;
    conversionRate: number;
    lifecycleEmailClicks: number;
    lifecycleEmailConversions: number;
    pausedSubscriptions?: number;
    churnedTenants?: number;
    overdueOrFailedBilling?: number;
    customPriceTenants?: number;
    discountedTenants?: number;
    allowanceAdjustedTenants?: number;
    actualMonthlyRecurringRevenueByCurrency?: Array<{ currency: string; amountCents: number }>;
    actualAnnualRecurringRevenueByCurrency?: Array<{ currency: string; amountCents: number }>;
    actualJobPackRevenueByCurrency?: Array<{ currency: string; amountCents: number }>;
    estimatedMonthlyRecurringRevenueByCurrency: Array<{ currency: string; amountCents: number }>;
    estimatedAnnualRecurringRevenueByCurrency?: Array<{ currency: string; amountCents: number }>;
    jobPackRevenueByCurrency?: Array<{ currency: string; amountCents: number }>;
    forecastedMonthlyRevenueByCurrency?: Array<{ currency: string; amountCents: number }>;
    revenueSourceLabels?: string[];
  };
  movement?: {
    expansionRevenueByCurrency: Array<{ currency: string; amountCents: number }>;
    contractionRevenueByCurrency: Array<{ currency: string; amountCents: number }>;
    limitation: string;
    forecastBasis: string;
  };
  activeSubscriptionsByTier: Array<{ planCode: string; planName: string; count: number }>;
  stripeAlignment: {
    stripeConfigured: boolean;
    backendKeyType: 'restricted' | 'standard_secret' | 'missing';
    webhookSecretConfigured: boolean;
    billingReturnUrlConfigured: boolean;
    publishableKeyConfigured: boolean;
    publishableKeyUsedByApp: boolean;
    portalConfigurationIdUsed: boolean;
    productIdEnvNamesUsed: string[];
    configuredPriceEnvNames: string[];
    missingConfigNames: string[];
  };
};

type PlatformOverviewResponse = {
  ok: boolean;
  executive: {
    totalActiveTenants: number;
    trialTenants: number;
    paidTenants: number;
    expiredTrials: number;
    conversionRate: number;
    actualMrrByCurrency?: Array<{ currency: string; amountCents: number }>;
    estimatedMrrByCurrency: Array<{ currency: string; amountCents: number }>;
    forecastedMrrByCurrency?: Array<{ currency: string; amountCents: number }>;
    recentMovement: {
      newTenantsLast30Days: number;
      conversionsLast30Days: number;
      trialEndingSoon: number;
      cancelAtPeriodEnd: number;
    };
  };
  support: {
    tenantsNeedingAttention: number;
    unverifiedOwners: number;
    billingBlockedTenants: number;
    emailReadinessIssues: number;
    recentSendFailures: number;
    operationalFrictionTenants: number;
    attentionTenants: Array<{
      tenantId: string;
      tenantName: string;
      ownerEmail: string | null;
      ownerEmailVerified: boolean;
      ownerLastLoginAt?: string | null;
      ownerLastActiveAt?: string | null;
      createdAt: string;
      planName: string;
      planCode: string;
      billingInterval: 'MONTHLY' | 'ANNUAL';
      subscriptionStatus: string;
      trialStatus: string;
      trialEndsAt?: string | null;
      cancelAtPeriodEnd: boolean;
      emailState: 'ready' | 'needs_attention';
      paymentsEnabled: boolean;
      portalEnabled: boolean;
      bookingEnabled: boolean;
      whatsappEnabled: boolean;
      webhookEndpointCount: number;
      activeWebhookEndpointCount: number;
      lastWebhookSuccessAt?: string | null;
      integrationState: 'connected' | 'needs_attention' | 'disabled';
      webhookFailures: number;
      recentSendFailures: number;
      overdueInvoices: number;
      ackPending: number;
      complianceOpen: number;
      slaBreaches: number;
      billingBlocked: boolean;
      issueCount: number;
      issues: string[];
      nextAction: string;
    }>;
  };
  revenue: {
    planDistribution: Array<{ planCode: string; planName: string; count: number }>;
    funnel: Array<{ key: string; label: string; count: number }>;
    cancelAtPeriodEnd: number;
    lifecycleEmails: { clicks: number; conversions: number };
    checkoutReadyTenants: number;
    portalReadyTenants: number;
    stripeAlignment: RevenueResponse['stripeAlignment'];
  };
  system: {
    readiness: {
      integrations: { connected: number; needsAttention: number; disabled: number };
      email: { ready: number; needsAttention: number; systemConfigured: boolean };
      payments: { ready: number; blocked: number; disabled: number };
      workflows: {
        completionAcknowledgementPressure: number;
        complianceQueue: number;
        breachedSlas: number;
        overdueInvoices: number;
        recentSendFailures: number;
        recentWebhookFailures: number;
      };
    };
    internalMonitoring?: any;
    traffic?: {
      visitsToday: number;
      visitsLast7Days: number;
      uniqueAnonymousSessions: number;
      surfaces?: {
        publicBooking?: number;
        customerWorkspace?: number;
      };
    };
    issueCategories: Array<{ key: string; label: string; count: number }>;
    attentionQueue: Array<{ key: string; label: string; count: number; href: string }>;
  };
  charts: {
    tenantLifecycle: Array<{ label: string; newTenants: number; trialsStarted: number; converted: number }>;
    planDistribution: Array<{ planCode: string; planName: string; count: number }>;
    conversionFunnel: Array<{ label: string; count: number }>;
    mrrByCurrency: Array<{ currency: string; amountCents: number }>;
    issueCategories: Array<{ key: string; label: string; count: number }>;
  };
};

type EmailControlResponse = {
  ok: boolean;
  control: {
    paused: boolean;
    pausedReason?: string | null;
    pausedAt?: string | null;
    providerSuspended: boolean;
    providerSuspensionReason?: string | null;
    providerSuspendedAt?: string | null;
  };
  environment: {
    mode: string;
    liveSmtpAllowed: boolean;
    productionOnlySenderEnforced: boolean;
    captureOnly: boolean;
  };
  sender: {
    readiness: {
      status: string;
      transport: string;
      canSend: boolean;
      guidance: string;
      fromEmail?: string | null;
      replyToEmail?: string | null;
    };
    replyToValid: boolean;
    senderIdentityVerified: boolean;
  };
  domainAlignment: {
    spf: string;
    dkim: string;
    dmarc: string;
    warmup: string;
  };
  health: {
    sentLast24h: number;
    deferredLast24h: number;
    failedLast24h: number;
    blockedLast24h: number;
    bounceRate: number;
    complaintRate: number;
    activeSuppressions: number;
    recentProviderResponses: Array<{
      id: string;
      createdAt: string;
      status: string;
      category: string;
      recipientMasked: string;
      responseSummary: string;
      providerCode?: string | null;
    }>;
  };
  suppressions: Array<{
    id: string;
    emailMasked: string;
    category: string;
    reason: string;
    source: string;
    expiresAt?: string | null;
    hitCount: number;
    lastMatchedAt?: string | null;
  }>;
};

type MembershipFilterState = {
  query: string;
  plan: string;
  subscription: string;
  trial: string;
  conversion: string;
  groupBy: 'none' | 'workspace' | 'plan' | 'subscription' | 'trial' | 'conversion';
};

const DEFAULT_MEMBERSHIP_FILTERS: MembershipFilterState = {
  query: '',
  plan: 'all',
  subscription: 'all',
  trial: 'all',
  conversion: 'all',
  groupBy: 'workspace',
};

const phase6CustomerSuccessSignals = [
  { key: 'tenant_health_score', label: 'Tenant health score', detail: 'Combines onboarding progress, setup issues, billing state, and usage trends without opening tenant records.' },
  { key: 'onboarding_progress', label: 'Onboarding progress', detail: 'Tracks setup completion and unresolved launch tasks.' },
  { key: 'feature_adoption', label: 'Feature adoption', detail: 'Uses safe feature usage counts and portal/booking readiness signals.' },
  { key: 'usage_trends', label: 'Usage trends', detail: 'Summarizes tenant lifecycle, traffic, and conversion movement.' },
  { key: 'support_mode_insight', label: 'Support mode insight', detail: 'Tenant operational data still requires explicit timed support mode.' },
  { key: 'churn_risk', label: 'Churn risk indicators', detail: 'Flags trial expiry, cancelled subscriptions, and unresolved setup friction.' },
  { key: 'setup_issues', label: 'Unresolved setup issues', detail: 'Directs customer success to exact setup actions.' },
  { key: 'account_health', label: 'Account health summary', detail: 'Aggregates safe account-health state without exposing secrets.' },
];

const phase6ObservabilitySignals = [
  { key: 'queue_health', label: 'Queue health', detail: 'Workflow and attention queues from platform overview.' },
  { key: 'sync_health', label: 'Sync health', detail: 'Provider sync readiness and conflict pressure.' },
  { key: 'automation_health', label: 'Automation health', detail: 'Automation run and acknowledgement pressure.' },
  { key: 'notification_health', label: 'Notification health', detail: 'Routing verification and recent send failures.' },
  { key: 'integration_health', label: 'Integration health', detail: 'Connected, needs-attention, and disabled integration counts.' },
  { key: 'offline_sync_health', label: 'Offline sync health', detail: 'Offline sync pressure stays internal unless support mode is active.' },
  { key: 'job_pack_sync_health', label: 'Job-pack sync health', detail: 'Billing catalog and job-pack sync evidence.' },
  { key: 'backup_evidence', label: 'Backup evidence', detail: 'Backup/restore evidence from readiness checks.' },
  { key: 'error_trends', label: 'Error trends', detail: 'Sanitized safe error log trends only.' },
];

const deferredCapabilityRegister = [
  { capability: 'External uptime monitoring', reason: 'Intentionally not configured for this launch phase.', owner: 'Platform operations', nextAction: 'Keep internal checks truthful; configure only after an approved monitoring decision.' },
  { capability: 'DVLA and MOT lookup', reason: 'No verified production provider credentials are configured.', owner: 'Platform integrations', nextAction: 'Select a licensed provider, complete data protection review, then run a gated pilot.' },
  { capability: 'Live maps, telematics, and traffic tracking', reason: 'Provider selection and tenant consent controls are not complete.', owner: 'Platform integrations', nextAction: 'Approve provider and consent model before enabling live location data.' },
  { capability: 'WhatsApp Business and SMS', reason: 'Provider accounts, templates, consent, and rate limits require tenant-specific verification.', owner: 'Communications', nextAction: 'Complete provider onboarding and opt-out validation before live sends.' },
  { capability: 'Payment provider live bridges', reason: 'Open Banking, GoCardless, SumUp, Zettle, Worldpay, Square, PayPal Business, Revolut Business, Adyen, Mollie, and Klarna have encrypted tenant setup and signed webhook contracts, but each live transaction adapter remains blocked until production credentials and an audited canary exist.', owner: 'Payments', nextAction: 'Approve credentials and run a provider-specific payment and refund canary before enabling that provider for customer checkout.' },
  { capability: 'Sage live accounting sync', reason: 'Xero and QuickBooks foundations exist; Sage OAuth and mapping are not verified.', owner: 'Accounting integrations', nextAction: 'Implement OAuth, VAT mapping, conflict handling, and tenant-gated sync.' },
  { capability: 'Commercial grace period', reason: 'No governed configurable 72-hour lockout grace policy is active.', owner: 'Billing', nextAction: 'Define entitlement behaviour, notices, audit events, and platform-only override controls.' },
  { capability: 'Native iOS and Android apps', reason: 'The assigned-job offline PWA workflow is operational, but native store-distributed apps are not built.', owner: 'Mobile', nextAction: 'Fund native shells, device security review, store signing, and release pipelines before claiming native app availability.' },
  { capability: 'Multi-branch policy deployment', reason: 'Location scoping exists, but global policy publication and branch lock governance are not complete.', owner: 'Enterprise governance', nextAction: 'Add versioned policy deployment, local exceptions, and rollout audit history.' },
  { capability: 'Legal wording approval', reason: 'Published policies require qualified UK legal review before any legal assurance is claimed.', owner: 'Legal and compliance', nextAction: 'Record counsel approval and revision date in the platform policy register.' },
  { capability: 'Security certification', reason: 'Operational controls are not a certification or external audit result.', owner: 'Security', nextAction: 'Commission an independent assessment when the certification programme is funded.' },
];

const excellenceScorecard = [
  {
    key: 'technical_maturity',
    category: 'Technical maturity',
    status: 'Evidence pass',
    score: '9.5/10',
    owner: 'Platform engineering',
    dateChecked: '2026-06-26',
    evidence: 'Stable suite, production readiness, Docker build path, Prisma migration deploy, request-id middleware, API route ownership, idempotency paths, dependency audit path, and dead-route checks are attached.',
    evidenceAttached: [
      'Full stable suite: scripts/validate-e2e-stable.sh',
      'Build and runtime: docker compose build app api marketing; scripts/healthcheck.sh',
      'Migration health: docker exec mytitan_api npx prisma migrate deploy',
      'API ownership: api/src/**/*.controller.ts and app/pages route inventory',
      'Request-id/logging: api/src/common/request-id.middleware.ts and api/src/common/request-log.interceptor.ts',
      'Idempotency: api/prisma/migrations/20260225060000_webhook_event_idempotency and api/prisma/migrations/20260225162110_notifications_idempotency_key',
      'Bundle budget evidence: scripts/check-bundle-budgets.sh -> evidence/bundle/latest.json',
    ],
    missingEvidence: [
      'Full repository TypeScript result is not attached when legacy scripts are outside configured builds.',
      'Production route-size budget output is not attached to this release record.',
      'Dependency audit high-advisory path is remediated; remaining moderate advisory report must be reviewed before 10/10.',
    ],
    coverage: 'scripts/validate-e2e-stable.sh; scripts/production-readiness-check.sh; scripts/generate-routes-inventory.sh; api/src/common/request-id.middleware.ts; api/src/common/request-log.interceptor.ts; app/e2e/phase-18-certification-gate.spec.ts',
    remainingWeakness: 'TypeScript and production route-size outputs are tracked but not all attached as passing release artifacts.',
    requiredFix: 'Attach passing typecheck and production route-size artifacts from CI before any technical 10/10 claim.',
    tenOutOfTenBlocked: true,
  },
  {
    key: 'operational_maturity',
    category: 'Operational maturity',
    status: 'Evidence pass',
    score: '9.3/10',
    owner: 'Operations',
    dateChecked: '2026-06-26',
    evidence: 'Autopilot, alert queue, scheduler status, backup freshness helper, restore-drill checklist, rollback checklist, incident playbook, and launch canary controls exist.',
    evidenceAttached: [
      'External uptime monitor configuration path: docs/external-monitoring.md and scripts/external-monitoring-status.sh',
      'Uptime saved state: MYTITAN_EXTERNAL_UPTIME_MONITOR_* environment contract only',
      'Backup freshness: scripts/backup-readiness-status.sh',
      'Scheduler health: scripts/summary-scheduler-status.sh',
      'Autopilot and alert queue: app/e2e/platform-autopilot.spec.ts',
      'Rollback and canary: docs/deployment-runbook.md and docs/payment-canary.md',
    ],
    missingEvidence: [
      'External uptime monitor: not_configured unless a real provider and non-secret monitor identifier are saved.',
      'Live restore-drill timestamp is not guaranteed in this local release record.',
    ],
    coverage: 'scripts/production-readiness-check.sh; scripts/external-monitoring-status.sh; app/e2e/launch-proof.spec.ts; app/e2e/platform-autopilot.spec.ts; docs/deployment-runbook.md; docs/ops-alerts.md',
    remainingWeakness: 'External uptime monitoring remains truthful as not_configured when no real monitor details are saved.',
    requiredFix: 'Configure an approved external monitor and attach backup/restore drill evidence before increasing the score.',
    tenOutOfTenBlocked: true,
  },
  {
    key: 'security_tenancy',
    category: 'Security and tenancy',
    status: 'Evidence pass',
    score: '9.5/10',
    owner: 'Security and platform',
    dateChecked: '2026-06-26',
    evidence: 'Tenant/platform isolation, support-mode audit, RBAC, vault redaction, webhook signing, portal isolation, upload permissions, API token scopes, security headers, and dependency audit path are covered.',
    evidenceAttached: [
      'Tenant and platform isolation: app/e2e/trial-and-platform-admin.spec.ts and app/e2e/platform-admin-recovery.spec.ts',
      'Support mode audit: app/pages/platform/index.tsx and api/src/admin/platform-admin.service.ts',
      'Secret redaction and vault safety: scripts/stripe-key-guard.sh; scripts/test-production-readiness-connect-vault.sh',
      'Webhook signatures: app/e2e/stripe-webhooks.spec.ts',
      'Uploads/media permissions: app/e2e/artifacts-foundation.spec.ts and app/e2e/ui-hardening.spec.ts',
      'Portal and API token scopes: app/e2e/public-portal.spec.ts; app/e2e/integrations-platform.spec.ts',
    ],
    missingEvidence: [
      'Independent security assessment: not attached.',
      'Production dependency vulnerability report is not attached to this local scorecard.',
    ],
    coverage: 'app/e2e/platform-admin-recovery.spec.ts; app/e2e/integrations-platform.spec.ts; app/e2e/workspace-governance.spec.ts; app/e2e/stripe-webhooks.spec.ts; app/e2e/final-production-readiness.spec.ts',
    remainingWeakness: 'Independent penetration-test or formal security assessment evidence is not attached.',
    requiredFix: 'Commission and attach independent security assessment evidence before claiming 10/10.',
    tenOutOfTenBlocked: true,
  },
  {
    key: 'platform_architecture',
    category: 'Platform architecture',
    status: 'Evidence pass',
    score: '9.4/10',
    owner: 'Platform architecture',
    dateChecked: '2026-06-26',
    evidence: 'MyTitan billing remains separate from tenant customer payments; provider readiness, accounting, webhooks, archive periods, numbering, portals, Tenant 360, and developer tools are covered.',
    evidenceAttached: [
      'Billing boundary: app/e2e/payments-hardening.spec.ts and api/src/billing/billing.service.ts',
      'No Stripe product/price mutation: api/scripts/verify-subscription-prices.js and api/scripts/sync-job-completion-products.js',
      'Provider readiness truth: app/e2e/integrations-platform.spec.ts',
      'Archive/numbering/platform controls: app/e2e/phase-13-launch-operations.spec.ts',
    ],
    missingEvidence: [
      'Live partner marketplace install lifecycle is not attached.',
      'Production provider canary results are manual and not marked complete without operator entry.',
    ],
    coverage: 'app/e2e/payments-hardening.spec.ts; app/e2e/stripe-webhooks.spec.ts; app/e2e/phase-1n-enterprise.spec.ts; app/e2e/phase-13-launch-operations.spec.ts',
    remainingWeakness: 'Marketplace and partner ecosystem remain roadmap, not live architecture.',
    requiredFix: 'Add partner app install lifecycle, review controls, and signed marketplace webhook contracts before increasing the score.',
    tenOutOfTenBlocked: true,
  },
  {
    key: 'product_experience',
    category: 'Product experience',
    status: 'Evidence pass',
    score: '9.4/10',
    owner: 'Product',
    dateChecked: '2026-06-26',
    evidence: 'Signup, onboarding, business profile, locations, services, bookings, calendar, jobs, job sheet, customers, invoices, payments, communications, settings, platform admin, command/search, and portals have checklist coverage.',
    evidenceAttached: [
      'Workflow checklist is rendered below this scorecard.',
      'Next actions and success/error states: app/e2e/dashboard-workflows.spec.ts and app/e2e/setup-wizard.spec.ts',
      'Booking and portals: app/e2e/booking-public-flow.spec.ts and app/e2e/public-portal.spec.ts',
      'Communications and settings: app/e2e/communications-hub.spec.ts and app/e2e/settings-operations.spec.ts',
    ],
    missingEvidence: [
      'Moderated usability study is not attached.',
      'First-user onboarding under 10 minutes is not marked complete without real study evidence.',
    ],
    coverage: 'app/e2e/dashboard-workflows.spec.ts; app/e2e/setup-wizard.spec.ts; app/e2e/communications-hub.spec.ts; app/e2e/public-portal.spec.ts; app/e2e/phase-18-certification-gate.spec.ts',
    remainingWeakness: 'A complete moderated usability study is not part of the release evidence.',
    requiredFix: 'Run a time-boxed first-user and technician field pilot, then attach task-completion evidence.',
    tenOutOfTenBlocked: true,
  },
  {
    key: 'visual_polish',
    category: 'Visual polish',
    status: 'Evidence pass',
    score: '9.2/10',
    owner: 'Design systems',
    dateChecked: '2026-06-26',
    evidence: 'Design-system consolidation, key-route visual baseline paths, light/dark readability, shell polish, tablet, mobile no-overflow, focus states, reduced motion, and state coverage are tracked.',
    evidenceAttached: [
      'Tenant routes: app/e2e/shell-polish.spec.ts and app/e2e/mobile-shell.spec.ts',
      'Public booking: app/e2e/booking-public-flow.spec.ts',
      'Marketing/pricing: app/e2e/marketing-pricing.spec.ts',
      'Platform admin: app/e2e/phase-17-excellence-gate.spec.ts',
      'No horizontal overflow: mobile viewport assertions in app/e2e/phase-18-certification-gate.spec.ts',
    ],
    missingEvidence: [
      'Stored screenshot-diff baseline for every route is not attached.',
      'Production visual-regression artifact set is not attached.',
    ],
    coverage: 'app/e2e/shell-polish.spec.ts; app/e2e/mobile-shell.spec.ts; app/e2e/tablet-layouts.spec.ts; app/e2e/phase-16-product-excellence.spec.ts; app/e2e/phase-18-certification-gate.spec.ts',
    remainingWeakness: 'No screenshot-diff baseline is stored for every route.',
    requiredFix: 'Add route screenshot baselines and visual-regression thresholds before claiming 10/10.',
    tenOutOfTenBlocked: true,
  },
  {
    key: 'marketing',
    category: 'Marketing',
    status: 'Evidence pass',
    score: '9.2/10',
    owner: 'Marketing and commercial',
    dateChecked: '2026-06-26',
    evidence: 'Homepage, pricing, trust copy, launch proof, SEO metadata, OpenGraph, structured-data path, mobile navigation, footer governance, and unsupported-claim checks are covered.',
    evidenceAttached: [
      'SEO and OpenGraph checks: marketing/components/MarketingSeo.tsx and app/e2e/marketing-pricing.spec.ts',
      'No fake testimonials/customer count/revenue/uptime: app/e2e/final-production-readiness.spec.ts and app/e2e/phase-15-product-craft.spec.ts',
      'Pricing clarity: marketing/pages/pricing.tsx',
      'Integration readiness truth: marketing/pages/index.tsx and marketing/pages/security.tsx',
    ],
    missingEvidence: [
      'Production Web Vitals evidence: not attached.',
      'Production Lighthouse report is not attached.',
      'Structured data is checked where implemented; no unsupported schema completion is claimed.',
    ],
    coverage: 'app/e2e/marketing-pricing.spec.ts; app/e2e/final-production-readiness.spec.ts; app/e2e/phase-15-product-craft.spec.ts; marketing/components/MarketingSeo.tsx',
    remainingWeakness: 'Core Web Vitals are not captured from a production analytics source in this scorecard.',
    requiredFix: 'Attach production Web Vitals and SEO crawl evidence before any 10/10 marketing claim.',
    tenOutOfTenBlocked: true,
  },
];

const workflowQualityChecklist = [
  { workflow: 'Signup', route: '/signup', evidence: 'clear next action, success and validation states, mobile safe, no dead primary CTA', discovery: 'marketing nav and Start Setup links' },
  { workflow: 'Onboarding', route: '/dashboard/setup-wizard', evidence: 'single action per step, progress success state, validation recovery, mobile safe', discovery: 'command palette and dashboard setup links' },
  { workflow: 'Business profile', route: '/dashboard/settings', evidence: 'save action, saved state, API error notice, responsive form', discovery: 'settings navigation' },
  { workflow: 'Locations', route: '/dashboard/locations', evidence: 'create/edit actions, empty and saved states, error handling, mobile table safety', discovery: 'sidebar and command palette' },
  { workflow: 'Services', route: '/dashboard/booking/settings', evidence: 'folder/service actions, service media, validation errors, no dead buttons', discovery: 'booking settings handoff' },
  { workflow: 'Public booking', route: '/portal/booking/[...booking]', evidence: 'service, slot, customer, confirmation, stale-slot recovery, deposit truth', discovery: 'shareable public booking link' },
  { workflow: 'Trade booking', route: '/trade/portal/[token]', evidence: 'verified trade state, booking without public deposit self-declaration, status recovery', discovery: 'trade account portal link' },
  { workflow: 'Calendar', route: '/dashboard/calendar', evidence: 'day/week/month actions, reschedule success, empty state, conflict error path', discovery: 'sidebar and command palette' },
  { workflow: 'Jobs', route: '/dashboard/jobs', evidence: 'create, status, assignment, archive, empty/loading/error states', discovery: 'sidebar and dashboard KPI links' },
  { workflow: 'Job sheet', route: '/dashboard/jobs/[id]', evidence: 'evidence capture, photos/signature, completion success, permission failures', discovery: 'job detail next actions' },
  { workflow: 'Customers', route: '/dashboard/customers', evidence: 'search, profile, timeline, related links, validation recovery', discovery: 'command palette and recent items' },
  { workflow: 'Invoices', route: '/dashboard/finance', evidence: 'money owed, overdue, manual refund and adjustment states, error handling', discovery: 'Get Paid nav' },
  { workflow: 'Payments', route: '/dashboard/settings/payments', evidence: 'tenant-owned provider readiness, no MyTitan fallback, manual canary controls', discovery: 'settings and launch control' },
  { workflow: 'Communications', route: '/dashboard/communications', evidence: 'thread loading, provider readiness truth, empty/error states', discovery: 'command palette' },
  { workflow: 'Settings', route: '/dashboard/settings/operations', evidence: 'uptime state, scheduler, backup, launch controls, clear remediation actions', discovery: 'settings nav' },
  { workflow: 'Platform admin', route: '/platform', evidence: 'platform-only access, support-mode audit, revenue truth, excellence gate', discovery: 'platform shell' },
];

const visualEvidenceChecklist = [
  'Key tenant routes: shell, dashboard, jobs, customers, calendar, finance, settings.',
  'Public booking: desktop and mobile public booking flow.',
  'Marketing homepage/pricing: claim-safe, metadata-aware marketing surfaces.',
  'Platform admin: excellence, revenue, uptime, support mode, and tenant detail surfaces.',
  'Mobile viewport: no horizontal overflow checks in stable specs.',
  'Dark/light mode where implemented: shell polish and theme-mode coverage.',
  'Focus states, reduced motion, and empty/loading/success/error states remain part of UI hardening evidence.',
];

const marketingEvidenceChecklist = [
  'SEO metadata checks and OpenGraph checks are attached through MarketingSeo and marketing-pricing specs.',
  'No fake testimonials, customer count, revenue, unsupported uptime claim, or fake provider readiness.',
  'Pricing clarity keeps completed-job allowances, billing intervals, and provider boundaries explicit.',
  'Integration readiness truth is copy-checked on marketing and security pages.',
  'Production Web Vitals evidence: not attached.',
];

const acceptanceEvidenceSlots = [
  'Moderated usability study: not entered.',
  'First-user onboarding under 10 minutes: not entered.',
  'Wheel A&R one-week pilot: not entered unless operator evidence is recorded.',
  'Mobile technician field test: not entered.',
  'Trade customer portal test: not entered.',
  'Live Stripe deposit/refund canary: manual only, not complete without tenant-owned provider evidence.',
  'Customer portal acceptance: not entered.',
  'Invoice/payment acceptance: not entered.',
];

const engineeringExcellenceScorecard = [
  {
    key: 'build_test_typecheck',
    category: 'Build, tests, and TypeScript',
    status: 'Proven',
    score: '9.1/10',
    owner: 'Platform engineering',
    dateChecked: '2026-06-26',
    evidence: 'Engineering-controlled release checks cover stable E2E, Docker build path, production readiness, package typechecks, and truthful remediation when a non-production script is excluded.',
    evidenceAttached: [
      'Full stable suite: scripts/validate-e2e-stable.sh',
      'Typecheck evidence: scripts/run-release-typechecks.sh -> evidence/typecheck/latest.json',
      'Docker health path: docker compose build app api marketing; scripts/healthcheck.sh',
      'Production readiness: scripts/production-readiness-check.sh',
    ],
    missingEvidence: [
      'Independent CI artifact retention must attach the latest command outputs before 10/10.',
    ],
    coverage: 'scripts/validate-e2e-stable.sh; scripts/run-release-typechecks.sh; api/package.json; app/package.json; marketing/package.json',
    remainingWeakness: 'This surface reports local/release evidence unless CI artifact retention is attached.',
    requiredFix: 'Attach retained CI logs and keep zero skipped tests before increasing the score.',
    evidenceState: 'Proven',
    tenOutOfTenBlocked: true,
  },
  {
    key: 'security_dependencies_contracts',
    category: 'Security, dependencies, and API contracts',
    status: 'Needs evidence',
    score: '8.4/10',
    owner: 'Security and platform',
    dateChecked: '2026-06-26',
    evidence: 'Dependency audit, high/critical gating, webhook signature smoke paths, auth-protected route checks, tenant isolation checks, RBAC, vault redaction, and API route inventory are automated as release evidence, but advisories and missing external assessment keep this below proven-complete.',
    evidenceAttached: [
      'Dependency scan: scripts/run-dependency-security-scan.sh -> evidence/security/latest.json',
      'API contracts: scripts/collect-api-contract-evidence.sh -> evidence/api-contract/latest.json',
      'Tenant and platform isolation: app/e2e/trial-and-platform-admin.spec.ts and app/e2e/platform-admin-recovery.spec.ts',
      'Webhook signatures and token scopes: app/e2e/stripe-webhooks.spec.ts; app/e2e/integrations-platform.spec.ts',
    ],
    missingEvidence: [
      'Independent security assessment: not attached.',
      'High/critical npm audit advisory gate: docker exec mytitan_api npm audit --audit-level=high.',
    ],
    coverage: 'scripts/run-dependency-security-scan.sh; scripts/collect-api-contract-evidence.sh; app/e2e/platform-admin-recovery.spec.ts; app/e2e/stripe-webhooks.spec.ts',
    remainingWeakness: 'Dependency and contract automation are not a formal external security certification, and moderate advisory evidence still requires review.',
    requiredFix: 'Keep high/critical audit gate passing, review moderate advisories, then commission and attach independent security assessment evidence before claiming 10/10.',
    evidenceState: 'High gate remediated',
    tenOutOfTenBlocked: true,
  },
  {
    key: 'performance_accessibility_visuals',
    category: 'Performance, accessibility, and visual regression',
    status: 'Needs evidence',
    score: '8.6/10',
    owner: 'Frontend engineering',
    dateChecked: '2026-06-26',
    evidence: 'Bundle budgets, route-size budgets, local Lighthouse slots, accessibility automation slots, and screenshot manifests exist without claiming production Web Vitals.',
    evidenceAttached: [
      'Bundle budgets: scripts/check-bundle-budgets.sh -> evidence/bundle/latest.json',
      'Screenshot baseline manifest: scripts/collect-screenshot-baseline.sh -> evidence/screenshots/manifest.json',
      'Local Lighthouse evidence: scripts/generate-local-lighthouse-evidence.sh -> evidence/lighthouse/latest.json',
      'Accessibility automation: scripts/run-accessibility-evidence.sh -> evidence/accessibility/latest.json',
    ],
    missingEvidence: [
      'Production Web Vitals evidence: not attached.',
      'Stored screenshot-diff baseline for every route is not attached until generated by Playwright.',
    ],
    coverage: 'app/e2e/shell-polish.spec.ts; app/e2e/mobile-shell.spec.ts; app/e2e/tablet-layouts.spec.ts; app/e2e/phase-18-certification-gate.spec.ts',
    remainingWeakness: 'Local Lighthouse and manifest evidence cannot prove production LCP, INP, CLS, or uptime.',
    requiredFix: 'Attach production Web Vitals and retained screenshot diff artifacts before 10/10.',
    evidenceState: 'Needs evidence',
    tenOutOfTenBlocked: true,
  },
  {
    key: 'architecture_release_package',
    category: 'Architecture and release evidence package',
    status: 'Proven',
    score: '9.0/10',
    owner: 'Platform architecture',
    dateChecked: '2026-06-26',
    evidence: 'Architecture documentation is generated from tracked routes, API modules, Prisma models, integrations, payment boundaries, tenant/platform separation, and release package manifests.',
    evidenceAttached: [
      'Architecture docs: scripts/generate-architecture-docs.sh -> docs/architecture/generated/',
      'Release package: scripts/create-release-evidence-package.sh -> release-evidence/<tag-or-date>/',
      'Payment boundary ADR: docs/architecture/adr/0001-tenant-payment-separation.md',
      'Route inventory: scripts/generate-routes-inventory.sh',
    ],
    missingEvidence: [
      'Deployment provider artifact retention is not attached in this local scorecard.',
    ],
    coverage: 'scripts/generate-architecture-docs.sh; scripts/create-release-evidence-package.sh; docs/architecture/generated/manifest.md',
    remainingWeakness: 'Generated docs reflect the repository and still need operator-owned deployment evidence.',
    requiredFix: 'Attach deployment topology evidence from the production host before 10/10.',
    evidenceState: 'Proven',
    tenOutOfTenBlocked: true,
  },
];

const productExcellenceScorecard = [
  {
    key: 'real_world_usage',
    category: 'User onboarding, adoption, retention, and task completion',
    status: 'Not proven',
    score: '6.0/10',
    owner: 'Product',
    dateChecked: '2026-06-26',
    evidence: 'The platform has workflow automation coverage, but real user onboarding completion, task completion time, adoption, retention, support volume, satisfaction, pilot outcomes, and usability-study evidence are not attached.',
    evidenceAttached: [
      'Workflow checklist: phase18-workflow-quality-checklist',
      'Acceptance slots: docs/audit/final-real-world-acceptance.md',
    ],
    missingEvidence: [
      'Moderated usability study is not attached.',
      'First-user onboarding under 10 minutes is not marked complete without real study evidence.',
      'Adoption and retention analytics from live tenants are not attached.',
    ],
    coverage: 'app/e2e/dashboard-workflows.spec.ts; app/e2e/setup-wizard.spec.ts; docs/audit/final-real-world-acceptance.md',
    remainingWeakness: 'Product quality cannot be scored as complete from automated UI checks alone.',
    requiredFix: 'Run live pilot studies and attach measured task completion, adoption, retention, support, and satisfaction evidence.',
    evidenceState: 'Not proven',
    tenOutOfTenBlocked: true,
  },
  {
    key: 'production_operations',
    category: 'Production performance, uptime, and Web Vitals',
    status: 'Needs evidence',
    score: '5.8/10',
    owner: 'Platform operations',
    dateChecked: '2026-06-26',
    evidence: 'Internal health and local Lighthouse evidence can be collected, but production uptime history and real Core Web Vitals are not claimed without external measurements.',
    evidenceAttached: [
      'Internal health: scripts/healthcheck.sh',
      'Readiness duration slot: scripts/production-readiness-check.sh',
      'Performance evidence slot: evidence/performance/latest.json',
    ],
    missingEvidence: [
      'External uptime monitor: not_configured unless a real provider and non-secret monitor identifier are saved.',
      'Production Web Vitals evidence: not attached.',
      'INP, LCP, and CLS production fields require real analytics source data.',
    ],
    coverage: 'scripts/external-monitoring-status.sh; scripts/generate-local-lighthouse-evidence.sh; app/pages/platform/index.tsx',
    remainingWeakness: 'Local checks are not global external uptime or production user performance proof.',
    requiredFix: 'Configure approved monitoring and attach production Web Vitals from a real analytics source.',
    evidenceState: 'Needs evidence',
    tenOutOfTenBlocked: true,
  },
  {
    key: 'payments_pilots_revenue',
    category: 'Live payments, pilots, customers, reviews, and revenue',
    status: 'Not proven',
    score: '5.5/10',
    owner: 'Commercial operations',
    dateChecked: '2026-06-26',
    evidence: 'MyTitan revenue remains actual platform billing only, tenant customer payments are excluded, and live payment canaries or customer outcomes are not fabricated.',
    evidenceAttached: [
      'Revenue truth: /admin/platform/revenue reports actual MyTitan subscription and job-pack revenue only.',
      'Payment canary guidance: docs/payment-canary.md',
      'Billing product verification: api/scripts/verify-subscription-prices.js',
    ],
    missingEvidence: [
      'Live payment canary is not complete without tenant-owned provider evidence.',
      'Customers, reviews, revenue outcomes, and pilot outcomes are not attached.',
      'No fake provider readiness is allowed.',
    ],
    coverage: 'app/e2e/trial-and-platform-admin.spec.ts; app/e2e/payments-hardening.spec.ts; api/src/billing/billing.service.ts',
    remainingWeakness: 'Real-world commercial proof has to come from live customers and audited provider canaries.',
    requiredFix: 'Attach tenant-owned live payment canary, pilot outcomes, and customer evidence before increasing the score.',
    evidenceState: 'Not proven',
    tenOutOfTenBlocked: true,
  },
];

export default function PlatformAdminPage() {
  const router = useRouter();
  const [meReady, setMeReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<TenantSearchResult[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loadingTenant, setLoadingTenant] = useState(false);
  const [supportModeSession, setSupportModeSession] = useState<SupportModeSession | null>(null);
  const [supportModeReason, setSupportModeReason] = useState('');
  const [supportModeMinutes, setSupportModeMinutes] = useState('30');
  const [supportModeViewRole, setSupportModeViewRole] = useState<'owner' | 'admin' | 'operator' | 'finance' | 'customer_portal'>('owner');
  const [supportModeAccessMode, setSupportModeAccessMode] = useState<'read_only' | 'write'>('read_only');
  const [supportModeWriteConfirmed, setSupportModeWriteConfirmed] = useState(false);
  const [supportModeBusy, setSupportModeBusy] = useState(false);
  const [pricingBusy, setPricingBusy] = useState(false);
  const [trialBusy, setTrialBusy] = useState(false);
  const [allowanceBusy, setAllowanceBusy] = useState(false);
  const [commercialBusy, setCommercialBusy] = useState(false);
  const [membershipsLoading, setMembershipsLoading] = useState(false);
  const [memberships, setMemberships] = useState<MembershipsResponse | null>(null);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [revenue, setRevenue] = useState<RevenueResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overview, setOverview] = useState<PlatformOverviewResponse | null>(null);
  const [templateQueueLoading, setTemplateQueueLoading] = useState(false);
  const [templateQueue, setTemplateQueue] = useState<any>(null);
  const [billingCatalogLoading, setBillingCatalogLoading] = useState(false);
  const [billingCatalog, setBillingCatalog] = useState<any>(null);
  const [billingCatalogVerifyResult, setBillingCatalogVerifyResult] = useState<any>(null);
  const [enterpriseAnnualRepair, setEnterpriseAnnualRepair] = useState<any>(null);
  const [enterpriseAnnualRepairLoading, setEnterpriseAnnualRepairLoading] = useState(false);
  const [enterpriseAnnualRepairDraft, setEnterpriseAnnualRepairDraft] = useState({ candidateToken: '', reason: '', confirmation: '' });
  const [emailControlLoading, setEmailControlLoading] = useState(false);
  const [emailControl, setEmailControl] = useState<EmailControlResponse | null>(null);
  const [emailControlReason, setEmailControlReason] = useState('');
  const [errorLogsLoading, setErrorLogsLoading] = useState(false);
  const [errorLogs, setErrorLogs] = useState<any>(null);
  const [errorLogFilters, setErrorLogFilters] = useState({ category: 'all', status: 'all' });
  const [revealedCatalogIds, setRevealedCatalogIds] = useState<Record<string, { stripePriceId?: string | null; stripeProductId?: string | null }>>({});
  const [copiedCatalogField, setCopiedCatalogField] = useState('');
  const platformSection = typeof router.query.section === 'string' ? router.query.section : '';
  const platformProduct = typeof router.query.product === 'string' ? router.query.product : '';
  const { getSectionProps } = useSectionTargeting({
    targetKey: platformProduct ? `catalog-${platformProduct}` : platformSection || '',
    ready: router.isReady,
  });
  const [catalogDrafts, setCatalogDrafts] = useState<Record<string, any>>({});
  const [templateReviewDrafts, setTemplateReviewDrafts] = useState<Record<string, any>>({});
  const [selectedTemplateReviewId, setSelectedTemplateReviewId] = useState<string>('');
  const [membershipFilters, setMembershipFilters] = useState<MembershipFilterState>(DEFAULT_MEMBERSHIP_FILTERS);
  const [pricingForm, setPricingForm] = useState({
    type: 'percentage' as 'percentage' | 'fixed',
    value: '10',
    duration: 'recurring' as 'one_time' | 'recurring' | 'until_date',
    expiresAt: '',
    reason: '',
  });
  const [trialForm, setTrialForm] = useState({
    startedAt: '',
    endsAt: '',
  });
  const [allowanceForm, setAllowanceForm] = useState({
    monthlyJobAllowance: '',
    recurringExtraAllowance: '',
    unlimitedJobs: false,
    creditDelta: '',
    jobPackCreditCount: '',
    temporaryCreditCount: '',
    expiresAt: '',
    enterprisePlanNote: '',
    reason: '',
  });
  const [commercialForm, setCommercialForm] = useState({
    planCode: '',
    interval: 'MONTHLY' as 'MONTHLY' | 'ANNUAL',
    customMonthlyPrice: '',
    customAnnualPrice: '',
    grandfatheredPricing: false,
    paused: false,
    billingNote: '',
    reason: '',
  });

  useEffect(() => {
    let cancelled = false;
    const loadMe = async () => {
      try {
        const me = await apiFetch('/me');
        if (!cancelled) {
          setAllowed(Boolean(me?.platformAdmin));
        }
      } catch {
        if (!cancelled) {
          setAllowed(false);
        }
      } finally {
        if (!cancelled) {
          setMeReady(true);
        }
      }
    };
    void loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const adjustment = tenant?.pricingState?.adjustment;
    setPricingForm({
      type: adjustment?.type || 'percentage',
      value: adjustment ? String(adjustment.value) : '10',
      duration: adjustment?.duration || 'recurring',
      expiresAt: adjustment?.expiresAt ? adjustment.expiresAt.slice(0, 10) : '',
      reason: adjustment?.reason || '',
    });
    setTrialForm({
      startedAt: tenant?.billing?.trial?.startedAt ? tenant.billing.trial.startedAt.slice(0, 10) : '',
      endsAt: tenant?.billing?.trial?.endsAt ? tenant.billing.trial.endsAt.slice(0, 10) : '',
    });
    const allowance = tenant?.jobAllowanceControl;
    setAllowanceForm({
      monthlyJobAllowance:
        allowance?.override?.monthlyJobAllowance !== null && allowance?.override?.monthlyJobAllowance !== undefined
          ? String(allowance.override.monthlyJobAllowance)
          : '',
      recurringExtraAllowance: String(allowance?.override?.recurringExtraAllowance || allowance?.summary?.recurringExtraAllowance || ''),
      unlimitedJobs: allowance?.override?.unlimitedJobs === true || allowance?.summary?.unlimitedJobs === true,
      creditDelta: '',
      jobPackCreditCount: '',
      temporaryCreditCount: '',
      expiresAt: '',
      enterprisePlanNote: allowance?.override?.enterprisePlanNote || allowance?.summary?.enterprisePlanNote || '',
      reason: allowance?.override?.reason || '',
    });
  }, [tenant?.pricingState?.adjustment, tenant?.billing?.trial, tenant?.jobAllowanceControl]);

  useEffect(() => {
    const nextDrafts: Record<string, any> = {};
    for (const item of [...(billingCatalog?.subscriptionItems || []), ...(billingCatalog?.jobPackItems || [])]) {
      const draftKey = `${item.kind}:${item.code}:${item.interval || 'none'}`;
      nextDrafts[draftKey] = {
        kind: item.kind,
        code: item.code,
        interval: item.interval || null,
        lookupKey: item.lookupKey || '',
        stripePriceId: '',
        stripeProductId: '',
        expectedAmountCents: item.expectedAmountCents ?? '',
        expectedAmount: item.expectedAmountDisplay || formatMoney(item.expectedAmountCents || 0, item.currency || 'GBP'),
        currency: item.currency || 'GBP',
        active: item.active !== false,
        changeNotes: item.changeNotes || '',
      };
    }
    setCatalogDrafts(nextDrafts);
  }, [billingCatalog]);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    const loadPlatformData = async () => {
      setOverviewLoading(true);
      setMembershipsLoading(true);
      setRevenueLoading(true);
      setTemplateQueueLoading(true);
      setBillingCatalogLoading(true);
      setEmailControlLoading(true);
      setErrorLogsLoading(true);
      try {
        const [overviewResponse, membershipsResponse, revenueResponse, templatesResponse, billingCatalogResponse, emailControlResponse, errorLogsResponse] = await Promise.all([
          apiFetch('/admin/platform/overview'),
          apiFetch('/admin/platform/memberships'),
          apiFetch('/admin/platform/revenue'),
          apiFetch('/admin/platform/templates'),
          apiFetch('/admin/platform/billing-catalog'),
          apiFetch('/admin/platform/email-control'),
          apiFetch('/admin/platform/error-logs'),
        ]);
        if (cancelled) return;
        setOverview(overviewResponse);
        setMemberships(membershipsResponse);
        setRevenue(revenueResponse);
        setTemplateQueue(templatesResponse);
        setBillingCatalog(billingCatalogResponse);
        setEmailControl(emailControlResponse);
        setErrorLogs(errorLogsResponse);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load platform control centre');
        }
      } finally {
        if (!cancelled) {
          setOverviewLoading(false);
          setMembershipsLoading(false);
          setRevenueLoading(false);
          setTemplateQueueLoading(false);
          setBillingCatalogLoading(false);
          setEmailControlLoading(false);
          setErrorLogsLoading(false);
        }
      }
    };
    void loadPlatformData();
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  const refreshTemplateQueue = async () => {
    setTemplateQueueLoading(true);
    try {
      const response = await apiFetch('/admin/platform/templates');
      setTemplateQueue(response);
      setSelectedTemplateReviewId((current) => current || response?.templates?.[0]?.id || '');
    } finally {
      setTemplateQueueLoading(false);
    }
  };

  const refreshBillingCatalog = async () => {
    setBillingCatalogLoading(true);
    try {
      const response = await apiFetch('/admin/platform/billing-catalog');
      setBillingCatalog(response);
    } finally {
      setBillingCatalogLoading(false);
    }
  };

  const refreshEmailControl = async () => {
    setEmailControlLoading(true);
    try {
      const response = await apiFetch('/admin/platform/email-control');
      setEmailControl(response);
    } finally {
      setEmailControlLoading(false);
    }
  };

  const updateEmailControl = async (action: 'pause' | 'resume') => {
    setEmailControlLoading(true);
    try {
      await apiFetch('/admin/platform/email-control', {
        method: 'PATCH',
        body: JSON.stringify({
          action,
          reason: action === 'pause' ? emailControlReason : '',
        }),
      });
      setEmailControlReason('');
      await refreshEmailControl();
    } catch (err: any) {
      setError(err.message || 'Failed to update outbound email control');
      setEmailControlLoading(false);
    }
  };

  const refreshErrorLogs = async (nextFilters = errorLogFilters) => {
    setErrorLogsLoading(true);
    try {
      const params = new URLSearchParams();
      if (nextFilters.category && nextFilters.category !== 'all') params.set('category', nextFilters.category);
      if (nextFilters.status && nextFilters.status !== 'all') params.set('status', nextFilters.status);
      const response = await apiFetch(`/admin/platform/error-logs${params.toString() ? `?${params.toString()}` : ''}`);
      setErrorLogs(response);
    } finally {
      setErrorLogsLoading(false);
    }
  };

  const reviewTemplate = async (templateId: string, status: 'approved' | 'rejected' | 'needs_changes') => {
    setTemplateQueueLoading(true);
    try {
      const draft = templateReviewDrafts[templateId] || {};
      await apiFetch(`/admin/platform/templates/${encodeURIComponent(templateId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          publish: draft.publish ?? status === 'approved',
          archive: draft.archive === true,
          featured: draft.featured === true,
          premiumStarter: draft.premiumStarter === true,
          bestFor: String(draft.bestFor || '').split(',').map((value) => value.trim()).filter(Boolean),
          workflowTags: String(draft.workflowTags || '').split(',').map((value) => value.trim()).filter(Boolean),
          estimatedSetupMinutes: draft.estimatedSetupMinutes ? Number(draft.estimatedSetupMinutes) : null,
          setupComplexity: draft.setupComplexity || undefined,
          editorialTone: draft.editorialTone || undefined,
          customerFacingSummary: draft.customerFacingSummary || undefined,
          approvalNotes: draft.approvalNotes || (status === 'approved' ? 'Approved for shared template library.' : null),
          reviewNotes: draft.reviewNotes || (status === 'rejected' ? 'Rejected by platform review.' : status === 'needs_changes' ? 'Needs changes before approval.' : null),
        }),
      });
      await refreshTemplateQueue();
    } catch (err: any) {
      setError(err.message || 'Failed to review template');
    } finally {
      setTemplateQueueLoading(false);
    }
  };

  const saveBillingCatalogItem = async (item: any, mode: 'validate' | 'save' = 'save') => {
    if (mode === 'save') {
      const reason = String(item.changeNotes || '').trim();
      if (!reason) {
        setError('A change reason is required before saving a billing catalog mapping.');
        return;
      }
      if (!window.confirm('Save this billing catalog mapping locally? Stripe products and prices will not be changed.')) return;
    }
    setBillingCatalogLoading(true);
    try {
      const response = await apiFetch('/admin/platform/billing-catalog', {
        method: 'POST',
        body: JSON.stringify({
          ...item,
          expectedAmount: item.expectedAmount,
          expectedAmountCents: undefined,
          mode,
        }),
      });
      if (mode === 'validate') {
        setCatalogDrafts((current) => ({
          ...current,
          [`${item.kind}:${item.code}:${item.interval || 'none'}`]: {
            ...current[`${item.kind}:${item.code}:${item.interval || 'none'}`],
            verificationPreview: response?.verification || null,
          },
        }));
      } else {
        await refreshBillingCatalog();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save billing catalog item');
    } finally {
      setBillingCatalogLoading(false);
    }
  };

  const revealBillingCatalogItem = async (key: string) => {
    try {
      if (!window.confirm('Reveal full Stripe identifiers for this mapping? This action is audited.')) return;
      const response = await apiFetch(`/admin/platform/billing-catalog/${encodeURIComponent(key)}/reveal`);
      setRevealedCatalogIds((current) => ({ ...current, [key]: response?.item || {} }));
    } catch (err: any) {
      setError(err.message || 'Failed to reveal billing catalog identifiers');
    }
  };

  const verifyAllJobPacks = async () => {
    setBillingCatalogLoading(true);
    try {
      const response = await apiFetch('/admin/platform/billing-catalog/verify-job-packs', { method: 'POST', body: JSON.stringify({}) });
      setBillingCatalogVerifyResult(response);
      await refreshBillingCatalog();
    } catch (err: any) {
      setError(err.message || 'Failed to dry-run verify job packs');
    } finally {
      setBillingCatalogLoading(false);
    }
  };

  const refreshEnterpriseAnnualRepair = async () => {
    setEnterpriseAnnualRepairLoading(true);
    setError('');
    try {
      const response = await apiFetch('/admin/platform/billing-catalog/enterprise-annual/repair-candidates');
      setEnterpriseAnnualRepair(response);
      setEnterpriseAnnualRepairDraft({ candidateToken: '', reason: '', confirmation: '' });
    } catch (err: any) {
      setError(err.message || 'Failed to load Enterprise Annual repair candidates');
    } finally {
      setEnterpriseAnnualRepairLoading(false);
    }
  };

  const adoptEnterpriseAnnualCandidate = async () => {
    if (!enterpriseAnnualRepairDraft.candidateToken) {
      setError('Choose a verified Enterprise Annual candidate before adoption.');
      return;
    }
    if (!enterpriseAnnualRepairDraft.reason.trim()) {
      setError('A change reason is required before adopting an Enterprise Annual mapping.');
      return;
    }
    if (enterpriseAnnualRepairDraft.confirmation.trim() !== 'ADOPT ENTERPRISE ANNUAL') {
      setError('Type ADOPT ENTERPRISE ANNUAL before adoption.');
      return;
    }
    if (!window.confirm('Adopt this Enterprise Annual mapping locally? Stripe products and prices will not be changed.')) return;
    setEnterpriseAnnualRepairLoading(true);
    setError('');
    try {
      const response = await apiFetch('/admin/platform/billing-catalog/enterprise-annual/adopt-candidate', {
        method: 'POST',
        body: JSON.stringify(enterpriseAnnualRepairDraft),
      });
      setEnterpriseAnnualRepair((current: any) => ({ ...(current || {}), latestAdoption: response }));
      await refreshBillingCatalog();
      await refreshEnterpriseAnnualRepair();
    } catch (err: any) {
      setError(err.message || 'Failed to adopt Enterprise Annual mapping');
    } finally {
      setEnterpriseAnnualRepairLoading(false);
    }
  };

  const rollbackBillingCatalogItem = async (item: any) => {
    const reason = catalogDrafts[`${item.kind}:${item.code}:${item.interval || 'none'}`]?.changeNotes || 'Rollback requested from platform catalog admin';
    if (!window.confirm('Rollback this billing catalog mapping locally using the latest rollback target? Stripe products and prices will not be changed.')) return;
    setBillingCatalogLoading(true);
    try {
      await apiFetch(`/admin/platform/billing-catalog/${encodeURIComponent(item.key)}/rollback`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      await refreshBillingCatalog();
    } catch (err: any) {
      setError(err.message || 'Failed to rollback billing catalog mapping');
    } finally {
      setBillingCatalogLoading(false);
    }
  };

  const adoptVerifiedProductFromPrice = async (item: any, draft: any) => {
    const reason = String(draft.changeNotes || '').trim();
    if (!reason) {
      setError('A change reason is required before adopting the Product ID from a verified Stripe Price.');
      return;
    }
    if (!window.confirm('Use the Product ID from the verified Stripe Price and save this local mapping? Stripe products and prices will not be changed.')) return;
    await saveBillingCatalogItem({ ...draft, stripeProductId: '', useVerifiedProductFromPrice: true }, 'save');
  };

  const copyDiagnosticRequestId = async (requestId?: string | null) => {
    if (!requestId || !navigator?.clipboard?.writeText) return;
    await navigator.clipboard.writeText(requestId);
    setCopiedCatalogField(`request:${requestId}`);
    window.setTimeout(() => setCopiedCatalogField((current) => (current === `request:${requestId}` ? '' : current)), 1500);
  };

  const copyCatalogIdentifier = async (value: string | null | undefined, key: string, field: 'price' | 'product') => {
    if (!value || !navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedCatalogField(`${key}:${field}`);
      window.setTimeout(() => {
        setCopiedCatalogField((current) => (current === `${key}:${field}` ? '' : current));
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to copy billing catalog identifier');
    }
  };

  const updateErrorLogStatus = async (logId: string, action: 'reviewed' | 'resolved' | 'reopen') => {
    await apiFetch(`/admin/platform/error-logs/${encodeURIComponent(logId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ action }),
    });
    await refreshErrorLogs();
  };

  const clearReviewedErrorLogs = async () => {
    await apiFetch('/admin/platform/error-logs/clear-reviewed', { method: 'POST', body: JSON.stringify({}) });
    await refreshErrorLogs();
  };

  const clearValidationErrorLogs = async () => {
    await apiFetch('/admin/platform/error-logs/clear-validation', { method: 'POST', body: JSON.stringify({}) });
    await refreshErrorLogs();
  };

  const exportErrorLogs = async () => {
    const params = new URLSearchParams();
    if (errorLogFilters.category !== 'all') params.set('category', errorLogFilters.category);
    if (errorLogFilters.status !== 'all') params.set('status', errorLogFilters.status);
    const response = await apiFetch(`/admin/platform/error-logs/export${params.toString() ? `?${params.toString()}` : ''}`);
    setErrorLogs((current: any) => ({ ...(current || {}), exportPreview: response?.content || '' }));
  };

  const selectedTemplateReview = useMemo(
    () => (templateQueue?.templates || []).find((template: any) => template.id === selectedTemplateReviewId) || (templateQueue?.templates || [])[0] || null,
    [selectedTemplateReviewId, templateQueue?.templates],
  );

  const selectedTrialSummary = useMemo(() => {
    const trial = tenant?.billing?.trial;
    if (!trial) return 'No trial data';
    if (trial.isActive) return `Trial active with ${trial.daysRemaining} day${trial.daysRemaining === 1 ? '' : 's'} remaining`;
    if (trial.status === 'expired') return 'Trial expired';
    if (trial.status === 'converted') return 'Trial window stored, but billing has already converted';
    return 'No active trial';
  }, [tenant?.billing?.trial]);

  const filteredMemberships = useMemo(() => {
    const rows = memberships?.rows || [];
    const queryText = membershipFilters.query.trim().toLowerCase();
    return rows.filter((row) => {
      if (queryText) {
        const haystack = [
          row.workspaceName,
          row.email,
          row.role,
          row.planName,
          row.planCode,
          row.subscriptionStatus,
          row.trialStatus,
          row.conversionSource || '',
        ].join(' ').toLowerCase();
        if (!haystack.includes(queryText)) return false;
      }
      if (membershipFilters.plan !== 'all' && row.planCode !== membershipFilters.plan) return false;
      if (membershipFilters.subscription !== 'all' && row.subscriptionStatus !== membershipFilters.subscription) return false;
      if (membershipFilters.trial !== 'all' && row.trialStatus !== membershipFilters.trial) return false;
      if (membershipFilters.conversion !== 'all') {
        const conversionValue = row.conversionSource || 'none';
        if (conversionValue !== membershipFilters.conversion) return false;
      }
      return true;
    });
  }, [memberships?.rows, membershipFilters]);

  const membershipGroups = useMemo(() => {
    const labelForRow = (row: MembershipRow) => {
      if (membershipFilters.groupBy === 'workspace') return row.workspaceName;
      if (membershipFilters.groupBy === 'plan') return row.planName;
      if (membershipFilters.groupBy === 'subscription') return row.subscriptionStatus || 'inactive';
      if (membershipFilters.groupBy === 'trial') return row.trialStatus || 'not_applicable';
      if (membershipFilters.groupBy === 'conversion') return row.conversionSource || 'none';
      return 'All members';
    };
    const groups = new Map<string, MembershipRow[]>();
    for (const row of filteredMemberships) {
      const label = labelForRow(row);
      groups.set(label, [...(groups.get(label) || []), row]);
    }
    return Array.from(groups.entries()).sort((left, right) => left[0].localeCompare(right[0]));
  }, [filteredMemberships, membershipFilters.groupBy]);

  const membershipFilterOptions = useMemo(() => {
    const rows = memberships?.rows || [];
    return {
      plans: Array.from(new Set(rows.map((row) => row.planCode))).sort(),
      subscriptions: Array.from(new Set(rows.map((row) => row.subscriptionStatus))).sort(),
      trials: Array.from(new Set(rows.map((row) => row.trialStatus))).sort(),
      conversions: Array.from(new Set(rows.map((row) => row.conversionSource || 'none'))).sort(),
    };
  }, [memberships?.rows]);

  async function refreshOverview() {
    setOverviewLoading(true);
    try {
      const response = await apiFetch('/admin/platform/overview');
      setOverview(response);
    } finally {
      setOverviewLoading(false);
    }
  }

  async function searchTenants(nextQuery?: string) {
    const value = (nextQuery ?? query).trim();
    setQuery(nextQuery ?? query);
    if (value.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    setError('');
    try {
      const response = await apiFetch(`/admin/platform/tenants?q=${encodeURIComponent(value)}`);
      setResults(Array.isArray(response?.results) ? response.results : []);
    } catch (err: any) {
      setError(err.message || 'Failed to search tenants');
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function loadTenant(tenantId: string) {
    setSelectedTenantId(tenantId);
    setLoadingTenant(true);
    setError('');
    try {
      const response = await apiFetch(`/admin/platform/tenants/${encodeURIComponent(tenantId)}`);
      setTenant(response);
      setCommercialForm({
        planCode: response?.commercialControl?.plan?.code || '',
        interval: response?.commercialControl?.interval === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY',
        customMonthlyPrice: response?.commercialControl?.controls?.customMonthlyPriceCents == null ? '' : String(response.commercialControl.controls.customMonthlyPriceCents / 100),
        customAnnualPrice: response?.commercialControl?.controls?.customAnnualPriceCents == null ? '' : String(response.commercialControl.controls.customAnnualPriceCents / 100),
        grandfatheredPricing: response?.commercialControl?.controls?.grandfatheredPricing === true,
        paused: response?.commercialControl?.controls?.paused === true,
        billingNote: response?.commercialControl?.controls?.billingNote || '',
        reason: '',
      });
      setSupportModeSession(response?.support?.supportMode || null);
    } catch (err: any) {
      setError(err.message || 'Failed to load tenant');
      setTenant(null);
    } finally {
      setLoadingTenant(false);
    }
  }

  async function checkSupportMode(tenantId: string) {
    try {
      const response = await apiFetch(`/admin/platform/tenants/${encodeURIComponent(tenantId)}/support-mode`);
      setSupportModeSession(response?.session || null);
      return response?.session || null;
    } catch {
      setSupportModeSession(null);
      return null;
    }
  }

  function selectTenantForSupport(tenantId: string) {
    setSelectedTenantId(tenantId);
    setTenant(null);
    setError('');
    void checkSupportMode(tenantId).then((session) => {
      if (session?.active) void loadTenant(tenantId);
    });
  }

  async function startSupportMode() {
    if (!selectedTenantId) return;
    setSupportModeBusy(true);
    setError('');
    try {
      const response = await apiFetch(`/admin/platform/tenants/${encodeURIComponent(selectedTenantId)}/support-mode`, {
        method: 'POST',
        body: JSON.stringify({
          reason: supportModeReason,
          durationMinutes: Number(supportModeMinutes || 30),
          viewRole: supportModeViewRole,
          accessMode: supportModeAccessMode,
          confirmation: supportModeAccessMode === 'write' ? supportModeWriteConfirmed : undefined,
        }),
      });
      setSupportModeSession(response?.session || null);
      setSupportModeReason('');
      setSupportModeWriteConfirmed(false);
      await loadTenant(selectedTenantId);
    } catch (err: any) {
      setError(err.message || 'Failed to start support mode');
    } finally {
      setSupportModeBusy(false);
    }
  }

  async function exitSupportMode() {
    if (!selectedTenantId) return;
    setSupportModeBusy(true);
    setError('');
    try {
      await apiFetch(`/admin/platform/tenants/${encodeURIComponent(selectedTenantId)}/support-mode`, { method: 'DELETE' });
      setSupportModeSession(null);
      setTenant(null);
    } catch (err: any) {
      setError(err.message || 'Failed to exit support mode');
    } finally {
      setSupportModeBusy(false);
    }
  }

  function focusTenant(tenantId: string) {
    void selectTenantForSupport(tenantId);
    const target = document.getElementById('lookup');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function savePricingAdjustment(method: 'POST' | 'PATCH') {
    if (!selectedTenantId) return;
    setPricingBusy(true);
    setError('');
    try {
      await apiFetch(`/admin/platform/tenants/${encodeURIComponent(selectedTenantId)}/pricing-adjustment`, {
        method,
        body: JSON.stringify({
          type: pricingForm.type,
          value: Number(pricingForm.value),
          duration: pricingForm.duration,
          expiresAt: pricingForm.duration === 'until_date' && pricingForm.expiresAt ? new Date(`${pricingForm.expiresAt}T23:59:59`).toISOString() : undefined,
          reason: pricingForm.reason.trim() || undefined,
          confirmation: true,
        }),
      });
      await Promise.all([loadTenant(selectedTenantId), refreshRevenue(), refreshOverview()]);
    } catch (err: any) {
      setError(err.message || 'Failed to save pricing adjustment');
    } finally {
      setPricingBusy(false);
    }
  }

  async function removePricingAdjustment() {
    if (!selectedTenantId) return;
    setPricingBusy(true);
    setError('');
    try {
      await apiFetch(`/admin/platform/tenants/${encodeURIComponent(selectedTenantId)}/pricing-adjustment`, {
        method: 'DELETE',
        body: JSON.stringify({ confirmation: true, reason: pricingForm.reason.trim() || 'Platform admin confirmed pricing removal' }),
      });
      await Promise.all([loadTenant(selectedTenantId), refreshRevenue(), refreshOverview()]);
    } catch (err: any) {
      setError(err.message || 'Failed to remove pricing adjustment');
    } finally {
      setPricingBusy(false);
    }
  }

  async function saveTrialOverride(clear = false) {
    if (!selectedTenantId) return;
    setTrialBusy(true);
    setError('');
    try {
      await apiFetch(`/admin/platform/tenants/${encodeURIComponent(selectedTenantId)}/trial`, {
        method: 'PATCH',
        body: JSON.stringify(clear ? { endsAt: null, confirmation: true, reason: 'Platform admin confirmed trial end or clear' } : {
          startedAt: trialForm.startedAt ? new Date(`${trialForm.startedAt}T00:00:00.000Z`).toISOString() : undefined,
          endsAt: trialForm.endsAt ? new Date(`${trialForm.endsAt}T23:59:59.000Z`).toISOString() : undefined,
          confirmation: true,
          reason: 'Platform admin confirmed trial date change',
        }),
      });
      await Promise.all([loadTenant(selectedTenantId), refreshMemberships(), refreshRevenue(), refreshOverview()]);
    } catch (err: any) {
      setError(err.message || 'Failed to update trial');
    } finally {
      setTrialBusy(false);
    }
  }

  async function runTrialLifecycleAction(action: 'extend' | 'pause' | 'resume' | 'expire', extendDays?: number) {
    if (!selectedTenantId) return;
    const reason = window.prompt(`Reason to ${action} this tenant trial:`);
    if (!reason || reason.trim().length < 8) return;
    if (!window.confirm(`Confirm trial action: ${action}?`)) return;
    setTrialBusy(true);
    setError('');
    try {
      await apiFetch(`/admin/platform/tenants/${encodeURIComponent(selectedTenantId)}/trial`, {
        method: 'PATCH',
        body: JSON.stringify({ action, extendDays, confirmation: true, reason: reason.trim() }),
      });
      await loadTenant(selectedTenantId);
    } catch (err: any) {
      setError(err.message || `Failed to ${action} trial`);
    } finally {
      setTrialBusy(false);
    }
  }

  async function saveJobAllowanceControl() {
    if (!selectedTenantId) return;
    setAllowanceBusy(true);
    setError('');
    try {
      await apiFetch(`/admin/platform/tenants/${encodeURIComponent(selectedTenantId)}/job-allowance`, {
        method: 'PATCH',
        body: JSON.stringify({
          monthlyJobAllowance: allowanceForm.monthlyJobAllowance.trim() ? Number(allowanceForm.monthlyJobAllowance) : null,
          recurringExtraAllowance: allowanceForm.recurringExtraAllowance.trim() ? Number(allowanceForm.recurringExtraAllowance) : 0,
          unlimitedJobs: allowanceForm.unlimitedJobs,
          creditDelta: allowanceForm.creditDelta.trim() ? Number(allowanceForm.creditDelta) : 0,
          jobPackCreditCount: allowanceForm.jobPackCreditCount.trim() ? Number(allowanceForm.jobPackCreditCount) : 0,
          temporaryCreditCount: allowanceForm.temporaryCreditCount.trim() ? Number(allowanceForm.temporaryCreditCount) : 0,
          expiresAt: allowanceForm.expiresAt ? new Date(`${allowanceForm.expiresAt}T23:59:59.000Z`).toISOString() : undefined,
          enterprisePlanNote: allowanceForm.enterprisePlanNote.trim() || undefined,
          reason: allowanceForm.reason.trim(),
          confirmation: true,
        }),
      });
      await loadTenant(selectedTenantId);
    } catch (err: any) {
      setError(err.message || 'Failed to update job allowance');
    } finally {
      setAllowanceBusy(false);
    }
  }

  async function saveCommercialControl() {
    if (!selectedTenantId) return;
    setCommercialBusy(true);
    setError('');
    try {
      await apiFetch(`/admin/platform/tenants/${encodeURIComponent(selectedTenantId)}/commercial-controls`, {
        method: 'PATCH',
        body: JSON.stringify({
          planCode: commercialForm.planCode || undefined,
          interval: commercialForm.interval,
          customMonthlyPriceCents: commercialForm.customMonthlyPrice.trim() ? Math.round(Number(commercialForm.customMonthlyPrice) * 100) : null,
          customAnnualPriceCents: commercialForm.customAnnualPrice.trim() ? Math.round(Number(commercialForm.customAnnualPrice) * 100) : null,
          grandfatheredPricing: commercialForm.grandfatheredPricing,
          paused: commercialForm.paused,
          billingNote: commercialForm.billingNote,
          reason: commercialForm.reason,
          confirmation: true,
        }),
      });
      await Promise.all([loadTenant(selectedTenantId), refreshMemberships(), refreshRevenue(), refreshOverview()]);
    } catch (err: any) {
      setError(err.message || 'Failed to update tenant commercial controls');
    } finally {
      setCommercialBusy(false);
    }
  }

  async function refreshMemberships() {
    setMembershipsLoading(true);
    try {
      const response = await apiFetch('/admin/platform/memberships');
      setMemberships(response);
    } finally {
      setMembershipsLoading(false);
    }
  }

  async function refreshRevenue() {
    setRevenueLoading(true);
    try {
      const response = await apiFetch('/admin/platform/revenue');
      setRevenue(response);
    } finally {
      setRevenueLoading(false);
    }
  }

  if (!meReady) {
    return <PlatformShell><div className="card">Loading platform access...</div></PlatformShell>;
  }

  if (!allowed) {
    return (
      <PlatformShell>
        <div className="card" data-testid="platform-admin-forbidden">
          <h2 style={{ marginTop: 0 }}>Platform admin access required</h2>
          <p className="muted" style={{ marginBottom: 0 }}>
            This internal surface is separate from the customer product and is only available to MyTitan platform admins.
          </p>
        </div>
      </PlatformShell>
    );
  }

  return (
    <PlatformShell>
      <div className="platform-admin-page">
        {error ? <div className="card platform-admin-alert" style={{ marginBottom: 16 }}>{error}</div> : null}

        <section className="platform-admin-hero card" data-testid="platform-admin-overview">
          <div className="platform-admin-hero__copy">
            <span className="platform-admin-eyebrow">
              <IconBadge icon="control" tone="info" size="sm" />
              Platform control centre
            </span>
            <h2>Support, revenue, and operational truth in one internal workspace.</h2>
            <p className="muted">
              This surface keeps tenant support decisions anchored to safe billing truth, readiness signals, and workflow pressure without exposing secrets or raw payment credentials.
            </p>
            <div className="platform-admin-hero__signal-row">
              <HeroSignal icon="growth" label="Actual revenue" value={describeRevenueAmounts(overview?.executive.actualMrrByCurrency || overview?.executive.estimatedMrrByCurrency || [])} tone="revenue" />
              <HeroSignal icon="support" label="Support attention" value={`${overview?.support.tenantsNeedingAttention || 0} tenants`} tone="warn" />
              <HeroSignal icon="system" label="Workflow pressure" value={`${overview?.system?.readiness?.workflows?.completionAcknowledgementPressure || 0} awaiting acknowledgement`} tone="danger" />
            </div>
          </div>
          <div className="platform-admin-hero__actions">
            <button className="button" type="button" onClick={() => void Promise.all([refreshOverview(), refreshMemberships(), refreshRevenue()])} disabled={overviewLoading || membershipsLoading || revenueLoading}>
              {overviewLoading || membershipsLoading || revenueLoading ? 'Refreshing...' : 'Refresh control centre'}
            </button>
            <div className="platform-admin-hero__hint muted">
              Tenants: {overview?.executive.totalActiveTenants || 0} • Attention: {overview?.support.tenantsNeedingAttention || 0}
            </div>
          </div>
          <div className="platform-admin-hero__graphic" aria-hidden="true">
            <div className="platform-admin-hero__graphic-grid">
              <span style={{ height: '42%' }} />
              <span style={{ height: '66%' }} />
              <span style={{ height: '58%' }} />
              <span style={{ height: '84%' }} />
            </div>
            <div className="platform-admin-hero__graphic-orbit" />
          </div>
        </section>

        <section id="excellence" className="platform-admin-section card" data-testid="phase17-excellence-scorecard">
          <div className="platform-admin-section__head">
            <SectionHeading
              title="Excellence evidence"
              description="Engineering Excellence is scored from objective release automation. Product Excellence is scored only from real operational evidence, and stays blocked where proof is missing."
              icon="shield"
              tone="info"
            />
            <Link className="button secondary" href="/platform/autopilot">Open Autopilot evidence</Link>
          </div>
          <div className="platform-admin-section__head">
            <SectionHeading
              title="Engineering Excellence"
              description="Objective build, test, security, performance, architecture, CI, and release-package evidence that MyTitan can automate."
              icon="system"
              tone="success"
            />
          </div>
          <div className="platform-admin-excellence-grid">
            {engineeringExcellenceScorecard.map((row) => (
              <article key={row.key} className="platform-admin-excellence-card" data-testid={`phase17-scorecard-${row.key}`}>
                <div className="platform-admin-excellence-card__head">
                  <div>
                    <strong>{row.category}</strong>
                    <p className="muted">{row.evidence}</p>
                  </div>
                  <div className="platform-admin-excellence-card__score">
                    <span>{row.score}</span>
                    <StatusPill tone="success">{row.status}</StatusPill>
                  </div>
                </div>
                <dl className="platform-admin-excellence-list">
                  <div>
                    <dt>Evidence pass</dt>
                    <dd>{row.status}</dd>
                  </div>
                  <div>
                    <dt>Evidence state</dt>
                    <dd>{row.evidenceState}</dd>
                  </div>
                  <div>
                    <dt>Owner</dt>
                    <dd>{row.owner}</dd>
                  </div>
                  <div>
                    <dt>Date checked</dt>
                    <dd>{row.dateChecked}</dd>
                  </div>
                  <div>
                    <dt>Evidence attached</dt>
                    <dd>
                      <ul>
                        {row.evidenceAttached.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </dd>
                  </div>
                  <div>
                    <dt>Missing evidence</dt>
                    <dd>
                      <ul>
                        {row.missingEvidence.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </dd>
                  </div>
                  <div>
                    <dt>10/10 gate</dt>
                    <dd>{row.tenOutOfTenBlocked ? 'Blocked while critical evidence is missing; this scorecard must not show 10/10.' : 'Eligible only when all critical evidence is attached.'}</dd>
                  </div>
                  <div>
                    <dt>Route/file/test coverage</dt>
                    <dd>{row.coverage}</dd>
                  </div>
                  <div>
                    <dt>Remaining weakness</dt>
                    <dd>{row.remainingWeakness}</dd>
                  </div>
                  <div>
                    <dt>Required fix</dt>
                    <dd>{row.requiredFix}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
          <div className="platform-admin-section__head">
            <SectionHeading
              title="Product Excellence"
              description="Operational and real-world usage evidence only. Local automation creates collection slots but cannot prove uptime, usability, customer outcomes, revenue, or production Web Vitals."
              icon="workspace"
              tone="warn"
            />
          </div>
          <div className="platform-admin-excellence-grid" data-testid="phase19-product-excellence-scorecard">
            {productExcellenceScorecard.map((row) => (
              <article key={row.key} className="platform-admin-excellence-card" data-testid={`phase19-product-scorecard-${row.key}`}>
                <div className="platform-admin-excellence-card__head">
                  <div>
                    <strong>{row.category}</strong>
                    <p className="muted">{row.evidence}</p>
                  </div>
                  <div className="platform-admin-excellence-card__score">
                    <span>{row.score}</span>
                    <StatusPill tone={row.status === 'Needs evidence' ? 'warn' : 'danger'}>{row.status}</StatusPill>
                  </div>
                </div>
                <dl className="platform-admin-excellence-list">
                  <div>
                    <dt>Evidence pass</dt>
                    <dd>{row.status}</dd>
                  </div>
                  <div>
                    <dt>Evidence state</dt>
                    <dd>{row.evidenceState}</dd>
                  </div>
                  <div>
                    <dt>Owner</dt>
                    <dd>{row.owner}</dd>
                  </div>
                  <div>
                    <dt>Date checked</dt>
                    <dd>{row.dateChecked}</dd>
                  </div>
                  <div>
                    <dt>Evidence attached</dt>
                    <dd>
                      <ul>
                        {row.evidenceAttached.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </dd>
                  </div>
                  <div>
                    <dt>Missing evidence</dt>
                    <dd>
                      <ul>
                        {row.missingEvidence.map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </dd>
                  </div>
                  <div>
                    <dt>10/10 gate</dt>
                    <dd>{row.tenOutOfTenBlocked ? 'Blocked while critical evidence is missing; this scorecard must not show 10/10.' : 'Eligible only when all critical evidence is attached.'}</dd>
                  </div>
                  <div>
                    <dt>Route/file/test coverage</dt>
                    <dd>{row.coverage}</dd>
                  </div>
                  <div>
                    <dt>Remaining weakness</dt>
                    <dd>{row.remainingWeakness}</dd>
                  </div>
                  <div>
                    <dt>Required fix</dt>
                    <dd>{row.requiredFix}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
          <article className="platform-admin-evidence-panel" data-testid="phase19-performance-evidence-dashboard">
            <div className="platform-admin-evidence-panel__head">
              <strong>Performance evidence dashboard</strong>
              <span>local evidence slots</span>
            </div>
            <div className="platform-admin-evidence-table">
              {[
                { label: 'TTFB', value: 'Measured only when local or production HTTP evidence is attached.', source: 'evidence/performance/latest.json' },
                { label: 'App route response times', value: 'Slot created by release evidence package; slow-route inventory requires measured run.', source: 'scripts/create-release-evidence-package.sh' },
                { label: 'API health response time', value: 'Collected from scripts/healthcheck.sh output when package is generated.', source: 'scripts/healthcheck.sh' },
                { label: 'Readiness check duration', value: 'Collected from scripts/production-readiness-check.sh output when package is generated.', source: 'scripts/production-readiness-check.sh' },
                { label: 'Core Web Vitals', value: 'Production INP, LCP, and CLS are not attached and must remain product evidence slots.', source: 'real production analytics required' },
              ].map((item) => (
                <div key={item.label} className="platform-admin-evidence-row">
                  <strong>{item.label}</strong>
                  <span>{item.source}</span>
                  <p>{item.value}</p>
                  <small>Last measured: evidence package timestamp when generated.</small>
                </div>
              ))}
            </div>
          </article>
          <div className="platform-admin-evidence-panels" data-testid="phase18-certification-evidence">
            <article className="platform-admin-evidence-panel" data-testid="phase18-workflow-quality-checklist">
              <div className="platform-admin-evidence-panel__head">
                <strong>Workflow quality checklist</strong>
                <span>{workflowQualityChecklist.length} workflows</span>
              </div>
              <div className="platform-admin-evidence-table">
                {workflowQualityChecklist.map((item) => (
                  <div key={item.workflow} className="platform-admin-evidence-row">
                    <strong>{item.workflow}</strong>
                    <span>{item.route}</span>
                    <p>{item.evidence}</p>
                    <small>{item.discovery}</small>
                  </div>
                ))}
              </div>
            </article>
            <article className="platform-admin-evidence-panel" data-testid="phase18-visual-polish-evidence">
              <div className="platform-admin-evidence-panel__head">
                <strong>Visual polish evidence</strong>
                <span>baseline support</span>
              </div>
              <ul>
                {visualEvidenceChecklist.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
            <article className="platform-admin-evidence-panel" data-testid="phase18-marketing-evidence">
              <div className="platform-admin-evidence-panel__head">
                <strong>Marketing evidence</strong>
                <span>truth gated</span>
              </div>
              <ul>
                {marketingEvidenceChecklist.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
            <article className="platform-admin-evidence-panel" data-testid="phase18-real-world-acceptance">
              <div className="platform-admin-evidence-panel__head">
                <strong>Real-world acceptance evidence slots</strong>
                <span>manual evidence only</span>
              </div>
              <ul>
                {acceptanceEvidenceSlots.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
          </div>
        </section>

        <section className="platform-admin-section platform-admin-section--executive">
          <SectionHeading
            title="Executive overview"
            description="Commercial health at a glance, grouped safely and backed by the current billing model."
            icon="growth"
            tone="revenue"
          />
          <div className="platform-admin-kpi-grid">
            <MetricCard dataTestId="platform-kpi-total-tenants" label="Active tenants" value={String(overview?.executive.totalActiveTenants || 0)} detail={`${overview?.executive.recentMovement.newTenantsLast30Days || 0} new in 30 days`} tone="info" icon="workspace" />
            <MetricCard dataTestId="platform-kpi-trials" label="Trial tenants" value={String(overview?.executive.trialTenants || 0)} detail={`${overview?.executive.recentMovement.trialEndingSoon || 0} ending soon`} tone="neutral" icon="trial" />
            <MetricCard dataTestId="platform-kpi-paid" label="Paid tenants" value={String(overview?.executive.paidTenants || 0)} detail={`${overview?.executive.recentMovement.conversionsLast30Days || 0} converted in 30 days`} tone="success" icon="billing" />
            <MetricCard dataTestId="platform-kpi-expired" label="Expired trials" value={String(overview?.executive.expiredTrials || 0)} detail={`${overview?.executive.recentMovement.cancelAtPeriodEnd || 0} cancelling at period end`} tone="warn" icon="attention" />
            <MetricCard dataTestId="platform-kpi-conversion-rate" label="Conversion rate" value={formatPercentage(overview?.executive.conversionRate || 0)} detail="Trial to paid" tone="revenue" icon="conversion" />
            <MetricCard dataTestId="platform-kpi-mrr" label="Actual MRR" value={describeRevenueAmounts(overview?.executive.actualMrrByCurrency || overview?.executive.estimatedMrrByCurrency || [])} detail="Actual revenue. Tenant customer payments excluded." tone="revenue" icon="growth" />
          </div>
          <div className="platform-admin-chart-grid">
            <ChartCard title="Tenant movement" description="New tenants, trials started, and conversions over the last six months." annotation="Growth trend" tone="revenue" icon="growth" dataTestId="platform-chart-tenant-lifecycle">
              <TripleTrendChart rows={overview?.charts.tenantLifecycle || []} />
            </ChartCard>
            <ChartCard title="Plan distribution" description="Current paid tenant mix by plan." annotation="Current mix" tone="info" icon="billing" dataTestId="platform-chart-plan-distribution">
              <HorizontalBarChart rows={(overview?.charts.planDistribution || []).map((row) => ({ label: row.planName, value: row.count }))} tone="info" />
            </ChartCard>
            <ChartCard title="Conversion funnel" description="Stage counts from the current authoritative trial flow." annotation="Trial to paid" tone="success" icon="conversion" dataTestId="platform-chart-conversion-funnel">
              <FunnelChart rows={overview?.charts.conversionFunnel || []} />
            </ChartCard>
            <ChartCard title="MRR by currency" description="Never mixed across currencies." annotation="Grouped safely" tone="revenue" icon="growth" dataTestId="platform-chart-mrr-by-currency">
              <CurrencyBarChart rows={overview?.charts.mrrByCurrency || []} />
            </ChartCard>
          </div>
        </section>

        <section id="support" className="platform-admin-section platform-admin-section--support" data-testid="platform-support-operations">
          <SectionHeading
            title="Customer service and support"
            description="Who needs help, what is blocked, and what support should do next."
            icon="support"
            tone="warn"
          />
          <div className="platform-admin-kpi-grid">
            <MetricCard dataTestId="platform-support-attention" label="Tenants needing attention" value={String(overview?.support.tenantsNeedingAttention || 0)} detail="Any active support issue" tone="warn" icon="attention" />
            <MetricCard dataTestId="platform-support-unverified" label="Unverified owners" value={String(overview?.support.unverifiedOwners || 0)} detail="Workspace owner action needed" tone="danger" icon="shield" />
            <MetricCard dataTestId="platform-support-billing-blocked" label="Billing-blocked" value={String(overview?.support.billingBlockedTenants || 0)} detail="Trial or subscription action needed" tone="danger" icon="billing" />
            <MetricCard dataTestId="platform-support-email" label="Email issues" value={String(overview?.support.emailReadinessIssues || 0)} detail="Cannot send reliably yet" tone="warn" icon="mail" />
            <MetricCard dataTestId="platform-support-send-failures" label="Recent send failures" value={String(overview?.support.recentSendFailures || 0)} detail="Authoritative last 7 days" tone="warn" icon="support" />
            <MetricCard dataTestId="platform-support-friction" label="Operational friction" value={String(overview?.support.operationalFrictionTenants || 0)} detail="Workflow or integration pressure" tone="neutral" icon="system" />
          </div>
          <div className="platform-admin-chart-grid platform-admin-chart-grid--support">
            <ChartCard title="Issue categories" description="The biggest support drivers across tenants right now." annotation="Current pressure" tone="warn" icon="attention" dataTestId="platform-chart-issue-categories">
              <HorizontalBarChart rows={(overview?.charts.issueCategories || []).map((row) => ({ label: row.label, value: row.count }))} tone="warn" />
            </ChartCard>
            <div className="card platform-admin-card-stack platform-admin-card-stack--support">
              <div>
                <div className="platform-admin-card-heading">
                  <IconBadge icon="support" tone="warn" />
                  <strong>Tenants needing action</strong>
                </div>
                <p className="muted">Support-ready summaries with the next recommended action and a safe path into tenant detail.</p>
              </div>
              <div className="platform-admin-attention-list" data-testid="platform-tenant-attention-list">
                {(overview?.support.attentionTenants || []).map((row) => (
                  <article key={row.tenantId} className={`platform-admin-attention-card ${row.billingBlocked || !row.ownerEmailVerified ? 'platform-admin-attention-card--critical' : row.issueCount >= 4 ? 'platform-admin-attention-card--warn' : 'platform-admin-attention-card--info'}`}>
                    <div className="platform-admin-attention-card__top">
                      <div>
                        <strong>{row.tenantName}</strong>
                        <div className="muted">{row.ownerEmail || 'No owner email'} • {row.planName}</div>
                      </div>
                      <StatusPill tone={row.billingBlocked || !row.ownerEmailVerified ? 'danger' : row.issueCount >= 4 ? 'warn' : 'neutral'}>{row.issueCount} issue{row.issueCount === 1 ? '' : 's'}</StatusPill>
                    </div>
                    <div className="platform-admin-chip-row">
                      {row.issues.slice(0, 4).map((issue) => <span key={issue} className="platform-admin-chip">{issue}</span>)}
                    </div>
                    <p className="platform-admin-attention-card__action">{row.nextAction}</p>
                    <div className="platform-admin-attention-card__meta muted">
                      {humanizeEmailState(row.emailState)} • {humanizeState(row.integrationState)} • {row.cancelAtPeriodEnd ? 'Cancels at period end' : 'Continuing'}
                    </div>
                    <div className="button-row">
                      <Link className="button" data-testid={`platform-attention-open-tenant-360-${row.tenantId}`} href={`/platform/tenants/${encodeURIComponent(row.tenantId)}`}>Open Tenant 360</Link>
                      <Link className="button secondary" data-testid={`platform-attention-edit-commercials-${row.tenantId}`} href={`/platform/tenants/${encodeURIComponent(row.tenantId)}#commercial`}>Edit Commercials</Link>
                      <button className="button secondary" type="button" data-testid={`platform-attention-start-support-${row.tenantId}`} onClick={() => focusTenant(row.tenantId)}>Start Support Mode</button>
                      <Link className="button secondary" data-testid={`platform-attention-view-audit-${row.tenantId}`} href={`/platform/tenants/${encodeURIComponent(row.tenantId)}#audit`}>View Audit</Link>
                    </div>
                  </article>
                ))}
                {!(overview?.support.attentionTenants || []).length ? <p className="muted" style={{ marginBottom: 0 }}>No tenants need support action right now.</p> : null}
              </div>
            </div>
          </div>
        </section>

        <section id="revenue" className="platform-admin-section platform-admin-section--revenue card" data-testid="platform-revenue-dashboard">
          <div className="platform-admin-section__head">
            <SectionHeading
              title="Revenue and subscription monitoring"
              description="Actual MyTitan subscription and job-pack revenue only. Forecasts stay separate, and tenant customer payments are excluded."
              icon="billing"
              tone="revenue"
            />
            <button className="button secondary" type="button" onClick={() => void refreshRevenue()} disabled={revenueLoading}>
              {revenueLoading ? 'Refreshing...' : 'Refresh revenue'}
            </button>
          </div>
          <div className="platform-admin-kpi-grid">
            <MetricCard dataTestId="platform-revenue-trials" label="Trial workspaces" value={String(revenue?.totals.totalTrialWorkspaces || 0)} tone="neutral" icon="trial" />
            <MetricCard dataTestId="platform-revenue-paid" label="Active paid" value={String(revenue?.totals.activePaidWorkspaces || 0)} tone="success" icon="billing" />
            <MetricCard dataTestId="platform-revenue-expired" label="Expired trials" value={String(revenue?.totals.expiredTrials || 0)} tone="warn" icon="attention" />
            <MetricCard dataTestId="platform-revenue-conversions" label="Conversions" value={String(revenue?.totals.conversionCount || 0)} tone="revenue" icon="conversion" />
            <MetricCard dataTestId="platform-revenue-rate" label="Conversion rate" value={formatPercentage(revenue?.totals.conversionRate || 0)} tone="revenue" icon="growth" />
            <MetricCard dataTestId="platform-revenue-clicks" label="Lifecycle clicks" value={String(revenue?.totals.lifecycleEmailClicks || 0)} tone="info" icon="mail" />
            <MetricCard dataTestId="platform-revenue-lifecycle-conversions" label="Lifecycle-attributed" value={String(revenue?.totals.lifecycleEmailConversions || 0)} tone="success" icon="growth" />
            <MetricCard dataTestId="platform-revenue-mrr" label="Actual MRR" value={describeRevenueAmounts(revenue?.totals.actualMonthlyRecurringRevenueByCurrency || revenue?.totals.estimatedMonthlyRecurringRevenueByCurrency || [])} detail="Actual revenue. Tenant customer payments excluded." tone="revenue" icon="growth" />
            <MetricCard dataTestId="platform-revenue-arr" label="Actual ARR" value={describeRevenueAmounts(revenue?.totals.actualAnnualRecurringRevenueByCurrency || revenue?.totals.estimatedAnnualRecurringRevenueByCurrency || [])} detail="Actual revenue only." tone="revenue" icon="growth" />
            <MetricCard dataTestId="platform-revenue-paused" label="Paused subscriptions" value={String(revenue?.totals.pausedSubscriptions || 0)} tone="warn" icon="attention" />
            <MetricCard dataTestId="platform-revenue-churned" label="Churned tenants" value={String(revenue?.totals.churnedTenants || 0)} tone="warn" icon="attention" />
            <MetricCard dataTestId="platform-revenue-custom-price" label="Custom-price tenants" value={String(revenue?.totals.customPriceTenants || 0)} tone="info" icon="billing" />
            <MetricCard dataTestId="platform-revenue-discounted" label="Discounted tenants" value={String(revenue?.totals.discountedTenants || 0)} tone="info" icon="billing" />
            <MetricCard dataTestId="platform-revenue-allowance-adjusted" label="Allowance-adjusted" value={String(revenue?.totals.allowanceAdjustedTenants || 0)} tone="neutral" icon="workspace" />
            <MetricCard dataTestId="platform-revenue-job-packs" label="Actual job-pack revenue" value={describeRevenueAmounts(revenue?.totals.actualJobPackRevenueByCurrency || revenue?.totals.jobPackRevenueByCurrency || [])} detail="Paid MyTitan job-pack purchases only." tone="success" icon="billing" />
            <MetricCard dataTestId="platform-revenue-overdue" label="Overdue / failed billing" value={String(revenue?.totals.overdueOrFailedBilling || 0)} tone="warn" icon="attention" />
            <MetricCard dataTestId="platform-revenue-forecast" label="Forecast" value={describeRevenueAmounts(revenue?.totals.forecastedMonthlyRevenueByCurrency || [])} detail={revenue?.movement?.forecastBasis || 'Current active run-rate only'} tone="revenue" icon="growth" />
          </div>
          <div className="platform-admin-chart-grid">
            <div className="card platform-admin-card-stack platform-admin-card-stack--analytic" data-testid="platform-revenue-by-tier">
              <div>
                <div className="platform-admin-card-heading">
                  <IconBadge icon="billing" tone="revenue" />
                  <strong>Active subscriptions by tier</strong>
                </div>
                <p className="muted">Current paid distribution across commercial plans.</p>
              </div>
              <HorizontalBarChart rows={(revenue?.activeSubscriptionsByTier || []).map((tier) => ({ label: tier.planName, value: tier.count }))} tone="revenue" />
            </div>
            <div className="card platform-admin-card-stack platform-admin-card-stack--analytic">
              <div>
                <div className="platform-admin-card-heading">
                  <IconBadge icon="growth" tone="revenue" />
                  <strong>Revenue workflow signals</strong>
                </div>
                <p className="muted">Checkout and portal readiness from the current platform setup.</p>
              </div>
              <div className="platform-admin-signal-grid">
                <SignalCard label="Checkout-ready tenants" value={String(overview?.revenue?.checkoutReadyTenants || 0)} icon="billing" tone="success" />
                <SignalCard label="Portal-ready tenants" value={String(overview?.revenue?.portalReadyTenants || 0)} icon="workspace" tone="info" />
                <SignalCard label="Cancelling at period end" value={String(overview?.revenue?.cancelAtPeriodEnd || 0)} icon="attention" tone="warn" />
                <SignalCard label="Lifecycle conversions" value={String(overview?.revenue?.lifecycleEmails?.conversions || 0)} icon="conversion" tone="revenue" />
              </div>
            </div>
            <div className="card platform-admin-card-stack platform-admin-card-stack--system" data-testid="platform-stripe-alignment">
              <div>
                <div className="platform-admin-card-heading">
                  <IconBadge icon="shield" tone="info" />
                  <strong>Stripe alignment</strong>
                </div>
                <p className="muted">Presence-only billing configuration checks for the shared billing stack.</p>
              </div>
              <div className="platform-admin-list">
                <p className="muted">Server billing key: {revenue?.stripeAlignment.stripeConfigured ? 'configured' : 'missing'}</p>
                <p className="muted">Backend key type: {humanizeStripeKeyType(revenue?.stripeAlignment.backendKeyType || 'missing')}</p>
                <p className="muted">Webhook secret: {revenue?.stripeAlignment.webhookSecretConfigured ? 'configured' : 'missing'}</p>
                <p className="muted">Billing return URL: {revenue?.stripeAlignment.billingReturnUrlConfigured ? 'configured' : 'missing'}</p>
                <p className="muted">Publishable key used by app: {revenue?.stripeAlignment.publishableKeyUsedByApp ? 'yes' : 'no'}</p>
                <p className="muted">Publishable key configured: {revenue?.stripeAlignment.publishableKeyConfigured ? 'yes' : 'no'}</p>
                <p className="muted">Portal config IDs used: {revenue?.stripeAlignment.portalConfigurationIdUsed ? 'yes' : 'no'}</p>
                <p className="muted">Product ID envs used: {(revenue?.stripeAlignment.productIdEnvNamesUsed || []).length}</p>
                <p className="muted">Price envs configured: {(revenue?.stripeAlignment.configuredPriceEnvNames || []).length}</p>
                <p className="muted">Missing config names: {(revenue?.stripeAlignment.missingConfigNames || []).join(', ') || 'None'}</p>
              </div>
            </div>
          </div>
        </section>

        <section id="system" className="platform-admin-section platform-admin-section--system" data-testid="platform-system-monitoring">
          <SectionHeading
            title="System and workflow monitoring"
            description="Platform readiness, workflow pressure, and operational queues that support should see before triaging a tenant."
            icon="system"
            tone="info"
          />
          <div className="platform-admin-kpi-grid">
            <MetricCard dataTestId="platform-system-integrations" label="Integrations ready" value={String(overview?.system?.readiness?.integrations?.connected || 0)} detail={`${overview?.system?.readiness?.integrations?.needsAttention || 0} need attention`} tone="success" icon="system" />
            <MetricCard dataTestId="platform-system-email" label="Email ready" value={String(overview?.system?.readiness?.email?.ready || 0)} detail={`${overview?.system?.readiness?.email?.needsAttention || 0} need attention`} tone="success" icon="mail" />
            <MetricCard dataTestId="platform-system-payments" label="Payments ready" value={String(overview?.system?.readiness?.payments?.ready || 0)} detail={`${overview?.system?.readiness?.payments?.blocked || 0} blocked`} tone="info" icon="billing" />
            <MetricCard dataTestId="platform-system-ack" label="Awaiting acknowledgement" value={String(overview?.system?.readiness?.workflows?.completionAcknowledgementPressure || 0)} detail="Completion pressure" tone="danger" icon="attention" />
            <MetricCard dataTestId="platform-system-compliance" label="Compliance queue" value={String(overview?.system?.readiness?.workflows?.complianceQueue || 0)} detail="Open exceptions" tone="warn" icon="shield" />
            <MetricCard dataTestId="platform-system-sla" label="Breached SLAs" value={String(overview?.system?.readiness?.workflows?.breachedSlas || 0)} detail="Needs follow-through" tone="warn" icon="support" />
          </div>
          <div className="platform-admin-kpi-grid" style={{ marginTop: 16 }} data-testid="platform-health-traffic-cards">
            <MetricCard
              dataTestId="platform-uptime-availability-card"
              label="Internal platform health"
              value={overview?.system?.internalMonitoring?.overall?.label || 'Unknown'}
              detail={`${overview?.system?.internalMonitoring?.overall?.availabilityPercentage ?? 0}% recorded availability`}
              tone={overview?.system?.internalMonitoring?.overall?.state === 'healthy' ? 'success' : 'warn'}
              icon="system"
            />
            <MetricCard
              dataTestId="platform-website-visits-card"
              label="Website visits"
              value={String(overview?.system?.traffic?.visitsToday || 0)}
              detail={`${overview?.system?.traffic?.visitsLast7Days || 0} in 7 days`}
              tone="info"
              icon="growth"
            />
            <MetricCard
              dataTestId="platform-public-reachability-card"
              label="Public reachability"
              value={String(overview?.system?.internalMonitoring?.services?.filter((service: any) => ['app', 'api', 'marketing'].includes(service.key) && service.state === 'healthy').length || 0)}
              detail="App, API, marketing checks"
              tone="info"
              icon="system"
            />
            <MetricCard
              dataTestId="platform-email-health-card"
              label="Email sending health"
              value={overview?.system?.internalMonitoring?.services?.find((service: any) => service.key === 'notification-routing')?.state === 'healthy' ? 'Ready' : 'Needs attention'}
              detail={overview?.system?.internalMonitoring?.services?.find((service: any) => service.key === 'notification-routing')?.summary || 'Routing verify unavailable'}
              tone={overview?.system?.internalMonitoring?.services?.find((service: any) => service.key === 'notification-routing')?.state === 'healthy' ? 'success' : 'warn'}
              icon="mail"
            />
            <MetricCard
              dataTestId="platform-billing-sync-card"
              label="Billing/catalog sync"
              value={overview?.system?.internalMonitoring?.services?.find((service: any) => service.key === 'billing')?.state === 'healthy' ? 'Ready' : 'Needs setup'}
              detail={overview?.system?.internalMonitoring?.services?.find((service: any) => service.key === 'job-packs')?.summary || 'Job-pack dry-run unavailable'}
              tone={overview?.system?.internalMonitoring?.services?.find((service: any) => service.key === 'billing')?.state === 'healthy' ? 'success' : 'warn'}
              icon="billing"
            />
          </div>
          <details className="card platform-admin-card-stack platform-admin-card-stack--system" style={{ marginTop: 16 }} data-testid="platform-health-advanced-details">
            <summary><strong>Advanced internal health details</strong></summary>
            <p className="muted">Recorded by MyTitan from this environment. This is not a global external uptime claim.</p>
            <div className="platform-admin-list">
              <div>Last checked: {formatDateTime(overview?.system?.internalMonitoring?.checkedAt)}</div>
              <div>History: {overview?.system?.internalMonitoring?.historyWindow?.summary || 'No recorded internal history yet.'}</div>
              <div>
                External monitor: {overview?.system?.internalMonitoring?.externalMonitoring?.status === 'not_configured' || !overview?.system?.internalMonitoring?.externalMonitoring?.status
                  ? 'External monitor intentionally deferred.'
                  : overview?.system?.internalMonitoring?.externalMonitoring?.summary}
              </div>
              <div>Unique anonymous sessions: {overview?.system?.traffic?.uniqueAnonymousSessions || 0}</div>
              <div>Public booking visits: {overview?.system?.traffic?.surfaces?.publicBooking || 0}</div>
              <div>Customer workspace visits: {overview?.system?.traffic?.surfaces?.customerWorkspace || 0}</div>
            </div>
          </details>
          <div className="platform-admin-chart-grid platform-admin-chart-grid--system">
            <div className="card platform-admin-card-stack platform-admin-card-stack--system">
              <div>
                <div className="platform-admin-card-heading">
                  <IconBadge icon="system" tone="info" />
                  <strong>Readiness mix</strong>
                </div>
                <p className="muted">Platform readiness across integrations, email, and payments.</p>
              </div>
              <div className="platform-admin-readiness-grid">
                <ReadinessPanel
                  title="Integrations"
                  rows={[
                    { label: 'Connected', value: overview?.system?.readiness?.integrations?.connected || 0 },
                    { label: 'Need attention', value: overview?.system?.readiness?.integrations?.needsAttention || 0 },
                    { label: 'Disabled', value: overview?.system?.readiness?.integrations?.disabled || 0 },
                  ]}
                />
                <ReadinessPanel
                  title="Email"
                  rows={[
                    { label: 'Ready', value: overview?.system?.readiness?.email?.ready || 0 },
                    { label: 'Need attention', value: overview?.system?.readiness?.email?.needsAttention || 0 },
                    { label: 'Shared system ready', value: overview?.system?.readiness?.email?.systemConfigured ? 1 : 0 },
                  ]}
                />
                <ReadinessPanel
                  title="Payments"
                  rows={[
                    { label: 'Ready', value: overview?.system?.readiness?.payments?.ready || 0 },
                    { label: 'Blocked', value: overview?.system?.readiness?.payments?.blocked || 0 },
                    { label: 'Disabled', value: overview?.system?.readiness?.payments?.disabled || 0 },
                  ]}
                />
              </div>
            </div>
            <div className="card platform-admin-card-stack platform-admin-card-stack--support">
              <div>
                <div className="platform-admin-card-heading">
                  <IconBadge icon="attention" tone="warn" />
                  <strong>Attention queue</strong>
                </div>
                <p className="muted">Current issue categories and internal pressure points worth escalating.</p>
              </div>
              <div className="platform-admin-queue-list">
                {(overview?.system?.attentionQueue || []).map((item) => (
                  <a key={item.key} href={item.href} className="platform-admin-queue-item">
                    <div>
                      <strong>{item.label}</strong>
                      <div className="muted">{item.count} live</div>
                    </div>
                    <span className="platform-admin-queue-count">
                      <IconGlyph icon="attention" />
                      {item.count}
                    </span>
                  </a>
                ))}
                {!(overview?.system?.attentionQueue || []).length ? <p className="muted" style={{ marginBottom: 0 }}>No platform-wide workflow queue is elevated right now.</p> : null}
              </div>
            </div>
          </div>
        </section>

        <section className="platform-admin-section card" data-testid="phase6-platform-customer-success-observability">
          <div className="platform-admin-section__head">
            <div className="platform-admin-section-copy">
              <div className="platform-admin-section-copy__eyebrow">Phase 6 control</div>
              <h2>Customer success and internal observability</h2>
              <p>
                Platform-only view for onboarding health, customer success triage, internal queues, sync health, job-pack sync, backups, and sanitized error trends.
                Tenant operational records stay closed unless timed support mode is active and audited.
              </p>
            </div>
            <a className="button secondary" href="#system">Open system monitoring</a>
          </div>
          <div className="platform-admin-kpi-grid" style={{ marginTop: 16 }}>
            <MetricCard dataTestId="phase6-success-health-score" label="Tenant health score" value={`${Math.max(0, 100 - ((overview?.support.tenantsNeedingAttention || 0) * 10))}%`} detail="Derived from safe platform overview counts" tone="success" icon="support" />
            <MetricCard dataTestId="phase6-success-onboarding" label="Onboarding progress" value={`${overview?.executive.trialTenants || 0} trials`} detail={`${overview?.support.operationalFrictionTenants || 0} with setup friction`} tone="info" icon="trial" />
            <MetricCard dataTestId="phase6-success-adoption" label="Feature adoption" value={`${overview?.revenue.portalReadyTenants || 0} portal-ready`} detail={`${overview?.revenue.checkoutReadyTenants || 0} checkout-ready`} tone="revenue" icon="growth" />
            <MetricCard dataTestId="phase6-success-churn-risk" label="Churn risk" value={`${overview?.executive.recentMovement.cancelAtPeriodEnd || 0}`} detail="Cancel-at-period-end tenants" tone="warn" icon="attention" />
          </div>
          <div className="platform-admin-chart-grid platform-admin-chart-grid--system" style={{ marginTop: 16 }}>
            <div className="card platform-admin-card-stack platform-admin-card-stack--support" data-testid="phase6-customer-success-tooling">
              <div className="platform-admin-card-heading">
                <IconBadge icon="support" tone="info" />
                <strong>Customer success tooling</strong>
              </div>
              <div className="platform-admin-list">
                {phase6CustomerSuccessSignals.map((item) => (
                  <div key={item.key} data-testid={`phase6-success-${item.key}`}>
                    <strong>{item.label}</strong>
                    <p className="muted">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="card platform-admin-card-stack platform-admin-card-stack--system" data-testid="phase6-internal-observability">
              <div className="platform-admin-card-heading">
                <IconBadge icon="system" tone="info" />
                <strong>Internal observability without external monitor</strong>
              </div>
              <p className="muted">No external uptime monitor is configured or required. This view uses platform-owned internal signals only.</p>
              <div className="platform-admin-list">
                {phase6ObservabilitySignals.map((item) => (
                  <div key={item.key} data-testid={`phase6-observability-${item.key}`}>
                    <strong>{item.label}</strong>
                    <p className="muted">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="platform-admin-section card" data-testid="platform-deferred-capability-register">
          <div className="platform-admin-section__head">
            <div className="platform-admin-section-copy">
              <div className="platform-admin-section-copy__eyebrow">Backend admin only</div>
              <h2>Deferred capability register</h2>
              <p>Partial, provider-dependent, legal-review, certification, and infrastructure work is owned here and is never presented to tenant users as live.</p>
            </div>
          </div>
          <div className="platform-admin-attention-list" style={{ marginTop: 16 }}>
            {deferredCapabilityRegister.map((item) => (
              <article key={item.capability} className="platform-admin-attention-card">
                <div className="platform-admin-attention-card__top">
                  <strong>{item.capability}</strong>
                  <StatusPill tone="warn">deferred</StatusPill>
                </div>
                <p className="muted"><strong>Reason:</strong> {item.reason}</p>
                <p className="muted"><strong>Owner:</strong> {item.owner}</p>
                <p className="muted" style={{ marginBottom: 0 }}><strong>Next action:</strong> {item.nextAction}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="platform-admin-section card" data-testid="platform-template-review" {...getSectionProps('template-review')}>
          <div className="platform-admin-section__head">
            <div className="platform-admin-section-copy">
              <div className="platform-admin-section-copy__eyebrow">Template review</div>
              <h2>Shared job-sheet submissions</h2>
              <p>Curate tenant-submitted job sheets with a calmer editorial workflow: preview, compare, publish, archive, and keep moderation history visible.</p>
            </div>
            <button className="button secondary" type="button" onClick={() => void refreshTemplateQueue()} disabled={templateQueueLoading}>
              {templateQueueLoading ? 'Refreshing…' : 'Refresh queue'}
            </button>
          </div>
          <div className="platform-admin-kpi-grid" style={{ marginTop: 16 }}>
            <MetricCard dataTestId="platform-template-submitted-count" label="Submitted" value={String(templateQueue?.summary?.submitted || 0)} tone="warn" icon="workspace" />
            <MetricCard dataTestId="platform-template-approved-count" label="Approved" value={String(templateQueue?.summary?.approved || 0)} tone="success" icon="workspace" />
            <MetricCard dataTestId="platform-template-needs-changes-count" label="Needs changes" value={String(templateQueue?.summary?.needsChanges || 0)} tone="info" icon="attention" />
            <MetricCard dataTestId="platform-template-published-count" label="Published" value={String(templateQueue?.summary?.published || 0)} tone="neutral" icon="workspace" />
          </div>
          <div className="two-col" style={{ marginTop: 16, alignItems: 'start' }}>
            <div className="platform-admin-attention-list">
              {(templateQueue?.templates || []).slice(0, 16).map((template: any) => (
                <button
                  key={template.id}
                  type="button"
                  className="platform-admin-attention-card"
                  data-testid={`platform-template-${template.id}`}
                  style={{ textAlign: 'left', width: '100%' }}
                  onClick={() => setSelectedTemplateReviewId(template.id)}
                >
                  <div className="platform-admin-attention-card__top">
                    <strong>{template.name}</strong>
                    <StatusPill tone={template.status === 'approved' ? 'success' : template.status === 'submitted' ? 'warn' : 'info'}>
                      {template.status}
                    </StatusPill>
                  </div>
                  <p className="muted" style={{ marginTop: 8 }}>{template.description || template.metadata?.editorialTone || 'No description provided.'}</p>
                  <div className="platform-admin-chip-row">
                    <span className="platform-admin-chip">{template.tradeCategory}</span>
                    <span className="platform-admin-chip">{template.isPublished ? 'published' : 'not live'}</span>
                    <span className="platform-admin-chip">{template.rollbackVisibility ? 'rollback visible' : 'single version'}</span>
                  </div>
                </button>
              ))}
            </div>
            {selectedTemplateReview ? (() => {
              const reviewDraft = templateReviewDrafts[selectedTemplateReview.id] || {};
              return (
                <div className="card platform-admin-card-stack platform-admin-card-stack--system" data-testid="platform-template-preview-panel">
                  <div className="platform-admin-card-heading">
                    <div>
                      <strong>{selectedTemplateReview.name}</strong>
                      <p className="muted" style={{ margin: '6px 0 0 0' }}>{selectedTemplateReview.metadata?.editorialTone || selectedTemplateReview.description || 'Preview ready.'}</p>
                    </div>
                    <StatusPill tone={selectedTemplateReview.isPublished ? 'success' : 'warn'}>
                      {selectedTemplateReview.isPublished ? 'published' : 'not live'}
                    </StatusPill>
                  </div>
                  <div className="platform-admin-chip-row">
                    <span className="platform-admin-chip">{selectedTemplateReview.tradeCategory}</span>
                    <span className="platform-admin-chip">{selectedTemplateReview.metadata?.estimatedSetupMinutes || 10} min setup</span>
                    <span className="platform-admin-chip">{selectedTemplateReview.metadata?.setupComplexity || 'balanced'}</span>
                  </div>
                  <div className="two-col" style={{ marginTop: 12 }}>
                    <div>
                      <label>Best for</label>
                      <input className="input" value={reviewDraft.bestFor ?? (selectedTemplateReview.metadata?.bestFor || []).join(', ')} onChange={(event) => setTemplateReviewDrafts((current) => ({ ...current, [selectedTemplateReview.id]: { ...reviewDraft, bestFor: event.target.value } }))} />
                    </div>
                    <div>
                      <label>Workflow tags</label>
                      <input className="input" value={reviewDraft.workflowTags ?? (selectedTemplateReview.metadata?.workflowTags || []).join(', ')} onChange={(event) => setTemplateReviewDrafts((current) => ({ ...current, [selectedTemplateReview.id]: { ...reviewDraft, workflowTags: event.target.value } }))} />
                    </div>
                    <div>
                      <label>Estimated setup minutes</label>
                      <input className="input" value={reviewDraft.estimatedSetupMinutes ?? selectedTemplateReview.metadata?.estimatedSetupMinutes ?? ''} onChange={(event) => setTemplateReviewDrafts((current) => ({ ...current, [selectedTemplateReview.id]: { ...reviewDraft, estimatedSetupMinutes: event.target.value } }))} />
                    </div>
                    <div>
                      <label>Setup complexity</label>
                      <select className="input" value={reviewDraft.setupComplexity ?? selectedTemplateReview.metadata?.setupComplexity ?? 'balanced'} onChange={(event) => setTemplateReviewDrafts((current) => ({ ...current, [selectedTemplateReview.id]: { ...reviewDraft, setupComplexity: event.target.value } }))}>
                        <option value="fast">Fast</option>
                        <option value="balanced">Balanced</option>
                        <option value="advanced">Advanced</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <label>Editorial note</label>
                    <textarea className="input" rows={3} value={reviewDraft.editorialTone ?? selectedTemplateReview.metadata?.editorialTone ?? ''} onChange={(event) => setTemplateReviewDrafts((current) => ({ ...current, [selectedTemplateReview.id]: { ...reviewDraft, editorialTone: event.target.value } }))} />
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <label>Customer-facing summary</label>
                    <textarea className="input" rows={3} value={reviewDraft.customerFacingSummary ?? selectedTemplateReview.metadata?.customerFacingSummary ?? ''} onChange={(event) => setTemplateReviewDrafts((current) => ({ ...current, [selectedTemplateReview.id]: { ...reviewDraft, customerFacingSummary: event.target.value } }))} />
                  </div>
                  <div className="two-col" style={{ marginTop: 12 }}>
                    <div className="platform-admin-list">
                      <strong>Preview mode</strong>
                      <div>{(selectedTemplateReview?.payload?.serviceTypes || []).length} service types</div>
                      <div>{(selectedTemplateReview?.payload?.sections || []).length} sections</div>
                      <div>{(selectedTemplateReview?.payload?.fields || []).length} fields</div>
                    </div>
                    <div className="platform-admin-list">
                      <strong>Side-by-side comparison</strong>
                      <div>Operator structure: {(selectedTemplateReview?.payload?.sections || []).slice(0, 3).map((section: any) => section.title).join(' • ') || 'No sections'}</div>
                      <div>Customer summary: {(selectedTemplateReview.metadata?.customerFacingSummary || 'Not yet refined')}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <label>Approval notes</label>
                    <textarea className="input" rows={2} value={reviewDraft.approvalNotes ?? selectedTemplateReview.approvalNotes ?? ''} onChange={(event) => setTemplateReviewDrafts((current) => ({ ...current, [selectedTemplateReview.id]: { ...reviewDraft, approvalNotes: event.target.value } }))} />
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <label>Review notes</label>
                    <textarea className="input" rows={2} value={reviewDraft.reviewNotes ?? selectedTemplateReview.reviewNotes ?? ''} onChange={(event) => setTemplateReviewDrafts((current) => ({ ...current, [selectedTemplateReview.id]: { ...reviewDraft, reviewNotes: event.target.value } }))} />
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
                    <label><input type="checkbox" checked={reviewDraft.publish ?? selectedTemplateReview.isPublished} onChange={(event) => setTemplateReviewDrafts((current) => ({ ...current, [selectedTemplateReview.id]: { ...reviewDraft, publish: event.target.checked } }))} /> Publish</label>
                    <label><input type="checkbox" checked={reviewDraft.archive ?? selectedTemplateReview.isArchived} onChange={(event) => setTemplateReviewDrafts((current) => ({ ...current, [selectedTemplateReview.id]: { ...reviewDraft, archive: event.target.checked } }))} /> Archive</label>
                    <label><input type="checkbox" checked={reviewDraft.featured ?? selectedTemplateReview.metadata?.featured ?? false} onChange={(event) => setTemplateReviewDrafts((current) => ({ ...current, [selectedTemplateReview.id]: { ...reviewDraft, featured: event.target.checked } }))} /> Featured</label>
                    <label><input type="checkbox" checked={reviewDraft.premiumStarter ?? selectedTemplateReview.metadata?.premiumStarter ?? false} onChange={(event) => setTemplateReviewDrafts((current) => ({ ...current, [selectedTemplateReview.id]: { ...reviewDraft, premiumStarter: event.target.checked } }))} /> Premium starter</label>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    <button className="button secondary" type="button" onClick={() => void reviewTemplate(selectedTemplateReview.id, 'approved')}>Approve</button>
                    <button className="button secondary" type="button" onClick={() => void reviewTemplate(selectedTemplateReview.id, 'needs_changes')}>Needs changes</button>
                    <button className="button secondary" type="button" onClick={() => void reviewTemplate(selectedTemplateReview.id, 'rejected')}>Reject</button>
                  </div>
                  <div className="platform-admin-list" style={{ marginTop: 12 }} data-testid="platform-template-history">
                    <strong>Moderation history</strong>
                    {((selectedTemplateReview.metadata?.moderationHistory || []) as any[]).slice(0, 6).map((entry: any, index: number) => (
                      <div key={`${entry.createdAt}-${index}`}>{entry.action} · {entry.toStatus || entry.fromStatus || 'state'} · {new Date(entry.createdAt).toLocaleString()}</div>
                    ))}
                    {!(selectedTemplateReview.metadata?.moderationHistory || []).length ? <div>No moderation history recorded yet.</div> : null}
                  </div>
                </div>
              );
            })() : null}
          </div>
        </section>

        <section className="platform-admin-section card" data-testid="platform-billing-catalog-admin" {...getSectionProps('billing-catalog')}>
          <div className="platform-admin-section__head">
            <div className="platform-admin-section-copy">
              <div className="platform-admin-section-copy__eyebrow">Billing catalog</div>
              <h2>Platform product catalog</h2>
              <p>Validate subscription and job-pack Stripe mappings safely, keep identifiers masked by default, and audit every catalog change.</p>
            </div>
            <button className="button secondary" type="button" onClick={() => void refreshBillingCatalog()} disabled={billingCatalogLoading}>
              {billingCatalogLoading ? 'Refreshing…' : 'Refresh catalog'}
            </button>
            <button className="button secondary" type="button" onClick={() => void verifyAllJobPacks()} disabled={billingCatalogLoading} data-testid="platform-billing-catalog-verify-all-job-packs">
              Dry-run verify all packs
            </button>
          </div>
          <div className="platform-admin-kpi-grid" style={{ marginTop: 16 }}>
            <MetricCard dataTestId="platform-catalog-ready-count" label="Ready" value={String(billingCatalog?.mappingHealth?.ready || 0)} tone="success" icon="billing" />
            <MetricCard dataTestId="platform-catalog-needs-mapping-count" label="Needs mapping" value={String(billingCatalog?.mappingHealth?.needsMapping || 0)} tone="warn" icon="attention" />
            <MetricCard dataTestId="platform-catalog-mismatch-count" label="Mismatches" value={String((billingCatalog?.mappingHealth?.amountMismatch || 0) + (billingCatalog?.mappingHealth?.currencyMismatch || 0))} tone="warn" icon="support" />
            <MetricCard dataTestId="platform-catalog-checkout-readiness" label="Checkout readiness" value={billingCatalog?.checkoutReadiness?.status === 'ready' ? 'Ready' : 'Needs attention'} tone={billingCatalog?.checkoutReadiness?.status === 'ready' ? 'success' : 'warn'} icon="growth" />
          </div>
          <div className="card platform-admin-card-stack platform-admin-card-stack--system" style={{ marginTop: 16 }}>
            <strong>Stripe mapping health</strong>
            <div className="muted">{billingCatalog?.checkoutReadiness?.summary || 'Catalog readiness summary unavailable.'}</div>
            <div className="muted" data-testid="platform-job-pack-checkout-readiness" style={{ marginTop: 8 }}>
              Job-pack checkout: {billingCatalog?.jobPackCheckoutReadiness?.checkoutStatus || 'setup_required'} · {(billingCatalog?.jobPackCheckoutReadiness?.blockers || []).join(' · ') || 'No job-pack blockers reported'}
            </div>
            {billingCatalogVerifyResult ? (
              <div className="muted" data-testid="platform-job-pack-verify-result" style={{ marginTop: 8 }}>
                Latest dry-run: {billingCatalogVerifyResult.status} · {billingCatalogVerifyResult.summary}
              </div>
            ) : null}
          </div>
          <div className="mt-priority-card" style={{ marginTop: 16 }} data-testid="platform-catalog-next-step">
            <span className="mt-priority-card__eyebrow">Recommended next action</span>
            <h3 className="mt-priority-card__title">
              {billingCatalog?.checkoutReadiness?.status === 'ready' ? 'Review the final catalog history before any launch change.' : 'Fix the next catalog row that is still blocking checkout readiness.'}
            </h3>
            <p className="mt-priority-card__copy">
              {billingCatalog?.checkoutReadiness?.status === 'ready'
                ? 'Mappings are currently verification-ready. Use history and masked review to confirm nothing changed unexpectedly.'
                : billingCatalog?.checkoutReadiness?.summary || 'One or more Stripe mappings still need attention before checkout can ever be considered ready.'}
            </p>
          </div>
          <div className="card platform-admin-card-stack platform-admin-card-stack--system" style={{ marginTop: 16 }} data-testid="enterprise-annual-repair-wizard">
            <div className="platform-admin-card-heading">
              <div>
                <strong>Repair Enterprise Annual mapping</strong>
                <p className="muted" style={{ margin: '6px 0 0 0' }}>
                  Discover active GBP yearly Stripe prices at the expected Enterprise Annual amount, then adopt one locally after confirmation. Stripe products and prices are never created, updated, archived, or deleted here.
                </p>
              </div>
              <button className="button secondary" type="button" disabled={enterpriseAnnualRepairLoading} onClick={() => void refreshEnterpriseAnnualRepair()} data-testid="enterprise-annual-refresh-candidates">
                {enterpriseAnnualRepairLoading ? 'Checking…' : 'Find candidates'}
              </button>
            </div>
            <div className="operator-grid operator-grid--three" style={{ marginTop: 12 }}>
              <DiagnosticSection title="Expected mapping">
                <div>Plan: Enterprise</div>
                <div>Interval: Annual / yearly recurring</div>
                <div>Amount: {enterpriseAnnualRepair?.expected?.amount || '£1,590.00'} GBP</div>
              </DiagnosticSection>
              <DiagnosticSection title="Current mapping">
                <div>Status: {enterpriseAnnualRepair?.current?.verificationLabel || enterpriseAnnualRepair?.current?.verificationStatus || 'Load candidates to inspect current state'}</div>
                <div>Price ID: {enterpriseAnnualRepair?.current?.stripePriceIdMasked || 'Masked or missing'}</div>
                <div>Product ID: {enterpriseAnnualRepair?.current?.stripeProductIdMasked || 'Masked or missing'}</div>
              </DiagnosticSection>
              <DiagnosticSection title="Structured result">
                <div>Status: {enterpriseAnnualRepair?.status || 'not_checked'}</div>
                <div>Reason: {enterpriseAnnualRepair?.reason || 'Candidates have not been refreshed yet.'}</div>
                <div>Request ID: {enterpriseAnnualRepair?.requestId || 'not generated yet'}</div>
              </DiagnosticSection>
            </div>
            {enterpriseAnnualRepair?.safeNextAction ? (
              <p className="muted" style={{ marginTop: 12 }}>Safe next action: {enterpriseAnnualRepair.safeNextAction}</p>
            ) : null}
            <div className="platform-admin-list" style={{ marginTop: 12 }} data-testid="enterprise-annual-candidate-list">
              {(enterpriseAnnualRepair?.candidates || []).length ? (
                enterpriseAnnualRepair.candidates.map((candidate: any, index: number) => (
                  <label key={`${candidate.priceIdMasked}-${index}`} className="card platform-admin-card-stack" style={{ margin: 0 }}>
                    <span className="check-row">
                      <input
                        type="radio"
                        name="enterprise-annual-candidate"
                        checked={enterpriseAnnualRepairDraft.candidateToken === candidate.token}
                        onChange={() => setEnterpriseAnnualRepairDraft((current) => ({ ...current, candidateToken: candidate.token }))}
                      />
                      <strong>{candidate.productName}</strong>
                    </span>
                    <span className="muted">Price {candidate.priceIdMasked} · Product {candidate.productIdMasked} · {candidate.amount} {candidate.currency} · {candidate.recurringInterval}</span>
                    <span className="muted">Lookup key: {candidate.lookupKey || 'none'} · Active: {candidate.active ? 'yes' : 'no'}</span>
                  </label>
                ))
              ) : (
                <p className="muted">No candidate prices loaded. Use Find candidates to read Stripe safely with the configured MyTitan Billing Stripe credential.</p>
              )}
            </div>
            <div className="two-col" style={{ marginTop: 12 }}>
              <label>Change reason<textarea className="input" rows={2} value={enterpriseAnnualRepairDraft.reason} onChange={(event) => setEnterpriseAnnualRepairDraft((current) => ({ ...current, reason: event.target.value }))} placeholder="Reason for adopting this Enterprise Annual mapping" /></label>
              <label>Confirmation<input className="input" value={enterpriseAnnualRepairDraft.confirmation} onChange={(event) => setEnterpriseAnnualRepairDraft((current) => ({ ...current, confirmation: event.target.value }))} placeholder="ADOPT ENTERPRISE ANNUAL" /></label>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <button className="button secondary" type="button" disabled={enterpriseAnnualRepairLoading || !enterpriseAnnualRepairDraft.candidateToken} onClick={() => void adoptEnterpriseAnnualCandidate()} data-testid="enterprise-annual-adopt-candidate">
                Adopt verified candidate
              </button>
              <Link className="button secondary" href="/platform?section=billing-catalog&product=subscription_price:enterprise:annual">
                Open catalog row
              </Link>
            </div>
            {enterpriseAnnualRepair?.latestAdoption ? (
              <p className="muted" style={{ marginTop: 12 }} data-testid="enterprise-annual-adoption-result">
                Latest adoption: {enterpriseAnnualRepair.latestAdoption.status} · Request {enterpriseAnnualRepair.latestAdoption.requestId}
              </p>
            ) : null}
          </div>
          {[
            { key: 'subscriptions', title: 'Subscription plans', items: billingCatalog?.groups?.subscriptions || billingCatalog?.subscriptionItems || [] },
            { key: 'job-packs', title: 'Job completion packs', items: billingCatalog?.groups?.jobCompletionPacks || billingCatalog?.jobPackItems || [] },
          ].map((group) => (
            <div key={group.key} style={{ display: 'grid', gap: 16, marginTop: 16 }}>
              <div className="platform-admin-section-copy">
                <div className="platform-admin-section-copy__eyebrow">{group.key === 'subscriptions' ? 'Subscription plans' : 'Job completion packs'}</div>
                <h3 style={{ margin: 0 }}>{group.title}</h3>
              </div>
              {group.items.map((item: any) => {
                const draftKey = `${item.kind}:${item.code}:${item.interval || 'none'}`;
                const draft = catalogDrafts[draftKey] || item;
                const revealed = revealedCatalogIds[item.key] || {};
                const verificationPreview = draft.verificationPreview || item.diagnostic || null;
                const diagnosticChecks = verificationPreview?.checks || {};
                const problemsFound = diagnosticProblems(diagnosticChecks);
                const canAdoptVerifiedProduct = Boolean(
                  verificationPreview?.providerState?.canAdoptProductFromVerifiedPrice &&
                  String(draft.stripePriceId || '').trim() &&
                  !String(draft.stripeProductId || '').trim(),
                );
                return (
                  <div
                    key={draftKey}
                    className="card platform-admin-card-stack platform-admin-card-stack--system"
                    data-testid={`platform-billing-catalog-item-${item.code}-${item.interval || 'none'}`}
                    {...getSectionProps(`catalog-${item.key}`)}
                  >
                    <div className="platform-admin-card-heading">
                      <div>
                        <strong>{item.planName || item.label || item.code}</strong>
                        <p className="muted" style={{ margin: '6px 0 0 0' }}>
                          {item.kind === 'subscription_price' ? `${item.interval} subscription price` : `${item.jobCount} jobs add-on`} • Current mapping {item.source}
                        </p>
                      </div>
                      <StatusPill tone={item.verificationStatus === 'ready' ? 'success' : item.verificationStatus === 'inactive' ? 'neutral' : 'warn'}>
                        {item.verificationLabel || item.verificationStatus || 'Verification failed'}
                      </StatusPill>
                    </div>
                    <div className="two-col">
                      <div>
                        <label>Stripe price ID</label>
                        <input className="input" placeholder={item.stripePriceIdMasked || 'Masked until reveal'} value={draft.stripePriceId || ''} onChange={(event) => setCatalogDrafts((current) => ({ ...current, [draftKey]: { ...draft, stripePriceId: event.target.value } }))} />
                      </div>
                      <div>
                        <label>Stripe product ID</label>
                        <input className="input" placeholder={item.stripeProductIdMasked || 'Masked until reveal'} value={draft.stripeProductId || ''} onChange={(event) => setCatalogDrafts((current) => ({ ...current, [draftKey]: { ...draft, stripeProductId: event.target.value } }))} />
                      </div>
                      <div>
                        <label>Lookup key</label>
                        <input className="input" value={draft.lookupKey || ''} onChange={(event) => setCatalogDrafts((current) => ({ ...current, [draftKey]: { ...draft, lookupKey: event.target.value } }))} />
                      </div>
                      <div>
                        <label>Expected amount</label>
                        <input
                          className="input"
                          inputMode="decimal"
                          placeholder="£19.00"
                          value={draft.expectedAmount ?? ''}
                          onChange={(event) => setCatalogDrafts((current) => ({ ...current, [draftKey]: { ...draft, expectedAmount: event.target.value } }))}
                          data-testid={`platform-billing-catalog-amount-${item.code}-${item.interval || 'none'}`}
                        />
                        <div className="muted" style={{ marginTop: 4 }}>
                          Displayed and validated as GBP before the server stores the minor-unit value.
                        </div>
                      </div>
                      <div>
                        <label>Currency</label>
                        <input className="input" value={draft.currency || 'GBP'} onChange={(event) => setCatalogDrafts((current) => ({ ...current, [draftKey]: { ...draft, currency: event.target.value.toUpperCase() } }))} />
                      </div>
                      <div>
                        <label>Active</label>
                        <select className="input" value={draft.active === false ? 'inactive' : 'active'} onChange={(event) => setCatalogDrafts((current) => ({ ...current, [draftKey]: { ...draft, active: event.target.value === 'active' } }))}>
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <label>Notes / change reason</label>
                      <textarea className="input" rows={2} value={draft.changeNotes || ''} onChange={(event) => setCatalogDrafts((current) => ({ ...current, [draftKey]: { ...draft, changeNotes: event.target.value } }))} />
                    </div>
                    <div className="platform-admin-list" style={{ marginTop: 12 }} data-testid={`platform-billing-catalog-diagnostics-${item.code}-${item.interval || 'none'}`}>
                      <DiagnosticSection title="Configuration entered">
                        <div>Price ID: {draft.stripePriceId ? 'entered, hidden until reveal' : item.stripePriceIdMasked || 'Not entered'}</div>
                        <div>Product ID: {draft.stripeProductId ? 'entered, hidden until reveal' : item.stripeProductIdMasked || 'Not entered'}</div>
                        <div>Lookup key: {draft.lookupKey || item.lookupKey || 'Not entered'}</div>
                        <div>Expected price: {draft.expectedAmount || item.expectedAmountDisplay || formatMoney(item.expectedAmountCents || 0, item.currency || 'GBP')} {draft.currency || item.currency || 'GBP'}</div>
                      </DiagnosticSection>
                      <DiagnosticSection title="MyTitan saved mapping">
                        <div>Status: {item.verificationLabel || item.verificationStatus}</div>
                        <div>Price ID: {revealed.stripePriceId || item.stripePriceIdMasked || 'Not stored'}</div>
                        <div>Product ID: {revealed.stripeProductId || item.stripeProductIdMasked || 'Not stored'}</div>
                        <div>Local completeness: {verificationPreview?.localMappingComplete ?? (!item.missingPriceId && !item.missingProductId) ? 'complete' : 'incomplete'}</div>
                      </DiagnosticSection>
                      <DiagnosticSection title="Stripe provider result">
                        <div>{verificationPreview?.message || item.verificationMessage || 'No provider verification has been run for this draft yet.'}</div>
                        {verificationPreview?.observed?.observedAmountDisplay ? <div>Observed Stripe price: {verificationPreview.observed.observedAmountDisplay}</div> : null}
                        {verificationPreview?.observed?.observedCurrency ? <div>Observed currency: {verificationPreview.observed.observedCurrency}</div> : null}
                        {verificationPreview?.observed?.observedProductIdMasked ? <div>Observed product: {verificationPreview.observed.observedProductIdMasked}</div> : null}
                        {verificationPreview?.providerState?.priceProductIdMasked ? <div>Price belongs to product: {verificationPreview.providerState.priceProductIdMasked}</div> : null}
                        {verificationPreview?.requestId ? <div>Request ID: {verificationPreview.requestId}</div> : null}
                      </DiagnosticSection>
                      <DiagnosticSection title="Verification checklist">
                        {catalogDiagnosticRows(diagnosticChecks).map((row) => (
                          <div key={row.key} className="platform-admin-readiness-row">
                            <strong>{statusIcon(row.check?.status)} {row.label}</strong>
                            <span>{row.check?.message || 'Not checked yet.'}</span>
                            <span className="muted">{row.check?.technicalDetail || 'No redacted technical detail yet.'}</span>
                            <span className="muted">Next action: {row.check?.operatorAction || 'Dry-run validate again.'}</span>
                          </div>
                        ))}
                      </DiagnosticSection>
                      <DiagnosticSection title="Problems found">
                        {problemsFound.length ? problemsFound.map((problem) => <div key={problem}>{problem}</div>) : <div>No failed diagnostic checks reported.</div>}
                      </DiagnosticSection>
                      <DiagnosticSection title="Recommended fix">
                        <div>{verificationPreview?.safeNextAction || item.safeNextAction || item.nextAction || 'Review this mapping before checkout is considered ready.'}</div>
                      </DiagnosticSection>
                      <DiagnosticSection title="Audit/change history">
                        <div>Last verified: {formatDateTime(item.lastVerifiedAt)}</div>
                        <div>Change reason: {item.changeNotes || 'No saved change reason yet.'}</div>
                        <div>Writes require confirmation, a reason, and an audit event. Stripe products and prices are never mutated here.</div>
                      </DiagnosticSection>
                    </div>
                    <div className="platform-admin-list" style={{ marginTop: 12 }} data-testid={`platform-billing-catalog-history-${item.code}-${item.interval || 'none'}`}>
                      <strong>Change history</strong>
                      {(item.history || []).length ? (
                        (item.history || []).slice(0, 4).map((entry: any, index: number) => (
                          <div key={`${entry.createdAt}-${index}`}>
                            {entry.action} · {entry.changeNotes || 'No note'} · {entry.actorEmail || entry.createdByUserId || 'unknown'} · {new Date(entry.createdAt).toLocaleString()}
                            <details>
                              <summary>Advanced detail</summary>
                              <span>Price changed to {entry.nextValuesAdvanced?.expectedAmountDisplay || entry.nextValues?.expectedAmountDisplay || 'not recorded'} ({entry.nextValues?.expectedAmountCents ?? 'n/a'} minor units).</span>
                            </details>
                          </div>
                        ))
                      ) : (
                        <div>No staged or saved changes have been recorded for this mapping yet.</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                      <button className="button secondary" type="button" onClick={() => void saveBillingCatalogItem(draft, 'validate')} data-testid={`platform-billing-catalog-validate-${item.code}-${item.interval || 'none'}`}>Dry-run validate</button>
                      {canAdoptVerifiedProduct ? (
                        <button className="button secondary" type="button" onClick={() => void adoptVerifiedProductFromPrice(item, draft)} data-testid={`platform-billing-catalog-adopt-product-${item.code}-${item.interval || 'none'}`}>Use product from verified Stripe price</button>
                      ) : null}
                      <button className="button secondary" type="button" onClick={() => void revealBillingCatalogItem(item.key)} data-testid={`platform-billing-catalog-reveal-${item.code}-${item.interval || 'none'}`}>Reveal IDs</button>
                      {verificationPreview?.requestId ? (
                        <button className="button secondary" type="button" onClick={() => void copyDiagnosticRequestId(verificationPreview.requestId)} data-testid={`platform-billing-catalog-copy-request-${item.code}-${item.interval || 'none'}`}>
                          {copiedCatalogField === `request:${verificationPreview.requestId}` ? 'Copied request ID' : 'Copy request ID'}
                        </button>
                      ) : null}
                      {revealed.stripePriceId ? (
                        <button
                          className="button secondary"
                          type="button"
                          onClick={() => void copyCatalogIdentifier(revealed.stripePriceId, item.key, 'price')}
                          data-testid={`platform-billing-catalog-copy-price-${item.code}-${item.interval || 'none'}`}
                        >
                          {copiedCatalogField === `${item.key}:price` ? 'Copied price ID' : 'Copy price ID'}
                        </button>
                      ) : null}
                      {revealed.stripeProductId ? (
                        <button
                          className="button secondary"
                          type="button"
                          onClick={() => void copyCatalogIdentifier(revealed.stripeProductId, item.key, 'product')}
                          data-testid={`platform-billing-catalog-copy-product-${item.code}-${item.interval || 'none'}`}
                        >
                          {copiedCatalogField === `${item.key}:product` ? 'Copied product ID' : 'Copy product ID'}
                        </button>
                      ) : null}
                      <button className="button secondary" type="button" onClick={() => void saveBillingCatalogItem(draft, 'save')} data-testid={`platform-billing-catalog-save-${item.code}-${item.interval || 'none'}`}>Save mapping</button>
                      <button className="button secondary" type="button" onClick={() => void rollbackBillingCatalogItem(item)} data-testid={`platform-billing-catalog-rollback-${item.code}-${item.interval || 'none'}`}>Rollback mapping</button>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <div className="card platform-admin-card-stack platform-admin-card-stack--system" style={{ marginTop: 16 }} data-testid="platform-billing-catalog-change-history">
            <strong>Change history</strong>
            {(billingCatalog?.changeHistory || []).slice(0, 8).map((entry: any, index: number) => (
              <div key={`${entry.overrideKey}-${index}`}>{entry.overrideKey} · {entry.action} · {entry.actorEmail || entry.createdByUserId || 'unknown'} · {new Date(entry.createdAt).toLocaleString()}</div>
            ))}
            {!(billingCatalog?.changeHistory || []).length ? <div>No catalog change history yet.</div> : null}
          </div>
        </section>

        <section className="platform-admin-section card" data-testid="platform-email-control-admin" {...getSectionProps('email-control')}>
          <div className="platform-admin-section__head" style={{ marginBottom: 18 }}>
            <div className="platform-admin-section-copy">
              <div className="platform-admin-section-copy__eyebrow">Outbound email control</div>
              <h2>Reputation and abuse safety</h2>
              <p>Global outbound state, environment isolation, deliverability signals, and recent sanitized provider responses stay visible here.</p>
            </div>
            <button className="button secondary" type="button" onClick={() => void refreshEmailControl()} disabled={emailControlLoading}>
              {emailControlLoading ? 'Refreshing…' : 'Refresh email safety'}
            </button>
          </div>
          <div className="platform-admin-kpi-grid">
            <MetricCard dataTestId="platform-email-mode" label="Environment" value={emailControl?.environment.mode || 'unknown'} detail={emailControl?.environment.captureOnly ? 'Safe capture only' : 'Live SMTP allowed'} tone={emailControl?.environment.captureOnly ? 'info' : 'success'} icon="mail" />
            <MetricCard dataTestId="platform-email-sender-readiness" label="Sender" value={humanizeState(emailControl?.sender.readiness.status || 'unknown')} detail={emailControl?.sender.readiness.guidance || 'No guidance'} tone={emailControl?.sender.readiness.canSend ? 'success' : 'warn'} icon="mail" />
            <MetricCard dataTestId="platform-email-bounce-rate" label="Bounce rate" value={`${Number(emailControl?.health.bounceRate || 0).toFixed(2)}%`} detail={`${emailControl?.health.complaintRate || 0}% complaints`} tone={Number(emailControl?.health.bounceRate || 0) > 3 ? 'warn' : 'success'} icon="attention" />
            <MetricCard dataTestId="platform-email-paused" label="Paused" value={emailControl?.control.paused || emailControl?.control.providerSuspended ? 'Yes' : 'No'} detail={emailControl?.control.providerSuspended ? 'Provider suspension safe mode' : 'Platform emergency control'} tone={emailControl?.control.paused || emailControl?.control.providerSuspended ? 'warn' : 'success'} icon="control" />
          </div>
          <div className="platform-admin-filter-grid" style={{ marginTop: 16 }}>
            <label>
              <span className="muted">Pause reason</span>
              <input
                className="input"
                value={emailControlReason}
                onChange={(event) => setEmailControlReason(event.target.value)}
                placeholder="Reason shown when outbound is paused"
                data-testid="platform-email-pause-reason"
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button className="button secondary" type="button" onClick={() => void updateEmailControl('pause')} disabled={emailControlLoading} data-testid="platform-email-pause">Pause outbound</button>
            <button className="button secondary" type="button" onClick={() => void updateEmailControl('resume')} disabled={emailControlLoading} data-testid="platform-email-resume">Resume outbound</button>
          </div>
          <div className="platform-admin-list" style={{ marginTop: 16 }}>
            <div>Sender identity: {emailControl?.sender.senderIdentityVerified ? 'verified' : 'unconfirmed'}</div>
            <div>Reply-to: {emailControl?.sender.replyToValid ? 'valid' : 'needs attention'}</div>
            <div>SPF: {emailControl?.domainAlignment.spf || 'unknown'}</div>
            <div>DKIM: {emailControl?.domainAlignment.dkim || 'unknown'}</div>
            <div>DMARC: {emailControl?.domainAlignment.dmarc || 'unknown'}</div>
            <div>Warmup: {emailControl?.domainAlignment.warmup || 'unknown'}</div>
            <div>Sent in last 24h: {emailControl?.health.sentLast24h || 0}</div>
            <div>Deferred in last 24h: {emailControl?.health.deferredLast24h || 0}</div>
            <div>Failed in last 24h: {emailControl?.health.failedLast24h || 0}</div>
            <div>Blocked in last 24h: {emailControl?.health.blockedLast24h || 0}</div>
            <div>Active suppressions: {emailControl?.health.activeSuppressions || 0}</div>
          </div>
          <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
            <div className="card platform-admin-card-stack platform-admin-card-stack--system" data-testid="platform-email-recent-failures">
              <strong>Recent provider responses</strong>
              {(emailControl?.health.recentProviderResponses || []).map((row) => (
                <div key={row.id} style={{ marginTop: 10 }}>
                  <div>{row.recipientMasked} • {humanizeState(row.status)} • {row.category}</div>
                  <div className="muted">{formatDateTime(row.createdAt)} • {row.providerCode || 'no code'} • {row.responseSummary}</div>
                </div>
              ))}
              {!(emailControl?.health.recentProviderResponses || []).length ? <div className="muted">No recent provider failures or deferrals.</div> : null}
            </div>
            <div className="card platform-admin-card-stack platform-admin-card-stack--system" data-testid="platform-email-suppressions">
              <strong>Active suppressions</strong>
              {(emailControl?.suppressions || []).map((row) => (
                <div key={row.id} style={{ marginTop: 10 }}>
                  <div>{row.emailMasked} • {row.category} • {row.source}</div>
                  <div className="muted">{row.reason} • hits {row.hitCount} • expires {formatDateTime(row.expiresAt)}</div>
                </div>
              ))}
              {!(emailControl?.suppressions || []).length ? <div className="muted">No active suppressions.</div> : null}
            </div>
          </div>
        </section>

        <section className="platform-admin-section card" data-testid="platform-safe-error-log-admin" {...getSectionProps('error-logs')}>
          <div className="platform-admin-section__head">
            <div className="platform-admin-section-copy">
              <div className="platform-admin-section-copy__eyebrow">Provider diagnostics</div>
              <h2>Provider Diagnostics</h2>
              <p>Sanitized provider and platform failures stay reviewable here without exposing raw payloads or secrets to tenant users.</p>
            </div>
            <button className="button secondary" type="button" onClick={() => void refreshErrorLogs()} disabled={errorLogsLoading}>
              {errorLogsLoading ? 'Refreshing…' : 'Refresh logs'}
            </button>
          </div>
          <div className="platform-admin-filter-grid">
            <label>
              <span className="muted">Category</span>
              <select className="input" value={errorLogFilters.category} onChange={(event) => {
                const next = { ...errorLogFilters, category: event.target.value };
                setErrorLogFilters(next);
                void refreshErrorLogs(next);
              }}>
                <option value="all">All categories</option>
                {['validation', 'notification', 'billing catalog', 'webhook', 'integration', 'auth', 'platform health', 'backup', 'scheduler'].map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>
              <span className="muted">Status</span>
              <select className="input" value={errorLogFilters.status} onChange={(event) => {
                const next = { ...errorLogFilters, status: event.target.value };
                setErrorLogFilters(next);
                void refreshErrorLogs(next);
              }}>
                <option value="all">All statuses</option>
                <option value="open">Open</option>
                <option value="reviewed">Reviewed</option>
                <option value="resolved">Resolved</option>
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button className="button secondary" type="button" onClick={() => void clearReviewedErrorLogs()} data-testid="platform-safe-error-log-clear-reviewed">Clear reviewed logs</button>
            <button className="button secondary" type="button" onClick={() => void clearValidationErrorLogs()} data-testid="platform-safe-error-log-clear-validation">Clear validation / test-only logs</button>
            <button className="button secondary" type="button" onClick={() => void exportErrorLogs()} data-testid="platform-safe-error-log-export">Export sanitized summary</button>
          </div>
          <div className="mt-priority-card" style={{ marginTop: 16 }} data-testid="platform-error-log-next-step">
            <span className="mt-priority-card__eyebrow">Recommended next action</span>
            <h3 className="mt-priority-card__title">
              {(errorLogs?.items || []).some((row: any) => row.status === 'open')
                ? 'Review the oldest open sanitized log before clearing anything.'
                : 'Clear reviewed non-critical logs to keep this queue calm.'}
            </h3>
            <p className="mt-priority-card__copy">
              {(errorLogs?.items || []).some((row: any) => row.status === 'open')
                ? 'This keeps the queue truthful and prevents accidental cleanup of issues that still need an owner or platform decision.'
                : 'Protected audit entries stay intact. Only resolved or validation-only noise should be cleared from here.'}
            </p>
          </div>
          <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
            {(errorLogs?.items || []).map((row: any) => (
              <div key={row.id} className="card platform-admin-card-stack platform-admin-card-stack--system" data-testid={`platform-safe-error-log-${row.id}`}>
                <div className="platform-admin-card-heading">
                  <div>
                    <strong>{row.summary}</strong>
                    <p className="muted" style={{ margin: '6px 0 0 0' }}>{row.area} • {row.category}</p>
                  </div>
                  <StatusPill tone={row.status === 'resolved' ? 'success' : row.status === 'reviewed' ? 'info' : 'warn'}>{row.status}</StatusPill>
                </div>
                <div className="platform-admin-list">
                  <div>Affected area: {row.area}</div>
                  <div>First seen: {new Date(row.firstSeenAt).toLocaleString()}</div>
                  <div>Last seen: {new Date(row.lastSeenAt).toLocaleString()}</div>
                  <div>Count: {row.occurrenceCount}</div>
                  <div>Safe action: {row.safeAction}</div>
                </div>
                <details style={{ marginTop: 8 }}>
                  <summary>Advanced diagnostics</summary>
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(row.diagnostics || {}, null, 2)}</pre>
                </details>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  <button className="button secondary" type="button" onClick={() => void updateErrorLogStatus(row.id, 'reviewed')} data-testid={`platform-safe-error-log-review-${row.id}`}>Mark reviewed</button>
                  <button className="button secondary" type="button" onClick={() => void updateErrorLogStatus(row.id, 'resolved')} data-testid={`platform-safe-error-log-resolve-${row.id}`}>Mark resolved</button>
                  <button className="button secondary" type="button" onClick={() => void updateErrorLogStatus(row.id, 'reopen')} data-testid={`platform-safe-error-log-reopen-${row.id}`}>Reopen</button>
                </div>
              </div>
            ))}
            {!(errorLogs?.items || []).length ? <div className="muted">No sanitized error logs matched the current filter.</div> : null}
            {errorLogs?.exportPreview ? (
              <details>
                <summary>Export preview</summary>
                <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{errorLogs.exportPreview}</pre>
              </details>
            ) : null}
          </div>
        </section>

        <section id="memberships" className="platform-admin-section platform-admin-section--memberships card" data-testid="platform-membership-dashboard">
          <div className="platform-admin-section__head">
            <SectionHeading
              title="Membership intelligence"
              description="Cross-workspace membership, conversion, and Stripe linkage signals for support and commercial follow-through."
              icon="workspace"
              tone="neutral"
            />
            <button className="button secondary" type="button" onClick={() => void refreshMemberships()} disabled={membershipsLoading}>
              {membershipsLoading ? 'Refreshing...' : 'Refresh members'}
            </button>
          </div>
          <div className="platform-admin-kpi-grid">
            <MetricCard dataTestId="platform-members-count" label="Members" value={String(memberships?.summary.members || 0)} tone="neutral" icon="workspace" />
            <MetricCard dataTestId="platform-workspaces-count" label="Workspaces" value={String(memberships?.summary.workspaces || 0)} tone="info" icon="workspace" />
            <MetricCard dataTestId="platform-paid-workspaces-count" label="Paid workspaces" value={String(memberships?.summary.activePaidWorkspaces || 0)} tone="success" icon="billing" />
            <MetricCard dataTestId="platform-trial-workspaces-count" label="Active trials" value={String(memberships?.summary.activeTrials || 0)} tone="neutral" icon="trial" />
          </div>
          <div className="platform-admin-filter-grid">
            <label>
              <span className="muted">Search</span>
              <input
                className="input"
                data-testid="platform-memberships-search"
                value={membershipFilters.query}
                onChange={(event) => setMembershipFilters((current) => ({ ...current, query: event.target.value }))}
                placeholder="Workspace, email, role"
              />
            </label>
            <label>
              <span className="muted">Plan</span>
              <select className="input" data-testid="platform-memberships-plan-filter" value={membershipFilters.plan} onChange={(event) => setMembershipFilters((current) => ({ ...current, plan: event.target.value }))}>
                <option value="all">All plans</option>
                {membershipFilterOptions.plans.map((plan) => <option key={plan} value={plan}>{plan}</option>)}
              </select>
            </label>
            <label>
              <span className="muted">Subscription</span>
              <select className="input" data-testid="platform-memberships-subscription-filter" value={membershipFilters.subscription} onChange={(event) => setMembershipFilters((current) => ({ ...current, subscription: event.target.value }))}>
                <option value="all">All statuses</option>
                {membershipFilterOptions.subscriptions.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label>
              <span className="muted">Trial</span>
              <select className="input" data-testid="platform-memberships-trial-filter" value={membershipFilters.trial} onChange={(event) => setMembershipFilters((current) => ({ ...current, trial: event.target.value }))}>
                <option value="all">All trial states</option>
                {membershipFilterOptions.trials.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label>
              <span className="muted">Conversion</span>
              <select className="input" data-testid="platform-memberships-conversion-filter" value={membershipFilters.conversion} onChange={(event) => setMembershipFilters((current) => ({ ...current, conversion: event.target.value }))}>
                <option value="all">All conversion states</option>
                {membershipFilterOptions.conversions.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label>
              <span className="muted">Group by</span>
              <select className="input" data-testid="platform-memberships-group-filter" value={membershipFilters.groupBy} onChange={(event) => setMembershipFilters((current) => ({ ...current, groupBy: event.target.value as MembershipFilterState['groupBy'] }))}>
                <option value="workspace">Workspace</option>
                <option value="plan">Plan</option>
                <option value="subscription">Subscription</option>
                <option value="trial">Trial</option>
                <option value="conversion">Conversion</option>
                <option value="none">None</option>
              </select>
            </label>
          </div>
          <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
            {membershipGroups.map(([label, rows]) => (
              <div key={label} className="card platform-admin-membership-card">
                {membershipFilters.groupBy !== 'none' ? <h3 style={{ marginTop: 0 }}>{label}</h3> : null}
                <div style={{ overflowX: 'auto' }}>
                  <table className="platform-admin-memberships-table" style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="platform-memberships-table">
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(148, 163, 184, 0.2)' }}>
                        <th style={tableHeaderStyle}>Workspace</th>
                        <th style={tableHeaderStyle}>Member</th>
                        <th style={tableHeaderStyle}>Role</th>
                        <th style={tableHeaderStyle}>Plan</th>
                        <th style={tableHeaderStyle}>Subscription</th>
	                        <th style={tableHeaderStyle}>Trial</th>
	                        <th style={tableHeaderStyle}>Converted</th>
	                        <th style={tableHeaderStyle}>Stripe</th>
	                        <th style={tableHeaderStyle}>Actions</th>
	                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.userId} data-testid={`platform-membership-row-${row.userId}`} style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.08)' }}>
                          <td style={tableCellStyle}>
                            <strong>{row.workspaceName}</strong>
                            <div className="muted">{row.workspaceTimezone} • {row.workspaceCurrency}</div>
                          </td>
                          <td style={tableCellStyle}>
                            <div>{row.email}</div>
                            <div className="platform-admin-inline-status-row">
                              <StatusPill tone={row.emailVerified ? 'success' : 'warn'}>{row.emailVerified ? 'Email verified' : 'Email not verified'}</StatusPill>
                            </div>
                          </td>
                          <td style={tableCellStyle}><span className="platform-admin-table-chip">{row.role}</span></td>
                          <td style={tableCellStyle}>
                            <div>{row.planName}</div>
                            <div className="muted">{row.billingInterval}</div>
                          </td>
                          <td style={tableCellStyle}>
                            <div className="platform-admin-inline-status-row">
                              <StatusPill tone={row.subscriptionStatus === 'active' ? 'success' : row.cancelAtPeriodEnd ? 'warn' : 'neutral'}>{row.subscriptionStatus || 'inactive'}</StatusPill>
                            </div>
                            <div className="muted">{row.cancelAtPeriodEnd ? 'Cancels at period end' : 'Continuing'}</div>
                          </td>
                          <td style={tableCellStyle}>
                            <div className="platform-admin-inline-status-row">
                              <StatusPill tone={row.trialStatus === 'active' ? 'info' : row.trialStatus === 'expired' ? 'warn' : 'neutral'}>{describeTrialStatus(row)}</StatusPill>
                            </div>
                            <div className="muted">{row.trialEndsAt ? `Ends ${new Date(row.trialEndsAt).toLocaleDateString()}` : 'No trial window'}</div>
                          </td>
                          <td style={tableCellStyle}>
                            <div>{row.convertedAt ? new Date(row.convertedAt).toLocaleDateString() : 'Not converted'}</div>
                            <div className="muted">{row.conversionSource || 'none'}</div>
                          </td>
	                          <td style={tableCellStyle}>
	                            <div className="platform-admin-inline-status-row">
	                              <StatusPill tone={row.stripeLinked ? 'success' : 'neutral'}>{row.stripeLinked ? 'Linked' : 'Not linked'}</StatusPill>
	                            </div>
	                            <div className="muted">{row.stripeCustomerLinked && row.stripeSubscriptionLinked ? 'Customer + subscription' : row.stripeCustomerLinked ? 'Customer only' : row.stripeSubscriptionLinked ? 'Subscription only' : 'No linkage'}</div>
	                          </td>
	                          <td style={tableCellStyle}>
	                            {row.workspaceId ? (
	                              <div className="button-row" data-testid={`platform-membership-actions-${row.workspaceId}`}>
	                                <Link className="button secondary" data-testid={`platform-membership-open-tenant-360-${row.workspaceId}`} href={`/platform/tenants/${encodeURIComponent(row.workspaceId!)}`}>Open Tenant 360</Link>
	                                <Link className="button secondary" data-testid={`platform-membership-edit-commercials-${row.workspaceId}`} href={`/platform/tenants/${encodeURIComponent(row.workspaceId!)}#commercial`}>Edit Commercials</Link>
	                                <button className="button secondary" type="button" data-testid={`platform-membership-start-support-${row.workspaceId}`} onClick={() => focusTenant(row.workspaceId!)}>Start Support Mode</button>
	                              </div>
	                            ) : (
	                              <span className="muted">No workspace action</span>
	                            )}
	                          </td>
	                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            {!filteredMemberships.length ? <p className="muted" style={{ marginBottom: 0 }}>No memberships match the current filters.</p> : null}
          </div>
        </section>

        <div id="lookup" className="platform-admin-lookup-grid">
          <section className="card platform-admin-card-stack platform-admin-card-stack--lookup" data-testid="platform-tenant-lookup">
            <h2 style={{ marginTop: 0 }}>Tenant lookup</h2>
            <p className="muted">Search by workspace name or owner email. Platform-only support tools stay here, outside the customer dashboard.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                data-testid="platform-tenant-search-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Workspace or owner email"
              />
              <button className="button" type="button" data-testid="platform-tenant-search-submit" onClick={() => void searchTenants()} disabled={searching}>
                {searching ? 'Searching...' : 'Search'}
              </button>
            </div>
            <div className="platform-admin-attention-list" style={{ marginTop: 16 }}>
              {results.map((result) => (
                <article
                  key={result.id}
                  className="platform-admin-attention-card"
                  data-testid={`platform-tenant-result-card-${result.id}`}
                >
                  <div className="platform-admin-attention-card__top">
                    <div>
                      <strong>{result.name}</strong>
                      <div className="muted">{result.ownerEmail || 'No owner email'} • {result.currency} • {result.timezone}</div>
                    </div>
                    <StatusPill tone="neutral">{new Date(result.createdAt).toLocaleDateString()}</StatusPill>
                  </div>
                  <div className="button-row">
                    <Link className="button" data-testid={`platform-tenant-open-tenant-360-${result.id}`} href={`/platform/tenants/${encodeURIComponent(result.id)}`}>Open Tenant 360</Link>
                    <Link className="button secondary" data-testid={`platform-tenant-edit-commercials-${result.id}`} href={`/platform/tenants/${encodeURIComponent(result.id)}#commercial`}>Edit Commercials</Link>
                    <button
                      className="button secondary"
                      type="button"
                      data-testid={`platform-tenant-result-${result.id}`}
                      onClick={() => selectTenantForSupport(result.id)}
                    >
                      Start Support Mode
                    </button>
                    <Link className="button secondary" data-testid={`platform-tenant-view-audit-${result.id}`} href={`/platform/tenants/${encodeURIComponent(result.id)}#audit`}>View Audit</Link>
                  </div>
                </article>
              ))}
              {!results.length && query.trim().length >= 2 ? <p className="muted" style={{ marginBottom: 0 }}>No tenants matched.</p> : null}
            </div>
          </section>

          <section className="card platform-admin-card-stack platform-admin-card-stack--detail" data-testid="platform-tenant-detail">
            {!selectedTenantId ? <p className="muted" style={{ marginBottom: 0 }}>Select a tenant to inspect support readiness, trial, pricing, and billing state.</p> : null}
            {selectedTenantId ? (
              <div className="card platform-admin-card-stack platform-admin-card-stack--support" data-testid="platform-support-mode-panel">
                <div className="platform-admin-card-heading">
                  <IconBadge icon="support" tone={supportModeSession?.active ? 'success' : 'warn'} />
                  <strong>{supportModeSession?.active ? 'Support mode active' : 'Start support mode'}</strong>
                </div>
                {supportModeSession?.active ? (
                  <div data-testid="platform-support-mode-banner">
                    <p className="muted" style={{ marginTop: 0 }}>
                      Timed tenant access expires {new Date(supportModeSession.expiresAt).toLocaleString()} · View as {supportModeSession.viewRole || 'owner'} · {supportModeSession.accessMode === 'write' ? 'Write mode' : 'Read-only'} · Reason: {supportModeSession.reason}
                    </p>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button className="button secondary" type="button" data-testid="platform-support-mode-refresh" onClick={() => void loadTenant(selectedTenantId)} disabled={loadingTenant}>
                        Refresh tenant detail
                      </button>
                      <button className="button secondary" type="button" data-testid="platform-support-mode-exit" onClick={() => void exitSupportMode()} disabled={supportModeBusy}>
                        {supportModeBusy ? 'Exiting...' : 'Exit support mode'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="muted">Tenant data is locked until a platform admin chooses a tenant, provides a reason, and starts a timed support session.</p>
                    <div className="platform-admin-detail-grid">
                      <label>
                        <span className="muted">Support reason</span>
                        <input className="input" data-testid="platform-support-mode-reason" value={supportModeReason} onChange={(event) => setSupportModeReason(event.target.value)} placeholder="Customer requested billing investigation" />
                      </label>
                      <label>
                        <span className="muted">Duration</span>
                        <select className="input" data-testid="platform-support-mode-duration" value={supportModeMinutes} onChange={(event) => setSupportModeMinutes(event.target.value)}>
                          <option value="5">5 minutes</option>
                          <option value="15">15 minutes</option>
                          <option value="30">30 minutes</option>
                          <option value="60">60 minutes</option>
                          <option value="120">120 minutes</option>
                        </select>
                      </label>
                      <label>
                        <span className="muted">View as</span>
                        <select className="input" data-testid="platform-support-mode-view-role" value={supportModeViewRole} onChange={(event) => setSupportModeViewRole(event.target.value as typeof supportModeViewRole)}>
                          <option value="owner">Owner</option>
                          <option value="admin">Admin</option>
                          <option value="operator">Operator / service provider</option>
                          <option value="finance">Finance</option>
                          <option value="customer_portal">Customer portal (safe view)</option>
                        </select>
                      </label>
                      <label>
                        <span className="muted">Access mode</span>
                        <select className="input" data-testid="platform-support-mode-access-mode" value={supportModeAccessMode} onChange={(event) => setSupportModeAccessMode(event.target.value as typeof supportModeAccessMode)}>
                          <option value="read_only">Read-only (default)</option>
                          <option value="write">Write mode (audited)</option>
                        </select>
                      </label>
                    </div>
                    {supportModeAccessMode === 'write' ? (
                      <label className="check-row">
                        <input data-testid="platform-support-mode-write-confirm" type="checkbox" checked={supportModeWriteConfirmed} onChange={(event) => setSupportModeWriteConfirmed(event.target.checked)} />
                        Confirm audited write-mode support access for this timed session.
                      </label>
                    ) : null}
                    <button className="button" type="button" data-testid="platform-support-mode-start" onClick={() => void startSupportMode()} disabled={supportModeBusy || supportModeReason.trim().length < 8 || (supportModeAccessMode === 'write' && !supportModeWriteConfirmed)}>
                      {supportModeBusy ? 'Starting...' : 'Start timed support mode'}
                    </button>
                  </div>
                )}
              </div>
            ) : null}
            {loadingTenant ? <p className="muted">Loading tenant state...</p> : null}
            {tenant?.company ? (
              <div className="platform-admin-card-stack">
                <div>
                  <h2 style={{ marginTop: 0, marginBottom: 6 }}>{tenant.company.name}</h2>
                  <p className="muted" style={{ marginBottom: 0 }}>
                    Owner: {tenant.owner?.email || 'Unknown'} • Plan: {tenant.billing?.plan?.name || tenant.billing?.plan?.code || 'Unknown'} • Status: {tenant.billing?.subscription?.status || 'inactive'}
                  </p>
                  <Link className="button secondary" data-testid="platform-open-tenant-360" href={`/platform/tenants/${encodeURIComponent(tenant.company.id)}`}>
                    Open Tenant 360
                  </Link>
                </div>

                <div className="platform-admin-kpi-grid">
                  <MetricCard dataTestId="platform-trial-summary" label="Trial" value={selectedTrialSummary} detail={tenant.billing?.trial?.endsAt ? `Ends ${new Date(tenant.billing.trial.endsAt).toLocaleDateString()}` : 'No trial window'} tone="neutral" icon="trial" compact />
                  <MetricCard dataTestId="platform-pricing-summary" label="Pricing" value={formatMoney(tenant.pricingState?.adjustedPriceCents || tenant.pricingState?.basePriceCents || 0, tenant.pricingState?.currency || tenant.company.currency)} detail={describeAdjustment(tenant.pricingState?.adjustment || null)} detailTestId="platform-pricing-adjustment-summary" tone="revenue" icon="billing" compact />
                  <MetricCard dataTestId="platform-tenant-email-readiness" label="Email" value={tenant.operations?.email.canSend ? 'Ready' : 'Needs attention'} detail={tenant.operations?.email.guidance || 'No guidance'} tone={tenant.operations?.email.canSend ? 'success' : 'warn'} icon="mail" compact />
                  <MetricCard dataTestId="platform-tenant-next-action" label="Next support action" value={tenant.support?.nextAction || 'No urgent support action is outstanding right now.'} detail={tenant.support?.ownerEmailVerified ? 'Owner verified' : 'Owner verification pending'} tone="warn" icon="support" compact />
                </div>

                <div className="platform-admin-detail-grid">
                  <div className="card platform-admin-card-stack platform-admin-card-stack--analytic" data-testid="platform-commercial-controls">
                    <div>
                      <div className="platform-admin-card-heading">
                        <IconBadge icon="billing" tone="revenue" />
                        <strong>Plan and commercial state</strong>
                      </div>
                      <p className="muted">Authoritative plan, custom monthly/annual pricing, safe pause state, and internal billing note.</p>
                    </div>
                    <div className="list">
                      <label>
                        <span className="muted">Plan</span>
                        <select className="input" data-testid="platform-commercial-plan" value={commercialForm.planCode} onChange={(event) => setCommercialForm((current) => ({ ...current, planCode: event.target.value }))}>
                          {(tenant.commercialControl?.plans || []).map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}
                        </select>
                      </label>
                      <label>
                        <span className="muted">Billing interval</span>
                        <select className="input" data-testid="platform-commercial-interval" value={commercialForm.interval} onChange={(event) => setCommercialForm((current) => ({ ...current, interval: event.target.value as 'MONTHLY' | 'ANNUAL' }))}>
                          <option value="MONTHLY">Monthly</option>
                          <option value="ANNUAL">Annual</option>
                        </select>
                      </label>
                      <label>
                        <span className="muted">Custom monthly price</span>
                        <input className="input" data-testid="platform-commercial-monthly-price" type="number" min="0" step="0.01" value={commercialForm.customMonthlyPrice} onChange={(event) => setCommercialForm((current) => ({ ...current, customMonthlyPrice: event.target.value }))} placeholder="Use plan price" />
                      </label>
                      <label>
                        <span className="muted">Custom annual price</span>
                        <input className="input" data-testid="platform-commercial-annual-price" type="number" min="0" step="0.01" value={commercialForm.customAnnualPrice} onChange={(event) => setCommercialForm((current) => ({ ...current, customAnnualPrice: event.target.value }))} placeholder="Use plan price" />
                      </label>
                      <label className="toggle-row">
                        <input type="checkbox" data-testid="platform-commercial-grandfathered" checked={commercialForm.grandfatheredPricing} onChange={(event) => setCommercialForm((current) => ({ ...current, grandfatheredPricing: event.target.checked }))} />
                        Grandfathered pricing
                      </label>
                      <label className="toggle-row">
                        <input type="checkbox" data-testid="platform-commercial-paused" checked={commercialForm.paused} onChange={(event) => setCommercialForm((current) => ({ ...current, paused: event.target.checked }))} />
                        Pause new subscription and job-pack purchases without locking workspace data.
                      </label>
                      <label>
                        <span className="muted">Billing note</span>
                        <textarea className="input" data-testid="platform-commercial-note" value={commercialForm.billingNote} onChange={(event) => setCommercialForm((current) => ({ ...current, billingNote: event.target.value }))} />
                      </label>
                      <label>
                        <span className="muted">Change reason</span>
                        <input className="input" data-testid="platform-commercial-reason" value={commercialForm.reason} onChange={(event) => setCommercialForm((current) => ({ ...current, reason: event.target.value }))} />
                      </label>
                    </div>
                    <button className="button" type="button" data-testid="platform-commercial-save" disabled={commercialBusy || commercialForm.reason.trim().length < 8} onClick={() => void saveCommercialControl()}>
                      {commercialBusy ? 'Saving...' : 'Confirm commercial change'}
                    </button>
                  </div>

                  <div className="card platform-admin-card-stack platform-admin-card-stack--analytic" data-testid="platform-pricing-controls">
                    <div>
                      <div className="platform-admin-card-heading">
                        <IconBadge icon="billing" tone="revenue" />
                        <strong>Pricing adjustment</strong>
                      </div>
                      <p className="muted">Commercial control for the selected workspace only.</p>
                    </div>
                    <div className="list">
                      <label>
                        <span className="muted">Adjustment type</span>
                        <select className="input" data-testid="platform-pricing-type" value={pricingForm.type} onChange={(event) => setPricingForm((current) => ({ ...current, type: event.target.value as 'percentage' | 'fixed' }))}>
                          <option value="percentage">Percentage discount</option>
                          <option value="fixed">Fixed discount</option>
                        </select>
                      </label>
                      <label>
                        <span className="muted">Value</span>
                        <input className="input" data-testid="platform-pricing-value" type="number" min="0.01" step={pricingForm.type === 'percentage' ? '1' : '0.01'} value={pricingForm.value} onChange={(event) => setPricingForm((current) => ({ ...current, value: event.target.value }))} />
                      </label>
                      <label>
                        <span className="muted">Duration</span>
                        <select className="input" data-testid="platform-pricing-duration" value={pricingForm.duration} onChange={(event) => setPricingForm((current) => ({ ...current, duration: event.target.value as 'one_time' | 'recurring' | 'until_date' }))}>
                          <option value="one_time">One-time</option>
                          <option value="recurring">Recurring</option>
                          <option value="until_date">Until date</option>
                        </select>
                      </label>
                      {pricingForm.duration === 'until_date' ? (
                        <label>
                          <span className="muted">Expiry</span>
                          <input className="input" data-testid="platform-pricing-expiry" type="date" value={pricingForm.expiresAt} onChange={(event) => setPricingForm((current) => ({ ...current, expiresAt: event.target.value }))} />
                        </label>
                      ) : null}
                      <label>
                        <span className="muted">Reason</span>
                        <input className="input" data-testid="platform-pricing-reason" value={pricingForm.reason} onChange={(event) => setPricingForm((current) => ({ ...current, reason: event.target.value }))} />
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button className="button" type="button" data-testid="platform-pricing-save" disabled={pricingBusy} onClick={() => void savePricingAdjustment(tenant.pricingState?.adjustment ? 'PATCH' : 'POST')}>
                        {pricingBusy ? 'Saving...' : tenant.pricingState?.adjustment ? 'Confirm pricing update' : 'Confirm pricing'}
                      </button>
                      <button className="button secondary" type="button" data-testid="platform-pricing-remove" disabled={pricingBusy || !tenant.pricingState?.adjustment} onClick={() => void removePricingAdjustment()}>
                        Remove pricing
                      </button>
                    </div>
                  </div>

	                  <div className="card platform-admin-card-stack platform-admin-card-stack--support" data-testid="platform-trial-controls">
                    <div>
                      <div className="platform-admin-card-heading">
                        <IconBadge icon="trial" tone="warn" />
                        <strong>Trial override</strong>
                      </div>
                      <p className="muted">Pre-billing support control for the selected workspace only.</p>
                    </div>
                    <div className="list">
                      <label>
                        <span className="muted">Trial start</span>
                        <input className="input" data-testid="platform-trial-start" type="date" value={trialForm.startedAt} onChange={(event) => setTrialForm((current) => ({ ...current, startedAt: event.target.value }))} />
                      </label>
                      <label>
                        <span className="muted">Trial end</span>
                        <input className="input" data-testid="platform-trial-end" type="date" value={trialForm.endsAt} onChange={(event) => setTrialForm((current) => ({ ...current, endsAt: event.target.value }))} />
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button className="button" type="button" data-testid="platform-trial-save" disabled={trialBusy || !trialForm.endsAt} onClick={() => void saveTrialOverride(false)}>
                        {trialBusy ? 'Saving...' : 'Confirm trial change'}
                      </button>
                      <button className="button secondary" type="button" data-testid="platform-trial-clear" disabled={trialBusy} onClick={() => void saveTrialOverride(true)}>
                        Confirm trial end
                      </button>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="button secondary" type="button" data-testid="platform-trial-extend-7" disabled={trialBusy} onClick={() => void runTrialLifecycleAction('extend', 7)}>Extend 7 days</button>
                        <button className="button secondary" type="button" data-testid="platform-trial-pause" disabled={trialBusy} onClick={() => void runTrialLifecycleAction('pause')}>Pause trial</button>
                        <button className="button secondary" type="button" data-testid="platform-trial-resume" disabled={trialBusy} onClick={() => void runTrialLifecycleAction('resume')}>Resume trial</button>
                        <button className="button secondary" type="button" data-testid="platform-trial-expire" disabled={trialBusy} onClick={() => void runTrialLifecycleAction('expire')}>Force expiry</button>
                      </div>
	                    </div>
	                  </div>

	                  <div className="card platform-admin-card-stack platform-admin-card-stack--analytic" data-testid="platform-job-allowance-controls">
	                    <div>
	                      <div className="platform-admin-card-heading">
	                        <IconBadge icon="billing" tone="success" />
	                        <strong>Job allowance control</strong>
	                      </div>
	                      <p className="muted">Platform-only monthly allowance, manual credits, promotional credits, and enterprise override state.</p>
	                    </div>
	                    <div className="platform-admin-list">
	                      <p className="muted">Plan allowance: {tenant.jobAllowanceControl?.summary?.planIncludedAllowance ?? 'unknown'}</p>
	                      <p className="muted">Current available: {tenant.jobAllowanceControl?.summary?.unlimitedJobs ? 'Unlimited' : tenant.jobAllowanceControl?.summary?.remainingAllowance ?? tenant.jobAllowanceControl?.summary?.totalAvailableNow ?? 'unknown'}</p>
	                      <p className="muted">Manual credits: {tenant.jobAllowanceControl?.summary?.manualCreditsTotal ?? 0} • Temporary: {tenant.jobAllowanceControl?.summary?.temporaryCreditsTotal ?? 0}</p>
	                    </div>
	                    <div className="list">
	                      <label>
	                        <span className="muted">Monthly allowance override</span>
	                        <input className="input" data-testid="platform-job-allowance-monthly" type="number" min="0" value={allowanceForm.monthlyJobAllowance} onChange={(event) => setAllowanceForm((current) => ({ ...current, monthlyJobAllowance: event.target.value }))} />
	                      </label>
	                      <label>
	                        <span className="muted">Recurring extra allowance</span>
	                        <input className="input" data-testid="platform-job-allowance-recurring-extra" type="number" min="0" value={allowanceForm.recurringExtraAllowance} onChange={(event) => setAllowanceForm((current) => ({ ...current, recurringExtraAllowance: event.target.value }))} />
	                      </label>
	                      <label className="toggle-row">
	                        <input type="checkbox" checked={allowanceForm.unlimitedJobs} onChange={(event) => setAllowanceForm((current) => ({ ...current, unlimitedJobs: event.target.checked }))} />
	                        Unlimited jobs
	                      </label>
	                      <label>
	                        <span className="muted">Manual credit delta</span>
	                        <input className="input" data-testid="platform-job-allowance-credit-delta" type="number" step="1" value={allowanceForm.creditDelta} onChange={(event) => setAllowanceForm((current) => ({ ...current, creditDelta: event.target.value }))} />
	                      </label>
	                      <label>
	                        <span className="muted">Manual job-pack grant</span>
	                        <input className="input" data-testid="platform-job-pack-credit-count" type="number" min="0" step="1" value={allowanceForm.jobPackCreditCount} onChange={(event) => setAllowanceForm((current) => ({ ...current, jobPackCreditCount: event.target.value }))} />
	                      </label>
	                      <label>
	                        <span className="muted">Temporary promotional credits</span>
	                        <input className="input" data-testid="platform-job-allowance-temp" type="number" min="0" step="1" value={allowanceForm.temporaryCreditCount} onChange={(event) => setAllowanceForm((current) => ({ ...current, temporaryCreditCount: event.target.value }))} />
	                      </label>
	                      <label>
	                        <span className="muted">Temporary credit expiry</span>
	                        <input className="input" data-testid="platform-job-allowance-expiry" type="date" value={allowanceForm.expiresAt} onChange={(event) => setAllowanceForm((current) => ({ ...current, expiresAt: event.target.value }))} />
	                      </label>
	                      <label>
	                        <span className="muted">Enterprise/custom plan note</span>
	                        <input className="input" data-testid="platform-job-allowance-note" value={allowanceForm.enterprisePlanNote} onChange={(event) => setAllowanceForm((current) => ({ ...current, enterprisePlanNote: event.target.value }))} />
	                      </label>
	                      <label>
	                        <span className="muted">Reason</span>
	                        <input className="input" data-testid="platform-job-allowance-reason" value={allowanceForm.reason} onChange={(event) => setAllowanceForm((current) => ({ ...current, reason: event.target.value }))} />
	                      </label>
	                    </div>
	                    <button className="button" type="button" data-testid="platform-job-allowance-save" disabled={allowanceBusy} onClick={() => void saveJobAllowanceControl()}>
	                      {allowanceBusy ? 'Saving...' : 'Confirm allowance change'}
	                    </button>
	                  </div>
	                </div>

                <div className="platform-admin-detail-grid">
                  <div className="card platform-admin-card-stack platform-admin-card-stack--support">
                    <div>
                      <div className="platform-admin-card-heading">
                        <IconBadge icon="support" tone="warn" />
                        <strong>Support quick facts</strong>
                      </div>
                      <p className="muted">What support should know before replying to the customer.</p>
                    </div>
                    <div className="platform-admin-list">
                      <p className="muted">Owner verification: {tenant.support?.ownerEmailVerified ? 'verified' : 'not verified'}</p>
                      <p className="muted">Last login: {formatDateTime(tenant.support?.ownerLastLoginAt)}</p>
                      <p className="muted">Last active: {formatDateTime(tenant.support?.ownerLastActiveAt)}</p>
                      <p className="muted">Payments enabled: {tenant.support?.paymentsEnabled ? 'yes' : 'no'}</p>
                      <p className="muted">Stripe ready: {tenant.support?.stripeConfigured ? 'yes' : 'no'}</p>
                      <p className="muted">Customer collection: {tenant.billing?.paymentCollection?.customerCollection?.preferredProvider === 'STRIPE' ? 'Stripe' : 'Manual follow-up'}</p>
                      <p className="muted">Provider-ready requests: {(tenant.billing?.paymentCollection?.customerCollection?.requestedProviders || []).join(', ') || 'None'}</p>
                    </div>
                  </div>
                  <div className="card platform-admin-card-stack platform-admin-card-stack--system">
                    <div>
                      <div className="platform-admin-card-heading">
                        <IconBadge icon="system" tone="info" />
                        <strong>Operational readiness</strong>
                      </div>
                      <p className="muted">Safe delivery and integration states for this workspace only.</p>
                    </div>
                    <div className="platform-admin-list">
                      <p className="muted">Email state: {humanizeState(tenant.operations?.email.status || 'unknown')}</p>
                      <p className="muted">Webhook state: {humanizeState(tenant.operations?.integrations?.webhookPlatform?.state || 'disabled')}</p>
                      <p className="muted">Active webhook endpoints: {tenant.operations?.integrations?.webhookPlatform?.activeEndpointCount || 0}</p>
                      <p className="muted">Recent webhook delivery failures: {tenant.operations?.integrations?.webhookPlatform?.failedRecentDeliveries || 0}</p>
                      <p className="muted">Last webhook success: {formatDateTime(tenant.operations?.integrations?.webhookPlatform?.lastSuccessAt)}</p>
                      <p className="muted">Automation delivery: {humanizeState(tenant.operations?.integrations?.automationDelivery?.state || 'disabled')}</p>
                      <p className="muted">Bookings module: {tenant.operations?.integrations?.moduleFlags?.bookingsEnabled ? 'enabled' : 'off'}</p>
                      <p className="muted">Accounting module: {tenant.operations?.integrations?.moduleFlags?.accountingEnabled ? 'enabled' : 'off'}</p>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {tenant.links?.customerBilling ? <a className="button secondary" href={tenant.links.customerBilling} target="_blank" rel="noreferrer">Open customer billing</a> : null}
                  {tenant.links?.customerSettings ? <a className="button secondary" href={tenant.links.customerSettings} target="_blank" rel="noreferrer">Open customer settings</a> : null}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </PlatformShell>
  );
}

function SectionHeading({ title, description, icon, tone }: { title: string; description: string; icon: IconName; tone: SemanticTone }) {
  return (
    <div className="platform-admin-section-copy">
      <div className="platform-admin-section-copy__eyebrow">
        <IconBadge icon={icon} tone={tone} />
        <span>{title}</span>
      </div>
      <h2>{title}</h2>
      <p className="muted">{description}</p>
    </div>
  );
}

function MetricCard({
  dataTestId,
  label,
  value,
  detail,
  detailTestId,
  tone = 'neutral',
  icon,
  compact = false,
}: {
  dataTestId: string;
  label: string;
  value: string;
  detail?: string;
  detailTestId?: string;
  tone?: SemanticTone;
  icon: IconName;
  compact?: boolean;
}) {
  return (
    <div className={`platform-admin-kpi-card platform-admin-kpi-card--${tone}${compact ? ' platform-admin-kpi-card--compact' : ''}`} data-testid={dataTestId}>
      <div className="platform-admin-kpi-card__head">
        <span className="platform-admin-kpi-card__label">{label}</span>
        <IconBadge icon={icon} tone={tone} size={compact ? 'sm' : 'md'} />
      </div>
      <strong className="platform-admin-kpi-card__value">{value}</strong>
      {detail ? <p className="muted platform-admin-kpi-card__detail" data-testid={detailTestId}>{detail}</p> : null}
    </div>
  );
}

function SignalCard({ label, value, icon, tone }: { label: string; value: string; icon: IconName; tone: SemanticTone }) {
  return (
    <div className={`platform-admin-signal-card platform-admin-signal-card--${tone}`}>
      <div className="platform-admin-card-heading">
        <IconBadge icon={icon} tone={tone} size="sm" />
        <span className="platform-admin-signal-card__label">{label}</span>
      </div>
      <strong className="platform-admin-signal-card__value">{value}</strong>
    </div>
  );
}

function ChartCard({
  title,
  description,
  annotation,
  tone,
  icon,
  children,
  dataTestId,
}: {
  title: string;
  description: string;
  annotation?: string;
  tone: SemanticTone;
  icon: IconName;
  children: React.ReactNode;
  dataTestId?: string;
}) {
  return (
    <div className={`card platform-admin-card-stack platform-admin-card-stack--chart platform-admin-card-stack--${tone}`} data-testid={dataTestId}>
      <div>
        <div className="platform-admin-card-heading">
          <IconBadge icon={icon} tone={tone} />
          <strong>{title}</strong>
          {annotation ? <span className="platform-admin-chart-annotation">{annotation}</span> : null}
        </div>
        <p className="muted">{description}</p>
      </div>
      {children}
    </div>
  );
}

function TripleTrendChart({ rows }: { rows: Array<{ label: string; newTenants: number; trialsStarted: number; converted: number }> }) {
  const maxValue = Math.max(1, ...rows.flatMap((row) => [row.newTenants, row.trialsStarted, row.converted]));
  return (
    <div className="platform-admin-trend-chart-wrap">
      <div className="platform-admin-chart-legend">
        <LegendItem tone="info" label="New tenants" />
        <LegendItem tone="neutral" label="Trials started" />
        <LegendItem tone="success" label="Converted" />
      </div>
      <div className="platform-admin-trend-chart">
      {rows.map((row) => (
        <div key={row.label} className="platform-admin-trend-chart__group">
          <div className="platform-admin-trend-chart__bars">
            <span className="platform-admin-trend-chart__bar platform-admin-trend-chart__bar--one" style={{ height: `${(row.newTenants / maxValue) * 100}%` }} />
            <span className="platform-admin-trend-chart__bar platform-admin-trend-chart__bar--two" style={{ height: `${(row.trialsStarted / maxValue) * 100}%` }} />
            <span className="platform-admin-trend-chart__bar platform-admin-trend-chart__bar--three" style={{ height: `${(row.converted / maxValue) * 100}%` }} />
          </div>
          <div className="platform-admin-trend-chart__label">{row.label}</div>
        </div>
      ))}
      {!rows.length ? <p className="muted">No trend data available yet.</p> : null}
      </div>
    </div>
  );
}

function HorizontalBarChart({ rows, tone = 'info' }: { rows: Array<{ label: string; value: number }>; tone?: SemanticTone }) {
  const maxValue = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className={`platform-admin-bar-list platform-admin-bar-list--${tone}`}>
      {rows.map((row) => (
        <div key={row.label} className="platform-admin-bar-list__row">
          <div className="platform-admin-bar-list__labels">
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
          <div className="platform-admin-bar-list__track">
            <span className="platform-admin-bar-list__fill" style={{ width: `${(row.value / maxValue) * 100}%` }} />
          </div>
        </div>
      ))}
      {!rows.length ? <p className="muted">No chart data available yet.</p> : null}
    </div>
  );
}

function FunnelChart({ rows }: { rows: Array<{ label: string; count: number }> }) {
  const maxValue = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div className="platform-admin-funnel">
      {rows.map((row) => (
        <div key={row.label} className="platform-admin-funnel__step" style={{ width: `${40 + (row.count / maxValue) * 60}%` }}>
          <span>{row.label}</span>
          <strong>{row.count}</strong>
        </div>
      ))}
      {!rows.length ? <p className="muted">No funnel data available yet.</p> : null}
    </div>
  );
}

function CurrencyBarChart({ rows }: { rows: Array<{ currency: string; amountCents: number }> }) {
  return (
    <HorizontalBarChart
      rows={rows.map((row) => ({
        label: row.currency,
        value: Math.round(row.amountCents / 100),
      }))}
      tone="revenue"
    />
  );
}

function ReadinessPanel({ title, rows }: { title: string; rows: Array<{ label: string; value: number }> }) {
  return (
    <div className="platform-admin-readiness-card">
      <div className="platform-admin-card-heading">
        <IconBadge icon={title === 'Email' ? 'mail' : title === 'Payments' ? 'billing' : 'system'} tone={title === 'Email' ? 'success' : title === 'Payments' ? 'info' : 'neutral'} size="sm" />
        <strong>{title}</strong>
      </div>
      <div className="platform-admin-list">
        {rows.map((row) => (
          <div key={row.label} className="platform-admin-readiness-row">
            <span className="muted">{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ children, tone }: { children: React.ReactNode; tone: Exclude<SemanticTone, 'revenue' | 'info'> | 'info' }) {
  return <span className={`platform-admin-status-pill platform-admin-status-pill--${tone}`}>{children}</span>;
}

function DiagnosticSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 10 }}>
      <strong>{title}</strong>
      <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>{children}</div>
    </div>
  );
}

function catalogDiagnosticRows(checks: Record<string, any>) {
  const labels: Record<string, string> = {
    credentialValid: 'Credential valid',
    stripeReachable: 'Stripe reachable',
    priceIdProvided: 'Price ID provided',
    priceFound: 'Price found',
    productIdProvided: 'Product ID provided',
    productFound: 'Product found',
    priceBelongsToProduct: 'Price belongs to product',
    lookupKeyMatches: 'Lookup key matches',
    currencyMatches: 'Currency matches',
    amountMatches: 'Amount matches',
    activeMatches: 'Active state matches',
    localMappingComplete: 'Local mapping complete',
    runtimeLoaded: 'Runtime loaded',
    canSave: 'Can save',
  };
  return Object.keys(labels).map((key) => ({ key, label: labels[key], check: checks?.[key] || null }));
}

function diagnosticProblems(checks: Record<string, any>) {
  return catalogDiagnosticRows(checks)
    .filter((row) => row.check?.status === 'fail' || row.check?.status === 'warning')
    .map((row) => `${row.label}: ${row.check.message}`);
}

function statusIcon(status?: string) {
  if (status === 'pass') return 'OK';
  if (status === 'fail') return 'FAIL';
  if (status === 'warning') return 'WARN';
  return 'WAIT';
}

function LegendItem({ tone, label }: { tone: SemanticTone; label: string }) {
  return (
    <span className="platform-admin-legend-item">
      <span className={`platform-admin-legend-swatch platform-admin-legend-swatch--${tone}`} />
      {label}
    </span>
  );
}

type IconName = 'control' | 'growth' | 'support' | 'system' | 'workspace' | 'trial' | 'billing' | 'attention' | 'shield' | 'mail' | 'conversion';
type SemanticTone = 'neutral' | 'info' | 'success' | 'warn' | 'danger' | 'revenue';

function HeroSignal({ icon, label, value, tone }: { icon: IconName; label: string; value: string; tone: SemanticTone }) {
  return (
    <div className={`platform-admin-hero-signal platform-admin-hero-signal--${tone}`}>
      <IconBadge icon={icon} tone={tone} />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function IconBadge({ icon, tone, size = 'md' }: { icon: IconName; tone: SemanticTone; size?: 'sm' | 'md' }) {
  return (
    <span className={`platform-admin-icon-badge platform-admin-icon-badge--${tone} platform-admin-icon-badge--${size}`} aria-hidden="true">
      <IconGlyph icon={icon} />
    </span>
  );
}

function IconGlyph({ icon }: { icon: IconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 24 24" className="platform-admin-icon-glyph">
      {icon === 'control' ? (
        <>
          <circle cx="12" cy="12" r="8" {...common} />
          <path d="M12 7v5l3 2" {...common} />
        </>
      ) : null}
      {icon === 'growth' ? (
        <>
          <path d="M5 16l4-4 3 3 6-7" {...common} />
          <path d="M15 8h3v3" {...common} />
        </>
      ) : null}
      {icon === 'support' ? (
        <>
          <path d="M6 10a6 6 0 0 1 12 0v5a2 2 0 0 1-2 2h-2" {...common} />
          <path d="M8 18h4" {...common} />
          <rect x="4" y="10" width="3" height="6" rx="1.5" {...common} />
          <rect x="17" y="10" width="3" height="6" rx="1.5" {...common} />
        </>
      ) : null}
      {icon === 'system' ? (
        <>
          <rect x="4" y="5" width="16" height="14" rx="3" {...common} />
          <path d="M8 9h8M8 13h5" {...common} />
        </>
      ) : null}
      {icon === 'workspace' ? (
        <>
          <rect x="4" y="6" width="7" height="5" rx="1.5" {...common} />
          <rect x="13" y="6" width="7" height="5" rx="1.5" {...common} />
          <rect x="4" y="13" width="16" height="5" rx="1.5" {...common} />
        </>
      ) : null}
      {icon === 'trial' ? (
        <>
          <path d="M12 5v7l4 2" {...common} />
          <circle cx="12" cy="12" r="8" {...common} />
        </>
      ) : null}
      {icon === 'billing' ? (
        <>
          <rect x="4" y="6" width="16" height="12" rx="2.5" {...common} />
          <path d="M4 10h16M8 14h4" {...common} />
        </>
      ) : null}
      {icon === 'attention' ? (
        <>
          <path d="M12 4l8 14H4l8-14z" {...common} />
          <path d="M12 9v4M12 16h.01" {...common} />
        </>
      ) : null}
      {icon === 'shield' ? (
        <>
          <path d="M12 4l7 3v5c0 4.3-2.8 7.2-7 8-4.2-.8-7-3.7-7-8V7l7-3z" {...common} />
          <path d="M9.5 12l1.7 1.7L14.8 10" {...common} />
        </>
      ) : null}
      {icon === 'mail' ? (
        <>
          <rect x="4" y="6" width="16" height="12" rx="2" {...common} />
          <path d="M5 8l7 5 7-5" {...common} />
        </>
      ) : null}
      {icon === 'conversion' ? (
        <>
          <path d="M7 7h10v4" {...common} />
          <path d="M17 17H7v-4" {...common} />
          <path d="M17 7l-3 3M7 17l3-3" {...common} />
        </>
      ) : null}
    </svg>
  );
}

const tableHeaderStyle: CSSProperties = {
  padding: '10px 8px',
  color: '#94a3b8',
  fontSize: 12,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
};

const tableCellStyle: CSSProperties = {
  padding: '12px 8px',
  verticalAlign: 'top',
};

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'GBP' }).format((cents || 0) / 100);
}

function formatPercentage(value: number) {
  return `${((value || 0) * 100).toFixed(1)}%`;
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not available';
  return parsed.toLocaleString();
}

function describeAdjustment(adjustment: PricingAdjustment | null) {
  if (!adjustment) return 'No custom pricing is active for this workspace.';
  const valueLabel = adjustment.type === 'percentage' ? `${adjustment.value}% off` : `${adjustment.value.toFixed(2)} off`;
  const durationLabel =
    adjustment.duration === 'one_time'
      ? 'Applies to the next payment only'
      : adjustment.duration === 'recurring'
        ? 'Applies to future payments'
        : adjustment.expiresAt
          ? `Applies until ${new Date(adjustment.expiresAt).toLocaleDateString()}`
          : 'Applies until removed';
  return `${valueLabel}. ${durationLabel}.`;
}

function describeTrialStatus(row: MembershipRow) {
  if (row.trialStatus === 'active') {
    return `Active (${row.trialDaysRemaining} day${row.trialDaysRemaining === 1 ? '' : 's'} left)`;
  }
  if (row.trialStatus === 'expired') return 'Expired';
  if (row.trialStatus === 'converted') return 'Converted';
  return 'Not applicable';
}

function describeRevenueAmounts(rows: Array<{ currency: string; amountCents: number }>) {
  if (!rows.length) return formatMoney(0, 'GBP');
  return rows.map((row) => formatMoney(row.amountCents, row.currency)).join(' • ');
}

function humanizeStripeKeyType(value: 'restricted' | 'standard_secret' | 'missing') {
  if (value === 'restricted') return 'Restricted key';
  if (value === 'standard_secret') return 'Standard secret key';
  return 'Missing';
}

function humanizeEmailState(value: 'ready' | 'needs_attention') {
  return value === 'ready' ? 'Email ready' : 'Email needs attention';
}

function humanizeState(value: string) {
  return String(value || 'unknown').replace(/_/g, ' ');
}
