import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/router';
import { getApiBase } from '../../../lib/api';
import { isMarketplaceEnabled, isPortalPolishV1Enabled } from '../../../lib/feature-flags';
import { humanizeUnderscoreLabel } from '../../../lib/text-format';
import MyTitanLogo from '../../../components/brand/mytitan-logo';

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
  feedbackRequest?: {
    enabled?: boolean;
    promptText?: string | null;
    publicReviewUrl?: string | null;
    thankYouText?: string | null;
  } | null;
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
    paymentRequest?: {
      status?: string | null;
      provider?: string | null;
      providerLabel?: string | null;
      amountCents?: number | null;
      currency?: string | null;
      dueAt?: string | null;
      paidAt?: string | null;
      manualMethod?: string | null;
      amountReceivedCents?: number | null;
      evidenceReceived?: boolean | null;
      evidenceLabel?: string | null;
      receiptNote?: string | null;
      actionAvailable?: boolean | null;
      actionUrl?: string | null;
      manualInstructions?: string | null;
      separationMessage?: string | null;
    } | null;
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
  booking?: {
    enabled?: boolean;
    available?: boolean;
    bookingUrl?: string | null;
    message?: string | null;
    services?: Array<{
      id: string;
      name: string;
      description?: string | null;
      durationMinutes?: number | null;
    }>;
    nextSlots?: Array<{
      serviceId: string;
      serviceName: string;
      startsAt: string;
      endsAt: string;
      date?: string | null;
      bookingUrl?: string | null;
    }>;
  };
  workHistory?: {
    available?: boolean;
    summary?: {
      totalJobs?: number;
      outstandingInvoices?: number;
      paidJobs?: number;
    };
    jobs?: Array<{
      id: string;
      jobRef: string;
      status?: string | null;
      serviceName?: string | null;
      createdAt?: string | null;
      completedAt?: string | null;
      invoiceIssuedAt?: string | null;
      invoiceDueAt?: string | null;
      invoicePaidAt?: string | null;
      totalCents?: number | null;
      currency?: string | null;
      approvalState?: string | null;
      billingState?: string | null;
      vehicleLabel?: string | null;
      active?: boolean;
    }>;
  };
  servicePlans?: Array<{
    id: string;
    name: string;
    status: string;
    nextRunAt?: string | null;
    lastRunAt?: string | null;
    lastRunStatus?: string | null;
  }>;
  executionRecord?: {
    status?: string | null;
    summary?: string | null;
    submittedAt?: string | null;
    acknowledgedAt?: string | null;
    evidence?: Array<{
      id: string;
      label: string;
      kind: string;
      artifact?: {
        id: string;
        label: string;
      } | null;
    }>;
  } | null;
  journey?: {
    enabled?: boolean;
    currentStage?: string | null;
    stages?: Array<{ key: string; label: string; state: string }>;
    eta?: {
      available?: boolean;
      scheduledAt?: string | null;
      windowStart?: string | null;
      windowEnd?: string | null;
      status?: string | null;
      confidence?: string | null;
      delayed?: boolean;
      delayMinutes?: number;
      customerNote?: string | null;
      label?: string | null;
      precisionNotice?: string | null;
    };
    appointment?: {
      rescheduled?: boolean;
    };
    technician?: {
      assigned?: boolean;
      displayName?: string | null;
      visible?: boolean;
    };
    statusUpdate?: string | null;
    preparationChecklist?: string[];
    trustNotice?: string | null;
    recentUpdates?: Array<{ eventType?: string | null; message?: string | null; createdAt?: string | null }>;
  };
};

type CustomerProfile = {
  customerName?: string | null;
  businessName?: string | null;
  invoiceNumber?: string | null;
  vatNumber?: string | null;
  companyNumber?: string | null;
  businessAddress?: {
    formatted?: string | null;
  } | null;
  billingAddress?: {
    formatted?: string | null;
  } | null;
  primaryContact?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    mobile?: string | null;
    summary?: string | null;
  } | null;
  secondaryContact?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    mobile?: string | null;
    summary?: string | null;
  } | null;
};

type CustomerPresentation = {
  displayName?: string | null;
  accountLabel?: string | null;
  businessDetails?: Array<{ label: string; value: string }>;
  contactDetails?: Array<{ label: string; value: string }>;
  billingDetails?: Array<{ label: string; value: string }>;
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

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatTime = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleTimeString('en-GB', {
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

const PORTAL_HERO_BACKGROUND =
  'linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(239, 246, 255, 0.96) 100%)';
const PORTAL_PANEL_BORDER = '1px solid rgba(148, 163, 184, 0.24)';
const PORTAL_SUCCESS_BACKGROUND = '#ecfdf5';
const PORTAL_SUCCESS_TEXT = '#0f766e';
const PORTAL_ERROR_TEXT = '#b91c1c';
const PORTAL_INFO_BACKGROUND = 'linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.98))';
const PORTAL_STEP_SHADOW = '0 18px 42px rgba(15, 23, 42, 0.07)';

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
        padding: 18,
        marginTop: 14,
        border: done ? '1px solid rgba(15, 118, 110, 0.24)' : PORTAL_PANEL_BORDER,
        opacity: enabled ? 1 : 0.75,
        background: PORTAL_INFO_BACKGROUND,
        boxShadow: PORTAL_STEP_SHADOW,
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
              background: PORTAL_SUCCESS_BACKGROUND,
              color: PORTAL_SUCCESS_TEXT,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Completed
          </span>
        ) : null}
      </div>
      <p className="muted" style={{ marginBottom: done ? 0 : 12, color: '#526071' }}>{description}</p>
      {done && summary ? <p className="muted" style={{ marginTop: 8, color: '#334155' }}>{summary}</p> : null}
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
        background: value ? PORTAL_SUCCESS_BACKGROUND : '#f8fafc',
        color: value ? PORTAL_SUCCESS_TEXT : '#475569',
        border: PORTAL_PANEL_BORDER,
      }}
    >
      {label}: {value ? 'Yes' : 'No'}
    </span>
  );
}

function SectionCard({
  title,
  eyebrow,
  children,
  testId,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className="card" data-testid={testId} style={{ padding: 18, marginTop: 14, borderRadius: 16, background: PORTAL_INFO_BACKGROUND, boxShadow: PORTAL_STEP_SHADOW }}>
      {eyebrow ? (
        <p className="muted" style={{ margin: '0 0 6px 0', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11 }}>
          {eyebrow}
        </p>
      ) : null}
      <h3 style={{ marginTop: 0, marginBottom: 14 }}>{title}</h3>
      {children}
    </section>
  );
}

function DetailRows({
  rows,
  columns = 1,
}: {
  rows: Array<{ label: string; value: ReactNode }>;
  columns?: 1 | 2;
}) {
  if (!rows.length) return null;
  return (
    <dl
      style={{
        display: 'grid',
        gridTemplateColumns: columns === 2 ? 'repeat(auto-fit, minmax(220px, 1fr))' : '1fr',
        gap: 12,
        margin: 0,
      }}
    >
      {rows.map((row) => (
        <div key={`${row.label}-${String(row.value)}`} style={{ padding: '12px 14px', border: PORTAL_PANEL_BORDER, borderRadius: 12, background: '#fff' }}>
          <dt className="muted" style={{ marginBottom: 6, fontSize: 12 }}>{row.label}</dt>
          <dd style={{ margin: 0, fontWeight: 600 }}>{row.value}</dd>
        </div>
      ))}
    </dl>
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
  const signatureDirtyRef = useRef(false);
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
        setCheckoutHint('Online payment is not available right now. Please contact the business.');
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

  const startDraw = (x: number, y: number, pointerId?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    signatureHistoryRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    drawingRef.current = true;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111';
    ctx.beginPath();
    ctx.moveTo(x, y);
    signatureDirtyRef.current = true;
    if (typeof pointerId === 'number') {
      canvas.setPointerCapture(pointerId);
    }
  };

  const continueDraw = (x: number, y: number) => {
    if (!drawingRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDraw = (pointerId?: number) => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (typeof pointerId === 'number' && canvas.hasPointerCapture(pointerId)) {
          canvas.releasePointerCapture(pointerId);
        }
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
    signatureDirtyRef.current = false;
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
    signatureDirtyRef.current = signatureHistoryRef.current.length > 1;
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
      if (!signatureDirtyRef.current) {
        throw new Error('Add a signature before saving');
      }
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
            ? 'Secure payment is unavailable for this job right now. Please contact the business directly to arrange payment.'
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
      setError('Secure payment is unavailable for this job right now. Please contact the business directly to arrange payment.');
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
          <h1>Your completed work</h1>
          {error && <p role="alert" style={{ color: PORTAL_ERROR_TEXT }}>{error}</p>}
          {status && <p aria-live="polite" role="status" style={{ color: PORTAL_SUCCESS_TEXT }}>{status}</p>}

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
                  data-testid="public-portal-signature-pad"
                  style={{ border: '1px solid #ccc', borderRadius: 6, background: '#fff', touchAction: 'none' }}
                  onPointerDown={(e) => {
                    const p = getCanvasPos(e.clientX, e.clientY);
                    startDraw(p.x, p.y, e.pointerId);
                  }}
                  onPointerUp={(e) => stopDraw(e.pointerId)}
                  onPointerLeave={(e) => stopDraw(e.pointerId)}
                  onPointerCancel={(e) => stopDraw(e.pointerId)}
                  onPointerMove={(e) => {
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
                  <p className="muted">Customer payments are handled by the business payment setup, not MyTitan billing.</p>
                )}
                {paymentStatus ? <p className="muted">Payment: {paymentStatus}</p> : null}
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
    Boolean(portal?.summary?.paymentAvailable) &&
    paymentConfigured !== false;
  const brandColor = portal?.brand?.primaryColor || '#4fd1c5';

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
  const paymentRequest = portal?.summary?.paymentRequest || null;
  const paymentRequestAmount = formatMoney(paymentRequest?.amountCents, paymentRequest?.currency);
  const paymentMethod = formatPaymentMethod(
    portal?.summary?.paymentMethod ?? (job?.formData?.paymentMethod as string | undefined),
  );
  const paymentSummary = paid
    ? [paymentAmount ? `Paid ${paymentAmount}` : 'Paid', paymentMethod ? `via ${paymentMethod}` : null, paidTime]
        .filter(Boolean)
        .join(' • ')
    : paymentsConfigured
      ? 'Payment pending'
      : 'Handled directly by the business';
  const dueTime = formatDateTime(portal?.summary?.invoiceDueAt);
  const nextStepMessage = declined
    ? 'This job is currently declined. Contact the business directly if the scope needs correcting before continuing.'
    : portal?.summary?.nextCustomerStep
      ? portal.summary.nextCustomerStep
      : !approved
        ? 'Review the scope and approve the job to continue.'
        : !signed
          ? 'Add your signature to confirm the approved work.'
          : paymentsConfigured && !paid
            ? dueTime
              ? `Payment is the next step. The current invoice is due by ${dueTime}. The business will confirm payment here after their provider updates them.`
              : 'Payment is the next step. The business will confirm payment here after their provider updates them.'
            : !step5Done
              ? 'Your summary PDF will unlock once the remaining steps complete.'
              : 'Everything is complete. You can download your service summary or contact the business directly if you need anything else.';

  const pdfSummary = step5Done ? (
    <>
      Service summary ready{' '}
      <a href={`${API_BASE}/public/job/${tokenValue}/pdf`} target="_blank" rel="noreferrer">
        Download
      </a>
    </>
  ) : null;

  const customerProfile = (job?.customerProfile || null) as CustomerProfile | null;
  const customerPresentation = (job?.customerPresentation || null) as CustomerPresentation | null;
  const services = Array.isArray(job?.formData?.serviceTypes)
    ? job.formData.serviceTypes
    : Array.isArray(job?.formData?.services)
      ? job.formData.services
      : job?.serviceName
        ? [job.serviceName]
        : [];
  const wheelPositions = Array.isArray(job?.formData?.wheelPositions)
    ? job.formData.wheelPositions
    : [];
  const vehicleSummary = [job?.vehicleMake, job?.vehicleModel, job?.formData?.vehicleColour, job?.vehicleReg || job?.formData?.registration].filter(Boolean).join(' ');
  const additionalServicePrice =
    typeof job?.formData?.additionalServicePrice === 'number'
      ? job.formData.additionalServicePrice
      : Number(job?.formData?.additionalServicePrice || 0);
  const additionalServicePriceLabel = additionalServicePrice > 0 && job?.currency
    ? formatMoney(Math.round(additionalServicePrice * 100), job.currency)
    : null;
  const summaryRows = [
    { label: 'Job reference', value: job?.jobRef || 'Not assigned' },
    ...(job?.formData?.jobDate ? [{ label: 'Job date', value: formatDate(job.formData.jobDate) || job.formData.jobDate }] : []),
    ...(job?.jobType || job?.formData?.jobType ? [{ label: 'Job type', value: job?.jobType || job?.formData?.jobType }] : []),
    ...(job?.formData?.siteLocation ? [{ label: 'Site location', value: job.formData.siteLocation }] : []),
    ...(vehicleSummary ? [{ label: 'Vehicle', value: vehicleSummary }] : []),
    ...(services.length ? [{ label: 'Services', value: services.join(', ') }] : []),
    ...(wheelPositions.length ? [{ label: 'Wheel positions', value: wheelPositions.join(', ') }] : []),
    ...(job?.formData?.looseWheels ? [{ label: 'Loose wheels', value: String(job.formData.looseWheels) }] : []),
    ...(job?.formData?.numberOfWheels ? [{ label: 'Number of wheels', value: String(job.formData.numberOfWheels) }] : []),
    ...(job?.formData?.additionalServicesText ? [{ label: 'Additional services', value: String(job.formData.additionalServicesText) }] : []),
    ...(additionalServicePriceLabel ? [{ label: 'Additional service price', value: additionalServicePriceLabel }] : []),
    ...(job?.formData?.customerNotes || job?.formData?.jobNotes
      ? [{ label: 'Notes', value: String(job.formData.customerNotes || job.formData.jobNotes) }]
      : []),
    ...(paymentAmount ? [{ label: 'Total due', value: paymentAmount }] : []),
    ...(customerProfile?.invoiceNumber ? [{ label: 'Invoice number', value: customerProfile.invoiceNumber }] : []),
  ];
  const businessRows = customerPresentation?.businessDetails || [];
  const contactRows = customerPresentation?.contactDetails || [];
  const billingRows = customerPresentation?.billingDetails || [];
  const bookingRows = (portal?.booking?.services || []).map((service) => ({
    label: service.name,
    value: service.durationMinutes ? `${service.durationMinutes} min visit` : 'Published service',
  }));
  const bookingSlots = portal?.booking?.nextSlots || [];
  const historyJobs = portal?.workHistory?.jobs || [];
  const actionStateRows = [
    { label: 'Approval', value: approvalDone ? approvalSummary : 'Awaiting customer review' },
    { label: 'Signature', value: signed ? signatureSummary : 'Awaiting signature' },
    { label: 'Billing', value: humanizeUnderscoreLabel(portal?.summary?.billingState || (paid ? 'paid' : 'pre_invoice')) },
    { label: 'Next step', value: nextStepMessage },
  ];
  const nextStepRows = [
    { label: 'Current step', value: nextStepMessage },
    {
      label: 'Available now',
      value: paid
        ? 'Your receipt and service summary are ready to download.'
        : pdfReady
          ? 'Your service summary is ready below.'
          : portal?.summary?.paymentAvailable
            ? 'You can review, sign, and pay here.'
            : 'Review the summary below and follow the guided steps.',
    },
  ];
  const lifecycleRows = [
    {
      label: 'Completed work',
      value: completed ? 'Complete' : 'In progress',
    },
    {
      label: 'Customer confirmation',
      value: signed ? 'Confirmed' : approved ? 'Waiting for signature' : 'Waiting for approval',
    },
    {
      label: 'Payment',
      value: paid ? 'Paid' : paymentsConfigured ? 'Pending with provider' : 'Handled directly by the team',
    },
  ];
  const handoffStateLabel = declined
    ? 'Waiting for scope confirmation'
    : !approved
      ? 'Waiting for approval'
      : !signed
        ? 'Waiting for signature'
        : paid
          ? 'Closed and paid'
          : pdfReady
            ? 'Service summary ready'
            : paymentsConfigured
              ? 'Waiting for payment'
              : 'Waiting for final documents';
  const handoffStateSummary = declined
    ? 'The job has been declined for now. The team can review the scope and send an updated handoff if needed.'
    : !approved
      ? 'The completed work is ready for your review.'
      : !signed
        ? 'Approval is in place. Add your signature to finish this off.'
        : paid
          ? 'Everything is complete. Your receipt and service summary stay available here.'
          : pdfReady
            ? 'Your service summary is ready to review.'
            : paymentsConfigured
              ? 'The work is complete and payment is the final remaining step.'
              : 'The work is complete and the team is preparing the final documents.';
  const portalTrustRows = [
    { label: 'Customer handoff', value: handoffStateLabel },
    { label: 'Shared by', value: portal?.brand?.tenantName || 'MyTitan' },
    { label: 'Service summary', value: pdfReady ? 'Ready' : 'Preparing from the completed job' },
    {
      label: 'Payment',
      value: paid ? 'Paid and closed' : paymentsConfigured ? 'Waiting for provider update' : 'Handled through the business payment setup',
    },
  ];
  const timelineRows = (portal?.timeline || []).map((item, index) => ({
    key: `${item.eventType || 'event'}-${index}`,
    title: item.message || item.eventType || 'Update',
    subtitle: formatDateTime(item.createdAt) || 'Time unavailable',
  }));
  const journey = portal?.journey || null;
  const journeyStages = journey?.stages || [];
  const eta = journey?.eta || null;
  const appointmentRows = [
    { label: 'Appointment window', value: eta?.available ? eta.label || [formatTime(eta.windowStart), formatTime(eta.windowEnd)].filter(Boolean).join('-') : 'Window not confirmed yet' },
    { label: 'Confidence', value: eta?.confidence ? humanizeUnderscoreLabel(eta.confidence) : 'Not available' },
    { label: 'Technician', value: journey?.technician?.assigned ? journey.technician.visible && journey.technician.displayName ? journey.technician.displayName : 'Assigned' : 'Not assigned yet' },
    { label: 'Progress', value: journey?.currentStage ? humanizeUnderscoreLabel(journey.currentStage) : handoffStateLabel },
    ...(eta?.delayed ? [{ label: 'Delay', value: eta.delayMinutes ? `Running approximately ${eta.delayMinutes} minutes behind schedule` : 'Running behind schedule' }] : []),
    ...(journey?.appointment?.rescheduled ? [{ label: 'Schedule update', value: 'This appointment was rescheduled by the team' }] : []),
  ];
  const brandBadge = (portal?.brand?.tenantName || 'Customer').slice(0, 1).toUpperCase();
  const selfServiceRows = [
    { label: 'Active status', value: handoffStateLabel },
    { label: 'Booking history', value: historyJobs.length ? `${historyJobs.length} recent visit${historyJobs.length === 1 ? '' : 's'}` : 'No previous visits shown yet' },
    { label: 'ETA window', value: eta?.available ? eta.label || [formatTime(eta.windowStart), formatTime(eta.windowEnd)].filter(Boolean).join('-') : 'Not shared yet' },
    { label: 'Photos and documents', value: `${portal?.documents?.length || 0} shared file${Number(portal?.documents?.length || 0) === 1 ? '' : 's'}` },
    { label: 'Invoices and receipts', value: portal?.summary?.receiptReady ? 'Receipt ready' : humanizeUnderscoreLabel(portal?.summary?.billingState || 'not_ready') },
    { label: 'Warranty and service history', value: portal?.servicePlans?.length ? 'Service plan status available' : 'Ready when the business publishes coverage' },
  ];
  const contactHref = hasTenantPhone ? `tel:${tenantPhoneSanitized}` : `mailto:${supportEmail}`;

  return (
    <div className="container" style={{ maxWidth: 760 }}>
      <div
        className="card"
        style={{
          padding: 18,
          borderRadius: 18,
          background: PORTAL_HERO_BACKGROUND,
        }}
      >
        <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p className="muted" style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11 }}>
              My service account
            </p>
            <h1 style={{ margin: '8px 0 6px 0', color: brandColor }}>{portal?.brand?.tenantName || 'Your service account'}</h1>
            <p style={{ margin: 0, maxWidth: 520, fontSize: 16, lineHeight: 1.5 }}>
              {customerPresentation?.displayName || job?.customerName || 'Customer'}
              {customerPresentation?.accountLabel ? ` for ${customerPresentation.accountLabel}` : ''}.
              {' '}
              Check your visit status, completed work, documents, invoices, service history, and next booking options in one secure place.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <MyTitanLogo size="sm" />
              <span className="muted" style={{ fontSize: 12 }}>Secure customer delivery via MyTitan</span>
            </div>
          </div>
          {portal?.brand?.logoUrl ? (
            <img
              src={portal.brand.logoUrl}
              alt="Tenant logo"
              style={{ width: 52, height: 52, objectFit: 'contain', borderRadius: 10, background: '#fff' }}
            />
          ) : (
            <div
              aria-hidden="true"
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                display: 'grid',
                placeItems: 'center',
                fontWeight: 800,
                fontSize: 22,
                color: '#08111f',
                background: brandColor,
              }}
            >
              {brandBadge}
            </div>
          )}
        </header>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          <StatusChip label="Approved" value={approved} />
          <StatusChip label="Signed" value={signed} />
          <StatusChip label="Paid" value={paid} />
          <StatusChip label="Completed" value={completed} />
        </div>

        <SectionCard title="Next steps" eyebrow="What happens now">
          <div style={{ display: 'grid', gap: 12 }}>
            <DetailRows rows={nextStepRows} columns={2} />
            <DetailRows rows={lifecycleRows} columns={2} />
          </div>
        </SectionCard>

        <SectionCard title="Your service account" eyebrow="Self-service" testId="public-portal-self-service-hub">
          <div style={{ display: 'grid', gap: 14 }}>
            <DetailRows rows={selfServiceRows} columns={2} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {portal?.booking?.bookingUrl ? (
                <a className="button secondary" data-testid="public-portal-rebook-action" href={portal.booking.bookingUrl}>
                  Rebook
                </a>
              ) : null}
              <a className="button secondary" data-testid="public-portal-contact-business" href={contactHref}>
                Contact the team
              </a>
              {portal?.documents?.length ? (
                <a className="button secondary" href="#documents">
                  View documents
                </a>
              ) : null}
            </div>
            <p className="muted" style={{ margin: 0 }}>
              {portal?.summary?.nextCustomerStep || portal?.booking?.message || 'Use this account page to check progress, documents, billing, feedback, and booking options shared by the business.'}
            </p>
          </div>
        </SectionCard>

        {journey?.enabled ? (
          <SectionCard title="Visit progress" eyebrow="Journey and ETA" testId="public-portal-journey">
            <div style={{ display: 'grid', gap: 14 }}>
              <DetailRows rows={appointmentRows} columns={2} />
              {journey.statusUpdate ? (
                <div style={{ padding: '12px 14px', border: PORTAL_PANEL_BORDER, borderRadius: 12, background: '#fff' }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Latest customer update</div>
                  <div className="muted">{journey.statusUpdate}</div>
                </div>
              ) : null}
              {eta?.customerNote ? (
                <p className="muted" style={{ margin: 0 }}>{eta.customerNote}</p>
              ) : null}
              <div data-testid="public-portal-journey-timeline" style={{ display: 'grid', gap: 8 }}>
                {journeyStages.map((stage) => (
                  <div
                    key={stage.key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '24px 1fr',
                      gap: 10,
                      alignItems: 'center',
                      padding: '10px 12px',
                      border: PORTAL_PANEL_BORDER,
                      borderRadius: 12,
                      background: stage.state === 'current' ? 'rgba(79, 209, 197, 0.13)' : '#fff',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 999,
                        background: stage.state === 'complete' ? PORTAL_SUCCESS_TEXT : stage.state === 'current' ? brandColor : '#cbd5e1',
                      }}
                    />
                    <div>
                      <div style={{ fontWeight: 700 }}>{stage.label}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{humanizeUnderscoreLabel(stage.state)}</div>
                    </div>
                  </div>
                ))}
              </div>
              {Array.isArray(journey.preparationChecklist) && journey.preparationChecklist.length ? (
                <div style={{ border: PORTAL_PANEL_BORDER, borderRadius: 12, padding: '12px 14px', background: '#fff' }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>Before your visit</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {journey.preparationChecklist.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              ) : null}
              <p className="muted" style={{ margin: 0 }}>{eta?.precisionNotice || journey.trustNotice || 'Live GPS tracking is not used.'}</p>
              <p className="muted" style={{ margin: 0 }}>No technician location or internal route is shared here.</p>
            </div>
          </SectionCard>
        ) : null}

        <SectionCard title="What happens next" eyebrow="Trusted delivery" testId="public-portal-handoff-status">
          <div style={{ display: 'grid', gap: 12 }}>
            <DetailRows rows={portalTrustRows} columns={2} />
            <div style={{ padding: '12px 14px', border: PORTAL_PANEL_BORDER, borderRadius: 12, background: '#fff' }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{handoffStateLabel}</div>
              <div className="muted">{handoffStateSummary}</div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Service summary" eyebrow="Overview">
          <DetailRows rows={summaryRows} columns={2} />
        </SectionCard>

        <SectionCard title="Customer details" eyebrow="Resolved identity">
          <div style={{ display: 'grid', gap: 12 }}>
            {businessRows.length ? <DetailRows rows={businessRows.map((row) => ({ label: row.label, value: row.value }))} columns={2} /> : null}
            {contactRows.length ? <DetailRows rows={contactRows.map((row) => ({ label: row.label, value: row.value }))} columns={2} /> : null}
            {billingRows.length ? <DetailRows rows={billingRows.map((row) => ({ label: row.label, value: row.value }))} columns={2} /> : null}
            {!businessRows.length && !contactRows.length && !billingRows.length ? (
              <p className="muted" style={{ margin: 0 }}>No customer business details have been published for this job yet.</p>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Current progress" eyebrow="Live update">
          <DetailRows rows={actionStateRows} columns={2} />
        </SectionCard>

        <SectionCard title="Billing and payment" eyebrow="Payments" testId="public-portal-billing-progress">
          <DetailRows
            rows={[
              { label: 'Billing', value: humanizeUnderscoreLabel(portal?.summary?.billingState || (paid ? 'paid' : job?.invoiceIssuedAt ? 'invoice_issued' : 'pre_invoice')) },
              ...(dueTime ? [{ label: 'Invoice due', value: `${dueTime}${portal?.summary?.invoiceOverdue ? ' · overdue' : ''}` }] : []),
              { label: 'Payment route', value: paymentRequest?.providerLabel || (portal?.summary?.paymentAvailable ? 'Available through the business payment provider' : 'Handled by the business payment setup') },
              ...(paymentRequestAmount ? [{ label: 'Amount due', value: paymentRequestAmount }] : []),
              ...(paymentRequest?.status ? [{ label: 'Payment request', value: humanizeUnderscoreLabel(paymentRequest.status) }] : []),
              ...(paymentRequest?.manualMethod ? [{ label: 'Manual method', value: humanizeUnderscoreLabel(paymentRequest.manualMethod) }] : []),
              ...(paymentRequest?.amountReceivedCents ? [{ label: 'Received', value: formatMoney(paymentRequest.amountReceivedCents, paymentRequest.currency) }] : []),
              ...(paymentRequest?.evidenceReceived ? [{ label: 'Evidence', value: paymentRequest.evidenceLabel || 'Received by the business' }] : []),
              { label: 'Receipt', value: portal?.summary?.receiptReady ? 'Ready to download' : 'Not available yet' },
            ]}
            columns={2}
          />
          {paymentRequest?.manualInstructions ? (
            <p className="muted" style={{ margin: '12px 0 0 0' }}>{paymentRequest.manualInstructions}</p>
          ) : null}
          {paymentRequest?.actionAvailable && paymentRequest?.actionUrl ? (
            <a className="button" href={paymentRequest.actionUrl} style={{ marginTop: 12, display: 'inline-flex' }} rel="noreferrer noopener">
              Pay securely
            </a>
          ) : null}
          {paymentRequest?.receiptNote ? (
            <p className="muted" style={{ margin: '6px 0 0 0' }}>{paymentRequest.receiptNote}</p>
          ) : null}
          {paymentRequest?.separationMessage ? (
            <p className="muted" style={{ margin: '6px 0 0 0' }}>{paymentRequest.separationMessage}</p>
          ) : null}
        </SectionCard>

        {portal?.feedbackRequest?.enabled ? (
          <SectionCard title="Share feedback" eyebrow="Aftercare" testId="public-portal-feedback-card">
            <div style={{ display: 'grid', gap: 12 }}>
              <p style={{ margin: 0 }}>
                {portal.feedbackRequest.promptText || "If the work went well, you can leave a quick rating or review for the team."}
              </p>
              {portal.feedbackRequest.publicReviewUrl ? (
                <a className="button secondary" href={portal.feedbackRequest.publicReviewUrl} target="_blank" rel="noreferrer noopener">
                  Leave feedback
                </a>
              ) : null}
              {portal.feedbackRequest.thankYouText ? (
                <p className="muted" style={{ margin: 0 }}>{portal.feedbackRequest.thankYouText}</p>
              ) : null}
            </div>
          </SectionCard>
        ) : null}

        <SectionCard title="Book another visit" eyebrow="Availability" testId="public-portal-booking">
          <div style={{ display: 'grid', gap: 12 }}>
            <p style={{ margin: 0 }}>
              {portal?.booking?.message || 'Online booking is not available here right now.'}
            </p>
            {bookingRows.length ? <DetailRows rows={bookingRows} columns={2} /> : null}
            {bookingSlots.length ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {bookingSlots.map((slot) => (
                  <div
                    key={`${slot.serviceId}-${slot.startsAt}`}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, border: PORTAL_PANEL_BORDER, borderRadius: 12, padding: '12px 14px', background: '#fff' }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{slot.serviceName}</div>
                      <div className="muted" style={{ marginTop: 4 }}>
                        {[formatDate(slot.startsAt), formatTime(slot.startsAt)].filter(Boolean).join(' • ')}
                      </div>
                    </div>
                    {slot.bookingUrl ? (
                      <a className="button secondary" data-testid="public-portal-booking-link" href={slot.bookingUrl}>
                        Book this time
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            {!bookingSlots.length && portal?.booking?.bookingUrl ? (
              <a className="button secondary" data-testid="public-portal-booking-link" href={portal.booking.bookingUrl}>
                Open booking page
              </a>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Service history" eyebrow="Your recent visits" testId="public-portal-work-history">
          {historyJobs.length ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {portal?.workHistory?.summary ? (
                <DetailRows
                  rows={[
                    { label: 'Recent jobs shown', value: String(portal.workHistory.summary.totalJobs || historyJobs.length) },
                    { label: 'Outstanding invoices', value: String(portal.workHistory.summary.outstandingInvoices || 0) },
                    { label: 'Paid jobs', value: String(portal.workHistory.summary.paidJobs || 0) },
                  ]}
                  columns={2}
                />
              ) : null}
              {historyJobs.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    border: PORTAL_PANEL_BORDER,
                    borderRadius: 12,
                    padding: '12px 14px',
                    background: entry.active ? 'rgba(15, 118, 110, 0.06)' : '#fff',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>
                        {entry.jobRef}
                        {entry.active ? ' · Current job' : ''}
                      </div>
                      <div className="muted" style={{ marginTop: 4 }}>
                        {[entry.serviceName, entry.vehicleLabel, entry.status ? humanizeUnderscoreLabel(entry.status) : null].filter(Boolean).join(' • ')}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700 }}>
                      {formatMoney(entry.totalCents, entry.currency) || 'Price pending'}
                    </div>
                  </div>
                  <div className="muted" style={{ marginTop: 8 }}>
                    {[
                      entry.createdAt ? `Opened ${formatDate(entry.createdAt)}` : null,
                      entry.completedAt ? `Completed ${formatDate(entry.completedAt)}` : null,
                      entry.invoicePaidAt
                        ? `Paid ${formatDate(entry.invoicePaidAt)}`
                        : entry.invoiceIssuedAt
                          ? `Invoice ${entry.invoiceDueAt ? `due ${formatDate(entry.invoiceDueAt)}` : 'issued'}`
                          : 'Invoice not issued yet',
                    ].filter(Boolean).join(' • ')}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ marginBottom: 0 }}>No previous work history is available here yet.</p>
          )}
        </SectionCard>

        <div id="documents">
        <SectionCard title="Documents and downloads" eyebrow="Files" testId="public-portal-documents">
          {portal?.documents?.length ? (
            <div style={{ display: "grid", gap: 10 }}>
              {portal.documents.map((item) => (
                <div
                  key={item.id}
                  style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", border: PORTAL_PANEL_BORDER, borderRadius: 12, padding: "12px 14px", background: "#fff" }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{item.label}</div>
                    <div className="muted" style={{ marginTop: 4 }}>
                      {[humanizeUnderscoreLabel(item.kind), formatDateTime(item.createdAt)].filter(Boolean).join(" • ")}
                    </div>
                  </div>
                  {item.downloadUrl ? (
                    <a
                      className="button secondary"
                      href={item.downloadUrl.startsWith("http") ? item.downloadUrl : `${API_BASE}${item.downloadUrl}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open file
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ marginBottom: 0 }}>No shared documents are available yet.</p>
          )}
        </SectionCard>
        </div>

        {portal?.executionRecord ? (
          <SectionCard title="This is your completed work" eyebrow="Shared proof" testId="public-portal-completion-proof">
            <p style={{ margin: 0 }}>
              <strong>Status:</strong> {portal.executionRecord.status || "Submitted"}
            </p>
            {portal.executionRecord.summary ? (
              <p style={{ marginBottom: 0 }}>
                <strong>Summary:</strong> {portal.executionRecord.summary}
              </p>
            ) : null}
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {(portal.executionRecord.evidence || []).length ? (
                portal.executionRecord.evidence?.map((item) => (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, border: PORTAL_PANEL_BORDER, borderRadius: 12, padding: "12px 14px", background: "#fff" }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{item.label}</div>
                      <div className="muted" style={{ marginTop: 4 }}>{humanizeUnderscoreLabel(item.kind)}</div>
                    </div>
                    {item.artifact ? (
                      <div className="muted">Saved as {item.artifact.label}</div>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="muted" style={{ marginBottom: 0 }}>No shared evidence is available yet.</p>
              )}
            </div>
          </SectionCard>
        ) : null}

        {portal?.servicePlans?.length ? (
          <SectionCard title="Service plan status" eyebrow="Ongoing coverage">
            <div style={{ display: "grid", gap: 10 }}>
              {portal.servicePlans.map((plan) => (
                <div key={plan.id} style={{ border: PORTAL_PANEL_BORDER, borderRadius: 12, padding: "12px 14px", background: "#fff" }}>
                  <div style={{ fontWeight: 600 }}>{plan.name}</div>
                  <div className="muted" style={{ marginTop: 4 }}>
                    {[plan.status, plan.nextRunAt ? `Next run ${formatDateTime(plan.nextRunAt)}` : null, plan.lastRunStatus ? `Last run ${plan.lastRunStatus}` : null]
                      .filter(Boolean)
                      .join(" • ")}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        ) : null}

        {timelineRows.length ? (
          <SectionCard title="Recent progress" eyebrow="Timeline">
            <div style={{ display: 'grid', gap: 8 }}>
              {timelineRows.map((item) => (
                <div key={item.key} style={{ padding: '12px 14px', border: PORTAL_PANEL_BORDER, borderRadius: 12, background: '#fff' }}>
                  <div style={{ fontWeight: 600 }}>{item.title}</div>
                  <div className="muted" style={{ marginTop: 4 }}>{item.subtitle}</div>
                </div>
              ))}
            </div>
          </SectionCard>
        ) : null}

        <p className="muted" data-testid="public-portal-next-step" style={{ marginTop: 14 }}>{nextStepMessage}</p>

        {error && <p data-testid="public-portal-error" role="alert" style={{ color: PORTAL_ERROR_TEXT, marginTop: 12 }}>{error}</p>}
        {status && <p aria-live="polite" data-testid="public-portal-status" role="status" style={{ color: PORTAL_SUCCESS_TEXT, marginTop: 12 }}>{status}</p>}

        <StepCard
          title="Approval"
          description={declined ? 'This job is currently declined.' : 'Confirm the scope before work is accepted.'}
          done={approvalDone}
          enabled={true}
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
            <button className="button" data-testid="public-portal-approve" type="button" onClick={approve} disabled={pendingAction !== ''} style={{ width: '100%', minHeight: 46 }}>
              {pendingAction === 'approve' ? 'Approving...' : 'Approve Job'}
            </button>
            {marketplaceEnabled ? (
              <button className="button secondary" data-testid="public-portal-decline" type="button" onClick={decline} disabled={pendingAction !== ''} style={{ width: '100%', minHeight: 46 }}>
                {pendingAction === 'decline' ? 'Declining...' : 'Decline Job'}
              </button>
            ) : null}
          </div>
        </StepCard>

        <StepCard
          title="Customer signature"
          description={
            step3Enabled
              ? 'Add your signature to confirm the approved work.'
              : declined
                ? 'Signing is unavailable while this job is declined.'
                : 'Approval is required before signing.'
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
            onPointerDown={(e) => {
              const p = getCanvasPos(e.clientX, e.clientY);
              startDraw(p.x, p.y, e.pointerId);
            }}
            onPointerUp={(e) => stopDraw(e.pointerId)}
            onPointerLeave={(e) => stopDraw(e.pointerId)}
            onPointerCancel={(e) => stopDraw(e.pointerId)}
            onPointerMove={(e) => {
              const p = getCanvasPos(e.clientX, e.clientY);
              continueDraw(p.x, p.y);
            }}
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
          title="Payment"
          description={
            step4Enabled
              ? portal?.summary?.invoiceOverdue
                ? 'Your invoice is overdue. Contact the team if anything is unclear.'
                : dueTime
                  ? `The current invoice is due by ${dueTime}.`
                  : 'The business will confirm payment here after their payment provider updates them.'
              : 'Complete signing first.'
          }
          done={step4Done}
          enabled={step4Enabled}
          summary={step4Done ? paymentSummary : null}
        >
          {paid ? (
            <p style={{ fontSize: 24, fontWeight: 800, color: '#7ff3b0', margin: 0 }}>Payment complete</p>
          ) : paymentsConfigured ? (
            <div style={{ display: 'grid', gap: 10 }}>
              {portal?.summary?.billingState ? (
                <p className="muted" style={{ margin: 0 }}>
                  Billing: {humanizeUnderscoreLabel(portal.summary.billingState)}
                </p>
              ) : null}
              <p className="muted" style={{ margin: 0 }}>The business payment provider handles customer payment collection. MyTitan billing is separate from customer payments.</p>
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              {portal?.enabled && portal?.paymentsEnabled
                ? 'Customer payments are handled by the business payment setup. Contact the team if you need payment help.'
                : 'Customer payments are not enabled for this job.'}
            </p>
          )}
        </StepCard>

        <StepCard
          title="Service summary PDF"
          description={
            step5Enabled
              ? pdfReady
                ? 'Download your service summary.'
                : 'Your summary PDF is still being prepared. Please check back shortly.'
              : paymentsConfigured
                ? 'Payment is required before the download unlocks.'
                : 'Complete signing first to unlock the summary.'
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
            Download service summary PDF
          </a>
        </StepCard>

        <SectionCard title="Support" eyebrow="Need help?">
          <DetailRows
            rows={[
              { label: 'Email', value: <a href={`mailto:${supportEmail}`}>{supportEmail}</a> },
              {
                label: 'WhatsApp',
                value: hasTenantPhone
                  ? <a href={`https://wa.me/${tenantPhoneSanitized}`} target="_blank" rel="noreferrer">Message us</a>
                  : 'WhatsApp support is not available for this tenant.',
              },
            ]}
            columns={2}
          />
        </SectionCard>
      </div>
    </div>
  );
}
