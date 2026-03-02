import React from 'react';

type DevMe = {
  ok: boolean;
  user: { email: string | null; companyId: string | null };
  company: unknown;
  subscription: unknown;
  billing: { mode: string; allowlistEmails: string[] };
};

export default function DevAdminPage() {
  const [data, setData] = React.useState<DevMe | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const base = process.env.NEXT_PUBLIC_API_BASE_URL || '';
        const res = await fetch(`${base}/admin/dev/me`, { credentials: 'include' });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        }
        const json = (await res.json()) as DevMe;
        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ marginTop: 0 }}>Developer Admin</h1>
      {loading ? <div>Loading...</div> : null}
      {err ? (
        <div style={{ color: 'var(--danger)' }}>
          <strong>Error:</strong> {err}
        </div>
      ) : null}
      {data ? (
        <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(data, null, 2)}</pre>
      ) : null}
    </main>
  );
}
