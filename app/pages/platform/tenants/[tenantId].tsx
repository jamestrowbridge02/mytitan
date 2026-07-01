import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { PlatformShell } from '../../../components/platform-shell';
import { apiFetch } from '../../../lib/api';

type CommercialAction =
  | 'extend_trial'
  | 'set_trial_end'
  | 'change_plan'
  | 'set_monthly_price'
  | 'set_annual_price'
  | 'clear_custom_price'
  | 'set_monthly_allowance'
  | 'add_one_off_credits'
  | 'add_recurring_extra'
  | 'grant_job_pack'
  | 'pause_account'
  | 'resume_account'
  | 'add_billing_note';

const ACTIONS: Array<{ key: CommercialAction; label: string; group: string; summary: string }> = [
  { key: 'extend_trial', label: 'Extend trial', group: 'Trial', summary: 'Add days to the current or stored trial window.' },
  { key: 'set_trial_end', label: 'Set trial end date', group: 'Trial', summary: 'Set an exact trial end date for this workspace.' },
  { key: 'change_plan', label: 'Change plan', group: 'Pricing', summary: 'Move the workspace to a different MyTitan plan and billing interval.' },
  { key: 'set_monthly_price', label: 'Set monthly price', group: 'Pricing', summary: 'Apply a platform-approved custom monthly subscription price.' },
  { key: 'set_annual_price', label: 'Set annual price', group: 'Pricing', summary: 'Apply a platform-approved custom annual subscription price.' },
  { key: 'clear_custom_price', label: 'Clear custom price', group: 'Pricing', summary: 'Return monthly and annual subscription pricing to plan defaults.' },
  { key: 'set_monthly_allowance', label: 'Set monthly allowance', group: 'Allowances', summary: 'Override the included monthly completed-job allowance.' },
  { key: 'add_one_off_credits', label: 'Add one-off credits', group: 'Allowances', summary: 'Grant manual completed-job credits for this workspace.' },
  { key: 'add_recurring_extra', label: 'Add recurring extra allowance', group: 'Allowances', summary: 'Add extra completed jobs to every monthly allowance period.' },
  { key: 'grant_job_pack', label: 'Grant job pack', group: 'Job packs', summary: 'Grant platform-approved job-pack credits without Stripe checkout.' },
  { key: 'pause_account', label: 'Pause account', group: 'Account', summary: 'Pause new MyTitan subscription and job-pack purchases.' },
  { key: 'resume_account', label: 'Resume account', group: 'Account', summary: 'Resume commercial purchases for this workspace.' },
  { key: 'add_billing_note', label: 'Add billing note', group: 'Notes', summary: 'Store an internal platform billing note.' },
];

function formatDate(value?: string | null) {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleString();
}

function formatDateInput(value?: string | null) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

function formatMoney(cents?: number | null, currency = 'GBP') {
  if (cents === null || cents === undefined || !Number.isFinite(Number(cents))) return 'Plan default';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(Number(cents) / 100);
}

function toMoneyInput(cents?: number | null) {
  if (cents === null || cents === undefined || !Number.isFinite(Number(cents))) return '';
  return (Number(cents) / 100).toFixed(2);
}

function Metric({ label, value, detail, testId }: { label: string; value: string; detail?: string; testId?: string }) {
  return (
    <article className="card platform-admin-card-stack" data-testid={testId}>
      <span className="muted">{label}</span>
      <strong>{value}</strong>
      {detail ? <span className="muted">{detail}</span> : null}
    </article>
  );
}

function actionLabel(key: CommercialAction) {
  return ACTIONS.find((action) => action.key === key)?.label || key;
}

export default function Tenant360Page() {
  const router = useRouter();
  const tenantId = typeof router.query.tenantId === 'string' ? router.query.tenantId : '';
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeAction, setActiveAction] = useState<CommercialAction>('extend_trial');
  const [confirmed, setConfirmed] = useState(false);
  const [recovery, setRecovery] = useState<any>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [recoveryForm, setRecoveryForm] = useState({
    targetUserId: '',
    reason: '',
    confirmation: false,
    productionOperationConfirmation: '',
    newPassword: '',
  });
  const [form, setForm] = useState({
    reason: '',
    effectiveDate: '',
    expiryDate: '',
    trialExtendDays: '7',
    trialEndDate: '',
    planCode: '',
    interval: 'MONTHLY',
    customMonthlyPrice: '',
    customAnnualPrice: '',
    monthlyJobAllowance: '',
    oneOffCredits: '',
    recurringExtraAllowance: '',
    jobPackCreditCount: '',
    billingNote: '',
  });

  async function loadTenant360(nextTenantId = tenantId) {
    const response = await apiFetch(`/admin/platform/tenants/${encodeURIComponent(nextTenantId)}/360`);
    setData(response);
    return response;
  }

  async function loadRecovery(nextTenantId = tenantId) {
    const response = await apiFetch(`/admin/platform/tenants/${encodeURIComponent(nextTenantId)}/owner-recovery`);
    setRecovery(response);
    const firstOwnerId = response?.owners?.[0]?.id || '';
    setRecoveryForm((current) => ({ ...current, targetUserId: current.targetUserId || firstOwnerId }));
    return response;
  }

  useEffect(() => {
    if (!router.isReady || !tenantId) return;
    void (async () => {
      try {
        const me = await apiFetch('/me');
        if (!me?.platformAdmin) {
          setAllowed(false);
          return;
        }
        setAllowed(true);
        await loadTenant360(tenantId);
        await loadRecovery(tenantId);
      } catch (loadError: any) {
        setError(loadError?.message || 'Tenant 360 could not be loaded.');
      }
    })();
  }, [router.isReady, tenantId]);

  useEffect(() => {
    if (!data) return;
    const controls = data.commercial?.controls || {};
    setForm((current) => ({
      ...current,
      trialEndDate: formatDateInput(data.account?.trial?.endsAt),
      planCode: data.commercial?.plan?.code || data.commercial?.plans?.[0]?.code || '',
      interval: data.commercial?.interval === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY',
      customMonthlyPrice: toMoneyInput(controls.customMonthlyPriceCents),
      customAnnualPrice: toMoneyInput(controls.customAnnualPriceCents),
      monthlyJobAllowance:
        data.usage?.allowanceOverride?.monthlyJobAllowance !== null && data.usage?.allowanceOverride?.monthlyJobAllowance !== undefined
          ? String(data.usage.allowanceOverride.monthlyJobAllowance)
          : '',
      recurringExtraAllowance: String(data.usage?.recurringExtraAllowance || ''),
      billingNote: controls.billingNote || '',
    }));
  }, [data]);

  const selectedPlan = useMemo(() => {
    const plans = data?.commercial?.plans || [];
    return plans.find((plan: any) => plan.code === form.planCode) || data?.commercial?.plan || plans[0] || null;
  }, [data?.commercial?.plans, data?.commercial?.plan, form.planCode]);

  const currency = data?.account?.currency || data?.commercial?.currency || 'GBP';
  const controls = data?.commercial?.controls || {};
  const monthlyPlanPrice = data?.commercial?.plan?.monthlyPriceCents ?? selectedPlan?.monthlyPriceCents ?? null;
  const annualPlanPrice = data?.commercial?.plan?.annualPriceCents ?? selectedPlan?.annualPriceCents ?? null;
  const actualMonthlyCents = controls.customMonthlyPriceCents ?? monthlyPlanPrice;
  const actualAnnualCents = controls.customAnnualPriceCents ?? annualPlanPrice;
  const customPriceActive = controls.customMonthlyPriceCents !== null || controls.customAnnualPriceCents !== null;
  const customAllowanceActive = Boolean(data?.usage?.allowanceOverride);
  const latestAudit = data?.commercial?.auditHistory?.[0] || data?.timeline?.find((row: any) => row.auditEventId);

  async function submitAction() {
    if (!tenantId || !data) return;
    const reason = form.reason.trim();
    if (reason.length < 8 || !confirmed) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      if (activeAction === 'extend_trial') {
        await apiFetch(`/admin/platform/tenants/${encodeURIComponent(tenantId)}/trial`, {
          method: 'PATCH',
          body: JSON.stringify({ action: 'extend', extendDays: Number(form.trialExtendDays || 0), reason, confirmation: true }),
        });
      } else if (activeAction === 'set_trial_end') {
        await apiFetch(`/admin/platform/tenants/${encodeURIComponent(tenantId)}/trial`, {
          method: 'PATCH',
          body: JSON.stringify({
            startedAt: data.account?.trial?.startedAt || new Date().toISOString(),
            endsAt: form.trialEndDate ? new Date(`${form.trialEndDate}T23:59:59.000Z`).toISOString() : undefined,
            reason,
            confirmation: true,
          }),
        });
      } else if (['change_plan', 'set_monthly_price', 'set_annual_price', 'clear_custom_price', 'pause_account', 'resume_account', 'add_billing_note'].includes(activeAction)) {
        await apiFetch(`/admin/platform/tenants/${encodeURIComponent(tenantId)}/commercial-controls`, {
          method: 'PATCH',
          body: JSON.stringify({
            planCode: activeAction === 'change_plan' ? form.planCode : data.commercial?.plan?.code,
            interval: activeAction === 'change_plan' ? form.interval : data.commercial?.interval,
            customMonthlyPriceCents:
              activeAction === 'clear_custom_price'
                ? null
                : activeAction === 'set_monthly_price'
                  ? Math.round(Number(form.customMonthlyPrice || 0) * 100)
                  : controls.customMonthlyPriceCents,
            customAnnualPriceCents:
              activeAction === 'clear_custom_price'
                ? null
                : activeAction === 'set_annual_price'
                  ? Math.round(Number(form.customAnnualPrice || 0) * 100)
                  : controls.customAnnualPriceCents,
            grandfatheredPricing: controls.grandfatheredPricing === true,
            paused: activeAction === 'pause_account' ? true : activeAction === 'resume_account' ? false : controls.paused === true,
            billingNote: activeAction === 'add_billing_note' ? form.billingNote : controls.billingNote,
            reason,
            confirmation: true,
          }),
        });
      } else {
        await apiFetch(`/admin/platform/tenants/${encodeURIComponent(tenantId)}/job-allowance`, {
          method: 'PATCH',
          body: JSON.stringify({
            monthlyJobAllowance: activeAction === 'set_monthly_allowance' ? Number(form.monthlyJobAllowance || 0) : undefined,
            recurringExtraAllowance: activeAction === 'add_recurring_extra' ? Number(form.recurringExtraAllowance || 0) : undefined,
            creditDelta: activeAction === 'add_one_off_credits' ? Number(form.oneOffCredits || 0) : 0,
            jobPackCreditCount: activeAction === 'grant_job_pack' ? Number(form.jobPackCreditCount || 0) : 0,
            expiresAt: form.expiryDate ? new Date(`${form.expiryDate}T23:59:59.000Z`).toISOString() : undefined,
            reason,
            confirmation: true,
          }),
        });
      }
      const refreshed = await loadTenant360();
      const auditId = refreshed?.commercial?.auditHistory?.[0]?.id || refreshed?.timeline?.find((row: any) => row.auditEventId)?.auditEventId || 'recorded';
      setSuccess(`${actionLabel(activeAction)} saved. Audit reference ${auditId}.`);
      setConfirmed(false);
      setForm((current) => ({ ...current, reason: '' }));
    } catch (saveError: any) {
      setError(saveError?.message || `${actionLabel(activeAction)} could not be saved.`);
    } finally {
      setBusy(false);
    }
  }

  async function submitOwnerRecovery(action: 'send_reset_email' | 'server_reset_password') {
    if (!tenantId || !recoveryForm.targetUserId) return;
    setRecoveryBusy(true);
    setError('');
    setRecoveryMessage('');
    try {
      const result = await apiFetch(`/admin/platform/tenants/${encodeURIComponent(tenantId)}/owner-recovery`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          targetUserId: recoveryForm.targetUserId,
          reason: recoveryForm.reason,
          confirmation: recoveryForm.confirmation,
          productionOperationConfirmation: recoveryForm.productionOperationConfirmation,
          newPassword: action === 'server_reset_password' ? recoveryForm.newPassword : undefined,
        }),
      });
      await loadRecovery();
      setRecoveryMessage(`Recovery ${result.status || 'accepted'}. Request ${result.requestId || 'recorded'}. No secrets were returned.`);
      setRecoveryForm((current) => ({
        ...current,
        confirmation: false,
        productionOperationConfirmation: '',
        newPassword: '',
      }));
    } catch (recoveryError: any) {
      setError(recoveryError?.message || 'Tenant owner recovery could not be completed.');
    } finally {
      setRecoveryBusy(false);
    }
  }

  if (allowed === null) return <PlatformShell><div className="card">Loading protected Tenant 360...</div></PlatformShell>;
  if (!allowed) {
    return (
      <PlatformShell>
        <div className="card" data-testid="platform-tenant-360-forbidden">
          <h2>Platform admin access required</h2>
          <p>Tenant users cannot access workspace health, commercial controls, risk, or platform audit data.</p>
        </div>
      </PlatformShell>
    );
  }

  const activeMeta = ACTIONS.find((action) => action.key === activeAction)!;

  return (
    <PlatformShell>
      <div className="platform-admin-stack" data-testid="platform-tenant-360">
        <section className="platform-admin-section card">
          <div className="platform-admin-section-copy">
            <div className="platform-admin-section-copy__eyebrow">Tenant 360</div>
            <h2>{data?.account?.name || 'Workspace'}</h2>
            <p>Commercial state, direct platform actions, health, usage, and redacted audit evidence.</p>
          </div>
          <div className="button-row">
            <a className="button" href="#commercial" data-testid="tenant-360-commercial-tab-link">Commercial</a>
            <Link className="button secondary" href={`/platform?tenantId=${encodeURIComponent(tenantId)}#lookup`}>Support mode</Link>
            <a className="button secondary" href="#owner-recovery" data-testid="tenant-360-owner-recovery-link">Owner recovery</a>
            <a className="button secondary" href="#audit">Audit</a>
          </div>
          {error ? <div className="alert warning" role="alert">{error}</div> : null}
          {success ? <div className="alert success" role="status" data-testid="tenant-360-commercial-success">{success}</div> : null}
        </section>

        {data ? (
          <>
            <section className="platform-admin-section card" data-testid="tenant-360-commercial-summary">
              <div className="platform-admin-section-copy">
                <div className="platform-admin-section-copy__eyebrow">Commercial state</div>
                <h2>Current subscription, trial, pricing, and allowance</h2>
                <p>True MyTitan commercial values only. Tenant customer payments and Stripe Connect deposits are not platform revenue.</p>
              </div>
              <div className="platform-admin-metric-grid">
                <Metric label="Current plan" value={data.account.plan?.name || 'No plan'} detail={data.account.plan?.code || 'not set'} />
                <Metric label="Billing interval" value={data.commercial?.interval || 'MONTHLY'} />
                <Metric label="Subscription state" value={data.account.subscription.state} detail={data.account.subscription.cancelAtPeriodEnd ? 'Cancels at period end' : 'Continuing'} />
                <Metric label="Trial state" value={data.account.trial.state} detail={data.account.trial.endsAt ? `Ends ${formatDate(data.account.trial.endsAt)}` : 'No trial window'} />
                <Metric label="Days remaining" value={String(data.account.trial.daysRemaining ?? 0)} />
                <Metric label="Actual monthly price" value={formatMoney(actualMonthlyCents, currency)} detail={controls.customMonthlyPriceCents !== null ? 'Custom price active' : 'Plan price'} testId="tenant-360-actual-monthly-price" />
                <Metric label="Actual annual price" value={formatMoney(actualAnnualCents, currency)} detail={controls.customAnnualPriceCents !== null ? 'Custom price active' : 'Plan price'} testId="tenant-360-actual-annual-price" />
                <Metric label="Custom price active" value={customPriceActive ? 'Yes' : 'No'} />
                <Metric label="Job allowance this period" value={data.usage?.unlimitedJobs ? 'Unlimited' : String(data.usage?.monthlyIncludedAllowance ?? 0)} detail={`Plan allowance ${data.usage?.planIncludedAllowance ?? 0}`} />
                <Metric label="Custom allowance active" value={customAllowanceActive ? 'Yes' : 'No'} />
                <Metric label="Recurring extras" value={String(data.usage?.recurringExtraAllowance ?? 0)} />
                <Metric label="One-off credits" value={String(data.usage?.manualCreditsTotal ?? 0)} />
                <Metric label="Job packs remaining" value={String(data.usage?.purchasedCreditsAvailableNow ?? data.usage?.purchasedCreditsTotal ?? 0)} />
                <Metric label="Commercial pause" value={controls.paused ? 'Paused' : 'Active'} detail={controls.billingNote || undefined} />
              </div>
            </section>

            <section id="commercial" className="platform-admin-section card" data-testid="tenant-360-commercial-tab">
              <div className="platform-admin-section-copy">
                <div className="platform-admin-section-copy__eyebrow">Commercial</div>
                <h2>Commercial Actions</h2>
                <p>Platform Admin can manage commercial controls here without starting support mode. Every save requires a reason, confirmation, and writes before/after audit evidence.</p>
              </div>
              <div className="platform-admin-filter-grid" data-testid="tenant-360-commercial-actions">
                {ACTIONS.map((action) => (
                  <button
                    key={action.key}
                    type="button"
                    className={activeAction === action.key ? 'button' : 'button secondary'}
                    data-testid={`tenant-360-action-${action.key}`}
                    onClick={() => {
                      setActiveAction(action.key);
                      setConfirmed(false);
                      setSuccess('');
                      setError('');
                    }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>

              <div className="card platform-admin-card-stack phase15-commercial-panel" data-testid="tenant-360-commercial-action-panel">
                <div className="platform-admin-card-stack__header">
                  <div>
                    <strong>{activeMeta.label}</strong>
                    <p className="muted">{activeMeta.group} - {activeMeta.summary}</p>
                  </div>
                  <span className="platform-admin-chip">Audit required</span>
                </div>
                <div className="phase15-action-guide" aria-label="Commercial action save requirements">
                  <div>
                    <span>1. Current state</span>
                    <strong>Review live values</strong>
                    <p>Price, trial, and allowance values below are read from this workspace before the change.</p>
                  </div>
                  <div>
                    <span>2. Proposed change</span>
                    <strong>Enter one intent</strong>
                    <p>The selected action changes only this tenant and never mutates Stripe products or prices.</p>
                  </div>
                  <div>
                    <span>3. Audit trail</span>
                    <strong>Reason and confirm</strong>
                    <p>Saving requires confirmation and writes platform before/after evidence.</p>
                  </div>
                </div>
                <div className="platform-admin-metric-grid">
                  <Metric label="Current trial end" value={formatDate(data.account.trial.endsAt)} />
                  <Metric label="Current monthly price" value={formatMoney(actualMonthlyCents, currency)} />
                  <Metric label="Current annual price" value={formatMoney(actualAnnualCents, currency)} />
                  <Metric label="Current allowance" value={data.usage?.unlimitedJobs ? 'Unlimited' : String(data.usage?.monthlyIncludedAllowance ?? 0)} />
                </div>
                <div className="form-grid">
                  {activeAction === 'extend_trial' ? (
                    <label>Extend by days<input className="input" data-testid="tenant-360-trial-extend-days" type="number" min="1" value={form.trialExtendDays} onChange={(event) => setForm((current) => ({ ...current, trialExtendDays: event.target.value }))} /></label>
                  ) : null}
                  {activeAction === 'set_trial_end' ? (
                    <label>Custom trial end date<input className="input" data-testid="tenant-360-trial-end-date" type="date" value={form.trialEndDate} onChange={(event) => setForm((current) => ({ ...current, trialEndDate: event.target.value }))} /></label>
                  ) : null}
                  {activeAction === 'change_plan' ? (
                    <>
                      <label>Plan<select className="input" data-testid="tenant-360-plan-code" value={form.planCode} onChange={(event) => setForm((current) => ({ ...current, planCode: event.target.value }))}>{(data.commercial?.plans || []).map((plan: any) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}</select></label>
                      <label>Billing interval<select className="input" data-testid="tenant-360-plan-interval" value={form.interval} onChange={(event) => setForm((current) => ({ ...current, interval: event.target.value }))}><option value="MONTHLY">Monthly</option><option value="ANNUAL">Annual</option></select></label>
                    </>
                  ) : null}
                  {activeAction === 'set_monthly_price' ? (
                    <label>Custom monthly price<input className="input" data-testid="tenant-360-monthly-price" type="number" min="0" step="0.01" value={form.customMonthlyPrice} onChange={(event) => setForm((current) => ({ ...current, customMonthlyPrice: event.target.value }))} /></label>
                  ) : null}
                  {activeAction === 'set_annual_price' ? (
                    <label>Custom annual price<input className="input" data-testid="tenant-360-annual-price" type="number" min="0" step="0.01" value={form.customAnnualPrice} onChange={(event) => setForm((current) => ({ ...current, customAnnualPrice: event.target.value }))} /></label>
                  ) : null}
                  {activeAction === 'set_monthly_allowance' ? (
                    <label>Monthly job allowance<input className="input" data-testid="tenant-360-monthly-allowance" type="number" min="0" value={form.monthlyJobAllowance} onChange={(event) => setForm((current) => ({ ...current, monthlyJobAllowance: event.target.value }))} /></label>
                  ) : null}
                  {activeAction === 'add_one_off_credits' ? (
                    <label>One-off job credits<input className="input" data-testid="tenant-360-one-off-credits" type="number" min="1" value={form.oneOffCredits} onChange={(event) => setForm((current) => ({ ...current, oneOffCredits: event.target.value }))} /></label>
                  ) : null}
                  {activeAction === 'add_recurring_extra' ? (
                    <label>Recurring extra allowance<input className="input" data-testid="tenant-360-recurring-extra" type="number" min="0" value={form.recurringExtraAllowance} onChange={(event) => setForm((current) => ({ ...current, recurringExtraAllowance: event.target.value }))} /></label>
                  ) : null}
                  {activeAction === 'grant_job_pack' ? (
                    <label>Job-pack credits<input className="input" data-testid="tenant-360-job-pack-grant" type="number" min="1" value={form.jobPackCreditCount} onChange={(event) => setForm((current) => ({ ...current, jobPackCreditCount: event.target.value }))} /></label>
                  ) : null}
                  {activeAction === 'add_billing_note' ? (
                    <label>Billing note<textarea className="input" data-testid="tenant-360-billing-note" value={form.billingNote} onChange={(event) => setForm((current) => ({ ...current, billingNote: event.target.value }))} /></label>
                  ) : null}
                  <label>Effective date<input className="input" data-testid="tenant-360-effective-date" type="date" value={form.effectiveDate} onChange={(event) => setForm((current) => ({ ...current, effectiveDate: event.target.value }))} /></label>
                  {['add_one_off_credits', 'grant_job_pack'].includes(activeAction) ? (
                    <label>Optional expiry date<input className="input" data-testid="tenant-360-expiry-date" type="date" value={form.expiryDate} onChange={(event) => setForm((current) => ({ ...current, expiryDate: event.target.value }))} /></label>
                  ) : null}
                  <label>Reason<input className="input" data-testid="tenant-360-commercial-reason" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Required internal reason" /></label>
                </div>
                <div className="alert info" data-testid="tenant-360-impact-summary">
                  Proposed action: {activeMeta.label}. This changes only the selected workspace commercial state and records before/after audit evidence. It does not mutate Stripe products or prices.
                </div>
                <label className="check-row">
                  <input data-testid="tenant-360-commercial-confirm" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                  Confirm this platform-only commercial change for {data.account.name}.
                </label>
                <button className="button" type="button" data-testid="tenant-360-commercial-save" disabled={busy || !confirmed || form.reason.trim().length < 8} onClick={() => void submitAction()}>
                  {busy ? 'Saving...' : `Save ${activeMeta.label}`}
                </button>
              </div>
            </section>

            <section className="platform-admin-section card" data-testid="tenant-360-commercial-history">
              <div className="platform-admin-section-copy"><h2>Commercial history</h2><p>Commercial, trial, pricing, allowance, job-pack, pause, resume, and billing-note changes for this workspace.</p></div>
              <div className="platform-admin-list">
                {(data.commercial?.auditHistory || []).map((event: any) => (
                  <p key={event.id}><strong>{event.type}</strong> - {formatDate(event.createdAt)}<br />{event.message}</p>
                ))}
                {!data.commercial?.auditHistory?.length ? <p className="muted">No commercial audit events recorded yet.</p> : null}
              </div>
            </section>

            <section id="owner-recovery" className="platform-admin-section card" data-testid="tenant-360-owner-recovery">
              <div className="platform-admin-section-copy">
                <div className="platform-admin-section-copy__eyebrow">Access recovery</div>
                <h2>Tenant owner password recovery</h2>
                <p>Last-resort owner recovery is platform-admin only, reason-gated, confirmation-gated, and audited. Tokens, passwords, and hashes are never shown here.</p>
              </div>
              <div className="platform-admin-metric-grid">
                <Metric label="System email" value={recovery?.email?.canSend ? 'Ready' : 'Needs attention'} detail={recovery?.email?.guidance || 'Email readiness unknown'} testId="tenant-360-recovery-email-readiness" />
                <Metric label="Owners" value={String(recovery?.owners?.length || 0)} detail="Tenant OWNER users only" />
                <Metric label="Secrets returned" value={recovery?.secretsReturned === false ? 'No' : 'Unknown'} />
              </div>
              <div className="form-grid">
                <label>
                  Owner
                  <select className="input" data-testid="tenant-360-recovery-owner" value={recoveryForm.targetUserId} onChange={(event) => setRecoveryForm((current) => ({ ...current, targetUserId: event.target.value }))}>
                    {(recovery?.owners || []).map((owner: any) => (
                      <option key={owner.id} value={owner.id}>{owner.email} - {owner.active ? 'active' : 'inactive'} - {owner.emailVerified ? 'verified' : 'unverified'}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Reason
                  <input className="input" data-testid="tenant-360-recovery-reason" value={recoveryForm.reason} onChange={(event) => setRecoveryForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Customer owner requested access recovery" />
                </label>
                <label className="check-row">
                  <input data-testid="tenant-360-recovery-confirm" type="checkbox" checked={recoveryForm.confirmation} onChange={(event) => setRecoveryForm((current) => ({ ...current, confirmation: event.target.checked }))} />
                  Confirm this recovery request for the selected tenant owner.
                </label>
              </div>
              <div className="button-row">
                <button
                  className="button"
                  type="button"
                  data-testid="tenant-360-recovery-send-email"
                  disabled={recoveryBusy || !recoveryForm.confirmation || recoveryForm.reason.trim().length < 12 || !recoveryForm.targetUserId}
                  onClick={() => void submitOwnerRecovery('send_reset_email')}
                >
                  {recoveryBusy ? 'Requesting...' : 'Send reset email'}
                </button>
              </div>
              <div className="card platform-admin-card-stack" data-testid="tenant-360-recovery-last-resort">
                <div className="platform-admin-card-stack__header">
                  <div>
                    <strong>Last-resort server reset</strong>
                    <p className="muted">Use only when system email is unavailable and the production operation has been explicitly approved. The temporary password is never displayed after submission.</p>
                  </div>
                  <span className="platform-admin-chip">Audited</span>
                </div>
                <div className="form-grid">
                  <label>
                    Production confirmation phrase
                    <input className="input" data-testid="tenant-360-recovery-production-confirmation" value={recoveryForm.productionOperationConfirmation} onChange={(event) => setRecoveryForm((current) => ({ ...current, productionOperationConfirmation: event.target.value }))} placeholder="CONFIRM_PRODUCTION_TENANT_OWNER_RECOVERY" />
                  </label>
                  <label>
                    Temporary password
                    <input className="input" data-testid="tenant-360-recovery-new-password" type="password" value={recoveryForm.newPassword} onChange={(event) => setRecoveryForm((current) => ({ ...current, newPassword: event.target.value }))} autoComplete="new-password" />
                  </label>
                </div>
                <button
                  className="button secondary"
                  type="button"
                  data-testid="tenant-360-recovery-server-reset"
                  disabled={recoveryBusy || !recoveryForm.confirmation || recoveryForm.reason.trim().length < 12 || recoveryForm.productionOperationConfirmation !== 'CONFIRM_PRODUCTION_TENANT_OWNER_RECOVERY' || recoveryForm.newPassword.length < 10}
                  onClick={() => void submitOwnerRecovery('server_reset_password')}
                >
                  {recoveryBusy ? 'Resetting...' : 'Run audited server reset'}
                </button>
              </div>
              {recoveryMessage ? <div className="alert success" role="status" data-testid="tenant-360-recovery-result">{recoveryMessage}</div> : null}
              <div className="platform-admin-list" data-testid="tenant-360-recovery-audit">
                {(recovery?.recentRequests || []).map((event: any) => (
                  <p key={event.id}><strong>{event.type}</strong> - {formatDate(event.createdAt)}<br />{event.message}</p>
                ))}
                {!recovery?.recentRequests?.length ? <p className="muted">No recent owner recovery requests for this tenant.</p> : null}
              </div>
            </section>

            <section className="platform-admin-section card" data-testid="tenant-360-health">
              <div className="platform-admin-section-copy"><h2>Workspace health</h2><p>Platform-only score based on persisted setup, adoption, readiness, and failure signals.</p></div>
              <div className="platform-admin-metric-grid">
                <Metric label="Health score" value={`${data.health.score}/100`} detail={data.health.status} />
                <Metric label="Setup completeness" value={`${data.health.setupCompleteness}%`} />
                <Metric label="Active users" value={String(data.health.activity.activeUsers)} />
                <Metric label="Bookings" value={String(data.health.activity.bookingsCreated)} detail={`${data.health.activity.bookingsCreatedLast30Days} in 30 days`} />
                <Metric label="Jobs completed" value={String(data.health.activity.jobsCompleted)} detail={`${data.health.activity.jobsCompletedLast30Days} in 30 days`} />
                <Metric label="Payments recorded" value={String(data.health.activity.paymentsRecorded)} />
              </div>
            </section>

            <section className="platform-admin-section card" data-testid="tenant-360-risk">
              <div className="platform-admin-section-copy"><h2>Risk and next action</h2><p>{data.recommendedNextAction}</p></div>
              <div className="platform-admin-card-grid">
                {(data.risks || []).map((risk: any) => (
                  <article className="card platform-admin-card-stack" key={risk.key}>
                    <strong>{risk.label}</strong>
                    <span className="muted">{risk.severity}</span>
                    <p>{risk.action}</p>
                  </article>
                ))}
                {!data.risks?.length ? <p className="muted">No active SaaS risk signal.</p> : null}
              </div>
            </section>

            <section id="audit" className="platform-admin-section card" data-testid="tenant-360-timeline">
              <div className="platform-admin-section-copy"><h2>Audit events</h2><p>Secret values remain redacted; commercial events retain actor, reason, timestamp, and before/after evidence.</p></div>
              <div className="platform-admin-list">
                {(data.timeline || []).slice(0, 50).map((event: any, index: number) => (
                  <p key={`${event.type}-${event.at}-${index}`}><strong>{event.type}</strong> - {formatDate(event.at)}<br />{event.label}</p>
                ))}
              </div>
              {latestAudit ? <p className="muted">Latest audit reference: {latestAudit.id || latestAudit.auditEventId}</p> : null}
            </section>
          </>
        ) : null}
      </div>
    </PlatformShell>
  );
}
