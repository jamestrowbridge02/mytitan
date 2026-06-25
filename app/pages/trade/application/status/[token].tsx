import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getApiBase } from '../../../../lib/api';

const API_BASE = getApiBase();

export default function TradeApplicationStatusPage() {
  const router = useRouter();
  const token = String(router.query.token || '');
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/public/trade/application-status/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.message || 'Application not found.');
        setStatus(body);
      })
      .catch((nextError) => setError(nextError.message));
  }, [token]);
  return (
    <main className="container" style={{ maxWidth: 720, paddingTop: 48 }}>
      <section className="card">
        <h1>Trade account application</h1>
        {error ? <p role="alert">{error}</p> : null}
        {status ? (
          <>
            <h2>{status.businessName}</h2>
            <p><strong>Status:</strong> {String(status.status).toLowerCase().replaceAll('_', ' ')}</p>
            {status.reviewNote ? <p>{status.reviewNote}</p> : <p className="muted">The business will update this page after reviewing your application.</p>}
          </>
        ) : null}
      </section>
    </main>
  );
}
