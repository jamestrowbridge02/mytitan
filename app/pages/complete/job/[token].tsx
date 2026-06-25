import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { OperatorStatusBadge } from '../../../components/ui/operator-page';
import { getApiBase } from '../../../lib/api';

type ChecklistItem = {
  key: string;
  label: string;
  completed: boolean;
  note?: string | null;
};

export default function JobCompletionQuickLinkPage() {
  const router = useRouter();
  const token = typeof router.query.token === 'string' ? router.query.token : '';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [payload, setPayload] = useState<any>(null);
  const [summary, setSummary] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [signatureName, setSignatureName] = useState('');
  const [signatureDirty, setSignatureDirty] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${getApiBase()}/public/job-completion/${token}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message || 'Could not open this completion link');
        setPayload(data);
        setSummary(String(data?.execution?.record?.summary || ''));
        setCompletionNotes(String(data?.execution?.record?.notesJson?.completionNotes || ''));
        const seededChecklist = Array.isArray(data?.execution?.record?.checklist) && data.execution.record.checklist.length
          ? data.execution.record.checklist
          : Array.isArray(data?.execution?.checklistTemplate)
            ? data.execution.checklistTemplate
            : [];
        setChecklist(seededChecklist.map((item: any, index: number) => ({
          key: String(item?.key || `checklist_${index + 1}`),
          label: String(item?.label || `Checklist item ${index + 1}`),
          completed: Boolean(item?.completed),
          note: item?.note || '',
        })));
      } catch (err: any) {
        setError(err?.message || 'Could not open this completion link');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [token]);

  const completionStatus = useMemo(() => payload?.execution?.record?.status || 'Not started', [payload]);
  const linkStateLabel = useMemo(() => {
    if (payload?.link?.revokedAt) return 'Revoked';
    if (payload?.link?.expiresAt && new Date(payload.link.expiresAt).getTime() < Date.now()) return 'Expired';
    return 'Active';
  }, [payload?.link?.expiresAt, payload?.link?.revokedAt]);

  function getCanvasPoint(event: PointerEvent | React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function ensureCanvasReady() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    return ctx;
  }

  function beginDraw(event: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = ensureCanvasReady();
    const point = getCanvasPoint(event);
    if (!ctx || !point) return;
    drawingRef.current = true;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  }

  function moveDraw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = ensureCanvasReady();
    const point = getCanvasPoint(event);
    if (!ctx || !point) return;
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    setSignatureDirty(true);
  }

  function endDraw() {
    drawingRef.current = false;
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDirty(false);
  }

  async function saveProgress() {
    if (!token) return;
    setSaving('save');
    setError('');
    setInfo('');
    try {
      const res = await fetch(`${getApiBase()}/public/job-completion/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary,
          checklist,
          notesJson: { completionNotes },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Could not save progress');
      setPayload((current: any) => ({
        ...(current || {}),
        execution: {
          ...(current?.execution || {}),
          record: data,
        },
      }));
      setInfo('Progress saved on the live job record.');
    } catch (err: any) {
      setError(err?.message || 'Could not save progress');
    } finally {
      setSaving('');
    }
  }

  async function submitCompletion() {
    if (!token) return;
    setSaving('submit');
    setError('');
    setInfo('');
    try {
      const signatureDataUrl = signatureDirty && canvasRef.current ? canvasRef.current.toDataURL('image/png') : undefined;
      const res = await fetch(`${getApiBase()}/public/job-completion/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary,
          checklist,
          notesJson: { completionNotes },
          evidenceNote: evidenceNote || undefined,
          signatureName: signatureName || undefined,
          signatureDataUrl,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Could not submit completion');
      setPayload((current: any) => ({
        ...(current || {}),
        execution: {
          ...(current?.execution || {}),
          record: data,
        },
      }));
      setEvidenceNote('');
      setInfo('Completion submitted to the main job sheet.');
    } catch (err: any) {
      setError(err?.message || 'Could not submit completion');
    } finally {
      setSaving('');
    }
  }

  if (loading) {
    return <main className="operator-stack" style={{ maxWidth: 960, margin: '0 auto', padding: '48px 20px' }}><p className="muted">Opening completion link...</p></main>;
  }

  if (error && !payload) {
    return <main className="operator-stack" style={{ maxWidth: 960, margin: '0 auto', padding: '48px 20px' }}><p>{error}</p></main>;
  }

  return (
    <main className="operator-stack quicklink-shell" style={{ maxWidth: 960, margin: '0 auto', padding: '32px 20px 64px' }}>
      <section className="card operator-section quicklink-page" data-testid="job-completion-quick-link-page">
        <div className="operator-section__header">
          <div>
            <p className="muted" style={{ marginBottom: 8 }}>Finish this job sheet only</p>
            <h1 className="operator-section__title" style={{ marginBottom: 8 }}>{payload?.job?.jobRef || 'Job completion'}</h1>
            <p className="operator-section__subtitle">
              This link is limited to checklist completion, notes, proof, and sign-off for this job sheet. It does not open the rest of the workspace.
            </p>
          </div>
        </div>

        <div className="quicklink-page__hero">
          <section className="quicklink-panel quicklink-panel--revenue quicklink-page__metaCard">
            <div className="quicklink-panel__header">
              <div className="quicklink-heading">
                <span className="quicklink-icon" aria-hidden="true">✓</span>
                <div>
                  <strong>{payload?.job?.customerName || 'Customer'}</strong>
                  <p className="muted" style={{ margin: '4px 0 0 0' }}>
                    {payload?.job?.serviceName || 'Service work'}{payload?.job?.vehicleLabel ? ` • ${payload.job.vehicleLabel}` : ''}
                  </p>
                </div>
              </div>
              <OperatorStatusBadge label={String(completionStatus)} tone={completionStatus === 'SUBMITTED' ? 'success' : 'warning'} />
            </div>
            <p className="muted" style={{ margin: 0 }}>
              This completion flow stays scoped to checklist completion, notes, proof, and sign-off only.
            </p>
          </section>

          <section className={`quicklink-panel quicklink-page__statusCard ${linkStateLabel === 'Active' ? 'quicklink-panel--success' : 'quicklink-panel--critical'}`}>
            <div className="quicklink-panel__header">
              <div className="quicklink-heading">
                <span className="quicklink-icon" aria-hidden="true">↗</span>
                <div>
                  <strong>Quick link status</strong>
                  <p className="muted" style={{ margin: '4px 0 0 0' }}>This public link never opens the rest of the workspace.</p>
                </div>
              </div>
              <OperatorStatusBadge label={linkStateLabel} tone={linkStateLabel === 'Active' ? 'success' : 'critical'} />
            </div>
            <p className="muted" style={{ margin: 0 }}>
              {payload?.link?.expiresAt ? `Expires ${new Date(payload.link.expiresAt).toLocaleString()}` : 'No expiry information is available.'}
            </p>
          </section>
        </div>

        {info ? <p className="muted billing-page-shell__notice billing-page-shell__notice--success">{info}</p> : null}
        {error ? <p className="muted billing-page-shell__notice billing-page-shell__notice--error">{error}</p> : null}

        <div className="quicklink-form-grid">
          <div className="quicklink-field">
            <label className="jobs-new-label">Work summary</label>
            <textarea className="input" value={summary} onChange={(event) => setSummary(event.target.value)} rows={4} data-testid="job-completion-summary" />
          </div>

          <div data-testid="job-completion-checklist" className="quicklink-checklist">
            {checklist.map((item, index) => (
              <div key={item.key} className={`quicklink-panel quicklink-checklist__item ${item.completed ? 'quicklink-panel--success' : 'quicklink-panel--warning'}`}>
                <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={item.completed}
                    onChange={(event) => {
                      const next = [...checklist];
                      next[index] = { ...item, completed: event.target.checked };
                      setChecklist(next);
                    }}
                  />
                  <strong>{item.label}</strong>
                </label>
                <input
                  className="input"
                  value={item.note || ''}
                  onChange={(event) => {
                    const next = [...checklist];
                    next[index] = { ...item, note: event.target.value };
                    setChecklist(next);
                  }}
                  placeholder="Optional note"
                />
              </div>
            ))}
          </div>

          <div className="quicklink-summary-grid">
            <section className="quicklink-panel quicklink-panel--info">
              <div className="quicklink-panel__header">
                <div className="quicklink-heading">
                  <span className="quicklink-icon" aria-hidden="true">✎</span>
                  <strong>Completion notes</strong>
                </div>
                <OperatorStatusBadge label="Scoped notes" tone="info" compact />
              </div>
              <textarea className="input" value={completionNotes} onChange={(event) => setCompletionNotes(event.target.value)} rows={4} data-testid="job-completion-notes" />
            </section>

            <section className="quicklink-panel quicklink-panel--attention">
              <div className="quicklink-panel__header">
                <div className="quicklink-heading">
                  <span className="quicklink-icon" aria-hidden="true">!</span>
                  <strong>Proof note</strong>
                </div>
                <OperatorStatusBadge label="Handoff proof" tone="warning" compact />
              </div>
              <input className="input" value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} placeholder="Add a short proof or handoff note" data-testid="job-completion-evidence-note" />
            </section>
          </div>

          <section className="quicklink-panel quicklink-panel--neutral">
            <div className="quicklink-panel__header">
              <div className="quicklink-heading">
                <span className="quicklink-icon" aria-hidden="true">✍</span>
                <strong>Technician sign-off</strong>
              </div>
              <OperatorStatusBadge label={signatureDirty ? 'Signature ready' : 'Optional'} tone={signatureDirty ? 'success' : 'neutral'} />
            </div>
            <div className="quicklink-field">
              <label className="jobs-new-label">Name for the sign-off</label>
              <input className="input" value={signatureName} onChange={(event) => setSignatureName(event.target.value)} placeholder="Name for the sign-off" data-testid="job-completion-signature-name" />
            </div>
            <canvas
              ref={canvasRef}
              width={640}
              height={220}
              className="signature-pad quicklink-signaturePad"
              data-testid="job-completion-signature-pad"
              onPointerDown={beginDraw}
              onPointerMove={moveDraw}
              onPointerUp={endDraw}
              onPointerLeave={endDraw}
            />
            <div className="quicklink-row">
              <button className="button secondary" type="button" onClick={clearSignature}>Clear signature</button>
              <span className="muted">{signatureDirty ? 'Signature ready to submit' : 'Add a signature if this handoff needs sign-off.'}</span>
            </div>
          </section>

          <div className="quicklink-row">
            <button className="button secondary" type="button" onClick={() => void saveProgress()} disabled={saving !== ''} data-testid="job-completion-save">
              {saving === 'save' ? 'Saving...' : 'Save progress'}
            </button>
            <button className="button" type="button" onClick={() => void submitCompletion()} disabled={saving !== ''} data-testid="job-completion-submit">
              {saving === 'submit' ? 'Submitting...' : 'Submit completion'}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
