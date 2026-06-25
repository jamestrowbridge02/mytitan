import { useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/router';
import { getApiBase } from '../../../lib/api';

const API_BASE = getApiBase();

export default function TradePortalPage() {
  const router = useRouter();
  const token = String(router.query.token || '');
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/public/trade/portal/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.message || 'Portal link is invalid or expired.');
        setData(body);
      })
      .catch((nextError) => setError(nextError.message));
  }, [token]);
  const money = (cents: number, currency = 'GBP') => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format((cents || 0) / 100);
  return (
    <main className="container" style={{ maxWidth: 980, paddingTop: 28, paddingBottom: 48, '--brand-600': data?.tenant?.primaryColor || '#2563eb' } as CSSProperties}>
      <section className="card">
        {data?.tenant?.logoUrl ? <img src={data.tenant.logoUrl} alt="" style={{ width: 220, height: 84, objectFit: 'contain' }} /> : <strong>{data?.tenant?.name || 'Trade portal'}</strong>}
        <h1>{data?.account?.name || 'Trade account'}</h1>
        {error ? <p role="alert">{error}</p> : null}
        {data ? (
          <div className="operator-stack">
            <section><h2>Trade services</h2>{data.services.length ? data.services.map((service: any) => <article className="integration-card" key={service.id}><strong>{service.name}</strong><span>{service.description || ''}</span></article>) : <p className="muted">No trade-only services are currently available.</p>}</section>
            <section><h2>Service locations</h2>{data.account.locations.map((location: any) => <article className="integration-card" key={location.id}><strong>{location.name}</strong><span>{[location.addressLine1, location.city, location.postcode].filter(Boolean).join(', ')}</span></article>)}</section>
            <section><h2>Booking and work history</h2>{data.jobs.map((job: any) => <article className="integration-card" key={job.id}><strong>{job.jobRef} · {job.serviceName}</strong><span>{job.status}{job.invoiceNumber ? ` · Invoice ${job.invoiceNumber}` : ''}</span></article>)}</section>
            <section><h2>Statements</h2>{data.statements.map((statement: any) => <article className="integration-card" key={statement.id}><strong>{statement.reference}</strong><span>{money(statement.openBalanceCents, statement.currency)} open · {statement.status}</span></article>)}</section>
          </div>
        ) : null}
      </section>
    </main>
  );
}
