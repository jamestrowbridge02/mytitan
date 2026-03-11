import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/router';
import { getApiBase } from '../../../lib/api';
import { isMarketplaceEnabled, isPortalPolishV1Enabled } from '../../../lib/feature-flags';

const API_BASE = getApiBase();
const FALLBACK_SUPPORT_EMAIL = 'support@mytitan.co.uk';

type PortalInfo = {
  enabled?: boolean;
  paymentsEnabled?: boolean;
  stripeConfigured?: boolean;
  featureFlag?: boolean;
  pdfDownloadAllowed?: boolean;
  supportEmail?: string | null;
  supportPhone?: string | null;
  brand?: {
    tenantName?: string | null;
    logoUrl?: string | null;
    primaryColor?: string | null;
  };
  summary?: {
    approvedAt?: string | null;
    approvedByName?: string | null;
    declinedAt?: string | null;
    signedAt?: string | null;
    signatureName?: string | null;
    invoiceIssuedAt?: string | null;
    invoiceDueAt?: string | null;
    invoicePaidAt?: string | null;
    totalCents?: number | null;
    currency?: string | null;
    paymentMethod?: string | null;
    paymentStatus?: string | null;
    paymentAvailable?: boolean | null;
    billingState?: string | null;
    nextCustomerStep?: string | null;
    invoiceOverdue?: boolean | null;
    receiptReady?: boolean | null;
    pdfReady?: boolean | null;
  };
  timeline?: Array<{ eventType?: string | null; message?: string | null; createdAt?: string | null }>;
  documents?: Array<{
    id: string;
    kind: string;
    label: string;
    createdAt?: string | null;
    downloadUrl?: string | null;
  }>;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatMoney = (cents?: number | null, currency?: string | null) => {
  if (typeof cents !== 'number' || !currency) return null;
  const upper = currency.toUpperCase();
  const symbol = upper === 'GBP' ? '£' : upper === 'EUR' ? '€' : upper === 'USD' ? '$' : `${upper} `;
  return `${symbol}${(cents / 100).toFixed(2)}`;
};

const formatPaymentMethod = (value?: string | null) => {
  if (!value) return null;
  const upper = value.toUpperCase();
  if (upper === 'CARD' || upper === 'STRIPE_LINK') return 'Card';
  if (upper === 'BANK_TRANSFER') return 'Bank transfer';
  if (upper === 'CASH') return 'Cash';
  return value;
};

function StepCard({
  title,
  description,
  done,
  enabled,
  summary,
  children,
}: {
  title: string;
  description: string;
  done: boolean;
  enabled: boolean;
  summary?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      className="card"
      style={{
        padding: 16,
        marginTop: 14,
        border: `1px solid ${done ? '#2f8f5b' : '#2a3042'}`,
        opacity: enabled ? 1 : 0.75,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 20 }}>{title}</h3>
        {done ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: 999,
              padding: '4px 10px',
              background: '#163e2a',
              color: '#7ff3b0',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Done
          </span>
        ) : null}
      </div>
      <p className="muted" style={{ marginBottom: done ? 0 : 12 }}>{description}</p>
      {done && summary ? <p className="muted" style={{ marginTop: 8 }}>{summary}</p> : null}
      {!done ? <div>{children}</div> : null}
    </section>
  );
}

function StatusChip({ label, value }: { label: string; value: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        borderRadius: 999,
        padding: '6px 10px',
        fontSize: 12,
        fontWeight: 700,
        background: value ? '#163e2a' : '#2a3042',
        color: value ? '#7ff3b0' : '#b8c3d8',
      }}
    >
      {label}: {value ? 'Yes' : 'No'}
    </span>
  );
}

export default function PublicJobPortal() {
  const router = useRouter();
  const { token, session_id } = router.query;
  const tokenValue = Array.isArray(token) ? token[0] : token;
  const sessionIdValue = Array.isArray(session_id) ? session_id[0] : session_id;
  const [job, setJob] = useState<any>(null);
  const [portal, setPortal] = useState<PortalInfo | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [signatureName, setSignatureName] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [paymentConfigured, setPaymentConfigured] = useState<boolean | null>(null);
  const [checkoutHint, setCheckoutHint] = useState('');
  const [pendingAction, setPendingAction] = useState<'' | 'approve' | 'decline' | 'sign' | 'pay' | 'refresh-payment'>('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const signatureHistoryRef = useRef<ImageData[]>([]);
  const marketplaceEnabled = isMarketplaceEnabled();
  const portalPolishV1Enabled = isPortalPolishV1Enabled();

  useEffect(() => {
    if (!tokenValue) return;
    fetch(`${API_BASE}/public/job/${tokenValue}`)
      .then((res) => res.json())
      .then((data) => {
        setJob({ ...data.job, assets: data.assets || [] });
        setPortal(data.portal || null);
      })
      .catch(() => setError('Failed to load job'));
  }, [tokenValue]);

  async function refreshPaymentStatus() {
    if (!tokenValue || !marketplaceEnabled) return;
    setError('');
    setStatus('');
    setPendingAction('refresh-payment');
    try {
      const suffix = sessionIdValue ? `?session_id=${sessionIdValue}` : '';
      const res = await fetch(`${API_BASE}/public/job/${tokenValue}/payment-status${suffix}`);
      const data = await res.json();
      if (!res.ok) {
        setPaymentStatus(null);
        setCheckoutHint('');
        setError(data?.message || 'Failed to refresh payment status');
        return;
      }
      setPaymentStatus(data?.status || 'unknown');
      setReceiptUrl(data?.receiptUrl || null);
      setPaymentConfigured(data?.configured !== false);
      if (data?.configured === false) {
        setCheckoutHint('Secure payment updates are unavailable in this environment. Contact support to confirm payment status.');
        setStatus('Payment status cannot be refreshed here.');
        return;
      }
      setCheckoutHint(data?.status === 'paid' ? 'Payment confirmed. A receipt will appear here when available.' : '');
      if (data?.status === 'paid') {
        setStatus('Payment status refreshed.');
      }
    } catch {
      setPaymentStatus('unknown');
      setCheckoutHint('');
      setError('Failed to refresh payment status');
    } finally {
      setPendingAction('');
    }
  }

  useEffect(() => {
    if (!tokenValue || !marketplaceEnabled) return;
    if (!portalPolishV1Enabled && !sessionIdValue) return;
    void refreshPaymentStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenValue, sessionIdValue, marketplaceEnabled, portalPolishV1Enabled]);

  const startDraw = (x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawingRef.current = true;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111';
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const continueDraw = (x: number, y: number) => {
    if (!drawingRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDraw = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        signatureHistoryRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      }
    }
    drawingRef.current = false;
  };

  const getCanvasPos = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    signatureHistoryRef.current = [];
  };

  const undoCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    signatureHistoryRef.current.pop();
    const previous = signatureHistoryRef.current[signatureHistoryRef.current.length - 1];
    if (!previous) {
      clearCanvas();
      return;
    }
    ctx.putImageData(previous, 0, 0);
  };

  async function approve() {
    setError('');
    setStatus('');
    setPendingAction('approve');
    try {
      const res = await fetch(`${API_BASE}/public/job/${tokenValue}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: signatureName || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || 'Approval failed');
      }
      setJob((prev: any) => ({ ...prev, approvedAt: new Date().toISOString(), declinedAt: null, declinedReason: null }));
      setStatus('Approved.');
    } catch (err: any) {
      setError(err?.message || 'Approval failed');
    } finally {
      setPendingAction('');
    }
  }

  async function decline() {
    setError('');
    setStatus('');
    setPendingAction('decline');
    try {
      const res = await fetch(`${API_BASE}/public/job/${tokenValue}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: signatureName || undefined, reason: declineReason || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || 'Decline failed');
      }
      setJob((prev: any) => ({ ...prev, declinedAt: new Date().toISOString(), approvedAt: null, declinedReason: declineReason || null }));
      setStatus('Declined.');
    } catch (err: any) {
      setError(err?.message || 'Decline failed');
    } finally {
      setPendingAction('');
    }
  }

  async function sign() {
    setError('');
    setStatus('');
    setPendingAction('sign');
    try {
      const dataUrl = canvasRef.current?.toDataURL('image/png');
      const res = await fetch(`${API_BASE}/public/job/${tokenValue}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: signatureName || undefined, signatureDataUrl: dataUrl }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || 'Signature failed');
      }
      setJob((prev: any) => ({ ...prev, signedAt: new Date().toISOString() }));
      setStatus('Signature saved.');
    } catch (err: any) {
      setError(err?.message || 'Signature failed');
    } finally {
      setPendingAction('');
    }
  }

  async function pay() {
    setError('');
    setStatus('');
    setCheckoutHint('');
    setPendingAction('pay');
    try {
      const res = await fetch(`${API_BASE}/public/job/${tokenValue}/checkout`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          res.status === 503 || res.status === 400
            ? 'Secure payment is unavailable for this job right now. Please contact support to complete payment.'
            : data?.message || 'Payment failed to start';
        setError(message);
        setPaymentConfigured(false);
        return;
      }
      if (data?.url) {
        if (portalPolishV1Enabled) {
          window.open(data.url, '_blank', 'noopener,noreferrer');
          setCheckoutHint('Return here after payment.');
        } else {
          window.location.href = data.url;
        }
        setPaymentConfigured(true);
        return;
      }
      setError('Secure payment is unavailable for this job right now. Please contact support to complete payment.');
      setPaymentConfigured(false);
    } catch {
      setError('Payment failed to start');
    } finally {
      setPendingAction('');
    }
  }

  if (!job && !error) {
    return <div className="container" data-testid="public-portal-loading" role="status" aria-live="polite">Loading...</div>;
  }

  if (!portalPolishV1Enabled) {
    return (
      <div className="container">
        <div className="card">
          <h1>Customer portal</h1>
          {error && <p role="alert" style={{ color: '#ff8a8a' }}>{error}</p>}
          {status && <p aria-live="polite" role="status" style={{ color: '#7bdba5' }}>{status}</p>}

          {job && (
            <>
              <p className="muted">Job: {job.jobRef}</p>
              <p><strong>Customer:</strong> {job.customerName}</p>
              <p><strong>Vehicle:</strong> {job.vehicleMake} {job.vehicleModel} {job.vehicleReg}</p>
              <p><strong>Total:</strong> {job.currency} {(job.totalCents / 100).toFixed(2)}</p>

              <div className="card" style={{ padding: 16, marginTop: 16 }}>
                <h3>Job summary</h3>
                <p className="muted">Job details</p>
                <p><strong>Job type:</strong> {job.jobType || job?.formData?.jobType || 'N/A'}</p>
                <p><strong>WhatsApp completion link:</strong> {job.whatsappCompletionLink || job?.formData?.whatsappCompletionLink || 'Not provided'}</p>
              </div>

              <div className="card" style={{ padding: 16, marginTop: 16 }}>
                <h3>Before photos</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                  {(Array.isArray((job as any).assets) ? (job as any).assets : []).filter((a: any) => a.kind === 'BEFORE').map((item: any) => (
                    <a key={item.id} href={item.url} target="_blank" rel="noreferrer">
                      <img src={item.url} alt="before" style={{ width: '100%', borderRadius: 8 }} />
                    </a>
                  ))}
                </div>
              </div>

              <div className="card" style={{ padding: 16, marginTop: 16 }}>
                <h3>After photos</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                  {(Array.isArray((job as any).assets) ? (job as any).assets : []).filter((a: any) => a.kind === 'AFTER').map((item: any) => (
                    <a key={item.id} href={item.url} target="_blank" rel="noreferrer">
                      <img src={item.url} alt="after" style={{ width: '100%', borderRadius: 8 }} />
                    </a>
                  ))}
                </div>
              </div>

              <div className="card" style={{ padding: 16, marginTop: 16 }}>
                <h3>Torque evidence</h3>
                {(Array.isArray((job as any).assets) ? (job as any).assets : []).filter((a: any) => a.kind === 'TORQUE').length > 0 ? (
                  <ul>
                    {(Array.isArray((job as any).assets) ? (job as any).assets : []).filter((a: any) => a.kind === 'TORQUE').map((item: any) => (
                      <li key={item.id}><a href={item.url} target="_blank" rel="noreferrer">{item.url}</a></li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted"><em>No torque image uploaded. Link fallback is shown when available.</em></p>
                )}
              </div>

              {job.invoicePdfUrl && (
                <p style={{ marginTop: 16 }}>
                  <a href={job.invoicePdfUrl} target="_blank" rel="noreferrer">Download Job PDF</a>
                </p>
              )}

              <div className="card" style={{ padding: 16, marginTop: 16 }}>
                <h3>1) Approve or decline</h3>
                <label>Name</label>
                <input className="input" value={signatureName} onChange={(e) => setSignatureName(e.target.value)} disabled={pendingAction !== ''} />

                <label>Decline reason (optional)</label>
                <input className="input" value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} disabled={pendingAction !== ''} />

                <div style={{ marginTop: 8 }}>
                  <button className="button" type="button" onClick={approve} disabled={pendingAction !== ''} style={{ marginRight: 8 }}>
                    {pendingAction === 'approve' ? 'Approving...' : 'Approve Job'}
                  </button>
                  {marketplaceEnabled ? (
                    <button className="button secondary" type="button" onClick={decline} disabled={pendingAction !== ''}>
                      {pendingAction === 'decline' ? 'Declining...' : 'Decline Job'}
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="card" style={{ padding: 16, marginTop: 16 }}>
                <h3>2) Sign</h3>
                <label>Signature</label>
                <canvas
                  ref={canvasRef}
                  width={400}
                  height={180}
                  style={{ border: '1px solid #ccc', borderRadius: 6, background: '#fff' }}
                  onMouseDown={(e) => {
                    const p = getCanvasPos(e.clientX, e.clientY);
                    startDraw(p.x, p.y);
                  }}
                  onMouseUp={stopDraw}
                  onMouseLeave={stopDraw}
                  onMouseMove={(e) => {
                    const p = getCanvasPos(e.clientX, e.clientY);
                    continueDraw(p.x, p.y);
                  }}
                />
                <div style={{ marginTop: 8 }}>
                  <button className="button secondary" type="button" onClick={clearCanvas} disabled={pendingAction !== ''} style={{ marginRight: 8 }}>
                    Clear
                  </button>
                  <button className="button secondary" type="button" onClick={undoCanvas} disabled={pendingAction !== ''} style={{ marginRight: 8 }}>
                    Undo
                  </button>
                  <button className="button" type="button" onClick={sign} disabled={pendingAction !== ''}>
                    {pendingAction === 'sign' ? 'Saving...' : 'Save Signature'}
                  </button>
                </div>
              </div>

              <div className="card" style={{ padding: 16, marginTop: 16 }}>
                <h3>3) Pay</h3>
                {portal?.enabled && portal?.paymentsEnabled && portal?.stripeConfigured && marketplaceEnabled ? (
                  <button className="button" type="button" onClick={pay} disabled={pendingAction !== ''}>
                    {pendingAction === 'pay' ? 'Opening payment...' : 'Pay securely'}
                  </button>
                ) : (
                  <p className="muted">Payments are not configured for this job.</p>
                )}
                {paymentStatus ? <p className="muted">Payment status: {paymentStatus}</p> : null}
                {receiptUrl ? (
                  <p>
                    <a href={receiptUrl} target="_blank" rel="noreferrer">View receipt</a>
                  </p>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const approved = Boolean(job?.approvedAt);
  const declined = Boolean(job?.declinedAt);
  const approvalDone = approved || declined;
  const signed = Boolean(job?.signedAt);
  const completed = String(job?.status || '').toUpperCase() === 'COMPLETED';
  const paid = Boolean(job?.invoicePaidAt) || paymentStatus === 'paid';
  const supportEmail = portal?.supportEmail || FALLBACK_SUPPORT_EMAIL;
  const hasTenantPhone = Boolean(portal?.supportPhone);
  const tenantPhoneSanitized = String(portal?.supportPhone || '').replace(/[^\d+]/g, '');
  const paymentsConfigured =
    marketplaceEnabled &&
    Boolean(portal?.enabled) &&
    Boolean(portal?.paymentsEnabled) &&
    Boolean(portal?.stripeConfigured) &&
    paymentConfigured !== false;
  const brandColor = portal?.brand?.primaryColor || '#4fd1c5';

  const step2Enabled = true;
  const step3Enabled = approvalDone && approved;
  const step4Enabled = step3Enabled;
  const step4Done = paid;
  const pdfReady = Boolean(portal?.summary?.pdfReady);
  const step5Enabled = step3Enabled && (paid || !paymentsConfigured);
  const step5Done = pdfReady;
  const step5Ready = step5Enabled && pdfReady;

  const approvalName = portal?.summary?.approvedByName || job?.approvedByName || null;
  const approvalTime = formatDateTime(portal?.summary?.approvedAt || job?.approvedAt);
  const declineTime = formatDateTime(portal?.summary?.declinedAt || job?.declinedAt);
  const approvalSummary = declined
    ? ['Declined', declineTime].filter(Boolean).join(' • ')
    : ['Approved', approvalName ? `by ${approvalName}` : null, approvalTime].filter(Boolean).join(' • ');

  const signedTime = formatDateTime(portal?.summary?.signedAt || job?.signedAt);
  const signatureLabel = portal?.summary?.signatureName || job?.signatureName || null;
  const signatureSummary = ['Signed', signatureLabel ? `by ${signatureLabel}` : null, signedTime]
    .filter(Boolean)
    .join(' • ');

  const paidTime = formatDateTime(portal?.summary?.invoicePaidAt || job?.invoicePaidAt);
  const paymentAmount = formatMoney(portal?.summary?.totalCents ?? job?.totalCents, portal?.summary?.currency ?? job?.currency);
  const paymentMethod = formatPaymentMethod(
    portal?.summary?.paymentMethod ?? (job?.formData?.paymentMethod as string | undefined),
  );
  const paymentSummary = paid
    ? [paymentAmount ? `Paid ${paymentAmount}` : 'Paid', paymentMethod ? `via ${paymentMethod}` : null, paidTime]
        .filter(Boolean)
        .join(' • ')
    : paymentsConfigured
      ? 'Payment pending'
      : 'Payments not enabled';
  const dueTime = formatDateTime(portal?.summary?.invoiceDueAt);
  const nextStepMessage = declined
    ? 'This job is currently declined. Contact support if you need the scope corrected before continuing.'
    : portal?.summary?.nextCustomerStep
      ? portal.summary.nextCustomerStep
      : !approved
        ? 'Review the scope and approve the job to continue.'
        : !signed
          ? 'Add your signature to confirm the approved work.'
          : paymentsConfigured && !paid
            ? dueTime
              ? `Payment is the next step. The current invoice is due by ${dueTime}. Once payment is complete, your receipt and PDF will be available here.`
              : 'Payment is the next step. Once payment is complete, your receipt and PDF will be available here.'
            : !step5Done
              ? 'Your PDF will unlock once the remaining steps complete.'
              : 'Everything is complete. You can download the PDF or contact support if you need anything else.';

  const pdfSummary = step5Done ? (
    <>
      PDF ready{' '}
      <a href={`${API_BASE}/public/job/${tokenValue}/pdf`} target="_blank" rel="noreferrer">
        Download
      </a>
    </>
  ) : null;

  const wheels = Array.isArray(job?.formData?.selectedWheels)
    ? job.formData.selectedWheels
    : Array.isArray(job?.formData?.wheels)
      ? job.formData.wheels
      : null;
  const services = Array.isArray(job?.formData?.services)
    ? job.formData.services
    : job?.serviceName
      ? [job.serviceName]
      : [];

  return (
    <div className="container" style={{ maxWidth: 760 }}>
      <div className="card" style={{ padding: 16 }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p className="muted" style={{ margin: 0 }}>MyTitan</p>
            <h1 style={{ margin: '6px 0 0 0', color: brandColor }}>{portal?.brand?.tenantName || 'Customer portal'}</h1>
          </div>
          {portal?.brand?.logoUrl ? (
            <img
              src={portal.brand.logoUrl}
              alt="Tenant logo"
              style={{ width: 52, height: 52, objectFit: 'contain', borderRadius: 10, background: '#fff' }}
            />
          ) : null}
        </header>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          <StatusChip label="Approved" value={approved} />
          <StatusChip label="Signed" value={signed} />
          <StatusChip label="Paid" value={paid} />
          <StatusChip label="Completed" value={completed} />
        </div>

        <section className="card" data-testid="public-portal-billing-progress" style={{ padding: 16, marginTop: 14 }}>
          <h3 style={{ marginTop: 0 }}>Billing progress</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            <p style={{ margin: 0 }}>
              <strong>Billing state:</strong> {String(portal?.summary?.billingState || (paid ? 'paid' : job?.invoiceIssuedAt ? 'invoice_issued' : 'pre_invoice')).replaceAll('_', ' ')}
            </p>
            {dueTime ? (
              <p style={{ margin: 0 }}>
                <strong>Invoice due:</strong> {dueTime}
                {portal?.summary?.invoiceOverdue ? ' · overdue' : ''}
              </p>
            ) : null}
            <p style={{ margin: 0 }}>
              <strong>Payment availability:</strong> {portal?.summary?.paymentAvailable ? 'Secure payment available here' : 'Payment handoff not enabled for this job'}
            </p>
            <p style={{ margin: 0 }}>
              <strong>Receipt:</strong> {portal?.summary?.receiptReady ? 'Available after payment' : 'Not available yet'}
            </p>
          </div>
        </section>

        <section className="card" data-testid="public-portal-documents" style={{ padding: 16, marginTop: 14 }}>
          <h3 style={{ marginTop: 0 }}>Documents</h3>
          {portal?.documents?.length ? (
            <div style={{ display: "grid", gap: 10 }}>
              {portal.documents.map((item) => (
                <div
                  key={item.id}
                  style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", border: "1px solid #2a3042", borderRadius: 12, padding: "12px 14px" }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{item.label}</div>
                    <div className="muted" style={{ marginTop: 4 }}>
                      {[item.kind.replaceAll("_", " "), formatDateTime(item.createdAt)].filter(Boolean).join(" • ")}
                    </div>
                  </div>
                  {item.downloadUrl ? (
                    <a
                      className="button secondary"
                      href={item.downloadUrl.startsWith("http") ? item.downloadUrl : `${API_BASE}${item.downloadUrl}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ marginBottom: 0 }}>No customer-safe documents are available yet.</p>
          )}
        </section>

        <p className="muted" data-testid="public-portal-next-step" style={{ marginTop: 12 }}>{nextStepMessage}</p>

        {error && <p data-testid="public-portal-error" role="alert" style={{ color: '#ff8a8a', marginTop: 12 }}>{error}</p>}
        {status && <p aria-live="polite" data-testid="public-portal-status" role="status" style={{ color: '#7bdba5', marginTop: 12 }}>{status}</p>}

        <StepCard
          title="Step 1: Review job summary"
          description="Confirm vehicle, work selected, and pricing before continuing."
          done={false}
          enabled={true}
        >
          <p><strong>Job:</strong> {job?.jobRef || 'N/A'}</p>
          <p><strong>Vehicle:</strong> {job?.vehicleMake || ''} {job?.vehicleModel || ''} {job?.vehicleReg || ''}</p>
          <p><strong>Registration:</strong> {job?.vehicleReg || 'Not provided'}</p>
          <p><strong>Wheels selected:</strong> {wheels?.length ? wheels.join(', ') : 'Not specified'}</p>
          <p><strong>Services:</strong> {services.length ? services.join(', ') : 'Not specified'}</p>
          <p><strong>Pricing:</strong> {job?.currency} {(job?.subtotalCents / 100 || 0).toFixed(2)} subtotal</p>
          <p><strong>Total:</strong> {job?.currency} {(job?.totalCents / 100 || 0).toFixed(2)}</p>
          {portal?.timeline?.length ? (
            <div style={{ marginTop: 16 }}>
              <p><strong>Recent progress</strong></p>
              <div style={{ display: 'grid', gap: 8 }}>
                {portal.timeline.map((item, index) => (
                  <div key={`${item.eventType || 'event'}-${index}`} style={{ padding: '10px 12px', border: '1px solid #2a3042', borderRadius: 12 }}>
                    <div style={{ fontWeight: 600 }}>{item.message || item.eventType || 'Update'}</div>
                    <div className="muted" style={{ marginTop: 4 }}>{formatDateTime(item.createdAt) || 'Time unavailable'}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </StepCard>

        <StepCard
          title="Step 2: Approve or Decline"
          description={declined ? 'You declined this job.' : 'Approve to continue. Decline if details are not correct.'}
          done={approvalDone}
          enabled={step2Enabled}
          summary={approvalDone ? approvalSummary : null}
        >
          <label>Name</label>
          <input className="input" value={signatureName} onChange={(e) => setSignatureName(e.target.value)} disabled={pendingAction !== ''} />
          {marketplaceEnabled ? (
            <>
              <label>Decline reason (optional)</label>
              <input className="input" value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} disabled={pendingAction !== ''} />
            </>
          ) : null}
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            <button className="button" data-testid="public-portal-approve" type="button" onClick={approve} style={{ width: '100%', minHeight: 46 }}>
              Approve Job
            </button>
            {marketplaceEnabled ? (
              <button className="button secondary" data-testid="public-portal-decline" type="button" onClick={decline} style={{ width: '100%', minHeight: 46 }}>
                Decline Job
              </button>
            ) : null}
          </div>
        </StepCard>

        <StepCard
          title="Step 3: Sign"
          description={
            step3Enabled
              ? 'Draw your signature and save it.'
              : declined
                ? 'Signing is disabled because this job was declined.'
                : 'Complete Step 2 first.'
          }
          done={signed}
          enabled={step3Enabled}
          summary={signed ? signatureSummary : null}
        >
          <label>Signature</label>
          <canvas
            ref={canvasRef}
            width={400}
            height={180}
            style={{ border: '1px solid #ccc', borderRadius: 8, background: '#fff', width: '100%', maxWidth: 420 }}
            onMouseDown={(e) => {
              const p = getCanvasPos(e.clientX, e.clientY);
              startDraw(p.x, p.y);
            }}
            onMouseUp={stopDraw}
            onMouseLeave={stopDraw}
            onMouseMove={(e) => {
              const p = getCanvasPos(e.clientX, e.clientY);
              continueDraw(p.x, p.y);
            }}
            onTouchStart={(e) => {
              const touch = e.touches[0];
              if (!touch) return;
              const p = getCanvasPos(touch.clientX, touch.clientY);
              startDraw(p.x, p.y);
            }}
            onTouchMove={(e) => {
              const touch = e.touches[0];
              if (!touch) return;
              const p = getCanvasPos(touch.clientX, touch.clientY);
              continueDraw(p.x, p.y);
            }}
            onTouchEnd={stopDraw}
          />
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            <button className="button secondary" type="button" onClick={clearCanvas} disabled={pendingAction !== ''} style={{ width: '100%', minHeight: 46 }}>
              Clear Signature
            </button>
            <button className="button secondary" type="button" onClick={undoCanvas} disabled={pendingAction !== ''} style={{ width: '100%', minHeight: 46 }}>
              Undo Last Stroke
            </button>
            <button className="button" data-testid="public-portal-sign" type="button" onClick={sign} disabled={!step3Enabled || pendingAction !== ''} style={{ width: '100%', minHeight: 46 }}>
              {pendingAction === 'sign' ? 'Saving...' : 'Save Signature'}
            </button>
          </div>
        </StepCard>

        <StepCard
          title="Step 4: Pay"
          description={
            step4Enabled
              ? portal?.summary?.invoiceOverdue
                ? 'Your invoice is overdue. Pay now or contact support if anything is unclear.'
                : dueTime
                  ? `Pay now. The current invoice is due by ${dueTime}.`
                  : 'Pay now, then come back and refresh your payment status.'
              : 'Complete Step 3 first.'
          }
          done={step4Done}
          enabled={step4Enabled}
          summary={step4Done ? paymentSummary : null}
        >
          {paid ? (
            <p style={{ fontSize: 24, fontWeight: 800, color: '#7ff3b0', margin: 0 }}>Paid ✅</p>
          ) : paymentsConfigured ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {portal?.summary?.billingState ? (
                <p className="muted" style={{ margin: 0 }}>
                  Billing state: {String(portal.summary.billingState).replaceAll('_', ' ')}
                </p>
              ) : null}
              <button className="button" data-testid="public-portal-pay" type="button" onClick={pay} disabled={!step4Enabled || pendingAction !== ''} style={{ width: '100%', minHeight: 46 }}>
                {pendingAction === 'pay' ? 'Opening payment...' : 'Pay now'}
              </button>
              <button className="button secondary" data-testid="public-portal-refresh-payment" type="button" onClick={refreshPaymentStatus} disabled={pendingAction !== ''} style={{ width: '100%', minHeight: 46 }}>
                {pendingAction === 'refresh-payment' ? 'Refreshing...' : 'Refresh payment status'}
              </button>
              {checkoutHint ? <p className="muted" style={{ margin: 0 }}>{checkoutHint}</p> : null}
              {paymentStatus ? <p className="muted" style={{ margin: 0 }}>Payment status: {paymentStatus}</p> : null}
              {receiptUrl ? (
                <p style={{ margin: 0 }}>
                  <a href={receiptUrl} target="_blank" rel="noreferrer">View receipt</a>
                </p>
              ) : null}
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              {portal?.enabled && portal?.paymentsEnabled
                ? 'Secure payment is unavailable for this workspace right now. Contact support to complete payment.'
                : 'Secure payment is not enabled for this job.'}
            </p>
          )}
        </StepCard>

        <StepCard
          title="Step 5: Download PDF"
          description={
            step5Enabled
              ? pdfReady
                ? 'Download your job PDF.'
                : 'PDF generating. Please check back shortly.'
              : paymentsConfigured
                ? 'Pay first to unlock download.'
                : 'Complete signing first to unlock download.'
          }
          done={step5Done}
          enabled={step5Enabled}
          summary={step5Done ? pdfSummary : null}
        >
          <a
            className="button"
            style={{ width: '100%', minHeight: 46, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            href={`${API_BASE}/public/job/${tokenValue}/pdf`}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!step5Ready}
            onClick={(e) => {
              if (!step5Ready) {
                e.preventDefault();
              }
            }}
          >
            Download PDF
          </a>
        </StepCard>

        <section className="card" style={{ padding: 16, marginTop: 14 }}>
          <h3 style={{ marginTop: 0 }}>Need help?</h3>
          <p style={{ marginBottom: 8 }}>
            Email: <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
          </p>
          {hasTenantPhone ? (
            <p style={{ margin: 0 }}>
              WhatsApp: <a href={`https://wa.me/${tenantPhoneSanitized}`} target="_blank" rel="noreferrer">Message us</a>
            </p>
          ) : (
            <p className="muted" style={{ margin: 0 }}>WhatsApp support is not available for this tenant.</p>
          )}
        </section>
      </div>
    </div>
  );
}
