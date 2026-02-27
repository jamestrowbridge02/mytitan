import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardShell } from '../../../components/dashboard-shell';
import { apiFetch } from '../../../lib/api';
import { isCrmProV1Enabled } from '../../../lib/feature-flags';

function money(cents: number, currency = 'GBP') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format((cents || 0) / 100);
}

type NextActionType = 'CALL' | 'EMAIL' | 'WHATSAPP' | 'FOLLOW_UP' | 'MEETING';

export default function TradeAccountProfilePage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const crmProEnabled = isCrmProV1Enabled();
  const [data, setData] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [noteText, setNoteText] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [draftState, setDraftState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [nextActionType, setNextActionType] = useState<NextActionType | ''>('');
  const [nextActionDueAt, setNextActionDueAt] = useState('');
  const [nextActionUserId, setNextActionUserId] = useState('');

  const localDraftKey = useMemo(() => `mytitan_crm_draft_${id}`, [id]);

  async function load() {
    if (!id) return;
    setError('');
    try {
      const [accountPayload, timelinePayload, crmDraft] = await Promise.all([
        crmProEnabled ? apiFetch(`/crm/accounts/${id}/full`) : apiFetch(`/trade-accounts/${id}`),
        crmProEnabled ? Promise.resolve(null) : apiFetch(`/trade-accounts/${id}/timeline?page=1&pageSize=25`),
        apiFetch('/drafts/latest?kind=crm_note').catch(() => null),
      ]);
      setData(accountPayload);
      setTimeline(crmProEnabled
        ? (Array.isArray(accountPayload?.timeline) ? accountPayload.timeline : [])
        : (Array.isArray(timelinePayload?.timeline) ? timelinePayload.timeline : []));
      const account = accountPayload?.account || accountPayload || {};
      setNextActionType(account.nextActionType || '');
      setNextActionDueAt(account.nextActionDueAt ? String(account.nextActionDueAt).slice(0, 10) : '');
      setNextActionUserId(account.nextActionUserId || '');
      if (crmDraft?.tradeAccountId === id && crmDraft?.payload?.noteText) {
        setNoteText(String(crmDraft.payload.noteText));
      } else if (typeof window !== 'undefined') {
        const fallback = window.localStorage.getItem(localDraftKey);
        if (fallback) setNoteText(fallback);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load account profile');
    }
  }

  useEffect(() => {
    load();
  }, [id, crmProEnabled]);

  useEffect(() => {
    if (!id) return;
    const timer = setTimeout(async () => {
      try {
        setDraftState('saving');
        await apiFetch('/drafts/crm-note', {
          method: 'PUT',
          body: JSON.stringify({
            tradeAccountId: id,
            payload: {
              noteText,
              nextActionType,
              nextActionDueAt,
              nextActionUserId,
            },
          }),
        });
        setDraftState('saved');
      } catch {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(localDraftKey, noteText);
        }
        setDraftState('saved');
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [id, noteText, nextActionType, nextActionDueAt, nextActionUserId, localDraftKey]);

  async function saveNextAction() {
    setStatus('');
    setError('');
    try {
      await apiFetch(`/trade-accounts/${id}/next-action`, {
        method: 'PATCH',
        body: JSON.stringify({
          type: nextActionType || null,
          dueAt: nextActionDueAt ? new Date(`${nextActionDueAt}T12:00:00Z`).toISOString() : null,
          assignedUserId: nextActionUserId || null,
        }),
      });
      setStatus('Next action saved');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to save next action');
    }
  }

  async function addNote() {
    if (!noteText.trim()) return;
    setStatus('');
    setError('');
    try {
      await apiFetch(`/trade-accounts/${id}/notes`, {
        method: 'POST',
        body: JSON.stringify({
          body: noteText.trim(),
          attachmentsMeta: {},
        }),
      });
      setNoteText('');
      if (typeof window !== 'undefined') window.localStorage.removeItem(localDraftKey);
      setStatus('Note added');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to add note');
    }
  }

  const account = data?.account || data || {};
  const summary = data?.summary || data?.financialSummary || { unpaidCount: 0, unpaidTotalCents: 0, paidTotalCents: 0 };
  const crmNotes = Array.isArray(data?.notes) ? data.notes : [];
  const crmTasks = Array.isArray(data?.tasks) ? data.tasks : [];
  const crmTags = Array.isArray(data?.tags) ? data.tags : [];
  const crmAttachments = Array.isArray(data?.attachments) ? data.attachments : [];

  return (
    <DashboardShell>
      <div className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ marginTop: 0 }}>{account.name || 'Trade account'}</h1>
        <p className="muted">
          {account.contactName || 'No contact'} • {account.contactEmail || 'No email'} • {account.contactPhone || 'No phone'}
        </p>
        <div className="pill-row">
          <span className="badge">{account.status || 'ACTIVE'}</span>
          <span className="badge">Unpaid {money(Number(summary.unpaidTotalCents || 0))}</span>
          <span className="badge">Paid {money(Number(summary.paidTotalCents || 0))}</span>
        </div>
        {error ? <p style={{ color: '#ff8a8a' }}>{error}</p> : null}
        {status ? <p style={{ color: '#5eead4' }}>{status}</p> : null}
      </div>

      {crmProEnabled ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>CRM Pro</h2>
          <p className="muted">Profile header, financial summary, timeline, notes, tasks, attachments, tags, quick actions.</p>
          <div className="pill-row">
            {crmTags.map((tag: any) => <span className="badge" key={tag.id || tag.label}>{tag.label || tag.name}</span>)}
            {crmTags.length === 0 ? <span className="muted">No tags</span> : null}
          </div>
          <p className="muted">Tasks: {crmTasks.length} • Notes: {crmNotes.length} • Attachments: {crmAttachments.length}</p>
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Quick Actions</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          <a className="button" href={`/dashboard/jobs/new?tradeAccountId=${id}&customerName=${encodeURIComponent(account.name || '')}&customerEmail=${encodeURIComponent(account.contactEmail || '')}&customerPhone=${encodeURIComponent(account.contactPhone || '')}`}>Create Job</a>
          <a className="button secondary" href={`/dashboard/booking/calendar?tradeAccountId=${id}&customerName=${encodeURIComponent(account.name || '')}&customerEmail=${encodeURIComponent(account.contactEmail || '')}&customerPhone=${encodeURIComponent(account.contactPhone || '')}`}>Create Booking</a>
          {account.contactPhone ? <a className="button secondary" href={`https://wa.me/${String(account.contactPhone).replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer">WhatsApp</a> : null}
          {account.contactEmail ? <a className="button secondary" href={`mailto:${account.contactEmail}`}>Email</a> : null}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Next Action</h2>
        <label>Type</label>
        <select className="input" value={nextActionType} onChange={(e) => setNextActionType(e.target.value as NextActionType | '')}>
          <option value="">None</option>
          <option value="CALL">Call</option>
          <option value="EMAIL">Email</option>
          <option value="WHATSAPP">WhatsApp</option>
          <option value="FOLLOW_UP">Follow up</option>
          <option value="MEETING">Meeting</option>
        </select>
        <label>Due date</label>
        <input className="input" type="date" value={nextActionDueAt} onChange={(e) => setNextActionDueAt(e.target.value)} />
        <label>Assigned user id</label>
        <input className="input" value={nextActionUserId} onChange={(e) => setNextActionUserId(e.target.value)} placeholder="Optional user id" />
        <button className="button" type="button" onClick={saveNextAction}>Save Next Action</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Notes</h2>
        <p className="muted">Use @name for mentions. Draft autosaves automatically.</p>
        <textarea className="input" rows={5} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add a note..." />
        <p className="muted" style={{ marginTop: -8 }}>
          Draft: {draftState === 'saving' ? 'Saving...' : draftState === 'saved' ? 'Saved' : 'Idle'}
        </p>
        <button className="button" type="button" onClick={addNote}>Add note</button>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Timeline</h2>
        <div className="list">
          {timeline.map((entry: any, index: number) => (
            <div key={`${entry.type}-${index}`} className="integration-card" style={{ alignItems: 'flex-start' }}>
              <div>
                <strong style={{ textTransform: 'capitalize' }}>{entry.type}</strong>
                <p className="muted" style={{ margin: '4px 0' }}>{new Date(entry.createdAt).toLocaleString()}</p>
                <p style={{ margin: 0 }}>
                  {entry.type === 'note' ? entry.data?.body : entry.type === 'job' ? entry.data?.jobRef : entry.type === 'booking' ? entry.data?.customerName : entry.type === 'payment' ? `Paid ${money(Number(entry.data?.totalCents || 0))}` : entry.data?.message}
                </p>
              </div>
            </div>
          ))}
          {timeline.length === 0 ? <p className="muted">No timeline activity yet.</p> : null}
        </div>
      </div>
    </DashboardShell>
  );
}
