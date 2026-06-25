import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { DashboardShell } from '../../components/dashboard-shell';
import { apiFetch } from '../../lib/api';
import { isGuidedEverywhereV1Enabled } from '../../lib/feature-flags';

function HelpTip({ text }: { text: string }) {
  return <span title={text} style={{ marginLeft: 6, cursor: 'help' }}>?</span>;
}

function openExternal(url: string) {
  if (typeof window === "undefined" || !url || url === "#") return;
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function GuidedEverywherePage() {
  const enabled = isGuidedEverywhereV1Enabled();
  const router = useRouter();
  const action = typeof router.query.action === 'string' ? router.query.action : 'create_job';
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [booking, setBooking] = useState<any>({ customerName: '', startsAt: '', endsAt: '' });
  const [message, setMessage] = useState<any>({ customerName: '', phone: '', email: '', note: '' });
  const [inventory, setInventory] = useState<any>({ stockItemId: '', jobId: '', qty: 1, poId: '' });

  const actions = useMemo(
    () => [
      { key: 'create_job', label: 'Create job' },
      { key: 'book_appointment', label: 'Book appointment' },
      { key: 'take_payment', label: 'Take payment' },
      { key: 'order_parts', label: 'Order parts' },
      { key: 'message_customer', label: 'Message customer' },
    ],
    [],
  );

  async function createBooking() {
    setError('');
    setStatus('');
    try {
      await apiFetch('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          customerName: booking.customerName || undefined,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
        }),
      });
      setStatus('Appointment booked');
    } catch (err: any) {
      setError(err?.message || 'Failed to create booking');
    }
  }

  async function receivePo() {
    setError('');
    setStatus('');
    if (!inventory.poId) return;
    try {
      await apiFetch(`/inventory/purchase-orders/${inventory.poId}/receive`, { method: 'POST' });
      setStatus('PO received');
    } catch (err: any) {
      setError(err?.message || 'Failed to receive PO');
    }
  }

  async function allocateToJob() {
    setError('');
    setStatus('');
    try {
      await apiFetch(`/inventory/items/${inventory.stockItemId}/allocate-to-job`, {
        method: 'POST',
        body: JSON.stringify({ jobId: inventory.jobId, qty: Number(inventory.qty || 1) }),
      });
      setStatus('Allocated to job');
    } catch (err: any) {
      setError(err?.message || 'Failed to allocate to job');
    }
  }

  function whatsappHref() {
    const clean = String(message.phone || '').replace(/[^\d]/g, '');
    const body = encodeURIComponent(`Hi ${message.customerName || ''}, ${message.note || ''}`.trim());
    return clean ? `https://wa.me/${clean}?text=${body}` : '#';
  }

  function emailHref() {
    const subject = encodeURIComponent('Update from MyTitan');
    const body = encodeURIComponent(`Hi ${message.customerName || ''},\n\n${message.note || ''}`);
    return message.email ? `mailto:${message.email}?subject=${subject}&body=${body}` : '#';
  }

  if (!enabled) {
    return (
      <DashboardShell>
        <div className="card"><h1>Guided Launcher</h1><p className="muted">Feature is disabled.</p></div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ marginTop: 0 }}>What do you want to do?</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
          {actions.map((item) => (
            <Link key={item.key} className={`button ${item.key === action ? '' : 'secondary'}`} href={`/dashboard/guided?action=${item.key}`}>{item.label}</Link>
          ))}
        </div>
        {status ? <p style={{ color: '#5eead4' }}>{status}</p> : null}
        {error ? <p style={{ color: '#ff8a8a' }}>{error}</p> : null}
      </div>

      {action === 'create_job' ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Guided create job</h2>
          <p className="muted">Step 1: choose trade workflow <HelpTip text="Wheels uses your existing guided flow. Other trades use a minimal stub and stay functional." /></p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link className="button" href="/dashboard/jobs/new?guided=1&resumeTrade=WHEELS">Start Wheels flow</Link>
            <Link className="button secondary" href="/dashboard/jobs/new">Start standard job</Link>
            <Link className="button secondary" href="/dashboard">Skip</Link>
          </div>
        </div>
      ) : null}

      {action === 'book_appointment' ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Guided booking setup</h2>
          <label>Customer name<HelpTip text="Optional for first pass. You can add details later." /></label>
          <input className="input" value={booking.customerName} onChange={(e) => setBooking({ ...booking, customerName: e.target.value })} />
          <label>Start time (ISO)<HelpTip text="Use local datetime converted to ISO format." /></label>
          <input className="input" placeholder="2026-03-01T10:00:00.000Z" value={booking.startsAt} onChange={(e) => setBooking({ ...booking, startsAt: e.target.value })} />
          <label>End time (ISO)</label>
          <input className="input" placeholder="2026-03-01T10:30:00.000Z" value={booking.endsAt} onChange={(e) => setBooking({ ...booking, endsAt: e.target.value })} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="button" type="button" onClick={createBooking}>Book now</button>
            <Link className="button secondary" href="/dashboard/bookings">Open full booking setup</Link>
            <Link className="button secondary" href="/dashboard">Skip</Link>
          </div>
        </div>
      ) : null}

      {action === 'take_payment' ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Take payment</h2>
          <p className="muted">Use billing checkout/portal and job payment links.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link className="button" href="/dashboard/billing">Open billing</Link>
            <Link className="button secondary" href="/dashboard/jobs">Open jobs to share pay link</Link>
            <Link className="button secondary" href="/dashboard">Skip</Link>
          </div>
        </div>
      ) : null}

      {action === 'order_parts' ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Order parts: receive and allocate</h2>
          <label>PO ID to receive<HelpTip text="Paste an existing purchase order id from inventory." /></label>
          <input className="input" value={inventory.poId} onChange={(e) => setInventory({ ...inventory, poId: e.target.value })} />
          <button className="button secondary" type="button" onClick={receivePo}>Receive PO</button>
          <hr style={{ borderColor: '#1f2937', margin: '14px 0' }} />
          <label>Stock item ID</label>
          <input className="input" value={inventory.stockItemId} onChange={(e) => setInventory({ ...inventory, stockItemId: e.target.value })} />
          <label>Job ID</label>
          <input className="input" value={inventory.jobId} onChange={(e) => setInventory({ ...inventory, jobId: e.target.value })} />
          <label>Qty</label>
          <input className="input" type="number" value={inventory.qty} onChange={(e) => setInventory({ ...inventory, qty: Number(e.target.value || 1) })} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="button" type="button" onClick={allocateToJob}>Allocate to job</button>
            <Link className="button secondary" href="/dashboard/inventory">Open inventory dashboard</Link>
            <Link className="button secondary" href="/dashboard">Skip</Link>
          </div>
        </div>
      ) : null}

      {action === 'message_customer' ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Customer message helper</h2>
          <label>Customer name</label>
          <input className="input" value={message.customerName} onChange={(e) => setMessage({ ...message, customerName: e.target.value })} />
          <label>WhatsApp number<HelpTip text="Digits only preferred. Country code required." /></label>
          <input className="input" value={message.phone} onChange={(e) => setMessage({ ...message, phone: e.target.value })} />
          <label>Email</label>
          <input className="input" value={message.email} onChange={(e) => setMessage({ ...message, email: e.target.value })} />
          <label>Message</label>
          <textarea className="input" value={message.note} onChange={(e) => setMessage({ ...message, note: e.target.value })} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="button" type="button" onClick={() => openExternal(whatsappHref())} disabled={!message.phone}>
              Open WhatsApp
            </button>
            <button className="button secondary" type="button" onClick={() => openExternal(emailHref())} disabled={!message.email}>
              Open Email
            </button>
            <Link className="button secondary" href="/dashboard">Skip</Link>
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}
