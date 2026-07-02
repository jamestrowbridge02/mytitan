import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { DashboardShell } from '../../components/dashboard-shell';
import { OperatorPageHeader, OperatorStatusBadge } from '../../components/ui/operator-page';
import { ApiError, apiFetch } from '../../lib/api';
import { useBilling } from '../../lib/billing';
import { getResendVerificationMessage, getSafeVerificationError } from '../../lib/verification-resend';
import { useSectionTargeting } from '../../lib/section-targeting';

export default function BillingPage() {
  const router = useRouter();
  const { plan, subscription, trial, interval: billingInterval, stripeConfigured, paymentCollection, tenantPaymentReadiness, providerCanaries, pricingModel, jobCompletionPacks, jobCompletionAllowance, viewer, refresh } = useBilling();
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState('');
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [platformCatalog, setPlatformCatalog] = useState<any>(null);
  const [interval, setInterval] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [preferredCollectionProvider, setPreferredCollectionProvider] = useState<'STRIPE' | 'MANUAL'>('MANUAL');
  const [requestedProviders, setRequestedProviders] = useState<string[]>([]);

  useEffect(() => {
    if (billingInterval) {
      setInterval(billingInterval);
    }
  }, [billingInterval]);

  useEffect(() => {
    const preferred = paymentCollection?.customerCollection?.preferredProvider;
    if (preferred === 'STRIPE' || preferred === 'MANUAL') {
      setPreferredCollectionProvider(preferred);
    }
    setRequestedProviders(Array.isArray(paymentCollection?.customerCollection?.requestedProviders) ? paymentCollection.customerCollection.requestedProviders : []);
  }, [paymentCollection]);

  useEffect(() => {
    let cancelled = false;
    const loadPlatformStatus = async () => {
      try {
        const me = await apiFetch('/me');
        if (cancelled) return;
        setPlatformAdmin(Boolean(me?.platformAdmin));
      } catch {
        if (!cancelled) {
          setPlatformAdmin(false);
          setPlatformCatalog(null);
        }
      }
    };
    void loadPlatformStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!platformAdmin) {
      setPlatformCatalog(null);
      return;
    }
    let cancelled = false;
    const loadPlatformCatalog = async () => {
      try {
        const catalog = await apiFetch('/admin/platform/billing-catalog');
        if (!cancelled) {
          setPlatformCatalog(catalog);
        }
      } catch {
        if (!cancelled) {
          setPlatformCatalog(null);
        }
      }
    };
    void loadPlatformCatalog();
    return () => {
      cancelled = true;
    };
  }, [platformAdmin]);

  useEffect(() => {
    if (!router.isReady) return;
    const checkout = typeof router.query.checkout === 'string' ? router.query.checkout : '';
    if (checkout === 'success') {
      setInfo('Subscription checkout completed. Billing state will refresh automatically when Stripe confirms payment.');
      setError('');
      void refresh();
    } else if (checkout === 'cancel') {
      setInfo('Checkout was cancelled. You can choose a plan again when ready.');
      setError('');
    }
    const packCheckout = typeof router.query.packCheckout === 'string' ? router.query.packCheckout : '';
    if (packCheckout === 'success') {
      setInfo('Pack checkout completed. Extra allowance only increases after Stripe confirms payment.');
      setError('');
      void refresh();
    } else if (packCheckout === 'cancel') {
      setInfo('Pack checkout was cancelled. No extra allowance has been added.');
      setError('');
    }
  }, [refresh, router.isReady, router.query.checkout]);

  const currentPlanCode = (plan?.code as string | undefined) || 'SOLE_TRADER';
  const status = subscription?.status || 'inactive';
  const trialEndsAt = trial?.endsAt ? new Date(trial.endsAt) : null;
  const canManageSubscription = Boolean(viewer?.canManageSubscription);
  const canManageCollectionSettings = Boolean(viewer?.canManageCollectionSettings);
  const verificationBlocked = canManageSubscription && !viewer?.emailVerified;
  const actionBlocked = verificationBlocked || !canManageSubscription || !stripeConfigured;
  const hasActiveSubscription = subscription?.status === 'active';
  const showPlanChoices = (pricingModel?.tiers || []).length > 0;
  const currentTier = useMemo(
    () => (pricingModel?.tiers || []).find((tier) => tier.code === currentPlanCode) || null,
    [currentPlanCode, pricingModel?.tiers],
  );
  const completedJobsLabel = currentTier?.completedJobsLabel || plan?.completedJobsLabel || 'Completed jobs per month';
  const extraPacksMessage =
    currentTier?.extraJobCompletionPacks?.message ||
    'Extra job packs are priced at £5, £12.50, £25, £50, £125, and £250 when enabled.';
  const jobCompletionPackRows = jobCompletionPacks?.packs || [];
  const unlimitedJobs = jobCompletionAllowance?.unlimitedJobs === true;
  const monthlyIncludedAllowance = jobCompletionAllowance?.monthlyIncludedAllowance ?? jobCompletionAllowance?.includedAllowance ?? 0;
  const monthlyIncludedUsed = jobCompletionAllowance?.monthlyIncludedUsed ?? Math.max(0, monthlyIncludedAllowance - (jobCompletionAllowance?.includedRemaining ?? 0));
  const monthlyIncludedRemaining = jobCompletionAllowance?.monthlyIncludedRemaining ?? jobCompletionAllowance?.includedRemaining ?? 0;
  const purchasedCreditsTotal = jobCompletionAllowance?.purchasedCreditsTotal ?? jobCompletionAllowance?.purchasedExtraAllowance ?? 0;
  const purchasedCreditsUsed = jobCompletionAllowance?.purchasedCreditsUsed ?? Math.max(0, purchasedCreditsTotal - (jobCompletionAllowance?.extraRemaining ?? 0));
  const purchasedCreditsRemaining = jobCompletionAllowance?.purchasedCreditsRemaining ?? jobCompletionAllowance?.extraRemaining ?? 0;
  const purchasedCreditsDeficit = jobCompletionAllowance?.purchasedCreditsDeficit ?? Math.max(0, 0 - purchasedCreditsRemaining);
  const totalAvailableNow = jobCompletionAllowance?.totalAvailableNow ?? jobCompletionAllowance?.remainingAllowance ?? 0;
  const resetDateLabel = jobCompletionAllowance?.resetDate
    ? new Date(jobCompletionAllowance.resetDate).toLocaleDateString()
    : jobCompletionAllowance?.periodEnd
      ? new Date(jobCompletionAllowance.periodEnd).toLocaleDateString()
      : null;
  const usageForecast = useMemo(() => {
    if (!jobCompletionAllowance?.periodStart || !jobCompletionAllowance?.periodEnd) return null;
    const periodStart = new Date(jobCompletionAllowance.periodStart).getTime();
    const periodEnd = new Date(jobCompletionAllowance.periodEnd).getTime();
    const now = Date.now();
    const elapsed = Math.max(1, now - periodStart);
    const total = Math.max(elapsed, periodEnd - periodStart);
    const completed = Number(jobCompletionAllowance.completedJobsCount || 0);
    const projected = Math.round((completed / elapsed) * total);
    const recommendedPack = jobCompletionPackRows.find((pack) => pack.status === 'ready' && pack.jobCount >= Math.max(0, projected - monthlyIncludedAllowance)) || null;
    return {
      projected,
      pacing: completed > monthlyIncludedAllowance ? 'ahead' : completed >= Math.round(monthlyIncludedAllowance * 0.8) ? 'close' : 'comfortable',
      recommendedPack,
      lowCreditWarning: totalAvailableNow <= Math.max(5, Math.round(monthlyIncludedAllowance * 0.15)),
    };
  }, [jobCompletionAllowance?.completedJobsCount, jobCompletionAllowance?.periodEnd, jobCompletionAllowance?.periodStart, jobCompletionPackRows, monthlyIncludedAllowance, totalAvailableNow]);
  const subscriptionPriceRows = pricingModel?.subscriptionPricingReadiness?.prices || [];
  const customerProviders = paymentCollection?.customerCollection?.providers || [];
  const readinessCounts = useMemo(() => {
    const counts = { ready: 0, pending: 0, blocked: 0, info: 0 };
    for (const provider of customerProviders) {
      const status = String(provider.status || '').toLowerCase();
      if (provider.live || status === 'connected' || status === 'live') {
        counts.ready += 1;
      } else if (status === 'requested' || status === 'pending') {
        counts.pending += 1;
      } else if (status === 'failed' || status === 'blocked') {
        counts.blocked += 1;
      } else {
        counts.info += 1;
      }
    }
    return counts;
  }, [customerProviders]);
  const providerReadinessRows = useMemo(
    () => [
      { label: 'Ready', value: readinessCounts.ready, tone: 'success' as const },
      { label: 'Pending', value: readinessCounts.pending, tone: 'warning' as const },
      { label: 'Blocked', value: readinessCounts.blocked, tone: 'critical' as const },
      { label: 'Info', value: readinessCounts.info, tone: 'info' as const },
    ].filter((row) => row.value > 0),
    [readinessCounts],
  );
  const trialStateLabel = trial?.isActive ? 'Active' : trial?.status === 'expired' ? 'Expired' : trial?.status === 'converted' ? 'Converted' : 'Not applicable';
  const subscriptionStatusLabel = humanizeStatus(status);
  const collectionPreferenceLabel = preferredCollectionProvider === 'STRIPE' ? 'Business card setup' : 'Manual collection';
  const launchControlHref = "/dashboard/settings/launch-control";
  const platformCatalogRows = useMemo(() => {
    const defaultJobPack = jobCompletionPackRows.find((pack) => pack.code === 'job_completion_pack_1') || jobCompletionPackRows[0] || null;
    const rows = [
      {
        key: `subscription_price:${currentPlanCode}:${interval}`.toLowerCase(),
        code: currentPlanCode,
        interval,
        kind: 'subscription_price',
        label: `${plan?.name || currentPlanCode} ${interval}`,
        planName: plan?.name || currentPlanCode,
      },
      defaultJobPack
        ? {
            key: `job_pack:${defaultJobPack.code}:none`,
            code: defaultJobPack.code,
            interval: null,
            kind: 'job_pack',
            label: defaultJobPack.label,
          }
        : null,
      usageForecast?.recommendedPack && usageForecast.recommendedPack.code !== defaultJobPack?.code
        ? {
            key: `job_pack:${usageForecast.recommendedPack.code}:none`,
            code: usageForecast.recommendedPack.code,
            interval: null,
            kind: 'job_pack',
            label: usageForecast.recommendedPack.label,
          }
        : null,
    ];
    return rows.filter(Boolean);
  }, [currentPlanCode, interval, jobCompletionPackRows, plan?.name, usageForecast?.recommendedPack]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const billingSection = typeof router.query.section === 'string' ? router.query.section : '';
  const billingPack = typeof router.query.pack === 'string' ? router.query.pack : '';
  const normalizedBillingSection =
    billingSection === 'payments' ? 'customer-payments' : billingSection;
  const packTarget =
    billingPack === '10' || billingPack === '25' || billingPack === '50' || billingPack === '100'
      ? `job-pack-${billingPack}`
      : '';
  const { getSectionProps } = useSectionTargeting({
    targetKey: packTarget || normalizedBillingSection,
    ready: router.isReady,
  });

  useEffect(() => {
    if (!router.isReady || normalizedBillingSection !== 'customer-payments') return;
    void router.replace('/dashboard/settings/payments');
  }, [normalizedBillingSection, router]);

  const nextStepTitle = useMemo(() => {
    if (!canManageSubscription) return 'Workspace owner action required';
    if (verificationBlocked) return 'Verify your email to continue';
    if (!stripeConfigured) return 'Billing is unavailable right now';
    if (hasActiveSubscription) return 'Manage the current subscription';
    if (trial?.isActive) return 'Choose a paid plan before trial end';
    return 'Choose the plan that fits this workspace';
  }, [canManageSubscription, hasActiveSubscription, stripeConfigured, trial?.isActive, verificationBlocked]);

  const nextStepCopy = useMemo(() => {
    if (!canManageSubscription) {
      return 'Only the workspace owner can change the subscription. Everyone else can review the current commercial state here.';
    }
    if (verificationBlocked) {
      return 'Billing stays locked until the workspace owner verifies their email. Resend the MyTitan verification email, complete verification, then retry here.';
    }
    if (!stripeConfigured) {
      return 'Plan changes and subscription management are temporarily unavailable.';
    }
    if (hasActiveSubscription) {
      return 'Open Stripe to manage the subscription, payment method, or renewal settings.';
    }
    if (trial?.isActive) {
      return 'Choose a paid plan before the trial ends to keep work, records, and payment flow moving without interruption.';
    }
    return 'Use the plan options below to start the subscription that matches the team and workload.';
  }, [canManageSubscription, hasActiveSubscription, stripeConfigured, trial?.isActive, verificationBlocked]);
  const nextStepHref = useMemo(() => {
    if (!canManageSubscription) return '/dashboard/settings';
    if (verificationBlocked) return '/dashboard/billing?section=plan-and-payments';
    if (!stripeConfigured) return '/dashboard/settings/launch-control';
    if (usageForecast?.lowCreditWarning || usageForecast?.recommendedPack) {
      return `/dashboard/billing?section=job-packs${usageForecast?.recommendedPack ? `&pack=${usageForecast.recommendedPack.jobCount}` : ''}`;
    }
    return '/dashboard/billing?section=plan-and-payments';
  }, [canManageSubscription, stripeConfigured, usageForecast?.lowCreditWarning, usageForecast?.recommendedPack, verificationBlocked]);

  async function startCheckout(planCode: string) {
    if (planCode === 'FREE') {
      setError('');
      setInfo('Free workspaces start from the real signup flow. Existing workspaces should stay on the current commercial path unless MyTitan confirms a change.');
      return;
    }
    if (!stripeConfigured) {
      setError('MyTitan subscription checkout is unavailable right now.');
      return;
    }
    if (!canManageSubscription) {
      setError('Only the workspace owner can choose or change a subscription plan.');
      return;
    }
    if (verificationBlocked) {
      setError('Verify your email from the MyTitan email first, then choose a plan.');
      return;
    }
    setError('');
    setInfo('');
    setLoading(planCode);
    try {
      const res = await apiFetch('/billing/checkout-session', {
        method: 'POST',
        body: JSON.stringify({ planCode, interval }),
      });
      if (res?.url) {
        window.location.href = res.url;
      } else {
        setError('Checkout could not be opened right now. Try again in a moment.');
      }
    } catch (err: any) {
      if (err instanceof ApiError && err.statusCode === 403 && /verify your email/i.test(err.message || '')) {
        setError('Verify your email from the MyTitan email first, then choose a plan.');
        return;
      }
      setError(err.message || 'Failed to start checkout');
    } finally {
      setLoading('');
    }
  }

  async function openPortal() {
    if (!stripeConfigured) {
      setError('MyTitan billing management is unavailable right now.');
      return;
    }
    if (!canManageSubscription) {
      setError('Only the workspace owner can manage the subscription.');
      return;
    }
    if (verificationBlocked) {
      setError('Verify your email from the MyTitan email first, then manage the subscription.');
      return;
    }
    setError('');
    setInfo('');
    setLoading('portal');
    try {
      const res = await apiFetch('/billing/portal');
      if (res?.url) {
        window.location.href = res.url;
      } else {
        setError('Subscription management could not be opened right now. Try again in a moment.');
      }
    } catch (err: any) {
      if (err instanceof ApiError && err.statusCode === 403 && /verify your email/i.test(err.message || '')) {
        setError('Verify your email from the MyTitan email first, then manage the subscription.');
        return;
      }
      setError(err.message || 'Failed to open portal');
    } finally {
      setLoading('');
    }
  }

  async function startPackCheckout(packCode: string) {
    setError('');
    setInfo('');
    setLoading(packCode);
    try {
      const res = await apiFetch('/billing/job-completion-packs/checkout-session', {
        method: 'POST',
        body: JSON.stringify({ packCode }),
      });
      if (res?.url) {
        window.location.href = res.url;
      } else {
        setError('Pack checkout could not be opened right now.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start pack checkout');
    } finally {
      setLoading('');
    }
  }

  async function resendVerification() {
    setError('');
    setInfo('');
    setLoading('resend-verification');
    try {
      const result = await apiFetch('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setInfo(getResendVerificationMessage(result));
    } catch (err: any) {
      setError(getSafeVerificationError(err));
    } finally {
      setLoading('');
    }
  }

  async function saveCollectionSettings() {
    setError('');
    setInfo('');
    setLoading('payment-collection');
    try {
      await apiFetch('/billing/payment-collection', {
        method: 'PATCH',
        body: JSON.stringify({
          preferredProvider: preferredCollectionProvider,
          requestedProviders,
        }),
      });
      await refresh();
      setInfo('Customer payment setup updated.');
    } catch (err: any) {
      setError(err.message || 'Failed to update customer payment setup');
    } finally {
      setLoading('');
    }
  }

  async function runStripeConnectAction(action: 'verify' | 'onboarding' | 'disconnect') {
    setError('');
    setInfo('');
    setLoading(`stripe-connect-${action}`);
    try {
      const result = await apiFetch(`/billing/customer-payment-readiness/stripe-connect/${action}`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await refresh();
      if (result?.actionUrl) {
        window.location.href = result.actionUrl;
        return;
      }
      setInfo(result?.summary || 'Stripe Connect payment setup updated.');
    } catch (err: any) {
      setError(err.message || 'Failed to update Stripe Connect payment setup');
    } finally {
      setLoading('');
    }
  }

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Settings"
          title="MyTitan Account"
          subtitle="Manage your MyTitan subscription, plan, job packs, invoices, and payment method."
          actions={hasActiveSubscription && !actionBlocked ? [{ label: 'Manage billing in Stripe', onClick: () => void openPortal(), testId: 'billing-open-portal-header' }] : undefined}
          shortcuts={['Owner verification still gates billing changes', 'Plan state only changes when Stripe confirms it']}
          stats={[
            { label: 'Plan', value: plan?.name || currentPlanCode, hint: subscriptionStatusLabel },
            { label: 'Trial', value: trial?.isActive ? `${trial.daysRemaining} days left` : trial?.status === 'expired' ? 'Ended' : 'None', hint: trialEndsAt ? `Ends ${trialEndsAt.toLocaleDateString()}` : 'No trial end pending' },
            { label: 'Completed jobs per month', value: String(currentTier?.completedJobsPerMonth || plan?.completedJobsPerMonth || 'Preparing'), hint: currentTier?.completedJobsPerMonth || plan?.completedJobsPerMonth ? completedJobsLabel : 'Usage tracking is being prepared' },
            { label: 'Owner path', value: canManageSubscription ? 'Ready' : 'View only', hint: verificationBlocked ? 'Email verification required' : stripeConfigured ? 'Stripe available' : 'Stripe unavailable' },
          ]}
        />

        <div className="card billing-page-shell billing-page-shell--admin">
          {info ? <p className="muted billing-page-shell__notice billing-page-shell__notice--success">{info}</p> : null}
          {error ? <p className="muted billing-page-shell__notice billing-page-shell__notice--error">{error}</p> : null}

          <section className="billing-ops-section" {...getSectionProps('billing-setup-hub')} data-testid="billing-setup-hub">
            <div className="operator-section__header billing-ops-section__header">
              <div>
                <h2 className="operator-section__title">MyTitan billing</h2>
                <p className="operator-section__subtitle">Everything here is for your MyTitan account only.</p>
              </div>
            </div>
            <div className="mt-priority-card" style={{ marginBottom: 16 }} data-testid="billing-next-step-card">
              <span className="mt-priority-card__eyebrow">Recommended next step</span>
              <h3 className="mt-priority-card__title">{nextStepTitle}</h3>
              <p className="mt-priority-card__copy">{nextStepCopy}</p>
              <div className="mt-priority-card__meta">
                <span>{subscriptionStatusLabel}</span>
                <span>{jobCompletionPacks?.status === 'ready' ? 'Job packs ready' : 'Job packs truthful'}</span>
              </div>
              <div>
                <Link className="button" href={nextStepHref}>
                  Open the next billing task
                </Link>
              </div>
            </div>
            <div className="mt-guided-setup-grid" data-testid="mytitan-account-navigation">
              <Link href="/dashboard/billing?section=plan-and-payments" className="mt-guided-setup-card mt-linkCard" data-testid="billing-setup-plan-and-payments">
                <span className="mt-guided-setup-card__eyebrow">Subscription</span>
                <strong>Manage your MyTitan subscription.</strong>
                <span className="mt-linkCard__action">Open subscription</span>
              </Link>
              <Link href="/dashboard/billing?section=plan-choices" className="mt-guided-setup-card mt-linkCard" data-testid="billing-setup-plan">
                <span className="mt-guided-setup-card__eyebrow">Plan</span>
                <strong>Review your current plan and available plans.</strong>
                <span className="mt-linkCard__action">Open plan</span>
              </Link>
              <Link href="/dashboard/billing?section=job-packs" className="mt-guided-setup-card mt-linkCard" data-testid="billing-setup-job-packs">
                <span className="mt-guided-setup-card__eyebrow">Job packs</span>
                <strong>Review job allowance and available job packs.</strong>
                <span className="mt-linkCard__action">Open job packs</span>
              </Link>
              <Link href="/dashboard/billing?section=mytitan-invoices" className="mt-guided-setup-card mt-linkCard" data-testid="billing-setup-invoices">
                <span className="mt-guided-setup-card__eyebrow">MyTitan invoices</span>
                <strong>Open your MyTitan billing history.</strong>
                <span className="mt-linkCard__action">Open invoices</span>
              </Link>
              <Link href="/dashboard/billing?section=plan-and-payments" className="mt-guided-setup-card mt-linkCard" data-testid="billing-setup-payment-method">
                <span className="mt-guided-setup-card__eyebrow">MyTitan payment method</span>
                <strong>Manage the payment method for MyTitan billing.</strong>
                <span className="mt-linkCard__action">Open payment method</span>
              </Link>
            </div>
          </section>

          <section className="operator-section billing-ops-section" {...getSectionProps('plan-and-payments')}>
            <div className="operator-section__header billing-ops-section__header">
              <div>
                <h2 className="operator-section__title">Plan and payments</h2>
                <p className="operator-section__subtitle">Current MyTitan plan, owner controls, payment method, and the next commercial step.</p>
              </div>
              <div className="billing-ops-section__badges">
                <OperatorStatusBadge label={subscriptionStatusLabel} tone={status === 'active' ? 'success' : trial?.isActive ? 'warning' : 'info'} />
                <OperatorStatusBadge label={trialStateLabel} tone={trial?.isActive ? 'warning' : trial?.status === 'expired' ? 'critical' : trial?.status === 'converted' ? 'success' : 'neutral'} />
                <OperatorStatusBadge label={canManageSubscription ? 'Owner ready' : 'View only'} tone={canManageSubscription ? 'success' : 'neutral'} />
              </div>
            </div>

            <div className="mt-pulse-grid" style={{ marginBottom: 18 }}>
              <article className="mt-surface-note">
                <strong>State</strong>
                <p className="muted" style={{ margin: "6px 0 0 0" }}>{plan?.name || currentPlanCode} · {subscriptionStatusLabel}</p>
              </article>
              <article className="mt-surface-note">
                <strong>Impact</strong>
                <p className="muted" style={{ margin: "6px 0 0 0" }}>
                  {hasActiveSubscription
                    ? "Billing is live and customer payment ownership stays separate."
                    : trial?.isActive
                      ? "Trial access is live, but a paid plan is the next commercial step."
                      : "A paid plan is still needed before billing-enabled workflows stay live."}
                </p>
              </article>
              <article className="mt-surface-note">
                <strong>Next step</strong>
                <p className="muted" style={{ margin: "6px 0 0 0" }}>{nextStepTitle}</p>
              </article>
            </div>

            <div className="billing-page-grid billing-page-grid--overview">
              <section className="billing-ops-panel billing-ops-panel--revenue">
                <div className="billing-ops-panel__header">
                  <div className="billing-ops-heading">
                    <span className="billing-ops-icon" aria-hidden="true">£</span>
                    <div>
                      <strong>Current plan</strong>
                      <p className="muted billing-page-panel__text"><strong>{plan?.name || currentPlanCode}</strong></p>
                    </div>
                  </div>
                  <OperatorStatusBadge label={subscriptionStatusLabel} tone={status === 'active' ? 'success' : 'info'} />
                </div>
                {subscription?.currentPeriodEnd ? (
                  <p className="muted billing-page-panel__text">
                    Current period ends: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                  </p>
                ) : null}
                {subscription?.cancelAtPeriodEnd ? <p className="muted billing-page-panel__text">Cancellation is scheduled at period end.</p> : null}
                <p className="muted billing-page-panel__text" data-testid="billing-plan-completion-allowance">
                  Completed jobs per month: <strong>{completedJobsLabel}</strong>
                </p>
                <p className="muted billing-page-panel__guidance" data-testid="billing-plan-usage-tracking">
                  {pricingModel?.usageTracking?.message || 'Usage tracking for job completion allowances is being prepared.'}
                </p>
                {!stripeConfigured ? (
                  <p className="muted billing-page-panel__text billing-page-panel__text--last">
                    Checkout and subscription management are unavailable until Stripe is configured on the server.
                  </p>
                ) : null}
              </section>

              <section className="billing-ops-panel billing-ops-panel--attention">
                <div className="billing-ops-panel__header">
                  <div className="billing-ops-heading">
                    <span className="billing-ops-icon" aria-hidden="true">→</span>
                    <div>
                      <strong>{nextStepTitle}</strong>
                      <p className="muted billing-page-panel__text billing-page-panel__text--last">{nextStepCopy}</p>
                    </div>
                  </div>
                  <OperatorStatusBadge
                    label={verificationBlocked ? 'Verification required' : actionBlocked ? 'Blocked' : hasActiveSubscription ? 'Ready to manage' : 'Choose plan'}
                    tone={verificationBlocked ? 'warning' : actionBlocked ? 'critical' : 'success'}
                  />
                </div>
              {verificationBlocked ? (
                <div className="billing-page-actions">
                  <button
                    className="button"
                    type="button"
                    onClick={resendVerification}
                    disabled={loading === 'resend-verification'}
                    data-testid="billing-resend-verification"
                  >
                    {loading === 'resend-verification' ? 'Sending verification email...' : 'Resend verification email'}
                  </button>
                  <button className="button secondary" type="button" onClick={() => void refresh()} data-testid="billing-refresh-status">
                    Check again after verification
                  </button>
                </div>
              ) : null}
              {hasActiveSubscription && !actionBlocked ? (
                <button
                  className="button"
                  type="button"
                  style={{ marginTop: 12 }}
                  onClick={() => void openPortal()}
                  disabled={loading === 'portal'}
                  data-testid="billing-open-portal"
                >
                  {loading === 'portal' ? 'Opening Stripe...' : 'Manage billing in Stripe'}
                </button>
              ) : null}
              </section>

              {pricingModel?.subscriptionPricingReadiness && showAdvanced ? (
                <section className="billing-ops-panel billing-ops-panel--neutral" data-testid="billing-subscription-price-review" {...getSectionProps('subscription-pricing')}>
                  <div className="billing-ops-panel__header">
                    <div className="billing-ops-heading">
                      <span className="billing-ops-icon" aria-hidden="true">!</span>
                      <div>
                        <strong>Subscription price review</strong>
                        <p className="muted billing-page-panel__text billing-page-panel__text--last">
                          {pricingModel.subscriptionPricingReadiness.message}
                        </p>
                      </div>
                    </div>
                    <OperatorStatusBadge
                      label={humanizeStatus(pricingModel.subscriptionPricingReadiness.status)}
                      tone={resolveBillingTone(pricingModel.subscriptionPricingReadiness.status)}
                    />
                  </div>
                  {pricingModel.subscriptionPricingReadiness.checkedAt ? (
                    <p className="muted billing-page-panel__text" data-testid="billing-subscription-price-checked-at">
                      Last checked: {new Date(pricingModel.subscriptionPricingReadiness.checkedAt).toLocaleString()}
                    </p>
                  ) : null}
                  {subscriptionPriceRows.length ? (
                    <div className="billing-provider-list" style={{ marginTop: 14 }}>
                      {subscriptionPriceRows.map((row) => (
                        <section
                          key={`${row.planCode}-${row.interval}`}
                          className={`billing-provider-card billing-provider-card--${resolveBillingTone(row.status)}`}
                          data-testid={`billing-subscription-price-${row.planCode.toLowerCase()}-${row.interval.toLowerCase()}`}
                        >
                          <div className="billing-ops-panel__header">
                            <div className="billing-ops-heading">
                              <span className="billing-ops-icon" aria-hidden="true">{row.interval === 'ANNUAL' ? 'Y' : 'M'}</span>
                              <div>
                                <strong>{row.planName} {row.interval === 'ANNUAL' ? 'annual' : 'monthly'}</strong>
                                <p className="muted" style={{ margin: '4px 0 0 0' }}>
                                  Expected {row.displayExpectedPrice || 'n/a'}{row.displayObservedPrice ? ` · Stripe ${row.displayObservedPrice}` : ''}
                                </p>
                              </div>
                            </div>
                            <OperatorStatusBadge label={humanizeStatus(row.status)} tone={resolveBillingTone(row.status)} />
                          </div>
                          <p className="muted" style={{ margin: '4px 0 0 0' }}>{row.detail}</p>
                          {row.status !== 'ready' ? (
                            <p className="muted billing-page-panel__text billing-page-panel__text--last" style={{ marginTop: 8 }}>
                              {row.action}
                            </p>
                          ) : null}
                        </section>
                      ))}
                    </div>
                  ) : null}
                </section>
              ) : null}

              <section className="billing-ops-panel billing-ops-panel--neutral" data-testid="billing-trial-card">
                <div className="billing-ops-panel__header">
                  <div className="billing-ops-heading">
                    <span className="billing-ops-icon" aria-hidden="true">◌</span>
                    <div>
                      <strong>Continuity</strong>
                      <p className="muted billing-page-panel__text" data-testid="billing-trial-status">
                        {trial?.isActive ? '14-day trial active' : trial?.status === 'expired' ? 'Trial ended' : 'No active trial'}
                      </p>
                    </div>
                  </div>
                  <OperatorStatusBadge label={trialStateLabel} tone={trial?.isActive ? 'warning' : trial?.status === 'expired' ? 'critical' : trial?.status === 'converted' ? 'success' : 'neutral'} />
                </div>
                {trial?.startedAt ? <p className="muted">Trial start: {new Date(trial.startedAt).toLocaleDateString()}</p> : null}
                {trialEndsAt ? <p className="muted">Trial end: {trialEndsAt.toLocaleDateString()}</p> : null}
                <p className="muted billing-page-panel__text billing-page-panel__text--last" data-testid="billing-trial-days">
                  {trial?.isActive ? `${trial.daysRemaining} day${trial.daysRemaining === 1 ? '' : 's'} remaining` : 'No trial days remaining'}
                </p>
                <p className="muted billing-page-panel__guidance" data-testid="billing-trial-guidance">
                  {trial?.isActive
                    ? 'Upgrade before the trial ends to keep the workspace and billing flow running without interruption.'
                    : trial?.status === 'expired'
                      ? 'Choose a paid plan to restore billing-enabled workflows and keep this workspace moving commercially.'
                      : 'This workspace is already on its commercial path.'}
                </p>
                <p className="muted billing-page-panel__guidance" data-testid="billing-extra-job-packs">
                  {extraPacksMessage}
                </p>
              </section>
            </div>

            <div className="billing-page-grid billing-page-grid--collection" style={{ marginTop: 18 }}>
              <section className="billing-ops-panel billing-ops-panel--neutral" data-testid="billing-job-completion-packs-card" {...getSectionProps('job-packs')}>
                <div className="billing-ops-panel__header">
                  <div className="billing-ops-heading">
                    <span className="billing-ops-icon" aria-hidden="true">+</span>
                    <div>
                <strong>Extra job completion packs</strong>
                <p className="muted billing-page-panel__text">MyTitan-billed add-on catalog status for busier months.</p>
                    </div>
                  </div>
                  <OperatorStatusBadge
                    label={humanizeStatus(jobCompletionPacks?.status || 'setup_needed')}
                    tone={resolveBillingTone(jobCompletionPacks?.status || 'setup_needed')}
                  />
                </div>
                <p className="muted billing-page-panel__guidance" data-testid="billing-job-pack-summary">
                {jobCompletionPacks?.summary || 'Extra job packs stay hidden until product sync and checkout wiring are both ready.'}
                </p>
                <p className="muted billing-page-panel__text" data-testid="billing-job-pack-checkout">
                  {jobCompletionPacks?.checkoutEnabled
                    ? 'Add-on checkout is enabled.'
                    : 'Extra job packs are not available yet. Choose a plan with more included capacity.'}
                </p>
                <p className="muted billing-page-panel__guidance" data-testid="billing-job-pack-ledger-readiness">
                  Included allowance is used first. Extra capacity is added only after payment is confirmed.
                </p>
                <p className="muted billing-page-panel__guidance">
                  Purchased credits carry over until used or refunded. Capacity is never added before payment confirmation.
                </p>
                {usageForecast ? (
                  <div className="billing-provider-card__meta" data-testid="billing-job-pack-forecast">
                    <strong>Usage pacing</strong>
                    <p className="muted" style={{ margin: '6px 0 0 0' }}>
                      Projected completed jobs this cycle: {usageForecast.projected}. Current pacing looks {usageForecast.pacing}.
                    </p>
                    <p className="muted" style={{ margin: '6px 0 0 0' }}>
                      {usageForecast.recommendedPack
                        ? `Recommended for your current workload: ${usageForecast.recommendedPack.label}.`
                        : 'No extra pack is recommended from current usage yet.'}
                    </p>
                    {usageForecast.lowCreditWarning ? (
                      <p className="muted" style={{ margin: '6px 0 0 0' }}>
                        Low-credit warning: the remaining allowance is narrow enough that operators may feel it soon if this pace continues.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {usageForecast?.lowCreditWarning || usageForecast?.recommendedPack ? (
                  <div className="settings-premium-subcard" style={{ marginTop: 14 }}>
                    <span className="mt-guided-setup-card__eyebrow">Inline setup</span>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <div style={{ maxWidth: 620 }}>
                        <strong>
                          {usageForecast?.recommendedPack
                            ? `${usageForecast.recommendedPack.label} is the closest fit for the current workload.`
                            : 'Allowance is getting tight for the current pace.'}
                        </strong>
                        <p className="muted" style={{ margin: '6px 0 0 0' }}>
                          Stay truthful: extra credits only arrive after confirmed Stripe webhook events, and checkout remains blocked until readiness is genuinely live.
                        </p>
                      </div>
                      <Link className="button secondary" href={`/dashboard/billing?section=job-packs${usageForecast?.recommendedPack ? `&pack=${usageForecast.recommendedPack.jobCount}` : ''}`}>
                        Review job packs
                      </Link>
                    </div>
                  </div>
                ) : null}
                <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: 14 }}>
                  {jobCompletionPackRows.map((pack) => (
                    <section
                      key={pack.code}
                      className={`billing-provider-card billing-provider-card--${resolveBillingTone(pack.status)}`}
                      data-testid={`billing-job-pack-primary-${pack.code}`}
                      {...getSectionProps(`job-pack-${pack.jobCount}`)}
                    >
                      <div className="billing-ops-panel__header">
                        <div className="billing-ops-heading">
                          <span className="billing-ops-icon" aria-hidden="true">+</span>
                          <div>
                            <strong>{pack.productName || pack.label}</strong>
                            <p className="muted" style={{ margin: '4px 0 0 0' }}>
                              {pack.displayPrice ? `${pack.displayPrice}${pack.currency ? ` · ${pack.currency}` : ''}` : 'Not synced yet'} · {pack.jobCount} jobs
                            </p>
                          </div>
                        </div>
                        <OperatorStatusBadge label={humanizeStatus(pack.status)} tone={resolveBillingTone(pack.status)} />
                      </div>
                      <p className="muted" style={{ margin: '0 0 10px 0' }}>{pack.message}</p>
                      {jobCompletionPacks?.checkoutEnabled && pack.status === 'ready' && canManageSubscription ? (
                        <button
                          className="button secondary"
                          type="button"
                          onClick={() => void startPackCheckout(pack.code)}
                          disabled={loading === pack.code}
                          data-testid={`billing-job-pack-buy-${pack.code}`}
                        >
                          {loading === pack.code ? 'Opening checkout...' : 'Buy this pack'}
                        </button>
                      ) : (
                        <span className="muted">
                          {jobCompletionPacks?.checkoutStatus === 'enabled'
                            ? 'Checkout is only available for ready packs.'
                            : jobCompletionPacks?.checkoutStatus === 'not_enabled'
                              ? 'Not live yet'
                              : 'Setup required'}
                        </span>
                      )}
                    </section>
                  ))}
                </div>
                {jobCompletionPacks?.enablementSteps?.length ? (
                  <div className="billing-provider-card__meta" data-testid="billing-job-pack-enablement-steps">
                    <strong>Enablement steps</strong>
                    {jobCompletionPacks.enablementSteps.map((step, index) => (
                      <p key={`${index}-${step}`} className="muted" style={{ margin: '6px 0 0 0' }}>
                        {index + 1}. {step}
                      </p>
                    ))}
                  </div>
                ) : null}
                {jobCompletionPacks?.canary ? (
                  <div className="billing-provider-card__meta" data-testid="billing-job-pack-canary">
                    <strong>Monitored canary</strong>
                    <p className="muted" style={{ margin: '6px 0 0 0' }}>{jobCompletionPacks.canary.message}</p>
                    {jobCompletionPacks.canary.lastResult ? (
                      <p className="muted" style={{ margin: '6px 0 0 0' }}>
                        Latest result: {jobCompletionPacks.canary.lastResult.replace(/_/g, ' ')}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {jobCompletionAllowance ? (
                  <div className="billing-readiness-bars" data-testid="billing-job-pack-allowance">
	                    <div className="billing-readiness-bars__row">
	                      <div className="billing-readiness-bars__meta">
	                        <span>Monthly included allowance</span>
	                        <strong>{unlimitedJobs ? 'Unlimited' : monthlyIncludedAllowance}</strong>
	                      </div>
	                    </div>
	                    {jobCompletionAllowance.enterprisePlanNote ? (
	                      <div className="billing-readiness-bars__meta">
	                        <span>Plan note</span>
	                        <strong>{jobCompletionAllowance.enterprisePlanNote}</strong>
	                      </div>
	                    ) : null}
                    <div className="billing-readiness-bars__row">
                      <div className="billing-readiness-bars__meta">
                        <span>Used this month</span>
                        <strong>{monthlyIncludedUsed}</strong>
                      </div>
                    </div>
                    <div className="billing-readiness-bars__meta">
                      <span>Monthly included remaining</span>
                      <strong>{monthlyIncludedRemaining}</strong>
                    </div>
	                    <div className="billing-readiness-bars__meta">
	                      <span>Purchased credits total</span>
	                      <strong>{purchasedCreditsTotal}</strong>
	                    </div>
	                    {Number(jobCompletionAllowance.manualCreditsTotal || 0) !== 0 ? (
	                      <div className="billing-readiness-bars__meta">
	                        <span>Manual credits</span>
	                        <strong>{jobCompletionAllowance.manualCreditsTotal}</strong>
	                      </div>
	                    ) : null}
	                    {Number(jobCompletionAllowance.temporaryCreditsTotal || 0) > 0 ? (
	                      <div className="billing-readiness-bars__meta">
	                        <span>Temporary promotional credits</span>
	                        <strong>{jobCompletionAllowance.temporaryCreditsTotal}</strong>
	                      </div>
	                    ) : null}
                    <div className="billing-readiness-bars__meta">
                      <span>Purchased credits used</span>
                      <strong>{purchasedCreditsUsed}</strong>
                    </div>
                    <div className="billing-readiness-bars__meta">
                      <span>Purchased credits remaining</span>
                      <strong>{purchasedCreditsRemaining}</strong>
                    </div>
	                    <div className="billing-readiness-bars__meta">
	                      <span>Total available now</span>
	                      <strong>{unlimitedJobs ? 'Unlimited' : totalAvailableNow}</strong>
	                    </div>
                    <div className="billing-readiness-bars__meta">
                      <span>Completed this month</span>
                      <strong>{jobCompletionAllowance.completedJobsCount}</strong>
                    </div>
                    <div className="billing-readiness-bars__meta">
                      <span>Pending pack purchases</span>
                      <strong>{jobCompletionAllowance.pendingPurchases.length}</strong>
                    </div>
                    {resetDateLabel ? (
                      <div className="billing-readiness-bars__meta">
                        <span>Next reset date</span>
                        <strong>{resetDateLabel}</strong>
                      </div>
                    ) : null}
                    {jobCompletionAllowance.purchaseStateSummary ? (
                      <div className="billing-readiness-bars__meta">
                        <span>Purchase state</span>
                        <strong>{jobCompletionAllowance.purchaseStateSummary}</strong>
                      </div>
                    ) : null}
                    <div className="billing-readiness-bars__meta">
                      <span>Carry-over</span>
                      <strong>Credits carry over until used or refunded</strong>
                    </div>
                    {usageForecast ? (
                      <div className="billing-readiness-bars__meta">
                        <span>Projected monthly usage</span>
                        <strong>{usageForecast.projected}</strong>
                      </div>
                    ) : null}
                    {usageForecast?.recommendedPack ? (
                      <div className="billing-readiness-bars__meta">
                        <span>Recommended next pack</span>
                        <strong>{usageForecast.recommendedPack.label}</strong>
                      </div>
                    ) : null}
                    {purchasedCreditsDeficit > 0 ? (
                      <div className="billing-readiness-bars__meta">
                        <span>Refund deficit</span>
                        <strong>{purchasedCreditsDeficit}</strong>
                      </div>
                    ) : null}
                    {(jobCompletionAllowance.expiredPurchases || jobCompletionAllowance.cancelledPurchases) ? (
                      <div className="billing-readiness-bars__meta">
                        <span>Expired or cancelled</span>
                        <strong>{jobCompletionAllowance.expiredPurchases + jobCompletionAllowance.cancelledPurchases}</strong>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {jobCompletionPacks?.lastCheckedAt ? (
                  <p className="muted billing-page-panel__text" data-testid="billing-job-pack-last-checked">
                    Last checked: {new Date(jobCompletionPacks.lastCheckedAt).toLocaleString()}
                  </p>
                ) : null}
                {platformAdmin ? (
                  <div className="billing-provider-card__meta" data-testid="billing-platform-catalog-link">
                    <strong>Platform catalog</strong>
                    <p className="muted" style={{ margin: '6px 0 0 0' }}>
                      Mapping health: {platformCatalog?.checkoutReadiness?.status === 'ready' ? 'Ready' : 'Needs attention'}.
                      Platform-only links below open the exact catalog rows behind the current workspace billing state.
                    </p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                      <Link className="button secondary" href="/platform?section=billing-catalog">
                        Open platform catalog
                      </Link>
                      {platformCatalogRows.map((item: any) => (
                        <Link
                          key={item.key}
                          className="button secondary"
                          href={`/platform?section=billing-catalog&product=${encodeURIComponent(item.key)}`}
                          data-testid={`billing-platform-catalog-link-${item.code}-${item.interval || 'none'}`}
                        >
                          {item.kind === 'subscription_price' ? `Review ${item.planName || item.label} ${item.interval}` : `Review ${item.label}`}
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>

              {showAdvanced ? (
              <section className="platform-admin-card-stack platform-admin-card-stack--chart billing-provider-chart" data-testid="billing-job-completion-pack-grid">
                <div className="platform-admin-card-heading">
                  <div className="billing-ops-heading">
                    <span className="billing-ops-icon" aria-hidden="true">▦</span>
                    <div>
                  <strong>Pack setup status</strong>
                      <p className="muted billing-page-panel__text billing-page-panel__text--last">
                        Product and price sync stays server-side. Extra allowance only lands after Stripe confirms payment.
                      </p>
                    </div>
                  </div>
                  <span className="platform-admin-chart-annotation">{jobCompletionPacks?.expectedCurrency || 'GBP'}</span>
                </div>
                <div className="billing-provider-list">
                  {jobCompletionPackRows.map((pack) => (
                    <section
                      key={pack.code}
                      className={`billing-provider-card billing-provider-card--${resolveBillingTone(pack.status)}`}
                      data-testid={`billing-job-pack-${pack.code}`}
                      {...getSectionProps(`job-pack-${pack.jobCount}`)}
                    >
                      <div className="billing-ops-panel__header">
                        <div className="billing-ops-heading">
                          <span className="billing-ops-icon" aria-hidden="true">{pack.label.replace(/[^0-9]/g, '').slice(-1) || '+'}</span>
                          <div>
                            <strong>{pack.productName || pack.label}</strong>
                            <p className="muted" style={{ margin: '4px 0 0 0' }}>
                              {pack.displayPrice ? `${pack.displayPrice}${pack.currency ? ` · ${pack.currency}` : ''}` : 'Price not synced yet'} · {pack.jobCount} jobs
                            </p>
                          </div>
                        </div>
                        <OperatorStatusBadge label={humanizeStatus(pack.status)} tone={resolveBillingTone(pack.status)} />
                      </div>
                      <div className="billing-provider-card__meta">
                        <span className="billing-provider-card__hint">{humanizeStatus(pack.source)}</span>
                        <p className="muted" style={{ margin: '4px 0 0 0' }}>{pack.message}</p>
                        {jobCompletionPacks?.checkoutEnabled && pack.status === 'ready' && canManageSubscription ? (
                          <button
                            className="button secondary"
                            type="button"
                            onClick={() => void startPackCheckout(pack.code)}
                            disabled={loading === pack.code}
                            data-testid={`billing-job-pack-buy-${pack.code}`}
                          >
                            {loading === pack.code ? 'Opening checkout...' : 'Buy this pack'}
                          </button>
                        ) : null}
                      </div>
                    </section>
                  ))}
                </div>
              </section>
              ) : null}
            </div>
          </section>

          {false ? <section className="operator-section billing-ops-section" data-testid="billing-payment-collection-card" {...getSectionProps('customer-payments')}>
            <div className="operator-section__header billing-ops-section__header">
              <div>
                <h2 className="operator-section__title">Customer payments</h2>
                <p className="operator-section__subtitle">MyTitan billing stays separate. Customer money goes through the business payment setup.</p>
              </div>
              <div className="billing-ops-section__badges">
                <OperatorStatusBadge label="MyTitan billing" tone="info" />
                <OperatorStatusBadge label={collectionPreferenceLabel} tone={preferredCollectionProvider === 'STRIPE' ? 'info' : 'neutral'} />
              </div>
            </div>

            <div className="billing-page-grid billing-page-grid--collection">
              {readinessCounts.ready === 0 ? (
                <div className="settings-premium-subcard" style={{ gridColumn: '1 / -1' }} data-testid="billing-inline-payment-setup">
                  <span className="mt-guided-setup-card__eyebrow">Inline setup</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ maxWidth: 680 }}>
                      <strong>No live customer payment route is confirmed yet.</strong>
                      <p className="muted" style={{ margin: '6px 0 0 0' }}>
                        Keep customer money off MyTitan billing. Review the business payment route here before asking customers to pay online.
                      </p>
                    </div>
                    <Link className="button secondary" href="/dashboard/integrations?section=business-tools&provider=worldpay">
                      Review payment setup
                    </Link>
                  </div>
                </div>
              ) : null}
              <section className="billing-ops-panel billing-ops-panel--neutral" data-testid="billing-first-payment-guidance">
                <div className="billing-ops-panel__header">
                  <div className="billing-ops-heading">
                    <span className="billing-ops-icon" aria-hidden="true">1</span>
                    <div>
                      <strong>Keep customer money on the business side</strong>
                      <p className="muted billing-page-panel__text">Use only the payment route that genuinely belongs to this workspace.</p>
                    </div>
                  </div>
                  <OperatorStatusBadge label="First-user guidance" tone="neutral" />
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <p className="muted billing-page-panel__text" style={{ marginBottom: 0 }}>
                    Customer payments go through your chosen payment provider. MyTitan billing is separate from customer payments.
                  </p>
                  <p className="muted billing-page-panel__text" style={{ marginBottom: 0 }}>
                    Booking deposits are collected through your business payment setup. If no provider is connected, collect manually or set one up.
                  </p>
                  <p className="muted billing-page-panel__text" style={{ marginBottom: 0 }}>
                    MyTitan subscriptions and extra job packs are billed by MyTitan. They are not used to collect customer service money.
                  </p>
                  <p className="muted billing-page-panel__text billing-page-panel__text--last">
                    SumUp and Worldpay stay as requested options until they are genuinely wired for this workspace.
                  </p>
                </div>
              </section>

              <section className="billing-ops-panel billing-ops-panel--neutral" data-testid="billing-tenant-payment-readiness">
                <div className="billing-ops-panel__header">
                  <div className="billing-ops-heading">
                    <span className="billing-ops-icon" aria-hidden="true">2</span>
                    <div>
                      <strong>Tenant-owned payment readiness</strong>
                      <p className="muted billing-page-panel__text">
                        {tenantPaymentReadiness?.fallbackReason || tenantPaymentReadiness?.nextAction || 'Manual collection is available until a verified business provider is connected.'}
                      </p>
                    </div>
                  </div>
                  <OperatorStatusBadge label={humanizeStatus(tenantPaymentReadiness?.status || 'manual_collection')} tone={resolveBillingTone(tenantPaymentReadiness?.status || 'manual_collection')} />
                </div>
                <div className="billing-provider-list">
                  {(tenantPaymentReadiness?.providers || []).slice(0, 7).map((provider: any) => (
                    <section key={provider.provider} className={`billing-provider-card billing-provider-card--${resolveBillingTone(provider.state)}`}>
                      <div className="billing-ops-panel__header">
                        <div>
                          <strong>{provider.label}</strong>
                          <p className="muted" style={{ margin: '4px 0 0 0' }}>{provider.summary}</p>
                          {provider.provider === 'stripe-connect' ? (
                            <p className="muted" style={{ margin: '6px 0 0 0' }}>
                              {provider.accountMasked ? `Account ${provider.accountMasked}. ` : ''}
                              {provider.featureEnabled ? `Mode: ${provider.dryRun ? 'dry-run' : 'live checkout'}.` : 'Tenant-owned payments are feature-gated.'}
                            </p>
                          ) : null}
                        </div>
                        <OperatorStatusBadge label={humanizeStatus(provider.state)} tone={resolveBillingTone(provider.state)} />
                      </div>
                      {provider.provider === 'stripe-connect' ? (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                          <button className="button secondary" type="button" onClick={() => void runStripeConnectAction('verify')} disabled={loading === 'stripe-connect-verify'}>
                            {loading === 'stripe-connect-verify' ? 'Verifying...' : 'Verify readiness'}
                          </button>
                          {provider.onboardingAvailable !== false ? (
                            <button className="button secondary" type="button" onClick={() => void router.push('/dashboard/settings/payments/stripe')}>
                              {provider.state === 'needs_reconnect' ? 'Reconnect Stripe' : 'Connect Stripe'}
                            </button>
                          ) : (
                            <button className="button secondary" type="button" disabled data-testid="billing-stripe-unavailable">
                              Stripe setup is not available yet.
                            </button>
                          )}
                          {provider.state !== 'setup_needed' && provider.state !== 'disabled' ? (
                            <button className="button ghost" type="button" onClick={() => void runStripeConnectAction('disconnect')} disabled={loading === 'stripe-connect-disconnect'}>
                              {loading === 'stripe-connect-disconnect' ? 'Disconnecting...' : 'Disable'}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </section>
                  ))}
                </div>
              </section>

              <section className="billing-ops-panel billing-ops-panel--neutral" data-testid="billing-launch-control-guidance">
                <div className="billing-ops-panel__header">
                  <div className="billing-ops-heading">
                    <span className="billing-ops-icon" aria-hidden="true">✓</span>
                    <div>
                      <strong>What to do next</strong>
                      <p className="muted billing-page-panel__text">Use one owner path for launch-critical billing, provider, and install checks.</p>
                    </div>
                  </div>
                  <OperatorStatusBadge label="Owner guide" tone="neutral" />
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  <p className="muted billing-page-panel__text" style={{ marginBottom: 0 }}>
                    1. Verify the workspace sender or keep the MyTitan fallback truthful.
                  </p>
                  <p className="muted billing-page-panel__text" style={{ marginBottom: 0 }}>
                    2. Confirm whether customer payments stay manual or move through a real tenant-owned provider.
                  </p>
                  <p className="muted billing-page-panel__text billing-page-panel__text--last" style={{ marginBottom: 0 }}>
                    3. Add extra job capacity only when it is shown as available here.
                  </p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Link className="button secondary" href={launchControlHref}>Open Launch Control</Link>
                    <Link className="button secondary" href="/dashboard/settings?tab=messages">Open email settings</Link>
                    <button className="button secondary" type="button" onClick={() => setShowAdvanced((current) => !current)}>
                      {showAdvanced ? 'Hide technical checks' : 'View technical checks'}
                    </button>
                  </div>
                </div>
              </section>

              <section className="billing-ops-panel billing-ops-panel--info">
                <div className="billing-ops-panel__header">
                  <div className="billing-ops-heading">
                    <span className="billing-ops-icon" aria-hidden="true">↗</span>
                    <div>
                      <strong>MyTitan billing</strong>
                      <p className="muted billing-page-panel__text">
                        {paymentCollection?.subscriptionBilling?.label || 'Stripe'} · {humanizeStatus(paymentCollection?.subscriptionBilling?.status || 'setup_needed')}
                      </p>
                    </div>
                  </div>
                  <OperatorStatusBadge label={humanizeStatus(paymentCollection?.subscriptionBilling?.status || 'setup_needed')} tone={resolveBillingTone(paymentCollection?.subscriptionBilling?.status)} />
                </div>
                <p className="muted billing-page-panel__text billing-page-panel__text--last">
                  {paymentCollection?.subscriptionBilling?.summary || 'MyTitan Stripe remains the subscription billing source of truth.'}
                </p>
              </section>

              <section className="billing-ops-panel billing-ops-panel--revenue">
                <div className="billing-ops-panel__header">
                  <div className="billing-ops-heading">
                    <span className="billing-ops-icon" aria-hidden="true">◎</span>
                    <div>
                      <strong>Main customer payment route</strong>
                      <p className="muted billing-page-panel__text">Choose the route customers are told to use for this workspace.</p>
                    </div>
                  </div>
                  <OperatorStatusBadge label={collectionPreferenceLabel} tone={preferredCollectionProvider === 'STRIPE' ? 'info' : 'neutral'} />
                </div>
                  <div className="tab-row" style={{ marginTop: 12 }}>
                    {(['STRIPE', 'MANUAL'] as const).map((providerCode) => (
                      <button
                        key={providerCode}
                        type="button"
                        className={`tab-button ${preferredCollectionProvider === providerCode ? 'active' : ''}`}
                        onClick={() => setPreferredCollectionProvider(providerCode)}
                        disabled={!canManageCollectionSettings}
                        data-testid={`billing-collection-provider-${providerCode.toLowerCase()}`}
                      >
                        {providerCode === 'STRIPE' ? 'Business card setup' : 'Manual collection'}
                      </button>
                    ))}
                  </div>
                  <p className="muted billing-page-panel__text billing-page-panel__text--last" data-testid="billing-collection-preferred">
                    Current route: {collectionPreferenceLabel}
                  </p>
              </section>

              <section className="platform-admin-card-stack platform-admin-card-stack--chart billing-provider-chart">
                <div className="platform-admin-card-heading">
                  <div className="billing-ops-heading">
                    <span className="billing-ops-icon" aria-hidden="true">▥</span>
                    <div>
                      <strong>Payment setup status</strong>
                      <p className="muted billing-page-panel__text billing-page-panel__text--last">A safe summary of which customer payment routes are live, manual, requested, or still need setup.</p>
                    </div>
                  </div>
                  <span className="platform-admin-chart-annotation">Authoritative status</span>
                </div>
                {providerReadinessRows.length ? (
                  <>
                    <div className="platform-admin-chart-legend">
                      {providerReadinessRows.map((row) => (
                        <span key={row.label} className="platform-admin-legend-item">
                          <span className={`platform-admin-legend-swatch platform-admin-legend-swatch--${row.tone === 'critical' ? 'warn' : row.tone}`} />
                          {row.label}
                        </span>
                      ))}
                    </div>
                    <div className="billing-readiness-bars" data-testid="billing-provider-readiness-chart">
                      {providerReadinessRows.map((row) => (
                        <div key={row.label} className="billing-readiness-bars__row">
                          <div className="billing-readiness-bars__meta">
                            <span>{row.label}</span>
                            <strong>{row.value}</strong>
                          </div>
                          <div className="billing-readiness-bars__track">
                            <span
                              className={`billing-readiness-bars__fill billing-readiness-bars__fill--${row.tone === 'critical' ? 'warn' : row.tone}`}
                              style={{ width: `${(row.value / Math.max(...providerReadinessRows.map((entry) => entry.value), 1)) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="muted">No provider readiness data is available yet.</p>
                )}
              </section>

              <div className="billing-provider-list">
                {(paymentCollection?.customerCollection?.providers || []).map((provider) => (
                  <section key={provider.provider} className={`billing-provider-card billing-provider-card--${resolveBillingTone(provider.status)}`} data-testid={`billing-provider-row-${provider.provider.toLowerCase()}`}>
                    <div className="billing-ops-panel__header">
                      <div className="billing-ops-heading">
                        <span className="billing-ops-icon" aria-hidden="true">{provider.provider === 'STRIPE' ? 'S' : provider.provider === 'MANUAL' ? 'M' : provider.provider.slice(0, 1)}</span>
                        <div>
                          <strong>{provider.label}</strong>
                          <p className="muted" style={{ margin: '4px 0 0 0' }}>{provider.usage}</p>
                        </div>
                      </div>
                      <OperatorStatusBadge label={humanizeStatus(provider.status)} tone={resolveBillingTone(provider.status)} />
                    </div>
                    <div className="billing-provider-card__meta">
                      <span className="billing-provider-card__hint">{provider.live ? 'Ready now' : provider.provider === 'MANUAL' ? 'Manual route' : 'Not live yet'}</span>
                      <p className="muted" style={{ margin: '4px 0 0 0' }}>{provider.summary}</p>
                    </div>
                  </section>
                ))}
              </div>

              {providerCanaries ? (
                <section className="billing-ops-panel billing-ops-panel--neutral" data-testid="billing-provider-canaries">
                  <div className="billing-ops-panel__header">
                    <div className="billing-ops-heading">
                      <span className="billing-ops-icon" aria-hidden="true">⚑</span>
                      <div>
                        <strong>Tenant payment-provider canaries</strong>
                        <p className="muted billing-page-panel__text">No live tenant-provider canary runs automatically. Approval remains explicit.</p>
                      </div>
                    </div>
                    <OperatorStatusBadge label={providerCanaries?.automatedLiveCanariesEnabled ? 'Approval present' : 'Approval blocked'} tone={providerCanaries?.automatedLiveCanariesEnabled ? 'success' : 'warning'} />
                  </div>
                  <p className="muted billing-page-panel__guidance">{providerCanaries?.summary}</p>
                  <div className="billing-provider-list">
                    {(providerCanaries?.providers || []).map((provider) => (
                      <section key={provider.provider} className={`billing-provider-card billing-provider-card--${resolveBillingTone(provider.status)}`}>
                        <div className="billing-ops-panel__header">
                          <div className="billing-ops-heading">
                            <span className="billing-ops-icon" aria-hidden="true">{provider.provider === 'MANUAL' ? 'M' : provider.provider.slice(0, 1)}</span>
                            <div>
                              <strong>{provider.label}</strong>
                              <p className="muted" style={{ margin: '4px 0 0 0' }}>{provider.message}</p>
                            </div>
                          </div>
                          <OperatorStatusBadge label={humanizeStatus(provider.status)} tone={resolveBillingTone(provider.status)} />
                        </div>
                      </section>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="billing-ops-panel billing-ops-panel--neutral">
                <strong>Future provider requests</strong>
                <p className="muted billing-page-panel__text">Track which payment providers the workspace wants next without showing them as live customer checkout paths.</p>
                <div className="tab-row">
                  {['SUMUP', 'WORLDPAY'].map((provider) => {
                    const selected = requestedProviders.includes(provider);
                    return (
                      <button
                        key={provider}
                        type="button"
                        className={`tab-button ${selected ? 'active' : ''}`}
                        onClick={() => {
                          if (!canManageCollectionSettings) return;
                          setRequestedProviders((current) => selected ? current.filter((entry) => entry !== provider) : [...current, provider]);
                        }}
                        disabled={!canManageCollectionSettings}
                        data-testid={`billing-provider-interest-${provider.toLowerCase()}`}
                      >
                        {selected ? `${provider} requested` : `Ask for ${provider}`}
                      </button>
                    );
                  })}
                </div>
                <p className="muted billing-page-panel__text billing-page-panel__text--last">
                  Worldpay and SumUp are shown as setup requests only. They are not presented as live customer payment providers until they are actually wired.
                </p>
              </section>

              {canManageCollectionSettings ? (
                <div className="billing-page-actions" style={{ marginTop: 12 }}>
                  <button
                    className="button"
                    type="button"
                    onClick={saveCollectionSettings}
                    disabled={loading === 'payment-collection'}
                    data-testid="billing-save-payment-collection"
                  >
                    {loading === 'payment-collection' ? 'Saving payment setup...' : 'Save payment setup'}
                  </button>
                </div>
              ) : null}
            </div>
              </section> : null}

              <section className="billing-ops-panel">
                <div className="billing-ops-panel__header">
                  <div className="billing-ops-heading">
                    <span className="billing-ops-icon" aria-hidden="true">i</span>
                    <div>
                      <strong>Settings live elsewhere</strong>
                      <p className="muted" style={{ margin: '6px 0 0 0' }}>
                        Use Billing for the current MyTitan commercial state. Change customer sender setup in Settings and payment defaults in Bookings.
                      </p>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link className="button secondary" href="/dashboard/settings?tab=messages">Open Email settings</Link>
                  <Link className="button secondary" href="/dashboard/booking/settings">Open Bookings</Link>
                </div>
              </section>

              {showPlanChoices ? (
            <section className="operator-section billing-ops-section">
              <div className="operator-section__header billing-ops-section__header">
                <div>
                  <h2 className="operator-section__title">Plan choices</h2>
                  <p className="operator-section__subtitle">Choose a plan only when the owner is allowed to do it, and only when Stripe price setup matches the published pricing.</p>
                </div>
                <OperatorStatusBadge label={interval === 'MONTHLY' ? 'Monthly billing' : 'Annual billing'} tone="info" />
              </div>
              <div className="tab-row" style={{ marginTop: 0 }}>
                  {(['MONTHLY', 'ANNUAL'] as const).map((mode) => (
                    <button
                      key={mode}
                      className={`tab-button ${interval === mode ? 'active' : ''}`}
                      type="button"
                      onClick={() => setInterval(mode)}
                    >
                      {mode === 'MONTHLY' ? 'Monthly' : 'Annual'}
                    </button>
                  ))}
              </div>

              <div className="list billing-tier-list" style={{ marginTop: 16 }}>
                {(pricingModel?.tiers || []).map((tier) => (
                    <div key={tier.code} className="card billing-tier-card billing-tier-card--admin">
                      {(() => {
                        const intervalConfigured =
                          tier.checkoutMode === 'stripe_checkout'
                            ? Boolean(tier.configuredIntervals?.[interval] ?? true)
                            : false;
                        return (
                          <>
                      <div className="billing-tier-card__header">
                        <div className="billing-ops-heading">
                          <span className="billing-ops-icon" aria-hidden="true">{tier.publicName.slice(0, 1)}</span>
                          <strong>{tier.publicName}</strong>
                        </div>
                        {currentPlanCode === tier.code ? <OperatorStatusBadge label="Current" tone="success" /> : <OperatorStatusBadge label={tier.checkoutMode === 'signup_only' ? 'Signup only' : intervalConfigured ? interval === 'MONTHLY' ? 'Monthly' : 'Annual' : 'Setup required'} tone={tier.checkoutMode === 'signup_only' ? 'warning' : intervalConfigured ? 'info' : 'warning'} />}
                      </div>
                      <p className="muted">{tier.summary}</p>
                      <p className="muted" style={{ marginTop: -6 }}>Best for: {tier.idealFor}</p>
                      <p className="muted" style={{ marginTop: -6 }}>
                        {interval === 'MONTHLY' ? tier.priceMonthlyLabel || 'Monthly setup required' : tier.priceAnnualLabel || 'Annual setup required'}
                      </p>
                      <p className="muted" style={{ marginTop: -6 }}>Completed jobs per month: {tier.completedJobsLabel || 'Usage allowance is being prepared.'}</p>
                      <p className="muted" style={{ marginTop: -6 }}>Includes: {tier.includedGroups.map((group) => group.label).join(' • ')}</p>
                      <p className="muted" style={{ marginTop: -6 }}>
                        Upgrade when: {tier.naturalUpgradeTriggers.map((trigger) => trigger.label).join(' • ') || 'Review with your workload and team size'}
                      </p>
                      <p className="muted" style={{ marginTop: -6 }}>
                        {tier.extraJobCompletionPacks?.message || 'Extra job completion packs coming soon for busy months.'}
                      </p>
                      {currentPlanCode === tier.code ? (
                        <p className="muted" style={{ marginTop: -6 }}>
                          This is the current subscription plan for the workspace.
                        </p>
                      ) : null}
                      {tier.checkoutMode === 'signup_only' ? (
                        <Link className="button secondary" href="/signup" data-testid={`billing-free-signup-${tier.code}`}>
                          Open free signup
                        </Link>
                      ) : (
                        <button
                          className="button"
                          type="button"
                          disabled={loading === tier.code || loading === 'portal' || actionBlocked || !intervalConfigured}
                          onClick={() => currentPlanCode === tier.code ? void openPortal() : void startCheckout(tier.code)}
                          data-testid={currentPlanCode === tier.code ? `billing-manage-plan-${tier.code}` : `billing-choose-plan-${tier.code}`}
                        >
                          {loading === tier.code || (currentPlanCode === tier.code && loading === 'portal')
                            ? 'Redirecting...'
                            : !canManageSubscription
                              ? 'Owner action required'
                              : verificationBlocked
                                ? 'Verify email to continue'
                                : !stripeConfigured
                                  ? 'Unavailable right now'
                                  : !intervalConfigured
                                    ? 'Setup required'
                                  : currentPlanCode === tier.code
                                    ? 'Manage plan'
                                    : 'Choose plan'}
                        </button>
                      )}
                          </>
                        );
                      })()}
                    </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </DashboardShell>
  );
}

function humanizeStatus(status: string) {
  return String(status || 'inactive')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (value) => value.toUpperCase());
}

function resolveBillingTone(status?: string) {
  const normalized = String(status || '').toLowerCase();
  if (['connected', 'live', 'ready', 'active', 'paid'].includes(normalized)) return 'success' as const;
  if (['requested', 'pending', 'setup_needed', 'coming_soon', 'trialing'].includes(normalized)) return 'warning' as const;
  if (['failed', 'blocked', 'revoked', 'expired', 'inactive', 'mismatch'].includes(normalized)) return 'critical' as const;
  return 'info' as const;
}
