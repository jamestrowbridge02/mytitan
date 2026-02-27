import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { getApiBase } from '../../../lib/api';
import { isMarketplaceEnabled } from '../../../lib/feature-flags';

const API_BASE = getApiBase();

export default function PublicJobPortal() {
  const router = useRouter();
  const { token, session_id } = router.query;
  const [job, setJob] = useState<any>(null);
  const [media, setMedia] = useState<any[]>([]);
  const [portal, setPortal] = useState<any>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [signatureName, setSignatureName] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const marketplaceEnabled = isMarketplaceEnabled();

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/public/job/${token}`)
      .then((res) => res.json())
      .then((data) => {
        setJob(data.job);
        setMedia(data.media || []);
        setPortal(data.portal || null);
      })
      .catch(() => setError('Failed to load job'));
  }, [token]);

  useEffect(() => {
    if (!token || !session_id || !marketplaceEnabled) return;
    fetch(`${API_BASE}/public/job/${token}/payment-status?session_id=${session_id}`)
      .then((res) => res.json())
      .then((data) => {
        setPaymentStatus(data.status || 'unknown');
        setReceiptUrl(data.receiptUrl || null);
      })
      .catch(() => setPaymentStatus('unknown'));
  }, [token, session_id, marketplaceEnabled]);

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    drawingRef.current = true;
    draw(e);
  };

  const endDraw = () => {
    drawingRef.current = false;
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111';
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
  };

  async function approve() {
    setError('');
    setStatus('');
    try {
      await fetch(`${API_BASE}/public/job/${token}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: signatureName || undefined }),
      });
      setStatus('Approved.');
    } catch {
      setError('Approval failed');
    }
  }

  async function decline() {
    setError('');
    setStatus('');
    try {
      await fetch(`${API_BASE}/public/job/${token}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: signatureName || undefined, reason: declineReason || undefined }),
      });
      setStatus('Declined.');
    } catch {
      setError('Decline failed');
    }
  }

  async function sign() {
    setError('');
    setStatus('');
    try {
      const dataUrl = canvasRef.current?.toDataURL('image/png');
      await fetch(`${API_BASE}/public/job/${token}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: signatureName || undefined, signatureDataUrl: dataUrl }),
      });
      setStatus('Signature saved.');
    } catch {
      setError('Signature failed');
    }
  }

  async function pay() {
    setError('');
    setStatus('');
    try {
      const res = await fetch(`${API_BASE}/public/job/${token}/checkout`, { method: 'POST' });
      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      setError('Payment is not available');
    } catch {
      setError('Payment failed to start');
    }
  }

  if (!job && !error) {
    return <div className="container">Loading...</div>;
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Customer portal</h1>
        {error && <p style={{ color: '#ff8a8a' }}>{error}</p>}
        {status && <p style={{ color: '#7bdba5' }}>{status}</p>}

        {job && (
          <>
            <p className="muted">Job: {job.jobRef}</p>
            <p><strong>Customer:</strong> {job.customerName}</p>
            <p><strong>Vehicle:</strong> {job.vehicleMake} {job.vehicleModel} {job.vehicleReg}</p>
            <p><strong>Total:</strong> {job.currency} {(job.totalCents / 100).toFixed(2)}</p>

            <div className="list" style={{ marginTop: 16 }}>
              {media.map((item) => (
                <div key={item.id} className="card" style={{ padding: 12 }}>
                  <p className="muted">{item.type}</p>
                  <img src={item.url} alt={item.type} style={{ maxWidth: '100%', borderRadius: 8 }} />
                </div>
              ))}
            </div>

            {job.invoicePdfUrl && (
              <p style={{ marginTop: 16 }}>
                <a href={job.invoicePdfUrl} target="_blank" rel="noreferrer">Download Invoice PDF</a>
              </p>
            )}

            <div className="card" style={{ padding: 16, marginTop: 16 }}>
              <h3>1) Approve or decline</h3>
              <label>Name</label>
              <input className="input" value={signatureName} onChange={(e) => setSignatureName(e.target.value)} />

              <label>Decline reason (optional)</label>
              <input className="input" value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} />

              <div style={{ marginTop: 8 }}>
                <button className="button" type="button" onClick={approve} style={{ marginRight: 8 }}>
                  Approve Job
                </button>
                {marketplaceEnabled ? (
                  <button className="button secondary" type="button" onClick={decline}>
                    Decline Job
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
                onMouseDown={startDraw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onMouseMove={draw}
              />
              <div style={{ marginTop: 8 }}>
                <button className="button secondary" type="button" onClick={clearCanvas} style={{ marginRight: 8 }}>
                  Clear
                </button>
                <button className="button" type="button" onClick={sign}>
                  Save Signature
                </button>
              </div>
            </div>

            <div className="card" style={{ padding: 16, marginTop: 16 }}>
              <h3>3) Pay</h3>
              {portal?.enabled && portal?.paymentsEnabled && portal?.stripeConfigured && marketplaceEnabled ? (
                <button className="button" type="button" onClick={pay}>
                  Pay securely
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
