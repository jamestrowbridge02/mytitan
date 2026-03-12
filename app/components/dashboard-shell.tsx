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
  isCalendarV1Enabled,
  isNotificationsV1Enabled,
  isSchedulingIntelligenceV1Enabled,
  isStartHereEnabled,
  isTradePacksEnabled,
  isWheelsFormV1Enabled,
} from '../lib/feature-flags';
import { GUIDED_MODE_STORAGE_KEY } from '../lib/guided-mode';
import { useTenantSettings } from '../lib/tenant-settings';
import { AiAssistant } from './ai-assistant';

type LocationCtx = {
  activeLocationId: string;
  available: Array<{ id: string; name: string; code?: string | null; kind?: string | null }>;
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
  const calendarV1Enabled = isCalendarV1Enabled();
  const schedulingEnabled = isSchedulingIntelligenceV1Enabled();
  const logoutEnabled = isLogoutV1Enabled();
  const demoPolishEnabled = isDemoPolishV1Enabled();
  const notificationsEnabled = isNotificationsV1Enabled();
  const wheelsFormEnabled = isWheelsFormV1Enabled() && settings?.primaryTrade === 'WHEELS';
  const coherenceFlag = String(process.env.NEXT_PUBLIC_MYTITAN_UI_COHERENCE_V1 || '').trim().toLowerCase();
  const coherenceOn = coherenceFlag === 'on' || coherenceFlag === 'true' || coherenceFlag === '1';
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
          if (currentMe?.email === '@mytitan.co.uk') return;
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

  const isDemoUser = useMemo(() => Boolean(me?.demoUser || me?.email === '@mytitan.co.uk'), [me]);
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
    <div className="dashboard-shell-content">
      {isDemoUser ? (
        <div className="card" style={{ marginBottom: 12, borderColor: '#8cc8ff' }}>
          <strong> Mode</strong>
          <p className="muted" style={{ margin: '6px 0 10px 0' }}>You are in a  workspace. Changes are safe and temporary.</p>
          <button className="button secondary" onClick={signOut}>Exit </button>
        </div>
      ) : null}
      {isDemoUser && demoPolishEnabled && !demoBannerDismissed ? (
        <div className="card" style={{ marginBottom: 12, borderColor: '#6ea8fe' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <strong> Tour</strong>
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

      {locationsEnabled && locationCtx.available.length > 1 ? (
        <div className="card" style={{ marginBottom: 12 }} data-testid="location-scope-switcher">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <strong>Location scope</strong>
              <p className="muted" style={{ margin: '6px 0 0 0' }}>Filter location-aware dashboards without changing tenant boundaries.</p>
            </div>
            <select
              className="input"
              style={{ minWidth: 240, margin: 0 }}
              value={locationCtx.activeLocationId}
              onChange={(event) => updateLocationContext(event.target.value)}
            >
              {locationCtx.available.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                  {location.code ? ` (${location.code})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {children}

      {marketplaceEnabled && aiAllowed ? <AiAssistant /> : null}
    </div>
  );
}
