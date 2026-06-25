import type { BillingInterval, PlanCode } from '@prisma/client';

export const FEATURE_KEYS = [
  'bookings_enabled',
  'accounting_enabled',
  'payments_enabled',
  'social_enabled',
  'ai_enabled',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type PricingFeatureGroupKey = 'core_operations' | 'growth_features' | 'advanced_controls';
export type PricingUpgradeTriggerKey =
  | 'team_size'
  | 'job_volume'
  | 'portal_and_bookings_adoption'
  | 'repeat_work_adoption'
  | 'integration_requirements'
  | 'automation_usage'
  | 'multi_location_rollout'
  | 'governance_and_reporting';

type PricingFeatureGroupDefinition = {
  key: PricingFeatureGroupKey;
  label: string;
  summary: string;
  capabilities: string[];
};

type PlanPackaging = {
  code: string;
  tierName: string;
  publicName: string;
  position: number;
  summary: string;
  rationale: string;
  idealFor: string;
  checkoutMode: 'signup_only' | 'stripe_checkout';
  completedJobsPerMonth: number | null;
  completedJobsLabel: string;
  extraJobCompletionPacks: {
    status: 'coming_soon' | 'enabled_when_configured';
    message: string;
  };
  includedGroups: PricingFeatureGroupKey[];
  highlightedCapabilities: string[];
  naturalUpgradeTriggers: PricingUpgradeTriggerKey[];
  guidance: {
    recommendedMaxActiveUsers: number | null;
    recommendedMonthlyJobs: number | null;
    recommendedLocations: number | null;
  };
};

type PlanDefinition = {
  code: PlanCode;
  name: string;
  pricesCents: {
    MONTHLY: number;
    ANNUAL: number;
  };
  packaging: PlanPackaging;
  features: Record<string, boolean | number | null | string | string[] | Record<string, unknown>>;
  aiRequestsLimitMonthly: number;
  aiTokensLimitMonthly: number | null;
};

type PublicPricingTier = {
  code: string;
  publicName: string;
  summary: string;
  idealFor: string;
  rationale: string;
  position: number;
  checkoutMode: 'signup_only' | 'stripe_checkout';
  completedJobsPerMonth: number | null;
  completedJobsLabel: string;
  extraJobCompletionPacks: {
    status: 'coming_soon' | 'enabled_when_configured';
    message: string;
  };
  includedGroups: PricingFeatureGroupKey[];
  highlightedCapabilities: string[];
  naturalUpgradeTriggers: PricingUpgradeTriggerKey[];
  guidance: {
    recommendedMaxActiveUsers: number | null;
    recommendedMonthlyJobs: number | null;
    recommendedLocations: number | null;
  };
  pricesCents: {
    MONTHLY: number;
    ANNUAL: number;
  } | null;
};

export const DEFAULT_PLAN_CODE: PlanCode = 'SOLE_TRADER';
export const DEFAULT_INTERVAL: BillingInterval = 'MONTHLY';

export const FREE_PLAN_TIER: PublicPricingTier = {
  code: 'FREE',
  publicName: 'Free',
  summary: 'For trying the operator workflow with a lighter monthly allowance.',
  idealFor: 'New workspaces testing the workflow before committing to a paid subscription.',
  rationale: 'Keeps a truthful low-friction entry point without pretending Stripe checkout is needed for a free account.',
  position: 0,
  checkoutMode: 'signup_only',
  completedJobsPerMonth: 20,
  completedJobsLabel: 'Up to 20 job completions/month',
  extraJobCompletionPacks: {
    status: 'coming_soon',
    message: 'Extra job packs are priced at £5, £12.50, £25, and £50 when enabled for busier months.',
  },
  includedGroups: ['core_operations'],
  highlightedCapabilities: [
    'Operator-first workflow and submitted job authority',
    'Customer-safe booking and output foundations',
    'A clear upgrade path when monthly demand grows',
  ],
  naturalUpgradeTriggers: ['job_volume', 'portal_and_bookings_adoption'],
  guidance: {
    recommendedMaxActiveUsers: 1,
    recommendedMonthlyJobs: 20,
    recommendedLocations: 1,
  },
  pricesCents: null,
};

export const PRICING_FEATURE_GROUPS: Record<PricingFeatureGroupKey, PricingFeatureGroupDefinition> = {
  core_operations: {
    key: 'core_operations',
    label: 'Core operations',
    summary: 'The essential workflow needed to reach first value quickly and run day-to-day work.',
    capabilities: [
      'Jobs, customers, and service records',
      'Basic billing outputs and job completion flow',
      'Operator workspace, CRM, quotes, and revenue follow-through',
    ],
  },
  growth_features: {
    key: 'growth_features',
    label: 'Growth features',
    summary: 'The tools that help teams take more demand, coordinate work, and keep customers engaged.',
    capabilities: [
      'Calendar, scheduling, and bookings',
      'Customer portal usage and approvals',
      'Service plans and repeat work',
    ],
  },
  advanced_controls: {
    key: 'advanced_controls',
    label: 'Advanced controls',
    summary: 'The controls that matter once the business needs reporting, integrations, scale, and automation.',
    capabilities: [
      'Analytics, performance, and compliance',
      'Integrations, API tokens, and webhooks',
      'Automation, AI scaling, and multi-location governance',
    ],
  },
};

export const UPGRADE_TRIGGER_DEFINITIONS: Record<
  PricingUpgradeTriggerKey,
  { label: string; summary: string }
> = {
  team_size: {
    label: 'Team size',
    summary: 'Upgrade when more people need role-based coordination across office and field work.',
  },
  job_volume: {
    label: 'Job volume',
    summary: 'Upgrade when monthly work volume outgrows the starter workload and reporting depth.',
  },
  portal_and_bookings_adoption: {
    label: 'Portal and bookings adoption',
    summary: 'Upgrade when online demand capture and customer self-service become daily workflows.',
  },
  repeat_work_adoption: {
    label: 'Repeat work adoption',
    summary: 'Upgrade when service plans and recurring work become important revenue channels.',
  },
  integration_requirements: {
    label: 'Integration requirements',
    summary: 'Upgrade when accounting, calendar sync, API, or webhooks become operationally important.',
  },
  automation_usage: {
    label: 'Automation usage',
    summary: 'Upgrade when follow-up rules and AI-assisted workflows save meaningful team time.',
  },
  multi_location_rollout: {
    label: 'Multi-location rollout',
    summary: 'Upgrade when the business needs cross-site visibility, rollout structure, and operational consistency.',
  },
  governance_and_reporting: {
    label: 'Governance and reporting',
    summary: 'Upgrade when analytics, compliance, and managerial controls become business-critical.',
  },
};

export const PLAN_DEFINITIONS: Record<PlanCode, PlanDefinition> = {
  SOLE_TRADER: {
    code: 'SOLE_TRADER',
    name: 'Sole Trader',
    pricesCents: {
      MONTHLY: 1900,
      ANNUAL: 19000,
    },
    packaging: {
      code: 'SOLE_TRADER',
      tierName: 'Sole Trader',
      publicName: 'Sole Trader',
      position: 1,
      summary: 'For small service businesses proving value with one connected workflow.',
      rationale: 'Keeps first value friction-free by covering core operations before monetisation pressure appears.',
      idealFor: 'Owner-led teams and early operators getting jobs, customers, and outputs under one roof.',
      checkoutMode: 'stripe_checkout',
      completedJobsPerMonth: 60,
      completedJobsLabel: 'Up to 60 job completions/month',
      extraJobCompletionPacks: {
        status: 'coming_soon',
        message: '10, 25, 50, 100, 250, and 500 extra job packs are priced at £5, £12.50, £25, £50, £125, and £250 when synced and enabled.',
      },
      includedGroups: ['core_operations'],
      highlightedCapabilities: [
        'Jobs, customers, and service records',
        'Quotes and billing follow-through',
        'A clean path to first completed job',
      ],
      naturalUpgradeTriggers: ['team_size', 'job_volume', 'portal_and_bookings_adoption'],
      guidance: {
        recommendedMaxActiveUsers: 3,
        recommendedMonthlyJobs: 60,
        recommendedLocations: 1,
      },
    },
    features: {
      bookings_enabled: true,
      accounting_enabled: false,
      payments_enabled: true,
      social_enabled: false,
      ai_enabled: true,
      storage_bytes_limit: 1_000_000_000,
      jobs_created_limit: 200,
      completed_jobs_monthly_limit: 60,
      completed_jobs_monthly_label: 'Up to 60 job completions/month',
      extra_job_completion_packs_status: 'coming_soon',
      pricing_tier_name: 'Sole Trader',
      pricing_tier_position: 1,
      pricing_group_keys: ['core_operations'],
      pricing_upgrade_trigger_keys: ['team_size', 'job_volume', 'portal_and_bookings_adoption'],
      recommended_active_users_max: 3,
      recommended_locations_max: 1,
    },
    aiRequestsLimitMonthly: 200,
    aiTokensLimitMonthly: 100000,
  },
  BUSINESS: {
    code: 'BUSINESS',
    name: 'Business',
    pricesCents: {
      MONTHLY: 5900,
      ANNUAL: 59000,
    },
    packaging: {
      code: 'BUSINESS',
      tierName: 'Business',
      publicName: 'Business',
      position: 2,
      summary: 'For growing teams using scheduling, bookings, portal workflows, and repeat service to win more work.',
      rationale: 'Monetises once the product is helping the team capture and coordinate more demand, not before.',
      idealFor: 'Growing service teams with office and field coordination, customer self-service, and repeat work.',
      checkoutMode: 'stripe_checkout',
      completedJobsPerMonth: 200,
      completedJobsLabel: 'Up to 200 job completions/month',
      extraJobCompletionPacks: {
        status: 'coming_soon',
        message: '10, 25, 50, 100, 250, and 500 extra job packs are priced at £5, £12.50, £25, £50, £125, and £250 when synced and enabled.',
      },
      includedGroups: ['core_operations', 'growth_features'],
      highlightedCapabilities: [
        'Calendar, bookings, and scheduling',
        'Customer portal and approvals',
        'Recurring service plans and stronger team visibility',
      ],
      naturalUpgradeTriggers: ['team_size', 'job_volume', 'repeat_work_adoption', 'integration_requirements'],
      guidance: {
        recommendedMaxActiveUsers: 15,
        recommendedMonthlyJobs: 200,
        recommendedLocations: 3,
      },
    },
    features: {
      bookings_enabled: true,
      accounting_enabled: true,
      payments_enabled: true,
      social_enabled: false,
      ai_enabled: true,
      storage_bytes_limit: 10_000_000_000,
      jobs_created_limit: 2000,
      completed_jobs_monthly_limit: 200,
      completed_jobs_monthly_label: 'Up to 200 job completions/month',
      extra_job_completion_packs_status: 'coming_soon',
      pricing_tier_name: 'Business',
      pricing_tier_position: 2,
      pricing_group_keys: ['core_operations', 'growth_features'],
      pricing_upgrade_trigger_keys: ['team_size', 'job_volume', 'repeat_work_adoption', 'integration_requirements'],
      recommended_active_users_max: 15,
      recommended_locations_max: 3,
    },
    aiRequestsLimitMonthly: 1000,
    aiTokensLimitMonthly: 500000,
  },
  ENTERPRISE: {
    code: 'ENTERPRISE',
    name: 'Enterprise',
    pricesCents: {
      MONTHLY: 15900,
      ANNUAL: 159000,
    },
    packaging: {
      code: 'ENTERPRISE',
      tierName: 'Enterprise',
      publicName: 'Enterprise',
      position: 3,
      summary: 'For larger or more complex operators that need control, integration depth, and multi-site rollout confidence.',
      rationale: 'Captures value when the business needs automation, integrations, reporting, governance, and broader rollout support.',
      idealFor: 'High-volume, multi-team, or multi-location businesses with stronger governance and reporting needs.',
      checkoutMode: 'stripe_checkout',
      completedJobsPerMonth: 500,
      completedJobsLabel: 'Up to 500 job completions/month',
      extraJobCompletionPacks: {
        status: 'coming_soon',
        message: '10, 25, 50, 100, 250, and 500 extra job packs are priced at £5, £12.50, £25, £50, £125, and £250 when synced and enabled.',
      },
      includedGroups: ['core_operations', 'growth_features', 'advanced_controls'],
      highlightedCapabilities: [
        'Advanced analytics, compliance, and performance views',
        'API, webhooks, and broader integration needs',
        'Automation, AI scaling, and multi-location control',
      ],
      naturalUpgradeTriggers: ['integration_requirements', 'automation_usage', 'multi_location_rollout', 'governance_and_reporting'],
      guidance: {
        recommendedMaxActiveUsers: null,
        recommendedMonthlyJobs: 500,
        recommendedLocations: null,
      },
    },
    features: {
      bookings_enabled: true,
      accounting_enabled: true,
      payments_enabled: true,
      social_enabled: true,
      ai_enabled: true,
      storage_bytes_limit: 100_000_000_000,
      jobs_created_limit: 100000,
      completed_jobs_monthly_limit: 500,
      completed_jobs_monthly_label: 'Up to 500 job completions/month',
      extra_job_completion_packs_status: 'coming_soon',
      pricing_tier_name: 'Enterprise',
      pricing_tier_position: 3,
      pricing_group_keys: ['core_operations', 'growth_features', 'advanced_controls'],
      pricing_upgrade_trigger_keys: ['integration_requirements', 'automation_usage', 'multi_location_rollout', 'governance_and_reporting'],
      recommended_active_users_max: null,
      recommended_locations_max: null,
    },
    aiRequestsLimitMonthly: 10000,
    aiTokensLimitMonthly: null,
  },
};

export function formatPlanPriceLabel(amountCents: number | null | undefined, interval: BillingInterval) {
  if (!Number.isFinite(Number(amountCents)) || amountCents == null) {
    return interval === 'ANNUAL' ? 'Annual setup required' : 'Monthly setup required';
  }
  const amount = Number(amountCents) / 100;
  const formatted = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 2,
  }).format(amount);
  return interval === 'ANNUAL' ? `${formatted} per year, billed annually` : `${formatted} per month`;
}

function getPublicPricingTiers(): PublicPricingTier[] {
  const paidTiers = Object.values(PLAN_DEFINITIONS).map((plan) => ({
    code: plan.code,
    publicName: plan.packaging.publicName,
    summary: plan.packaging.summary,
    idealFor: plan.packaging.idealFor,
    rationale: plan.packaging.rationale,
    position: plan.packaging.position,
    checkoutMode: plan.packaging.checkoutMode,
    completedJobsPerMonth: plan.packaging.completedJobsPerMonth,
    completedJobsLabel: plan.packaging.completedJobsLabel,
    extraJobCompletionPacks: plan.packaging.extraJobCompletionPacks,
    includedGroups: plan.packaging.includedGroups,
    highlightedCapabilities: plan.packaging.highlightedCapabilities,
    naturalUpgradeTriggers: plan.packaging.naturalUpgradeTriggers,
    guidance: plan.packaging.guidance,
    pricesCents: plan.pricesCents,
  }));
  return [FREE_PLAN_TIER, ...paidTiers].sort((left, right) => left.position - right.position);
}

export function getCurrentFeatureMap() {
  return {
    core_operations: [
      'jobs',
      'customers',
      'basic outputs',
      'quotes',
      'revenue follow-through',
      'service records',
    ],
    growth_features: [
      'calendar',
      'scheduling',
      'bookings',
      'customer portal',
      'approvals',
      'service plans',
    ],
    advanced_controls: [
      'analytics',
      'performance',
      'compliance',
      'integrations',
      'api tokens',
      'webhooks',
      'automations',
      'multi-location controls',
      'ai scaling',
    ],
  };
}

export function getPricingModelSummary() {
  return {
    featureGroups: Object.values(PRICING_FEATURE_GROUPS),
    upgradeTriggers: Object.entries(UPGRADE_TRIGGER_DEFINITIONS).map(([key, value]) => ({
      key,
      ...value,
    })),
    tiers: getPublicPricingTiers().map((tier) => ({
        code: tier.code,
        tierName: tier.publicName,
        publicName: tier.publicName,
        summary: tier.summary,
        rationale: tier.rationale,
        idealFor: tier.idealFor,
        checkoutMode: tier.checkoutMode,
        completedJobsPerMonth: tier.completedJobsPerMonth,
        completedJobsLabel: tier.completedJobsLabel,
        priceMonthlyLabel: tier.pricesCents ? formatPlanPriceLabel(tier.pricesCents.MONTHLY, 'MONTHLY') : 'Free',
        priceAnnualLabel: tier.pricesCents ? formatPlanPriceLabel(tier.pricesCents.ANNUAL, 'ANNUAL') : 'Free',
        extraJobCompletionPacks: tier.extraJobCompletionPacks,
        includedGroups: tier.includedGroups.map((key) => ({
          key,
          label: PRICING_FEATURE_GROUPS[key].label,
        })),
        highlightedCapabilities: tier.highlightedCapabilities,
        naturalUpgradeTriggers: tier.naturalUpgradeTriggers.map((key) => ({
          key,
          label: UPGRADE_TRIGGER_DEFINITIONS[key].label,
        })),
        guidance: tier.guidance,
      })),
    onboardingPolicy: {
      firstValuePreserved: true,
      enforcementMode: 'advisory_only',
      summary: 'New users should reach first value before monetisation creates friction. Packaging is prepared now, but feature access remains unchanged in this phase.',
    },
  };
}
