import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardShell } from '../../components/dashboard-shell';
import { OperatorPageHeader, OperatorStatusBadge } from '../../components/ui/operator-page';
import { ApiError, apiFetch } from '../../lib/api';
import { useBilling } from '../../lib/billing';
import { useSectionTargeting } from '../../lib/section-targeting';
import { getResendVerificationMessage, getSafeVerificationError } from '../../lib/verification-resend';

type BillingInterval = 'MONTHLY' | 'ANNUAL';

type PackConfirmation = {
  code: string;
  label: string;
  displayPrice: string;
  jobCount: number;
};

const SECTION_KEYS = {
  account: 'account-summary',
  plans: 'plan-choices',
  packs: 'job-packs',
  paymentMethod: 'payment-method',
  history: 'mytitan-invoices',
};

export default function BillingPage() {
  const router = useRouter();
  const {
    plan,
    subscription,
    trial,
    interval: billingInterval,
    stripeConfigured,
    pricingModel,
    jobCompletionPacks,
    jobCompletionAllowance,
    viewer,
    refresh,
  } = useBilling();
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState('');
  const [interval, setInterval] = useState<BillingInterval>('MONTHLY');
  const [confirmPack, setConfirmPack] = useState<PackConfirmation | null>(null);

  useEffect(() => {
    if (billingInterval) setInterval(billingInterval);
  }, [billingInterval]);

  useEffect(() => {
    if (!router.isReady) return;
    const checkout = typeof router.query.checkout === 'string' ? router.query.checkout : '';
    const packCheckout = typeof router.query.packCheckout === 'string' ? router.query.packCheckout : '';
    if (checkout === 'success') {
      setInfo('Subscription checkout completed. Your plan updates after Stripe confirms payment.');
      setError('');
      void refresh();
    } else if (checkout === 'cancel') {
      setInfo('Checkout was cancelled. No subscription changes were made.');
      setError('');
    } else if (packCheckout === 'success') {
      setInfo('Pack checkout completed. Extra jobs are added after Stripe confirms payment.');
      setError('');
      void refresh();
    } else if (packCheckout === 'cancel') {
      setInfo('Pack checkout was cancelled. No extra jobs were added.');
      setError('');
    }
  }, [refresh, router.isReady, router.query.checkout, router.query.packCheckout]);

  const billingSection = typeof router.query.section === 'string' ? router.query.section : '';
  const { getSectionProps } = useSectionTargeting({
    targetKey: billingSection || SECTION_KEYS.account,
    ready: router.isReady,
  });

  useEffect(() => {
    if (!router.isReady || billingSection !== 'customer-payments') return;
    void router.replace('/dashboard/settings/payments');
  }, [billingSection, router]);

  const currentPlanCode = String(plan?.code || 'SOLE_TRADER');
  const currentPlanName = plan?.name || humanizeStatus(currentPlanCode);
  const subscriptionStatus = String(subscription?.status || 'inactive');
  const statusLabel = humanizeStatus(subscriptionStatus);
  const hasActiveSubscription = subscriptionStatus === 'active';
  const canManageSubscription = Boolean(viewer?.canManageSubscription);
  const verificationBlocked = canManageSubscription && !viewer?.emailVerified;
  const actionBlocked = verificationBlocked || !canManageSubscription || !stripeConfigured;

  const currentTier = useMemo(
    () => (pricingModel?.tiers || []).find((tier) => tier.code === currentPlanCode) || null,
    [currentPlanCode, pricingModel?.tiers],
  );

  const selectablePlans = useMemo(
    () =>
      (pricingModel?.tiers || [])
        .filter((tier) => tier.checkoutMode === 'stripe_checkout')
        .filter((tier) => tier.code === currentPlanCode || Boolean(tier.configuredIntervals?.[interval]))
        .filter((tier) => tier.code !== 'FREE'),
    [currentPlanCode, interval, pricingModel?.tiers],
  );

  const availablePacks = useMemo(
    () =>
      (jobCompletionPacks?.packs || []).filter(
        (pack) =>
          jobCompletionPacks?.checkoutEnabled === true &&
          pack.status === 'ready' &&
          pack.active !== false &&
          Boolean(pack.displayPrice),
      ),
    [jobCompletionPacks?.checkoutEnabled, jobCompletionPacks?.packs],
  );

  const includedJobs = jobCompletionAllowance?.unlimitedJobs
    ? 'Unlimited'
    : String(
        jobCompletionAllowance?.monthlyIncludedAllowance ??
          jobCompletionAllowance?.includedAllowance ??
          currentTier?.completedJobsPerMonth ??
          plan?.completedJobsPerMonth ??
          0,
      );
  const usedThisMonth =
    jobCompletionAllowance?.monthlyIncludedUsed ??
    jobCompletionAllowance?.completedJobsCount ??
    Math.max(0, Number(jobCompletionAllowance?.includedAllowance || 0) - Number(jobCompletionAllowance?.includedRemaining || 0));
  const remainingThisMonth = jobCompletionAllowance?.unlimitedJobs
    ? 'Unlimited'
    : String(
        jobCompletionAllowance?.monthlyIncludedRemaining ??
          jobCompletionAllowance?.includedRemaining ??
          jobCompletionAllowance?.remainingAllowance ??
          0,
      );
  const resetDateLabel = jobCompletionAllowance?.resetDate
    ? new Date(jobCompletionAllowance.resetDate).toLocaleDateString()
    : jobCompletionAllowance?.periodEnd
      ? new Date(jobCompletionAllowance.periodEnd).toLocaleDateString()
      : subscription?.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
        : 'Not scheduled';
  const usagePercent = jobCompletionAllowance?.unlimitedJobs
    ? 0
    : Math.min(100, Math.round((Number(usedThisMonth || 0) / Math.max(1, Number(includedJobs || 0))) * 100));

  const trialMessage = useMemo(() => {
    if (trial?.isActive) {
      return trial.endsAt
        ? `Your trial ends on ${new Date(trial.endsAt).toLocaleDateString()}.`
        : 'Your trial is active.';
    }
    if (trial?.status === 'expired') {
      return trial.endsAt
        ? `Your trial ended on ${new Date(trial.endsAt).toLocaleDateString()}.`
        : 'Your trial has ended.';
    }
    if (trial?.status === 'converted') return 'Your trial has converted to a paid plan.';
    return '';
  }, [trial?.endsAt, trial?.isActive, trial?.status]);

  const primaryAction = useMemo(() => {
    if (!canManageSubscription) return { label: 'Ask owner to manage billing', section: SECTION_KEYS.account, disabled: true };
    if (verificationBlocked) return { label: 'Resend verification email', section: SECTION_KEYS.account, disabled: false };
    if (!stripeConfigured) return { label: 'Billing unavailable', section: SECTION_KEYS.account, disabled: true };
    if (hasActiveSubscription) return { label: 'Manage plan', section: SECTION_KEYS.paymentMethod, disabled: false };
    return { label: 'Choose a paid plan', section: SECTION_KEYS.plans, disabled: false };
  }, [canManageSubscription, hasActiveSubscription, stripeConfigured, verificationBlocked]);

  async function startCheckout(planCode: string) {
    if (!stripeConfigured) {
      setError('Plan checkout is unavailable right now.');
      return;
    }
    if (!canManageSubscription) {
      setError('Only the account owner can choose or change a plan.');
      return;
    }
    if (verificationBlocked) {
      setError('Verify the owner email first, then choose a plan.');
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
        setError('Verify the owner email first, then choose a plan.');
        return;
      }
      setError(err.message || 'Failed to start checkout');
    } finally {
      setLoading('');
    }
  }

  async function openPortal(target: 'billing' | 'payment-method' | 'history' = 'billing') {
    if (!stripeConfigured) {
      setError('MyTitan billing management is unavailable right now.');
      return;
    }
    if (!canManageSubscription) {
      setError('Only the account owner can manage billing.');
      return;
    }
    if (verificationBlocked) {
      setError('Verify the owner email first, then manage billing.');
      return;
    }
    setError('');
    setInfo('');
    setLoading(`portal-${target}`);
    try {
      const res = await apiFetch('/billing/portal');
      if (res?.url) {
        window.location.href = res.url;
      } else {
        setError('Billing management could not be opened right now. Try again in a moment.');
      }
    } catch (err: any) {
      if (err instanceof ApiError && err.statusCode === 403 && /verify your email/i.test(err.message || '')) {
        setError('Verify the owner email first, then manage billing.');
        return;
      }
      setError(err.message || 'Failed to open billing management');
    } finally {
      setLoading('');
    }
  }

  async function startPackCheckout(packCode: string) {
    if (!canManageSubscription) {
      setError('Only the account owner can buy extra job packs.');
      return;
    }
    if (verificationBlocked) {
      setError('Verify the owner email first, then buy extra job packs.');
      return;
    }
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
      setConfirmPack(null);
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

  function runPrimaryAction() {
    if (verificationBlocked) {
      void resendVerification();
      return;
    }
    if (hasActiveSubscription) {
      void openPortal('billing');
      return;
    }
    void router.push(`/dashboard/billing?section=${SECTION_KEYS.plans}`);
  }

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Settings"
          title="MyTitan Account"
          subtitle="Your plan, job allowance, payment method, and MyTitan invoices."
        />

        <div className="card billing-page-shell billing-page-shell--admin">
          {info ? <p className="muted billing-page-shell__notice billing-page-shell__notice--success">{info}</p> : null}
          {error ? <p className="muted billing-page-shell__notice billing-page-shell__notice--error">{error}</p> : null}

          <section className="operator-section billing-ops-section" data-testid="billing-account-summary" {...getSectionProps(SECTION_KEYS.account)}>
            <div className="operator-section__header billing-ops-section__header">
              <div>
                <h2 className="operator-section__title">Account summary</h2>
                <p className="operator-section__subtitle">{trialMessage || 'Your MyTitan billing status at a glance.'}</p>
              </div>
              <OperatorStatusBadge label={statusLabel} tone={subscriptionStatus === 'active' ? 'success' : trial?.status === 'expired' ? 'critical' : 'info'} />
            </div>

            <div className="billing-page-grid billing-page-grid--overview">
              <section className="billing-ops-panel billing-ops-panel--revenue">
                <div className="billing-ops-panel__header">
                  <div>
                    <span className="mt-guided-setup-card__eyebrow">Current plan</span>
                    <h3 className="billing-summary-plan">{currentPlanName}</h3>
                  </div>
                  <OperatorStatusBadge label={interval === 'ANNUAL' ? 'Annual billing' : 'Monthly billing'} tone="info" />
                </div>
                <div className="billing-summary-metrics" data-testid="billing-plan-usage-tracking">
                  <div><span>Included jobs</span><strong>{includedJobs}</strong></div>
                  <div><span>Used this month</span><strong>{usedThisMonth}</strong></div>
                  <div><span>Remaining this month</span><strong>{remainingThisMonth}</strong></div>
                  <div><span>Next renewal/reset</span><strong>{resetDateLabel}</strong></div>
                </div>
                {!jobCompletionAllowance?.unlimitedJobs ? (
                  <div className="billing-readiness-bars" data-testid="billing-job-pack-allowance">
                    <div className="billing-readiness-bars__track" aria-label="Usage progress">
                      <span className="billing-readiness-bars__fill billing-readiness-bars__fill--info" style={{ width: `${usagePercent}%` }} />
                    </div>
                  </div>
                ) : null}
                <div className="billing-page-actions">
                  <button
                    className="button"
                    type="button"
                    onClick={runPrimaryAction}
                    disabled={primaryAction.disabled || loading === 'resend-verification' || loading === 'portal-billing'}
                    data-testid="billing-primary-action"
                  >
                    {loading === 'resend-verification'
                      ? 'Sending verification email...'
                      : loading === 'portal-billing'
                        ? 'Opening billing...'
                        : primaryAction.label}
                  </button>
                </div>
              </section>
            </div>
          </section>

          <section className="operator-section billing-ops-section" data-testid="billing-plan-choices-section" {...getSectionProps(SECTION_KEYS.plans)}>
            <div className="operator-section__header billing-ops-section__header">
              <div>
                <h2 className="operator-section__title">Choose your plan</h2>
                <p className="operator-section__subtitle">Select a paid plan that is available for this account.</p>
              </div>
              <div className="tab-row" style={{ marginTop: 0 }}>
                {(['MONTHLY', 'ANNUAL'] as const).map((mode) => (
                  <button
                    key={mode}
                    className={`tab-button ${interval === mode ? 'active' : ''}`}
                    type="button"
                    onClick={() => setInterval(mode)}
                    data-testid={`billing-interval-${mode.toLowerCase()}`}
                  >
                    {mode === 'MONTHLY' ? 'Monthly' : 'Annual'}
                  </button>
                ))}
              </div>
            </div>

            {selectablePlans.length ? (
              <div className="list billing-tier-list" style={{ marginTop: 16 }}>
                {selectablePlans.map((tier) => {
                  const isCurrent = currentPlanCode === tier.code;
                  const priceLabel = interval === 'MONTHLY' ? tier.priceMonthlyLabel : tier.priceAnnualLabel;
                  return (
                    <article key={tier.code} className="card billing-tier-card billing-tier-card--admin" data-testid={`billing-plan-card-${tier.code}`}>
                      <div className="billing-tier-card__header">
                        <strong>{tier.publicName}</strong>
                        {isCurrent ? <OperatorStatusBadge label="Current" tone="success" /> : null}
                      </div>
                      <p className="billing-plan-price">{priceLabel || 'Price unavailable'}</p>
                      <p className="muted">{tier.idealFor || tier.summary}</p>
                      <p className="muted">Included completed jobs: <strong>{tier.completedJobsLabel || tier.completedJobsPerMonth || 'Prepared for this plan'}</strong></p>
                      <p className="muted">Includes: {tier.includedGroups.slice(0, 4).map((group) => group.label).join(' • ')}</p>
                      <button
                        className={isCurrent ? 'button secondary' : 'button'}
                        type="button"
                        disabled={loading === tier.code || loading === 'portal-billing' || actionBlocked}
                        onClick={() => (isCurrent ? void openPortal('billing') : void startCheckout(tier.code))}
                        data-testid={isCurrent ? `billing-manage-plan-${tier.code}` : `billing-choose-plan-${tier.code}`}
                      >
                        {loading === tier.code || (isCurrent && loading === 'portal-billing')
                          ? 'Opening...'
                          : !canManageSubscription
                            ? 'Owner required'
                            : verificationBlocked
                              ? 'Verify email first'
                              : !stripeConfigured
                                ? 'Unavailable'
                                : isCurrent
                                  ? 'Manage plan'
                                  : 'Select plan'}
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="muted" data-testid="billing-plan-unavailable">
                Paid plan checkout is not currently available for this account.
              </p>
            )}
          </section>

          <section className="operator-section billing-ops-section" data-testid="billing-job-completion-packs-card" {...getSectionProps(SECTION_KEYS.packs)}>
            <div className="operator-section__header billing-ops-section__header">
              <div>
                <h2 className="operator-section__title">Buy extra job packs</h2>
                <p className="operator-section__subtitle">Extra jobs are added only after Stripe confirms payment.</p>
              </div>
            </div>

            {availablePacks.length ? (
              <div className="list billing-tier-list">
                {availablePacks.map((pack) => (
                  <article
                    key={pack.code}
                    className="card billing-tier-card billing-tier-card--admin"
                    data-testid={`billing-job-pack-primary-${pack.code}`}
                    {...getSectionProps(`job-pack-${pack.jobCount}`)}
                  >
                    <div className="billing-tier-card__header">
                      <strong>{pack.jobCount} extra jobs</strong>
                      <OperatorStatusBadge label="Available" tone="success" />
                    </div>
                    <p className="billing-plan-price">{pack.displayPrice}</p>
                    <button
                      className="button"
                      type="button"
                      onClick={() =>
                        setConfirmPack({
                          code: pack.code,
                          label: `${pack.jobCount} extra jobs`,
                          displayPrice: pack.displayPrice || '',
                          jobCount: pack.jobCount,
                        })
                      }
                      disabled={actionBlocked || loading === pack.code}
                      data-testid={`billing-job-pack-buy-${pack.code}`}
                    >
                      {loading === pack.code
                        ? 'Opening checkout...'
                        : !canManageSubscription
                          ? 'Owner required'
                          : verificationBlocked
                            ? 'Verify email first'
                            : 'Buy pack'}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="billing-ops-panel billing-ops-panel--neutral">
                <p className="muted" data-testid="billing-job-pack-summary">Extra job packs are not currently available for this account.</p>
                <button className="button secondary" type="button" onClick={() => void router.push(`/dashboard/billing?section=${SECTION_KEYS.plans}`)} data-testid="billing-review-plans">
                  Review plans
                </button>
              </div>
            )}
          </section>

          <section className="operator-section billing-ops-section" data-testid="billing-payment-method-target" {...getSectionProps(SECTION_KEYS.paymentMethod)}>
            <div className="operator-section__header billing-ops-section__header">
              <div>
                <h2 className="operator-section__title">Payment method</h2>
                <p className="operator-section__subtitle">
                  {hasActiveSubscription
                    ? 'Manage your saved card securely in Stripe.'
                    : 'Add a payment method when you choose a plan.'}
                </p>
              </div>
              <OperatorStatusBadge label={hasActiveSubscription && !actionBlocked ? 'Available' : 'Not available'} tone={hasActiveSubscription && !actionBlocked ? 'success' : 'warning'} />
            </div>
            {hasActiveSubscription && !actionBlocked ? (
              <button
                className="button secondary"
                type="button"
                onClick={() => void openPortal('payment-method')}
                disabled={loading === 'portal-payment-method'}
                data-testid="billing-open-payment-method"
              >
                {loading === 'portal-payment-method' ? 'Opening payment method...' : 'Update payment method'}
              </button>
            ) : (
              <p className="muted" data-testid="billing-payment-method-unavailable">
                {verificationBlocked
                  ? 'Verify the owner email, then return here to update the payment method.'
                  : !canManageSubscription
                    ? 'Ask the account owner to manage the payment method.'
                    : !stripeConfigured
                      ? 'Payment method management is unavailable right now.'
                      : 'Add a payment method when you choose a plan.'}
              </p>
            )}
          </section>

          <section className="operator-section billing-ops-section" data-testid="billing-invoices-section" {...getSectionProps(SECTION_KEYS.history)}>
            <div className="operator-section__header billing-ops-section__header">
              <div>
                <h2 className="operator-section__title">Billing history</h2>
                <p className="operator-section__subtitle">MyTitan subscription and job-pack invoices.</p>
              </div>
            </div>
            {hasActiveSubscription && !actionBlocked ? (
              <div className="billing-history-table">
                <div className="billing-history-table__head">
                  <span>Date</span>
                  <span>Description</span>
                  <span>Amount</span>
                  <span>Status</span>
                  <span>Invoice</span>
                </div>
                <div className="billing-history-table__empty" data-testid="billing-history-empty">No MyTitan invoices yet.</div>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => void openPortal('history')}
                  disabled={loading === 'portal-history'}
                  data-testid="billing-open-invoices"
                >
                  {loading === 'portal-history' ? 'Opening billing history...' : 'Open billing history'}
                </button>
              </div>
            ) : (
              <p className="muted" data-testid="billing-invoices-unavailable">No MyTitan invoices yet.</p>
            )}
          </section>
        </div>

        {confirmPack ? (
          <div className="billing-modal-backdrop" role="presentation">
            <section className="card billing-pack-modal" role="dialog" aria-modal="true" aria-labelledby="billing-pack-confirm-title" data-testid="billing-job-pack-confirmation">
              <h2 id="billing-pack-confirm-title">Confirm job pack</h2>
              <p className="muted">{confirmPack.label}</p>
              <p className="billing-plan-price">{confirmPack.displayPrice}</p>
              <p className="muted">Extra jobs are added only after Stripe confirms payment.</p>
              <div className="billing-page-actions">
                <button className="button" type="button" onClick={() => void startPackCheckout(confirmPack.code)} disabled={loading === confirmPack.code} data-testid="billing-confirm-job-pack-purchase">
                  {loading === confirmPack.code ? 'Opening checkout...' : `Buy ${confirmPack.jobCount} jobs`}
                </button>
                <button className="button secondary" type="button" onClick={() => setConfirmPack(null)} disabled={loading === confirmPack.code}>
                  Cancel
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </DashboardShell>
  );
}

function humanizeStatus(status: string) {
  return String(status || 'inactive')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (value) => value.toUpperCase());
}
