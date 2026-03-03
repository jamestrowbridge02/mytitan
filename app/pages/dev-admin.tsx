import React from 'react';
import { PageShell } from '../components/layout/page-shell';
import { Skeleton } from '../components/ui/Skeleton';
import { apiFetch, ApiError } from '../lib/api';

type DevMe = {
  ok: boolean;
  user: { email: string | null; companyId: string | null };
  company: { id: string; name: string; timezone: string; currency: string; createdAt: string } | null;
  subscription: any | null;
  billing: { mode: string };
};

type DevHealth = {
  ok: boolean;
  now: string;
  db: { ok: boolean; error?: string };
  redis: { ok: boolean; error?: string };
  queues: { ok: boolean; status: string };
};

type TenantLookupResult = { id: string; name: string; createdAt: string; timezone: string; currency: string };

type DevTenant = {
  ok: boolean;
  error?: string;
  company?: { id: string; name: string; createdAt: string; timezone: string; currency: string };
  settings?: {
    tenantId: string;
    planId: string | null;
    planBillingInterval: string | null;
    bookingsEnabled: boolean | null;
    accountingEnabled: boolean | null;
    paymentsEnabled: boolean | null;
    socialEnabled: boolean | null;
    aiEnabled: boolean | null;
  } | null;
  subscription?: any | null;
  owner?: { id: string; email: string | null; createdAt: string } | null;
  links?: { audit: string; billing: string; settings: string };
};

type DevFlags = {
  ok: boolean;
  envFlags: Record<string, string>;
  tenant: any | null;
};

function formatStatus(ok: boolean) {
  return ok ? 'OK' : 'FAIL';
}

function Panel(props: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section
      style={{
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 14,
        padding: 16,
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 14, letterSpacing: 0.2, opacity: 0.9 }}>{props.title}</h2>
        {props.right ? <div>{props.right}</div> : null}
      </div>
      <div style={{ marginTop: 12 }}>{props.children}</div>
    </section>
  );
}

function CodeBlock({ value }: { value: any }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: 12,
        borderRadius: 12,
        overflow: 'auto',
        background: 'rgba(0,0,0,0.35)',
        border: '1px solid rgba(255,255,255,0.06)',
        fontSize: 12,
        lineHeight: 1.45,
        whiteSpace: 'pre-wrap',
      }}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function DevAdminPage() {
  const [me, setMe] = React.useState<DevMe | null>(null);
  const [health, setHealth] = React.useState<DevHealth | null>(null);
  const [flags, setFlags] = React.useState<DevFlags | null>(null);

  const [q, setQ] = React.useState('');
  const [lookupLoading, setLookupLoading] = React.useState(false);
  const [lookupResults, setLookupResults] = React.useState<TenantLookupResult[]>([]);

  const [selectedTenantId, setSelectedTenantId] = React.useState<string>('');
  const [tenantLoading, setTenantLoading] = React.useState(false);
  const [tenant, setTenant] = React.useState<DevTenant | null>(null);

  const [err, setErr] = React.useState<{ title: string; detail?: string; status?: number } | null>(null);
  const [loading, setLoading] = React.useState(true);

  const handleApiError = (e: unknown) => {
    if (e instanceof ApiError) {
      const status = e.statusCode;
      const title =
        status === 401
          ? 'Unauthorized (401)'
          : status === 403
            ? 'Forbidden (403)'
            : status === 429
              ? 'Rate limited (429)'
              : `Request failed (${status})`;
      const detail = typeof e.message === 'string' ? e.message : 'Request failed';
      setErr({ title, detail, status });
      return;
    }
    setErr({ title: 'Request failed', detail: (e as any)?.message || String(e) });
  };

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const [meJson, healthJson, flagsJson] = await Promise.all([
          apiFetch('/admin/dev/me') as Promise<DevMe>,
          apiFetch('/admin/dev/health') as Promise<DevHealth>,
          apiFetch('/admin/dev/flags') as Promise<DevFlags>,
        ]);

        if (cancelled) return;
        setMe(meJson);
        setHealth(healthJson);
        setFlags(flagsJson);
      } catch (e) {
        if (!cancelled) handleApiError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Tenant lookup (debounced)
  React.useEffect(() => {
    let cancelled = false;
    const query = q.trim();
    if (query.length < 2) {
      setLookupResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        setLookupLoading(true);
        const res = (await apiFetch(`/admin/dev/tenant-lookup?q=${encodeURIComponent(query)}`)) as {
          ok: boolean;
          results: TenantLookupResult[];
        };
        if (cancelled) return;
        setLookupResults(res.results || []);
      } catch (e) {
        if (!cancelled) handleApiError(e);
      } finally {
        if (!cancelled) setLookupLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  const loadTenant = async (tenantId: string) => {
    try {
      setTenantLoading(true);
      setErr(null);
      setSelectedTenantId(tenantId);

      const [tenantJson, flagsJson] = await Promise.all([
        apiFetch(`/admin/dev/tenant/${encodeURIComponent(tenantId)}`) as Promise<DevTenant>,
        apiFetch(`/admin/dev/flags?tenantId=${encodeURIComponent(tenantId)}`) as Promise<DevFlags>,
      ]);

      setTenant(tenantJson);
      setFlags(flagsJson);
    } catch (e) {
      handleApiError(e);
    } finally {
      setTenantLoading(false);
    }
  };

  const showSignIn = err?.status === 401;
  const showDisabled = err?.status === 403 && (err.detail || '').includes('DEV_ADMIN_DISABLED');
  const showForbidden = err?.status === 403 && !showDisabled;

  return (
    <PageShell title="Developer Admin" subtitle="Read-only diagnostics: tenants, flags, billing state, and health.">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, letterSpacing: 0.2 }}>Developer Admin</h1>
          <div style={{ marginTop: 6, opacity: 0.75, fontSize: 13 }}>
            Read-only diagnostics for tenant lookup, feature flags, billing state, and system health.
          </div>
        </div>
        <div style={{ opacity: 0.75, fontSize: 12 }}>
          {me?.user?.email ? <div>Signed in as {me.user.email}</div> : null}
        </div>
      </div>

      {loading ? (
        <div style={{ marginTop: 18, opacity: 0.8 }}>Loading</div>
      ) : null}

      {err ? (
        <div
          style={{
            marginTop: 18,
            padding: 12,
            borderRadius: 12,
            border: '1px solid rgba(255, 0, 0, 0.25)',
            background: 'rgba(255, 0, 0, 0.06)',
          }}
        >
          <div style={{ fontWeight: 700 }}>{err.title}</div>
          {err.detail ? <div style={{ marginTop: 6, opacity: 0.9 }}>{err.detail}</div> : null}

          {showSignIn ? (
            <div style={{ marginTop: 10 }}>
              <a href="/login" style={{ textDecoration: 'underline' }}>
                Sign in
              </a>
            </div>
          ) : null}

          {showDisabled ? (
            <div style={{ marginTop: 10, opacity: 0.9 }}>
              Dev Admin is disabled in this environment. Set <code>MYTITAN_DEV_ADMIN_ENABLED=on</code> to enable.
            </div>
          ) : null}

          {showForbidden ? <div style={{ marginTop: 10, opacity: 0.9 }}>You are not authorized for Dev Admin.</div> : null}
        </div>
      ) : null}

      <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr', gap: 14 }}>
        <Panel
          title="System health"
          right={
            health ? (
              <span style={{ fontSize: 12, opacity: 0.8 }}>
                Overall: <strong>{formatStatus(health.ok)}</strong>
              </span>
            ) : null
          }
        >
          {health ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              <div style={{ padding: 10, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>DB</div>
                <div style={{ marginTop: 4, fontWeight: 700 }}>{formatStatus(health.db.ok)}</div>
                {!health.db.ok && health.db.error ? <div style={{ marginTop: 4, opacity: 0.8 }}>{health.db.error}</div> : null}
              </div>
              <div style={{ padding: 10, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Redis</div>
                <div style={{ marginTop: 4, fontWeight: 700 }}>{formatStatus(health.redis.ok)}</div>
                {!health.redis.ok && health.redis.error ? (
                  <div style={{ marginTop: 4, opacity: 0.8 }}>{health.redis.error}</div>
                ) : null}
              </div>
              <div style={{ padding: 10, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>Queues</div>
                <div style={{ marginTop: 4, fontWeight: 700 }}>{health.queues.status}</div>
              </div>
            </div>
          ) : (
            <div style={{ opacity: 0.75 }}>No health data.</div>
          )}
        </Panel>

        <Panel title="Tenant lookup">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by company name or owner email…"
              style={{
                flex: '1 1 420px',
                minWidth: 260,
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.10)',
                background: 'rgba(0,0,0,0.25)',
                color: 'inherit',
              }}
            />
            <div style={{ fontSize: 12, opacity: 0.75 }}>{lookupLoading ? 'Searching…' : 'Type 2+ chars'}</div>
          </div>

          <div style={{ marginTop: 12 }}>
            {lookupResults.length === 0 ? (
              <div style={{ opacity: 0.7, fontSize: 13 }}>No results.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
                {lookupResults.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => loadTenant(r.id)}
                    style={{
                      textAlign: 'left',
                      padding: 12,
                      borderRadius: 12,
                      border: r.id === selectedTenantId ? '1px solid rgba(255,255,255,0.28)' : '1px solid rgba(255,255,255,0.10)',
                      background: r.id === selectedTenantId ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                      color: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{r.name}</div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                      {r.id} • {r.timezone} • {r.currency}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Panel>

        <Panel
          title="Tenant detail"
          right={tenantLoading ? <span style={{ fontSize: 12, opacity: 0.75 }}>Loading</span> : null}
        >
          {!selectedTenantId ? (
            <div style={{ opacity: 0.7, fontSize: 13 }}>Select a tenant from lookup to view details.</div>
          ) : tenant ? (
            tenant.ok ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
                  <div style={{ padding: 10, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Company</div>
                    <div style={{ marginTop: 4, fontWeight: 700 }}>{tenant.company?.name}</div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>{tenant.company?.id}</div>
                  </div>
                  <div style={{ padding: 10, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Owner</div>
                    <div style={{ marginTop: 4, fontWeight: 700 }}>{tenant.owner?.email || '—'}</div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>{tenant.owner?.id || '—'}</div>
                  </div>
                  <div style={{ padding: 10, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: 12, opacity: 0.75 }}>Subscription</div>
                    <div style={{ marginTop: 4, fontWeight: 700 }}>
                      {tenant.subscription?.status || 'none'} {tenant.subscription?.plan?.code ? `(${tenant.subscription.plan.code})` : ''}
                    </div>
                    <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
                      PlanId: {tenant.settings?.planId || '—'} • Interval: {tenant.settings?.planBillingInterval || '—'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
                  {[
                    ['Bookings', tenant.settings?.bookingsEnabled],
                    ['Accounting', tenant.settings?.accountingEnabled],
                    ['Payments', tenant.settings?.paymentsEnabled],
                    ['Social', tenant.settings?.socialEnabled],
                    ['AI', tenant.settings?.aiEnabled],
                  ].map(([label, value]) => (
                    <div key={String(label)} style={{ padding: 10, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>{label}</div>
                      <div style={{ marginTop: 4, fontWeight: 700 }}>{value === true ? 'enabled' : value === false ? 'disabled' : '—'}</div>
                    </div>
                  ))}
                </div>

                {tenant.links ? (
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
                    <a href={tenant.links.audit} style={{ textDecoration: 'underline' }}>
                      Audit logs
                    </a>
                    <a href={tenant.links.billing} style={{ textDecoration: 'underline' }}>
                      Billing
                    </a>
                    <a href={tenant.links.settings} style={{ textDecoration: 'underline' }}>
                      Settings
                    </a>
                  </div>
                ) : null}

                <details>
                  <summary style={{ cursor: 'pointer', opacity: 0.85 }}>Raw payload</summary>
                  <div style={{ marginTop: 10 }}>
                    <CodeBlock value={tenant} />
                  </div>
                </details>
              </div>
            ) : (
              <div style={{ opacity: 0.8 }}>
                {tenant.error || 'Tenant not found.'}
              </div>
            )
          ) : (
            <div style={{ opacity: 0.7 }}>No tenant data.</div>
          )}
        </Panel>

        <Panel title="Flags">
          {flags ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Environment flags (safe)</div>
                <CodeBlock value={flags.envFlags} />
              </div>
              {selectedTenantId ? (
                <div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>Tenant settings flags</div>
                  <CodeBlock value={flags.tenant} />
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ opacity: 0.75 }}>No flags data.</div>
          )}
        </Panel>

        <Panel title="Billing mode">
          <div style={{ fontSize: 13, opacity: 0.9 }}>
            Mode: <strong>{me?.billing?.mode || '—'}</strong>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
            Owner allowlist bypass is email-only and is not exposed in the UI.
          </div>
        </Panel>
      </div>
    </PageShell>
  );

}
