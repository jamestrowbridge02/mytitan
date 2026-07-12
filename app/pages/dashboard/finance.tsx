import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DashboardShell } from '../../components/dashboard-shell';
import { OperatorSavedViews, OperatorStatusBadge } from '../../components/ui/operator-page';
import { OperatorNotice } from '../../components/feedback/OperatorNotice';
import { useOperatorNotice } from '../../components/feedback/useOperatorNotice';
import { apiFetch } from '../../lib/api';
import { useTenantSettings } from '../../lib/tenant-settings';

type FinanceReport = {
  settings: {
    currency: string;
    vatConfigured: boolean;
    vatRateBps: number;
    vatNumber?: string | null;
    invoiceNumberPrefix?: string | null;
    paymentTermsDays?: number;
  };
  summary: {
    moneyOwedCount: number;
    overdueCount: number;
    paidCount: number;
    dueSoonCount?: number;
    manualReviewCount?: number;
    paymentRequestsSent?: number;
    paymentAttentionCount?: number;
    totalsByCurrency: Array<{
      currency: string;
      invoicedCents: number;
      paidCents: number;
      unpaidCents: number;
      overdueCents: number;
      taxCents: number;
      grossCents: number;
    }>;
    agingBuckets: Array<{ label: string; amountCents: number; count: number }>;
    moneyPendingInByCurrency: Array<{ currency: string; amountCents: number }>;
    bookingDepositsByCurrency: Array<{ currency: string; paidCents: number; refundedCents: number; pendingRefundCents: number }>;
    moneyPendingOut: {
      authoritative: boolean;
      amountByCurrency: Array<{ currency: string; amountCents: number }>;
      note?: string | null;
    };
  };
  taxSummary: {
    enabled: boolean;
    configured: boolean;
    guidance: string;
    totalsByCurrency: Array<{
      currency: string;
      netAmountCents: number;
      taxAmountCents: number;
      grossAmountCents: number;
    }>;
  };
  customerBalances: Array<{
    customerId?: string | null;
    customerName: string;
    currency: string;
    unpaidCents: number;
    overdueCents: number;
    invoiceCount: number;
    overdueCount: number;
  }>;
  paymentRequests?: Array<{
    id: string;
    sourceType: string;
    jobId?: string | null;
    bookingId?: string | null;
    statementId?: string | null;
    customerId?: string | null;
    customerName: string;
    relatedRecord: string;
    amountCents: number;
    currency: string;
    provider: string;
    status: string;
    sentAt?: string | null;
    viewedAt?: string | null;
    dueAt?: string | null;
    paidAt?: string | null;
    expiresAt?: string | null;
    lastActivity?: string | null;
    actionUrl?: string | null;
    publicUrlAvailable?: boolean;
    reviewNeeded?: boolean;
  }>;
  invoices: Array<{
    id: string;
    jobId: string;
    jobRef: string;
    customerId?: string | null;
    customerName: string;
    invoiceNumber: string;
    invoiceDate?: string | null;
    dueAt?: string | null;
    paidAt?: string | null;
    status: string;
    nextAction: string;
    agingBucket: string;
    daysOverdue: number;
    netAmountCents: number;
    taxAmountCents: number;
    grossAmountCents: number;
    unpaidAmountCents: number;
    currency: string;
    vatRateBps: number;
    vatCategory?: string | null;
    refundedAmountCents: number;
    pendingRefundAmountCents: number;
    adjustmentCreditCents: number;
    adjustmentDebitCents: number;
    paymentRequestStatus?: string | null;
    paymentMethod?: string | null;
    amountReceivedCents?: number | null;
    evidenceAttached?: boolean;
    reconciliationReviewNeeded?: boolean;
  }>;
  reconciliationQueue?: Array<{
    id: string;
    paymentRequestId?: string | null;
    jobId: string;
    jobRef: string;
    customerName: string;
    status: string;
    reason: string;
    amountCents: number;
    unpaidAmountCents: number;
    amountReceivedCents?: number | null;
    currency: string;
    dueAt?: string | null;
    paidAt?: string | null;
    method?: string | null;
    referenceMissing?: boolean;
    evidenceAttached?: boolean;
    reviewedAt?: string | null;
    actionUrl: string;
  }>;
  bookingDeposits: Array<{
    id: string;
    bookingId: string;
    customerName: string;
    serviceName: string;
    startsAt?: string | null;
    currency: string;
    depositDueCents: number;
    depositPaidCents: number;
    refundedAmountCents: number;
    pendingRefundAmountCents: number;
    depositStatus?: string | null;
    depositStatusLabel?: string | null;
    depositRefundStatus?: string | null;
    depositRefundStatusLabel?: string | null;
  }>;
};

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'GBP' }).format((cents || 0) / 100);
}

function formatDate(value?: string | null) {
  if (!value) return 'Not set';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not set';
  return parsed.toLocaleDateString();
}

function toCsvValue(value: unknown) {
  const raw = String(value ?? '');
  return `"${raw.replaceAll('"', '""')}"`;
}

function toMoneyInput(cents: number) {
  return ((cents || 0) / 100).toFixed(2);
}

function moneyInputToCents(value: string) {
  const normalized = String(value || '0').replace(/[^\d.-]/g, '');
  return Math.round(Number(normalized || 0) * 100);
}

export default function FinancePage() {
  const { settings } = useTenantSettings();
  const { notice, showError, showSuccess, clearNotice } = useOperatorNotice();
  const [data, setData] = useState<FinanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid' | 'partial' | 'overdue'>('all');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentDirection, setAdjustmentDirection] = useState<'credit' | 'debit'>('credit');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [statements, setStatements] = useState<any[]>([]);
  const [statementCustomerId, setStatementCustomerId] = useState('');
  const [statementFrom, setStatementFrom] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [statementTo, setStatementTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentSource, setPaymentSource] = useState<'invoice' | 'customer' | 'statement' | 'standalone'>('invoice');
  const [paymentJobId, setPaymentJobId] = useState('');
  const [paymentCustomerId, setPaymentCustomerId] = useState('');
  const [paymentStatementId, setPaymentStatementId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDescription, setPaymentDescription] = useState('');
  const [paymentRecipient, setPaymentRecipient] = useState('');
  const [paymentProvider, setPaymentProvider] = useState<'manual' | 'stripe-connect'>('manual');
  const [paymentDelivery, setPaymentDelivery] = useState<'email' | 'copy_link'>('email');
  const [activeTab, setActiveTab] = useState<'overview' | 'invoices' | 'payment-requests' | 'statements' | 'reconciliation'>('overview');
  const [paymentRequestOpen, setPaymentRequestOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (from) query.set('from', from);
      if (to) query.set('to', to);
      const [report, statementRows] = await Promise.all([
        apiFetch(`/billing/finance-report${query.toString() ? `?${query.toString()}` : ''}`),
        apiFetch('/billing/statements'),
      ]);
      setData(report as FinanceReport);
      setStatements(Array.isArray(statementRows) ? statementRows : []);
    } catch (err: any) {
      showError(err?.message || 'Failed to load finance report');
    } finally {
      setLoading(false);
    }
  }

  async function sendInvoice(jobId: string) {
    clearNotice();
    setActionBusy(true);
    try {
      const result = await apiFetch(`/billing/jobs/${jobId}/send-invoice`, { method: 'POST' });
      showSuccess(result?.delivered ? 'Invoice sent' : result?.reason || 'Invoice send was not completed');
      await load();
    } catch (err: any) {
      showError(err?.message || 'Invoice could not be sent');
    } finally {
      setActionBusy(false);
    }
  }

  async function updateInvoiceTerms(jobId: string) {
    const raw = window.prompt('Payment terms in days', String(data?.settings.paymentTermsDays || 7));
    if (raw == null) return;
    const paymentTermsDays = Number(raw);
    if (!Number.isInteger(paymentTermsDays) || paymentTermsDays < 0 || paymentTermsDays > 365) {
      showError('Enter payment terms between 0 and 365 days.');
      return;
    }
    setActionBusy(true);
    try {
      await apiFetch(`/billing/jobs/${jobId}/payment-terms`, {
        method: 'PATCH',
        body: JSON.stringify({ paymentTermsDays }),
      });
      showSuccess('Invoice terms and due date updated');
      await load();
    } catch (err: any) {
      showError(err?.message || 'Invoice terms could not be updated');
    } finally {
      setActionBusy(false);
    }
  }

  async function generateStatement() {
    if (!statementCustomerId) {
      showError('Choose a customer for the statement.');
      return;
    }
    setActionBusy(true);
    try {
      const statement = await apiFetch('/billing/statements', {
        method: 'POST',
        body: JSON.stringify({ customerId: statementCustomerId, from: statementFrom, to: statementTo }),
      });
      showSuccess(`Statement ${statement.reference} generated`);
      await load();
    } catch (err: any) {
      showError(err?.message || 'Statement could not be generated');
    } finally {
      setActionBusy(false);
    }
  }

  async function sendStatement(statementId: string) {
    setActionBusy(true);
    try {
      const result = await apiFetch(`/billing/statements/${statementId}/send`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      showSuccess(result?.delivered ? 'Statement sent' : result?.reason || 'Statement send was not completed');
      await load();
    } catch (err: any) {
      showError(err?.message || 'Statement could not be sent');
    } finally {
      setActionBusy(false);
    }
  }

  async function createPaymentRequest() {
    clearNotice();
    const selectedInvoice = data?.invoices.find((invoice) => invoice.jobId === paymentJobId);
    const selectedCustomer = data?.customerBalances.find((customer) => customer.customerId === paymentCustomerId);
    const selectedStatement = statements.find((statement) => statement.id === paymentStatementId);
    const amountCents = paymentAmount
      ? moneyInputToCents(paymentAmount)
      : Number(selectedInvoice?.unpaidAmountCents || selectedStatement?.openBalanceCents || selectedCustomer?.unpaidCents || 0);
    if (!amountCents || amountCents <= 0) {
      showError('Enter an amount above £0.00.');
      return;
    }
    if (paymentDelivery === 'email' && !paymentRecipient) {
      showError('Add a recipient email or choose copy link.');
      return;
    }
    const ok = window.confirm(`Create payment request for ${formatMoney(amountCents, selectedInvoice?.currency || selectedStatement?.currency || selectedCustomer?.currency || data?.settings.currency || 'GBP')}?`);
    if (!ok) return;
    setActionBusy(true);
    try {
      const result = await apiFetch('/billing/payment-requests', {
        method: 'POST',
        body: JSON.stringify({
          sourceType: paymentSource,
          jobId: paymentSource === 'invoice' ? paymentJobId : undefined,
          customerId: paymentSource === 'customer' ? paymentCustomerId : selectedInvoice?.customerId || selectedStatement?.customerId || undefined,
          statementId: paymentSource === 'statement' ? paymentStatementId : undefined,
          amountCents,
          currency: selectedInvoice?.currency || selectedStatement?.currency || selectedCustomer?.currency || data?.settings.currency || 'GBP',
          description: paymentDescription || selectedInvoice?.invoiceNumber || selectedStatement?.reference || 'Customer payment request',
          reference: selectedInvoice?.invoiceNumber || selectedStatement?.reference || undefined,
          recipientEmail: paymentRecipient || undefined,
          provider: paymentProvider,
          deliveryChannel: paymentDelivery,
          send: paymentDelivery === 'email',
        }),
      });
      if (paymentDelivery === 'copy_link' && result?.publicUrl && typeof navigator !== 'undefined') {
        await navigator.clipboard?.writeText(result.publicUrl).catch(() => undefined);
      }
      showSuccess(paymentDelivery === 'copy_link' ? 'Payment request created and secure link copied when supported.' : 'Payment request created and email delivery attempted.');
      setPaymentAmount('');
      setPaymentDescription('');
      setPaymentRecipient('');
      setPaymentRequestOpen(false);
      await load();
    } catch (err: any) {
      showError(err?.message || 'Payment request could not be created.');
    } finally {
      setActionBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const stats = useMemo(() => {
    if (!data) return [];
    const primaryCurrency = data.summary.totalsByCurrency[0]?.currency || settings?.defaultCurrency || 'GBP';
    const primaryMoneyOwed = data.summary.totalsByCurrency[0]?.unpaidCents || 0;
    const primaryOverdue = data.summary.totalsByCurrency[0]?.overdueCents || 0;
    return [
      { id: 'outstanding', label: 'Outstanding', value: formatMoney(primaryMoneyOwed, primaryCurrency), hint: `${data.summary.moneyOwedCount} open invoices` },
      { label: 'Overdue', value: formatMoney(primaryOverdue, primaryCurrency), hint: `${data.summary.overdueCount} overdue invoices` },
      { label: 'Collected', value: String(data.summary.paidCount), hint: 'Invoices marked paid' },
      { label: 'Needs review', value: String(data.summary.manualReviewCount || 0), hint: 'Reconciliation items needing finance sign-off' },
    ];
  }, [data, settings?.defaultCurrency]);

  function exportCsv() {
    if (!data || typeof window === 'undefined') return;
    const filteredInvoices = data.invoices.filter((invoice) => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'paid') return invoice.status === 'paid';
      if (statusFilter === 'partial') return invoice.paymentRequestStatus === 'partial_manual';
      if (statusFilter === 'overdue') return invoice.status === 'overdue';
      if (statusFilter === 'unpaid') return invoice.unpaidAmountCents > 0;
      return true;
    });
    const rows = [
      ['Invoice', 'Job', 'Customer', 'Invoice date', 'Due date', 'Paid date', 'Status', 'Payment request', 'Payment method', 'Amount received', 'Evidence attached', 'Review needed', 'Next action', 'Net', 'Tax', 'Gross', 'Unpaid', 'Currency', 'VAT rate bps', 'VAT category'],
      ...filteredInvoices.map((invoice) => [
        invoice.invoiceNumber,
        invoice.jobRef,
        invoice.customerName,
        invoice.invoiceDate || '',
        invoice.dueAt || '',
        invoice.paidAt || '',
        invoice.status,
        invoice.paymentRequestStatus || '',
        invoice.paymentMethod || '',
        String(invoice.amountReceivedCents || ''),
        invoice.evidenceAttached ? 'yes' : 'no',
        invoice.reconciliationReviewNeeded ? 'yes' : 'no',
        invoice.nextAction,
        String(invoice.netAmountCents),
        String(invoice.taxAmountCents),
        String(invoice.grossAmountCents),
        String(invoice.unpaidAmountCents),
        invoice.currency,
        String(invoice.vatRateBps || 0),
        invoice.vatCategory || '',
      ]),
      [],
      ['Reconciliation item', 'Job', 'Customer', 'Status', 'Reason', 'Method', 'Reference missing', 'Evidence attached', 'Reviewed', 'Amount', 'Unpaid', 'Currency'],
      ...(data.reconciliationQueue || []).map((item) => [
        item.paymentRequestId || item.id,
        item.jobRef,
        item.customerName,
        item.status,
        item.reason,
        item.method || '',
        item.referenceMissing ? 'yes' : 'no',
        item.evidenceAttached ? 'yes' : 'no',
        item.reviewedAt ? 'yes' : 'no',
        String(item.amountCents || 0),
        String(item.unpaidAmountCents || 0),
        item.currency,
      ]),
    ];
    const csv = rows.map((row) => row.map(toCsvValue).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mytitan-finance-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showSuccess('Saved. Safe finance CSV exported.');
  }

  async function submitRefund() {
    if (!selectedJobId || !refundAmount) return;
    setActionBusy(true);
    try {
      await apiFetch('/billing/refund', {
        method: 'POST',
        body: JSON.stringify({
          jobId: selectedJobId,
          amountCents: moneyInputToCents(refundAmount),
          reason: refundReason,
          mode: 'manual_record',
        }),
      });
      setRefundAmount('');
      setRefundReason('');
      await load();
      showSuccess('Refund recorded');
    } catch (err: any) {
      showError(err?.message || 'Failed to record refund');
    } finally {
      setActionBusy(false);
    }
  }

  async function submitAdjustment() {
    if (!selectedJobId || !adjustmentAmount) return;
    setActionBusy(true);
    try {
      await apiFetch('/billing/adjustment', {
        method: 'POST',
        body: JSON.stringify({
          jobId: selectedJobId,
          amountCents: moneyInputToCents(adjustmentAmount),
          direction: adjustmentDirection,
          reason: adjustmentReason,
        }),
      });
      setAdjustmentAmount('');
      setAdjustmentReason('');
      await load();
      showSuccess('Adjustment saved');
    } catch (err: any) {
      showError(err?.message || 'Failed to record adjustment');
    } finally {
      setActionBusy(false);
    }
  }

  async function reviewPaymentRequest(jobId: string, paymentRequestId?: string | null) {
    if (!jobId || !paymentRequestId) return;
    setActionBusy(true);
    try {
      await apiFetch(`/billing/jobs/${jobId}/payment-request/${paymentRequestId}/review`, {
        method: 'POST',
        body: JSON.stringify({ note: 'Reviewed from finance reconciliation queue' }),
      });
      await load();
      showSuccess('Reconciliation item reviewed');
    } catch (err: any) {
      showError(err?.message || 'Failed to review reconciliation item');
    } finally {
      setActionBusy(false);
    }
  }

  async function bulkReviewVisible() {
    const targets = (data?.reconciliationQueue || []).filter((item) => item.paymentRequestId && !item.reviewedAt);
    if (!targets.length) return;
    setActionBusy(true);
    try {
      for (const item of targets.slice(0, 20)) {
        await apiFetch(`/billing/jobs/${item.jobId}/payment-request/${item.paymentRequestId}/review`, {
          method: 'POST',
          body: JSON.stringify({ note: 'Bulk reviewed from finance reconciliation queue' }),
        });
      }
      await load();
      showSuccess('Visible reconciliation items reviewed');
    } catch (err: any) {
      showError(err?.message || 'Failed to bulk review reconciliation items');
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <DashboardShell>
      <div className="operator-stack">
        <header className="premium-page-header" data-testid="finance-premium-header">
          <div>
            <h1>Finance</h1>
            <p>Invoices, payments and reconciliation</p>
          </div>
          <div className="premium-page-header__actions">
            <Link className="button secondary" href="/dashboard/jobs/new">Create invoice</Link>
            <button
              className="button"
              type="button"
              onClick={() => {
                setActiveTab('payment-requests');
                setPaymentRequestOpen(true);
              }}
            >
              Payment request
            </button>
            <button className="button secondary" type="button" onClick={exportCsv}>Export</button>
            <Link className="button ghost" href="/dashboard/settings?tab=general">Settings</Link>
          </div>
        </header>

        {stats.length ? (
          <section className="premium-metric-grid" aria-label="Finance overview">
            {stats.map((stat) => (
              <article className="premium-metric-card" key={stat.label}>
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
                {stat.hint ? <small>{stat.hint}</small> : null}
              </article>
            ))}
          </section>
        ) : null}

        <section className="card operator-section" aria-label="Finance views">
          <OperatorSavedViews
            views={[
              { id: 'overview', label: 'Overview' },
              { id: 'invoices', label: 'Invoices', count: data?.invoices.length || 0 },
              { id: 'payment-requests', label: 'Payment requests', count: data?.paymentRequests?.length || 0 },
              { id: 'statements', label: 'Statements', count: statements.length },
              { id: 'reconciliation', label: 'Reconciliation', count: data?.reconciliationQueue?.length || 0 },
            ]}
            activeView={activeTab}
            onChange={(view) => setActiveTab(view as typeof activeTab)}
          />
        </section>

        <OperatorNotice notice={notice} onDismiss={clearNotice} />

        {data && activeTab === 'payment-requests' && paymentRequestOpen ? (
          <section className="card operator-section" id="create-payment-request" data-testid="finance-create-payment-request">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Create payment request</h2>
              </div>
              <button className="button secondary" type="button" onClick={() => setPaymentRequestOpen(false)}>Close</button>
            </div>
            <div className="three-col">
              <label>
                <span>Source</span>
                <select className="input" value={paymentSource} onChange={(event) => setPaymentSource(event.target.value as typeof paymentSource)}>
                  <option value="invoice">Invoice/job</option>
                  <option value="customer">Customer balance</option>
                  <option value="statement">Statement</option>
                  <option value="standalone">Standalone</option>
                </select>
              </label>
              {paymentSource === 'invoice' ? (
                <label>
                  <span>Invoice</span>
                  <select className="input" value={paymentJobId} onChange={(event) => {
                    const invoice = data.invoices.find((row) => row.jobId === event.target.value);
                    setPaymentJobId(event.target.value);
                    setPaymentAmount(invoice?.unpaidAmountCents ? toMoneyInput(invoice.unpaidAmountCents) : '');
                    setPaymentRecipient('');
                  }}>
                    <option value="">Choose invoice</option>
                    {data.invoices.filter((invoice) => invoice.unpaidAmountCents > 0).map((invoice) => (
                      <option key={invoice.jobId} value={invoice.jobId}>{invoice.invoiceNumber} · {invoice.customerName} · {formatMoney(invoice.unpaidAmountCents, invoice.currency)}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              {paymentSource === 'customer' ? (
                <label>
                  <span>Customer</span>
                  <select className="input" value={paymentCustomerId} onChange={(event) => {
                    const customer = data.customerBalances.find((row) => row.customerId === event.target.value);
                    setPaymentCustomerId(event.target.value);
                    setPaymentAmount(customer?.unpaidCents ? toMoneyInput(customer.unpaidCents) : '');
                  }}>
                    <option value="">Choose customer</option>
                    {data.customerBalances.filter((row) => row.customerId).map((row) => (
                      <option key={row.customerId} value={row.customerId || ''}>{row.customerName} · {formatMoney(row.unpaidCents, row.currency)}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              {paymentSource === 'statement' ? (
                <label>
                  <span>Statement</span>
                  <select className="input" value={paymentStatementId} onChange={(event) => {
                    const statement = statements.find((row) => row.id === event.target.value);
                    setPaymentStatementId(event.target.value);
                    setPaymentAmount(statement?.openBalanceCents ? toMoneyInput(statement.openBalanceCents) : '');
                  }}>
                    <option value="">Choose statement</option>
                    {statements.map((statement) => (
                      <option key={statement.id} value={statement.id}>{statement.reference} · {formatMoney(statement.openBalanceCents, statement.currency)}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label>
                <span>Amount</span>
                <input className="input" inputMode="decimal" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
              </label>
              <label>
                <span>Provider</span>
                <select className="input" value={paymentProvider} onChange={(event) => setPaymentProvider(event.target.value as typeof paymentProvider)}>
                  <option value="manual">Bank transfer / manual collection</option>
                  <option value="stripe-connect">Business Stripe setup</option>
                </select>
              </label>
              <label>
                <span>Delivery</span>
                <select className="input" value={paymentDelivery} onChange={(event) => setPaymentDelivery(event.target.value as typeof paymentDelivery)}>
                  <option value="email">Email through MyTitan delivery</option>
                  <option value="copy_link">Copy secure link</option>
                </select>
              </label>
              <label>
                <span>Recipient email</span>
                <input className="input" type="email" value={paymentRecipient} onChange={(event) => setPaymentRecipient(event.target.value)} placeholder="customer@example.com" />
              </label>
              <label>
                <span>Description</span>
                <input className="input" type="text" value={paymentDescription} onChange={(event) => setPaymentDescription(event.target.value)} placeholder="Invoice balance, deposit, or agreed payment" />
              </label>
            </div>
            <button className="button" type="button" disabled={actionBusy} onClick={() => void createPaymentRequest()}>
              {actionBusy ? 'Creating...' : 'Create payment request'}
            </button>
          </section>
        ) : null}

        <section className="card operator-section" id="finance-filters">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Filters</h2>
            </div>
          </div>
          <div className="two-col">
            <label>
              <span>From</span>
              <input className="input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label>
              <span>To</span>
              <input className="input" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
            <label>
              <span>Export status filter</span>
              <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                <option value="all">All invoices</option>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partial manual</option>
                <option value="overdue">Overdue</option>
              </select>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
            <button className="button" type="button" onClick={() => void load()} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh report'}
            </button>
            <Link className="button secondary" href="/dashboard/billing/readiness">Billing readiness</Link>
          </div>
        </section>

        {activeTab === 'overview' ? <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Finance summary</h2>
            </div>
          </div>
          {loading && !data ? <p className="muted">Loading finance report...</p> : null}
          {data ? (
            <div className="booking-summary-grid">
              <article className="booking-lifecycle-card">
                <strong>Money owed to you</strong>
                {data.summary.moneyPendingInByCurrency.map((row) => (
                  <p key={row.currency}>{formatMoney(row.amountCents, row.currency)}</p>
                ))}
              </article>
              <article className="booking-lifecycle-card">
                <strong>Overdue</strong>
                {data.summary.agingBuckets.map((bucket) => (
                  <p key={bucket.label}>{bucket.label}: {formatMoney(bucket.amountCents, data.settings.currency)} ({bucket.count})</p>
                ))}
              </article>
              <article className="booking-lifecycle-card">
                <strong>Tax / VAT records</strong>
                <p>{data.taxSummary.configured ? `VAT ${data.settings.vatNumber || 'configured'}` : 'VAT setup needed'}</p>
                <p>Invoice prefix: {data.settings.invoiceNumberPrefix || 'None'}</p>
              </article>
              <article className="booking-lifecycle-card">
                <strong>Booking deposits</strong>
                {data.summary.bookingDepositsByCurrency.length ? data.summary.bookingDepositsByCurrency.map((row) => (
                  <p key={row.currency}>
                    {row.currency}: paid {formatMoney(row.paidCents, row.currency)}
                    {row.refundedCents > 0 ? ` · refunded ${formatMoney(row.refundedCents, row.currency)}` : ''}
                    {row.pendingRefundCents > 0 ? ` · pending refund ${formatMoney(row.pendingRefundCents, row.currency)}` : ''}
                  </p>
                )) : <p>No deposit records yet.</p>}
              </article>
              <article className="booking-lifecycle-card">
                <strong>Reconciliation</strong>
                <p>{data.summary.manualReviewCount || 0} manual items need review</p>
                <p>{data.summary.paymentRequestsSent || 0} payment requests sent</p>
                <p>{data.summary.paymentAttentionCount || 0} provider/manual attention items</p>
              </article>
            </div>
          ) : null}
        </section> : null}

        {data && activeTab === 'payment-requests' ? (
          <section className="card operator-section" id="payment-requests" data-testid="finance-payment-request-section">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Payment requests</h2>
              </div>
              <button className="button secondary" type="button" onClick={() => setPaymentRequestOpen(true)}>Create payment request</button>
            </div>
            <div className="operator-table" data-testid="finance-payment-requests">
              {(data.paymentRequests || []).slice(0, 20).map((request) => (
                <div key={request.id} className="operator-table__row">
                  <div className="operator-table__cell">
                    <strong>{request.customerName}</strong>
                    <div className="operator-cellSubtle">{request.relatedRecord} · {request.sourceType.toLowerCase().replaceAll('_', ' ')}</div>
                  </div>
                  <div className="operator-table__cell">
                    <strong>{formatMoney(request.amountCents, request.currency)}</strong>
                    <div className="operator-cellSubtle">{request.provider}</div>
                  </div>
                  <div className="operator-table__cell">
                    <OperatorStatusBadge label={request.status.replaceAll('_', ' ')} tone={request.status === 'paid' ? 'success' : request.status === 'failed' || request.status === 'expired' || request.status === 'cancelled' ? 'critical' : request.reviewNeeded ? 'warning' : 'neutral'} />
                    <div className="operator-cellSubtle">Sent {formatDate(request.sentAt)} · Due {formatDate(request.dueAt)}</div>
                  </div>
                  <div className="operator-table__cell">
                    <div>Last activity {formatDate(request.lastActivity)}</div>
                    {request.viewedAt ? <div className="operator-cellSubtle">Viewed {formatDate(request.viewedAt)}</div> : null}
                  </div>
                  <div className="operator-table__cell" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {request.actionUrl ? <Link href={request.actionUrl}>Open</Link> : null}
                    {request.actionUrl ? (
                      <button className="button secondary" type="button" onClick={() => navigator.clipboard?.writeText(request.actionUrl || '').then(() => showSuccess('Payment link copied')).catch(() => showError('Copy is unavailable in this browser'))}>
                        Copy link
                      </button>
                    ) : null}
                    {request.jobId && request.reviewNeeded ? (
                      <button className="button secondary" type="button" disabled={actionBusy} onClick={() => void reviewPaymentRequest(request.jobId || '', request.id)}>
                        Mark reviewed
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
              {!(data.paymentRequests || []).length ? <div className="premium-empty-state"><h3>No payment requests yet</h3><button className="button" type="button" onClick={() => setPaymentRequestOpen(true)}>Create payment request</button></div> : null}
            </div>
          </section>
        ) : null}

        {data && activeTab === 'reconciliation' ? (
          <section className="card operator-section" id="reconciliation" data-testid="finance-reconciliation-queue">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Reconciliation queue</h2>
              </div>
              <button className="button secondary" type="button" disabled={actionBusy || !(data.reconciliationQueue || []).some((item) => item.paymentRequestId && !item.reviewedAt)} onClick={() => void bulkReviewVisible()}>
                Mark visible reviewed
              </button>
            </div>
            <div className="operator-table">
              {(data.reconciliationQueue || []).slice(0, 20).map((item) => (
                <div key={`${item.id}-${item.status}`} className="operator-table__row">
                  <div className="operator-table__cell">
                    <strong>{item.jobRef}</strong>
                    <div className="operator-cellSubtle">{item.customerName} · {item.reason}</div>
                    <div className="operator-cellSubtle">
                      {item.method ? `Method: ${item.method.replaceAll('_', ' ')}` : 'Method not set'}
                      {item.evidenceAttached ? ' · evidence attached' : ''}
                      {item.referenceMissing ? ' · missing reference' : ''}
                    </div>
                  </div>
                  <div className="operator-table__cell">
                    <OperatorStatusBadge label={item.reviewedAt ? 'Reviewed' : item.status.replaceAll('_', ' ')} tone={item.reviewedAt ? 'success' : item.status === 'overdue' ? 'critical' : 'warning'} />
                  </div>
                  <div className="operator-table__cell">
                    <strong>{formatMoney(item.unpaidAmountCents || item.amountCents, item.currency)}</strong>
                    {item.amountReceivedCents ? <div className="operator-cellSubtle">Received {formatMoney(item.amountReceivedCents, item.currency)}</div> : null}
                  </div>
                  <div className="operator-table__cell" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Link href={item.actionUrl}>Open job</Link>
                    {item.paymentRequestId && !item.reviewedAt ? (
                      <button className="button secondary" type="button" disabled={actionBusy} onClick={() => void reviewPaymentRequest(item.jobId, item.paymentRequestId)}>
                        Mark reviewed
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
              {!(data.reconciliationQueue || []).length ? <p className="muted">No reconciliation items need attention right now.</p> : null}
            </div>
          </section>
        ) : null}

        {data && activeTab === 'invoices' ? <section className="card operator-section" id="refunds">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Refunds and adjustments</h2>
            </div>
          </div>
          <div className="two-col">
            <label>
              <span>Job</span>
              <select className="input" value={selectedJobId} onChange={(event) => setSelectedJobId(event.target.value)}>
                <option value="">Choose a billed job</option>
                {(data?.invoices || []).map((invoice) => (
                  <option key={invoice.jobId} value={invoice.jobId}>
                    {invoice.invoiceNumber} · {invoice.customerName}
                  </option>
                ))}
              </select>
            </label>
            <div className="booking-summary-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <article className="booking-lifecycle-card">
                <strong>Manual refund</strong>
                <input className="input" inputMode="decimal" placeholder="Amount" value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} />
                <input className="input" type="text" placeholder="Reason" value={refundReason} onChange={(event) => setRefundReason(event.target.value)} />
                <button className="button" type="button" disabled={actionBusy || !selectedJobId || !refundAmount} onClick={() => void submitRefund()}>
                  {actionBusy ? 'Saving...' : 'Record refund'}
                </button>
              </article>
              <article className="booking-lifecycle-card">
                <strong>Balance adjustment</strong>
                <select className="input" value={adjustmentDirection} onChange={(event) => setAdjustmentDirection(event.target.value as 'credit' | 'debit')}>
                  <option value="credit">Credit</option>
                  <option value="debit">Debit</option>
                </select>
                <input className="input" inputMode="decimal" placeholder="Amount" value={adjustmentAmount} onChange={(event) => setAdjustmentAmount(event.target.value)} />
                <input className="input" type="text" placeholder="Reason" value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} />
                <button className="button secondary" type="button" disabled={actionBusy || !selectedJobId || !adjustmentAmount} onClick={() => void submitAdjustment()}>
                  {actionBusy ? 'Saving...' : 'Record adjustment'}
                </button>
              </article>
            </div>
          </div>
        </section> : null}

        {data ? (
          <>
            {activeTab === 'statements' ? <section className="card operator-section" id="statements" data-testid="finance-statements">
              <div className="operator-section__header">
                <div>
                  <h2 className="operator-section__title">Account statements</h2>
                </div>
              </div>
              <div className="three-col">
                <label>
                  <span>Customer</span>
                  <select className="input" data-testid="statement-customer" value={statementCustomerId} onChange={(event) => setStatementCustomerId(event.target.value)}>
                    <option value="">Choose customer</option>
                    {data.customerBalances.filter((row) => row.customerId).map((row) => (
                      <option key={row.customerId} value={row.customerId || ''}>{row.customerName}</option>
                    ))}
                  </select>
                </label>
                <label><span>From</span><input className="input" type="date" value={statementFrom} onChange={(event) => setStatementFrom(event.target.value)} /></label>
                <label><span>To</span><input className="input" type="date" value={statementTo} onChange={(event) => setStatementTo(event.target.value)} /></label>
              </div>
              <button className="button" type="button" disabled={actionBusy || !statementCustomerId} onClick={() => void generateStatement()}>
                Generate statement
              </button>
              <div className="operator-table" style={{ marginTop: 12 }}>
                {statements.map((statement) => (
                  <div className="operator-table__row" key={statement.id}>
                    <div className="operator-table__cell"><strong>{statement.reference}</strong><div className="operator-cellSubtle">{statement.customer?.name || statement.tradeAccount?.name || 'Account'}</div></div>
                    <div className="operator-table__cell">{formatMoney(statement.openBalanceCents, statement.currency)} open</div>
                    <div className="operator-table__cell">{statement.invoiceCount} invoices · {statement.status}</div>
                    <div className="operator-table__cell">
                      <button className="button secondary" type="button" disabled={actionBusy} onClick={() => void sendStatement(statement.id)}>Send statement</button>
                    </div>
                  </div>
                ))}
                {!statements.length ? <p className="muted">No statements generated yet.</p> : null}
              </div>
            </section> : null}

            {activeTab === 'overview' ? <section className="card operator-section" id="invoice-records">
              <div className="operator-section__header">
                <div>
                  <h2 className="operator-section__title">Customer balances</h2>
                </div>
              </div>
              <div className="operator-table">
                {data.customerBalances.slice(0, 12).map((row) => (
                  <div key={`${row.customerId || row.customerName}-${row.currency}`} className="operator-table__row">
                    <div className="operator-table__cell">
                      <strong>{row.customerName}</strong>
                      <div className="operator-cellSubtle">{row.invoiceCount} open invoices · {row.overdueCount} overdue</div>
                    </div>
                    <div className="operator-table__cell">{formatMoney(row.unpaidCents, row.currency)}</div>
                    <div className="operator-table__cell">{formatMoney(row.overdueCents, row.currency)}</div>
                    <div className="operator-table__cell">
                      <Link href={row.customerId ? `/dashboard/customers/${row.customerId}` : '/dashboard/customers'}>
                        {row.customerId ? 'Open customer' : 'Open customers'}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section> : null}

            {activeTab === 'overview' ? <section className="card operator-section">
              <div className="operator-section__header">
                <div>
                  <h2 className="operator-section__title">Booking deposit records</h2>
                </div>
              </div>
              <div className="operator-table">
                {data.bookingDeposits.map((deposit) => (
                  <div key={deposit.id} className="operator-table__row">
                    <div className="operator-table__cell">
                      <strong>{deposit.serviceName}</strong>
                      <div className="operator-cellSubtle">{deposit.customerName} · {formatDate(deposit.startsAt)}</div>
                    </div>
                    <div className="operator-table__cell">
                      <div>Deposit {formatMoney(deposit.depositPaidCents || deposit.depositDueCents, deposit.currency)}</div>
                      <div className="operator-cellSubtle">
                        {deposit.refundedAmountCents > 0 ? `Refunded ${formatMoney(deposit.refundedAmountCents, deposit.currency)}` : 'No refund recorded'}
                        {deposit.pendingRefundAmountCents > 0 ? ` · Pending ${formatMoney(deposit.pendingRefundAmountCents, deposit.currency)}` : ''}
                      </div>
                    </div>
                    <div className="operator-table__cell">
                      <OperatorStatusBadge label={(deposit.depositRefundStatusLabel || deposit.depositStatusLabel || 'Not set').replaceAll('_', ' ')} tone={deposit.depositRefundStatus === 'refunded' ? 'success' : deposit.depositRefundStatus === 'failed' ? 'critical' : deposit.depositRefundStatus ? 'warning' : deposit.depositStatus === 'paid' ? 'success' : 'warning'} />
                    </div>
                    <div className="operator-table__cell">
                      <Link href={`/dashboard/bookings/${deposit.bookingId}`}>Open booking</Link>
                    </div>
                  </div>
                ))}
              </div>
            </section> : null}

            {activeTab === 'invoices' ? <section className="card operator-section">
              <div className="operator-section__header">
                <div>
                  <h2 className="operator-section__title">Invoice records</h2>
                </div>
              </div>
              <div className="operator-table">
                {data.invoices.map((invoice) => (
                  <div key={invoice.id} className="operator-table__row">
                    <div className="operator-table__cell">
                      <strong>{invoice.invoiceNumber}</strong>
                      <div className="operator-cellSubtle">{invoice.customerName} · {invoice.jobRef}</div>
                    </div>
                    <div className="operator-table__cell">
                      <div>{formatMoney(invoice.grossAmountCents, invoice.currency)}</div>
                      <div className="operator-cellSubtle">Net {formatMoney(invoice.netAmountCents, invoice.currency)} · Tax {formatMoney(invoice.taxAmountCents, invoice.currency)}</div>
                      {invoice.refundedAmountCents > 0 || invoice.pendingRefundAmountCents > 0 || invoice.adjustmentCreditCents > 0 || invoice.adjustmentDebitCents > 0 ? (
                        <div className="operator-cellSubtle">
                          {invoice.refundedAmountCents > 0 ? `Refunded ${formatMoney(invoice.refundedAmountCents, invoice.currency)}` : null}
                          {invoice.pendingRefundAmountCents > 0 ? ` · Pending refund ${formatMoney(invoice.pendingRefundAmountCents, invoice.currency)}` : null}
                          {invoice.adjustmentCreditCents > 0 ? ` · Credit ${formatMoney(invoice.adjustmentCreditCents, invoice.currency)}` : null}
                          {invoice.adjustmentDebitCents > 0 ? ` · Debit ${formatMoney(invoice.adjustmentDebitCents, invoice.currency)}` : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="operator-table__cell">
                      <OperatorStatusBadge label={invoice.status.replaceAll('_', ' ')} tone={invoice.status === 'paid' || invoice.status === 'refunded' ? 'success' : invoice.status === 'overdue' ? 'critical' : 'warning'} />
                      <div className="operator-cellSubtle">Issued {formatDate(invoice.invoiceDate)} · Due {formatDate(invoice.dueAt)}</div>
                    </div>
                    <div className="operator-table__cell">
                      <div>{invoice.nextAction}</div>
                      <div className="operator-cellSubtle">{invoice.daysOverdue > 0 ? `${invoice.daysOverdue} days overdue` : `Bucket ${invoice.agingBucket.replaceAll('_', '-')}`}</div>
                    </div>
                    <div className="operator-table__cell">
                      <button className="button secondary" type="button" onClick={() => setSelectedJobId(invoice.jobId)}>
                        Use here
                      </button>
                      <button className="button secondary" type="button" disabled={actionBusy || !invoice.invoiceDate} onClick={() => void sendInvoice(invoice.jobId)}>
                        Send invoice
                      </button>
                      <button className="button ghost" type="button" disabled={actionBusy || !invoice.invoiceDate} onClick={() => void updateInvoiceTerms(invoice.jobId)}>
                        Payment terms
                      </button>
                      <Link href={`/dashboard/jobs/${invoice.jobId}`}>Open job</Link>
                    </div>
                  </div>
                ))}
              </div>
            </section> : null}
          </>
        ) : null}
      </div>
    </DashboardShell>
  );
}
