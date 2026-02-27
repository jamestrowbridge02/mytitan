import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, clearToken } from '../lib/api';
import { useBilling } from '../lib/billing';
import {
  isInventoryV1Enabled,
  isLocationsV1Enabled,
  isLogoutV1Enabled,
  isMarketplaceEnabled,
  isStartHereEnabled,
  isTradePacksEnabled,
  isWheelsFormV1Enabled,
} from '../lib/feature-flags';
import { GUIDED_MODE_STORAGE_KEY } from '../lib/guided-mode';
import { useTenantSettings } from '../lib/tenant-settings';
import { AiAssistant } from './ai-assistant';

type LocationCtx = {
  activeLocationId: string;
  available: Array<{ id: string; name: string }>;
};

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { settings } = useTenantSettings();
  const { features } = useBilling();
  const marketplaceEnabled = isMarketplaceEnabled();
  const tradePacksEnabled = isTradePacksEnabled();
  const startHereEnabled = isStartHereEnabled();
  const locationsEnabled = isLocationsV1Enabled();
  const inventoryEnabled = isInventoryV1Enabled();
  const logoutEnabled = isLogoutV1Enabled();
  const wheelsFormEnabled = isWheelsFormV1Enabled() && settings?.primaryTrade === 'WHEELS';
  const aiFlag = settings?.featureAI ?? settings?.aiEnabled;
  const bookingsFlag = settings?.featureBookings ?? settings?.bookingsEnabled;
  const aiAllowed = Boolean(features?.ai_enabled) && Boolean(aiFlag);
  const bookingsAllowed = Boolean(features?.bookings_enabled) && Boolean(bookingsFlag);
  const [locationCtx, setLocationCtx] = useState<LocationCtx>({ activeLocationId: 'all', available: [{ id: 'all', name: 'All locations' }] });
  const [me, setMe] = useState<any>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const mode = settings?.themeMode === 'dark' ? 'dark' : 'light';
    if (mode === 'dark') {
      document.documentElement.classList.add('dark');
      return;
    }
    document.documentElement.classList.remove('dark');
  }, [settings?.themeMode]);

  useEffect(() => {
    const load = async () => {
      try {
        const meRes = await apiFetch('/me');
        setMe(meRes);
      } catch {
        setMe(null);
      }
      if (!locationsEnabled) return;
      try {
        const ctx = await apiFetch('/me/location');
        setLocationCtx({
          activeLocationId: ctx?.activeLocationId || 'all',
          available: Array.isArray(ctx?.available) && ctx.available.length ? ctx.available : [{ id: 'all', name: 'All locations' }],
        });
      } catch {
        // ignore
      }
    };
    load();
  }, [locationsEnabled]);

  useEffect(() => {
    if (!marketplaceEnabled && !startHereEnabled) return;
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    if (path.startsWith('/onboarding')) return;
    const check = async () => {
      try {
        const currentMe = await apiFetch('/me');
        if (currentMe?.role) {
          if (currentMe?.email === 'demo@mytitan.co.uk') return;
          const status = await apiFetch('/onboarding/status');
          if (status && status.onboardingCompleted === false) {
            window.location.href = '/onboarding';
          }
        }
      } catch {
        // ignore
      }
    };
    check();
  }, [marketplaceEnabled, startHereEnabled]);

  const isDemoUser = useMemo(() => Boolean(me?.demoUser || me?.email === 'demo@mytitan.co.uk'), [me]);

  async function updateLocationContext(nextId: string) {
    setLocationCtx((prev) => ({ ...prev, activeLocationId: nextId }));
    try {
      await apiFetch('/me/location', {
        method: 'PUT',
        body: JSON.stringify({ locationId: nextId }),
      });
      router.replace(router.asPath);
    } catch {
      // ignore, keep optimistic UI
    }
  }

  async function signOut() {
    try {
      if (logoutEnabled) {
        await apiFetch('/auth/logout', { method: 'POST' });
      }
    } catch {
      // no-op
    }

    const keys = [
      'mytitan_token',
      'mytitan_wheels_draft_v1',
      'mytitan_demo_tour_seen_v1',
      'mytitan_theme_mode',
      GUIDED_MODE_STORAGE_KEY,
    ];

    if (typeof window !== 'undefined') {
      for (const key of keys) {
        window.localStorage.removeItem(key);
      }
    }
    clearToken();
    window.location.href = '/login';
  }

  async function signOutAllSessions() {
    try {
      if (logoutEnabled) {
        await apiFetch('/auth/logout-all', { method: 'POST' });
      }
    } catch {
      // continue with local sign-out
    }
    await signOut();
  }

  return (
    <div className="container">
      {isDemoUser ? (
        <div className="card" style={{ marginBottom: 12, borderColor: '#8cc8ff' }}>
          <strong>Demo Mode</strong>
          <p className="muted" style={{ margin: '6px 0 10px 0' }}>You are in a demo workspace. Changes are safe and temporary.</p>
          <button className="button secondary" onClick={signOut}>Exit demo</button>
        </div>
      ) : null}

      <div className="dashboard-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {settings?.logoUrl ? (
              <img src={settings.logoUrl} alt="Tenant logo" className="tenant-logo" />
            ) : (
              <div className="tenant-logo fallback">{(settings?.companyName || 'M').slice(0, 1).toUpperCase()}</div>
            )}
            <div>
              <strong>{settings?.companyName || 'MyTitan Tenant'}</strong>
              <p className="muted" style={{ margin: 0 }}>Operations workspace</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {locationsEnabled ? (
              <select
                className="input"
                style={{ margin: 0, minWidth: 180, padding: '10px 12px' }}
                value={locationCtx.activeLocationId}
                onChange={(e) => updateLocationContext(e.target.value)}
              >
                {locationCtx.available.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            ) : null}
            <button className="button secondary" onClick={signOut}>Sign out</button>
            <button className="button secondary" onClick={signOutAllSessions}>Sign out all</button>
          </div>
        </div>
      </div>

      <div className="nav">
        {startHereEnabled ? <Link href="/start">Start Here</Link> : null}
        <Link href="/dashboard">Overview</Link>
        <Link href="/dashboard/command-centre">Command Centre</Link>
        <Link href="/dashboard/jobs">Jobs</Link>
        <Link href="/dashboard/jobs/new">New Job</Link>
        {wheelsFormEnabled ? <Link href="/dashboard/templates/wheels">Wheels Template</Link> : null}
        {bookingsAllowed ? <Link href="/dashboard/bookings">Bookings</Link> : <Link href="/dashboard/billing">Bookings (Upgrade)</Link>}
        <Link href="/dashboard/trade-accounts">Trade Accounts</Link>
        {locationsEnabled ? <Link href="/dashboard/locations">Locations</Link> : null}
        {inventoryEnabled ? <Link href="/dashboard/inventory">Inventory</Link> : null}
        <Link href="/dashboard/users">Team</Link>
        <Link href="/dashboard/admin">Admin</Link>
        {marketplaceEnabled ? <Link href="/dashboard/setup">Setup</Link> : null}
        {tradePacksEnabled ? <Link href="/dashboard/trade-packs">Trade Packs</Link> : null}
        {marketplaceEnabled ? <Link href="/dashboard/integrations">Integrations</Link> : null}
        <Link href="/dashboard/settings">Settings</Link>
        <Link href="/dashboard/catalog">Catalog</Link>
        <Link href="/dashboard/email-templates">Email Templates</Link>
        <Link href="/dashboard/billing">Billing</Link>
        <Link href="/dashboard/audit">Audit</Link>
      </div>

      {children}

      {marketplaceEnabled && aiAllowed ? <AiAssistant /> : null}
    </div>
  );
}
