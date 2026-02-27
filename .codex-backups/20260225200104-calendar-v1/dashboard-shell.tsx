import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, clearToken } from '../lib/api';
import { useBilling } from '../lib/billing';
import {
  isBookingProV1Enabled,
  isCommandCentreV2Enabled,
  isCrmProV1Enabled,
  isDemoPolishV1Enabled,
  isInventoryV1Enabled,
  isLocationsV1Enabled,
  isLogoutV1Enabled,
  isMarketplaceEnabled,
  isAnalyticsV1Enabled,
  isAutomationsV1Enabled,
  isNotificationsV1Enabled,
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
  const bookingProEnabled = isBookingProV1Enabled();
  const commandCentreV2Enabled = isCommandCentreV2Enabled();
  const crmProEnabled = isCrmProV1Enabled();
  const automationsEnabled = isAutomationsV1Enabled();
  const analyticsEnabled = isAnalyticsV1Enabled();
  const logoutEnabled = isLogoutV1Enabled();
  const demoPolishEnabled = isDemoPolishV1Enabled();
  const notificationsEnabled = isNotificationsV1Enabled();
  const wheelsFormEnabled = isWheelsFormV1Enabled() && settings?.primaryTrade === 'WHEELS';
  const aiFlag = settings?.featureAI ?? settings?.aiEnabled;
  const bookingsFlag = settings?.featureBookings ?? settings?.bookingsEnabled;
  const aiAllowed = Boolean(features?.ai_enabled) && Boolean(aiFlag);
  const bookingsAllowed = Boolean(features?.bookings_enabled) && Boolean(bookingsFlag);
  const [locationCtx, setLocationCtx] = useState<LocationCtx>({ activeLocationId: 'all', available: [{ id: 'all', name: 'All locations' }] });
  const [me, setMe] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [demoBannerDismissed, setDemoBannerDismissed] = useState(false);

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
    if (!notificationsEnabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const loadNotifications = async () => {
      try {
        const items = await apiFetch('/notifications');
        setNotifications(Array.isArray(items) ? items : []);
      } catch {
        setNotifications([]);
      }
    };
    loadNotifications();
    timer = setInterval(loadNotifications, 20_000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [notificationsEnabled]);

  useEffect(() => {
    if (!marketplaceEnabled && !startHereEnabled) return;
    const path = router.pathname || '';
    if (path.startsWith('/onboarding')) return;
    const check = async () => {
      try {
        const currentMe = await apiFetch('/me');
        if (currentMe?.role) {
          if (currentMe?.email === 'demo@mytitan.co.uk') return;
          const status = await apiFetch('/onboarding/status');
          if (status && status.onboardingCompleted === false) {
            router.replace('/onboarding');
          }
        }
      } catch {
        // ignore
      }
    };
    check();
  }, [marketplaceEnabled, startHereEnabled, router]);

  const isDemoUser = useMemo(() => Boolean(me?.demoUser || me?.email === 'demo@mytitan.co.uk'), [me]);
  const unreadCount = useMemo(() => notifications.filter((item) => !item.isRead).length, [notifications]);

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
    router.replace('/login');
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
      {isDemoUser && demoPolishEnabled && !demoBannerDismissed ? (
        <div className="card" style={{ marginBottom: 12, borderColor: '#6ea8fe' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <strong>Demo Tour</strong>
              <p className="muted" style={{ margin: '6px 0 10px 0' }}>Try these guided actions to explore real screens with filters applied.</p>
            </div>
            <button className="button secondary" type="button" onClick={() => setDemoBannerDismissed(true)}>Dismiss</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 8 }}>
            <Link className="button secondary" href="/dashboard/command-centre-v2?status=OPEN">Try: All Open Jobs</Link>
            <Link className="button secondary" href="/dashboard/command-centre-v2?status=COMPLETED">Try: Awaiting Approval</Link>
            <Link className="button secondary" href="/dashboard/trade-accounts?status=ACTIVE">Try: CRM Active Accounts</Link>
            <Link className="button secondary" href="/dashboard/jobs/new?guided=1">Try: Guided Wheels Job</Link>
            <Link className="button secondary" href="/dashboard/booking/settings">Try: Booking Setup</Link>
          </div>
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
            {notificationsEnabled ? (
              <div style={{ position: 'relative' }}>
                <button className="button secondary" type="button" onClick={() => setShowNotifications((v) => !v)}>
                  Bell {unreadCount > 0 ? `(${unreadCount})` : ''}
                </button>
                {showNotifications ? (
                  <div className="card" style={{ position: 'absolute', right: 0, top: 44, width: 360, zIndex: 20, maxHeight: 360, overflow: 'auto' }}>
                    <strong>Notifications</strong>
                    <div className="list" style={{ marginTop: 10 }}>
                      {notifications.slice(0, 30).map((item) => (
                        <div key={item.id} className="integration-card" style={{ alignItems: 'flex-start' }}>
                          <div>
                            <strong>{item.title}</strong>
                            <p className="muted" style={{ margin: '4px 0 0 0' }}>{item.body || ''}</p>
                          </div>
                        </div>
                      ))}
                      {notifications.length === 0 ? <p className="muted">No notifications yet.</p> : null}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <Link href="/dashboard/notifications" className="button secondary">Open Notifications Centre</Link>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
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
        <Link href={commandCentreV2Enabled ? "/dashboard/command-centre-v2" : "/dashboard/command-centre"}>Command Centre</Link>
        <Link href="/dashboard/jobs">Jobs</Link>
        <Link href="/dashboard/jobs/new">New Job</Link>
        {wheelsFormEnabled ? <Link href="/dashboard/templates/wheels">Wheels Template</Link> : null}
        {bookingsAllowed ? <Link href={bookingProEnabled ? "/dashboard/booking/calendar" : "/dashboard/bookings"}>Bookings</Link> : <Link href="/dashboard/billing">Bookings (Upgrade)</Link>}
        {bookingProEnabled ? <Link href="/dashboard/booking/settings">Booking Settings</Link> : null}
        <Link href="/dashboard/trade-accounts">Trade Accounts</Link>
        {crmProEnabled ? <Link href="/dashboard/trade-accounts?view=segments">CRM Segments</Link> : null}
        {locationsEnabled ? <Link href="/dashboard/locations">Locations</Link> : null}
        {inventoryEnabled ? <Link href="/dashboard/inventory">Inventory</Link> : null}
        <Link href="/dashboard/users">Team</Link>
        <Link href="/dashboard/admin">Admin</Link>
        {marketplaceEnabled ? <Link href="/dashboard/setup">Setup</Link> : null}
        {tradePacksEnabled ? <Link href="/dashboard/trade-packs">Trade Packs</Link> : null}
        {marketplaceEnabled ? <Link href="/dashboard/integrations">Integrations</Link> : null}
        {notificationsEnabled ? <Link href="/dashboard/notifications">Notifications</Link> : null}
        {analyticsEnabled ? <Link href="/dashboard/insights">Insights</Link> : null}
        <Link href="/dashboard/settings">Settings</Link>
        {automationsEnabled ? <Link href="/dashboard/settings/automations">Automations</Link> : null}
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
