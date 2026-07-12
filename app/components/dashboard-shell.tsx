import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, clearToken } from '../lib/api';
import { useEntitlements } from '../lib/entitlements';
import { hasStoredActiveLocationId, readActiveLocationId, writeActiveLocationId } from '../lib/location-context';
import {
  isBookingProV1Enabled,
  isCommandCentreV2Enabled,
  isCrmProV1Enabled,
  isDemoPolishV1Enabled,
  isGuidedSetupV2Enabled,
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
import { resolveBookingsEnabled } from '../lib/workspace-features';
import { useMediaQuery } from '../lib/use-media-query';
import { getOperatorQuickActions, getOperatorRouteMeta, readOperatorRecentDestinations, type OperatorRecentDestination } from '../lib/operator-recents';
import { AiAssistant } from './ai-assistant';

type LocationCtx = {
  activeLocationId: string;
  available: Array<{ id: string; name: string; code?: string | null; kind?: string | null }>;
};

type AppNotification = {
  id: string;
  title: string;
  message?: string | null;
  category?: string | null;
  priority?: 'info' | 'success' | 'attention' | 'urgent' | null;
  actionUrl?: string | null;
  actionLabel?: string | null;
  isRead?: boolean;
  createdAt?: string | null;
};

function formatLocationScopeLabel(location: { name: string; code?: string | null }) {
  const rawName = String(location.name || "").trim() || "Unnamed location";
  const compactName = rawName.length > 32 ? `${rawName.slice(0, 29).trimEnd()}...` : rawName;
  return location.code ? `${compactName} (${location.code})` : compactName;
}

function formatNotificationTime(value?: string | null) {
  if (!value) return 'Just now';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Just now';
  const diffMinutes = Math.max(0, Math.round((Date.now() - parsed.getTime()) / 60000));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function groupNotifications(items: AppNotification[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const groups = { today: [] as AppNotification[], earlier: [] as AppNotification[] };
  for (const item of items) {
    const parsed = item.createdAt ? new Date(item.createdAt) : null;
    if (parsed && !Number.isNaN(parsed.getTime()) && parsed >= today) {
      groups.today.push(item);
      continue;
    }
    groups.earlier.push(item);
  }
  return groups;
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { settings } = useTenantSettings();
  const { features } = useEntitlements();
  const marketplaceEnabled = isMarketplaceEnabled();
  const guidedSetupV2Enabled = isGuidedSetupV2Enabled();
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
  const bookingsFlag = resolveBookingsEnabled(settings);
  const aiAllowed = Boolean(features?.ai_enabled) && Boolean(aiFlag);
  const bookingsAllowed = Boolean(features?.bookings_enabled) && Boolean(bookingsFlag);
  const [locationCtx, setLocationCtx] = useState<LocationCtx>({ activeLocationId: 'all', available: [{ id: 'all', name: 'All locations' }] });
  const [me, setMe] = useState<any>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [quickOptionsOpen, setQuickOptionsOpen] = useState(false);
  const quickOptionsRef = useRef<HTMLElement | null>(null);
  const [notificationsBusy, setNotificationsBusy] = useState(false);
  const [demoBannerDismissed, setDemoBannerDismissed] = useState(false);
  const [recentDestinations, setRecentDestinations] = useState<OperatorRecentDestination[]>([]);
  const showDesktopLocationScope = useMediaQuery('(min-width: 768px)');
  const showSupportCard =
    router.pathname === '/dashboard/help' ||
    ((router.pathname.startsWith('/dashboard/settings') || router.pathname.startsWith('/dashboard/billing')) &&
      Boolean(me?.permissions?.['settings.manage']));

  useEffect(() => {
    if (!quickOptionsOpen) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (!quickOptionsRef.current?.contains(event.target as Node)) {
        setQuickOptionsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setQuickOptionsOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [quickOptionsOpen]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const configuredMode = settings?.themeMode === 'dark' || settings?.themeMode === 'system'
      ? settings.themeMode
      : 'light';
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyMode = () => {
      const dark = configuredMode === 'dark' || (configuredMode === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.documentElement.dataset.themeMode = configuredMode;
      window.localStorage.setItem('mytitan_theme_mode', configuredMode);
    };
    applyMode();
    if (configuredMode !== 'system') return;
    media.addEventListener('change', applyMode);
    return () => media.removeEventListener('change', applyMode);
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
        const serverLocationId = String(ctx?.activeLocationId || 'all');
        const shouldPreferStoredLocation = hasStoredActiveLocationId();
        const nextLocationId = shouldPreferStoredLocation
          ? readActiveLocationId()
          : writeActiveLocationId(serverLocationId);
        setLocationCtx({
          activeLocationId: nextLocationId,
          available: Array.isArray(ctx?.available) && ctx.available.length ? ctx.available : [{ id: 'all', name: 'All locations' }],
        });
        if (shouldPreferStoredLocation && nextLocationId !== serverLocationId) {
          void apiFetch('/me/location', {
            method: 'PUT',
            body: JSON.stringify({ locationId: nextLocationId }),
          }).catch(() => undefined);
        }
      } catch {
        // ignore
      }
    };
    load();
  }, [locationsEnabled]);

  useEffect(() => {
    if (!notificationsEnabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    void refreshNotifications();
    timer = setInterval(() => {
      void refreshNotifications();
    }, 20_000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [notificationsEnabled]);

  useEffect(() => {
    if (guidedSetupV2Enabled || (!marketplaceEnabled && !startHereEnabled)) return;
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
  const notificationGroups = useMemo(() => groupNotifications(notifications), [notifications]);
  const routeMeta = useMemo(() => getOperatorRouteMeta(router.pathname, router.asPath), [router.asPath, router.pathname]);
  const shellQuickActions = useMemo(() => getOperatorQuickActions(router.pathname).slice(0, 3), [router.pathname]);
  const showWorkflowPulse = useMemo(
    () =>
      router.pathname === '/dashboard' ||
      router.pathname === '/dashboard/work' ||
      router.pathname === '/dashboard/customers' ||
      router.pathname.startsWith('/dashboard/customers/') ||
      router.pathname === '/dashboard/notifications' ||
      router.pathname === '/dashboard/command-centre-v2' ||
      router.pathname.startsWith('/dashboard/billing') ||
      router.pathname === '/dashboard/finance' ||
      router.pathname.startsWith('/dashboard/settings'),
    [router.pathname],
  );
  const workflowRecommendation = useMemo(() => {
    if (unreadCount > 0) {
      return {
        title: `${unreadCount} update${unreadCount === 1 ? '' : 's'} need review`,
        detail: 'Clear the internal inbox before small issues turn into scattered follow-up.',
        href: '/dashboard/notifications',
        action: 'Review notifications',
      };
    }
    if (router.pathname === '/dashboard/customers') {
      return {
        title: 'Move customer intake into real work',
        detail: 'Use the customer list to fix missing contact detail first, then start the linked job without context switching.',
        href: '/dashboard/customers?compose=add-contact',
        action: 'Add contact',
      };
    }
    if (router.pathname.startsWith('/dashboard/billing') || router.pathname === '/dashboard/finance') {
      return {
        title: 'Protect billing follow-through',
        detail: 'Keep invoice, payment, and readiness checks visible without drifting into unrelated settings.',
        href: '/dashboard/billing/readiness',
        action: 'Open billing readiness',
      };
    }
    if (router.pathname === '/dashboard/command-centre-v2') {
      return {
        title: 'Keep the live queue decisive',
        detail: 'Use Live Work for the next operational decision, then drop into the underlying record only when detail is required.',
        href: '/dashboard/jobs',
        action: 'Review jobs',
      };
    }
    return {
      title: 'Stay in the work rhythm',
      detail: 'Use the command layer and contextual next actions to move through operations without browsing for screens.',
      href: '/dashboard/command-centre-v2',
      action: 'Open live work',
    };
  }, [router.pathname, unreadCount]);

  useEffect(() => {
    setShowNotifications(false);
  }, [router.asPath]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setRecentDestinations(readOperatorRecentDestinations().filter((item) => item.href !== router.asPath).slice(0, 3));
  }, [router.asPath]);

  useEffect(() => {
    if (!showNotifications || typeof window === 'undefined') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowNotifications(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showNotifications]);

  async function refreshNotifications() {
    if (!notificationsEnabled) return;
    try {
      const items = await apiFetch('/notifications');
      setNotifications(Array.isArray(items) ? items : []);
    } catch {
      setNotifications([]);
    }
  }

  async function markNotificationRead(id: string, read = true) {
    setNotificationsBusy(true);
    try {
      const updated = await apiFetch(`/notifications/${encodeURIComponent(id)}/read`, {
        method: 'PATCH',
        body: JSON.stringify({ read }),
      });
      setNotifications((current) => current.map((item) => (item.id === id ? { ...item, ...(updated || {}) } : item)));
    } finally {
      setNotificationsBusy(false);
    }
  }

  async function dismissNotification(id: string) {
    setNotificationsBusy(true);
    try {
      await apiFetch(`/notifications/${encodeURIComponent(id)}/dismiss`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      });
      setNotifications((current) => current.filter((item) => item.id !== id));
    } finally {
      setNotificationsBusy(false);
    }
  }

  async function markAllNotificationsRead() {
    setNotificationsBusy(true);
    try {
      await apiFetch('/notifications/read-all', {
        method: 'PATCH',
        body: JSON.stringify({ read: true }),
      });
      setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
    } finally {
      setNotificationsBusy(false);
    }
  }

  async function updateLocationContext(nextId: string) {
    const normalized = writeActiveLocationId(nextId);
    setLocationCtx((prev) => ({ ...prev, activeLocationId: normalized }));
    try {
      await apiFetch('/me/location', {
        method: 'PUT',
        body: JSON.stringify({ locationId: normalized }),
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

  const notificationUtility = notificationsEnabled ? (
    <div className="dashboard-shell__utilityBar">
      <div className="dashboard-shell__utilityGroup">
        <button
          type="button"
          className="dashboard-shell__notificationBell"
          data-testid="dashboard-notification-bell"
          aria-haspopup="dialog"
          aria-expanded={showNotifications}
          aria-controls="dashboard-notification-drawer"
          onClick={() => setShowNotifications((current) => !current)}
        >
          <span className="dashboard-shell__notificationBellIcon" aria-hidden="true">🔔</span>
          <span className="dashboard-shell__notificationBellLabel">Inbox</span>
          {unreadCount > 0 ? <span className="dashboard-shell__notificationCount">{unreadCount}</span> : null}
        </button>
        {showNotifications ? (
          <div
            className="dashboard-shell__notificationDrawer"
            id="dashboard-notification-drawer"
            role="dialog"
            aria-label="Notifications"
            data-testid="dashboard-notification-drawer"
          >
            <div className="dashboard-shell__notificationDrawerHeader">
              <div>
                <strong>Notifications</strong>
                <p className="muted" style={{ margin: '4px 0 0 0' }}>
                  {unreadCount > 0 ? `${unreadCount} unread update${unreadCount === 1 ? '' : 's'}` : 'Everything is clear'}
                </p>
              </div>
              <div className="dashboard-shell__notificationDrawerActions">
                <button
                  type="button"
                  className="button secondary"
                  data-testid="dashboard-notifications-mark-all"
                  disabled={notificationsBusy || unreadCount === 0}
                  onClick={() => void markAllNotificationsRead()}
                >
                  Mark all read
                </button>
                <Link className="button secondary" href="/dashboard/notifications" onClick={() => setShowNotifications(false)}>
                  Open centre
                </Link>
              </div>
            </div>
            <div className="dashboard-shell__notificationGroups">
              {notificationGroups.today.length > 0 ? (
                <div className="dashboard-shell__notificationGroup">
                  <div className="dashboard-shell__notificationGroupLabel">Today</div>
                  {notificationGroups.today.map((item) => (
                    <article
                      key={item.id}
                      className={`dashboard-shell__notificationItem dashboard-shell__notificationItem--${item.priority || 'info'}${item.isRead ? ' is-read' : ''}`}
                    >
                      <div className="dashboard-shell__notificationItemHeader">
                        <strong>{item.title}</strong>
                        <span className="dashboard-shell__notificationTime">{formatNotificationTime(item.createdAt)}</span>
                      </div>
                      {item.message ? <p className="dashboard-shell__notificationMessage">{item.message}</p> : null}
                      <div className="dashboard-shell__notificationMeta">
                        <span className={`dashboard-shell__notificationPriority dashboard-shell__notificationPriority--${item.priority || 'info'}`}>
                          {item.priority || 'info'}
                        </span>
                        {item.category ? <span className="dashboard-shell__notificationCategory">{item.category}</span> : null}
                      </div>
                      <div className="dashboard-shell__notificationItemActions">
                        {item.actionUrl ? (
                          <Link
                            className="button"
                            href={item.actionUrl}
                            onClick={() => {
                              void markNotificationRead(item.id, true);
                              setShowNotifications(false);
                            }}
                          >
                            {item.actionLabel || 'Open'}
                          </Link>
                        ) : null}
                        {!item.isRead ? (
                          <button
                            type="button"
                            className="button secondary"
                            onClick={() => void markNotificationRead(item.id, true)}
                            disabled={notificationsBusy}
                          >
                            Mark read
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => void dismissNotification(item.id)}
                          disabled={notificationsBusy}
                        >
                          Dismiss
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
              {notificationGroups.earlier.length > 0 ? (
                <div className="dashboard-shell__notificationGroup">
                  <div className="dashboard-shell__notificationGroupLabel">Earlier</div>
                  {notificationGroups.earlier.map((item) => (
                    <article
                      key={item.id}
                      className={`dashboard-shell__notificationItem dashboard-shell__notificationItem--${item.priority || 'info'}${item.isRead ? ' is-read' : ''}`}
                    >
                      <div className="dashboard-shell__notificationItemHeader">
                        <strong>{item.title}</strong>
                        <span className="dashboard-shell__notificationTime">{formatNotificationTime(item.createdAt)}</span>
                      </div>
                      {item.message ? <p className="dashboard-shell__notificationMessage">{item.message}</p> : null}
                      <div className="dashboard-shell__notificationMeta">
                        <span className={`dashboard-shell__notificationPriority dashboard-shell__notificationPriority--${item.priority || 'info'}`}>
                          {item.priority || 'info'}
                        </span>
                        {item.category ? <span className="dashboard-shell__notificationCategory">{item.category}</span> : null}
                      </div>
                      <div className="dashboard-shell__notificationItemActions">
                        {item.actionUrl ? (
                          <Link
                            className="button"
                            href={item.actionUrl}
                            onClick={() => {
                              void markNotificationRead(item.id, true);
                              setShowNotifications(false);
                            }}
                          >
                            {item.actionLabel || 'Open'}
                          </Link>
                        ) : null}
                        {!item.isRead ? (
                          <button
                            type="button"
                            className="button secondary"
                            onClick={() => void markNotificationRead(item.id, true)}
                            disabled={notificationsBusy}
                          >
                            Mark read
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="button secondary"
                          onClick={() => void dismissNotification(item.id)}
                          disabled={notificationsBusy}
                        >
                          Dismiss
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
              {notificationGroups.today.length === 0 && notificationGroups.earlier.length === 0 ? (
                <div className="dashboard-shell__notificationEmpty" data-testid="dashboard-notification-empty">
                  <strong>Everything is clear</strong>
                  <p className="muted" style={{ margin: '6px 0 0 0' }}>
                    New operational updates will appear here when something needs attention.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  ) : null;

  const locationScopeCard = locationsEnabled && locationCtx.available.length > 1 ? (
    <div className="card dashboard-shell__locationCard dashboard-shell__locationCard--compact" data-testid="location-scope-switcher">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <strong>Location</strong>
          <span
            className="dashboard-shell__locationInfo"
            tabIndex={0}
            role="img"
            aria-label="Filter Dashboard metrics and work by location."
            title="Filter Dashboard metrics and work by location."
          >
            i
          </span>
        </div>
        <select
          className="input dashboard-shell__locationSelect"
          style={{ width: showDesktopLocationScope ? 'min(100%, 240px)' : '100%', minWidth: 0, maxWidth: '100%', margin: 0 }}
          value={locationCtx.activeLocationId}
          onChange={(event) => updateLocationContext(event.target.value)}
        >
          {locationCtx.available.map((location) => (
            <option key={location.id} value={location.id}>
              {formatLocationScopeLabel(location)}
            </option>
          ))}
        </select>
      </div>
    </div>
  ) : null;

  return (
    <div className="dashboard-shell-content w-full min-w-0 max-w-full">
      {isDemoUser ? (
        <div className="card dashboard-shell__moment dashboard-shell__moment--demo" style={{ marginBottom: 8, borderColor: '#8cc8ff' }}>
          <strong>Demo mode</strong>
          <p className="muted" style={{ margin: '6px 0 10px 0' }}>You are in a temporary workspace, so you can explore freely without affecting live operations.</p>
          <button className="button secondary" onClick={signOut}>Exit demo</button>
        </div>
      ) : null}
      {isDemoUser && demoPolishEnabled && !demoBannerDismissed ? (
        <div className="card dashboard-shell__moment dashboard-shell__moment--tour" style={{ marginBottom: 8, borderColor: '#6ea8fe' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <strong>Demo tour</strong>
              <p className="muted" style={{ margin: '6px 0 10px 0' }}>Use these guided routes to see real operational screens in a controlled flow.</p>
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

      {notificationUtility}

      {showWorkflowPulse ? (
        <section
          className="card dashboard-shell__workflowPulse"
          data-testid="dashboard-shell-workflow-pulse"
          ref={quickOptionsRef}
          onMouseLeave={() => setQuickOptionsOpen(false)}
        >
          <div className="dashboard-shell__workflowPulseHeader">
            <div>
              <div className="dashboard-shell__workflowPulseEyebrow">{routeMeta.label}</div>
              <h2 className="dashboard-shell__workflowPulseTitle">{workflowRecommendation.title}</h2>
              <p className="dashboard-shell__workflowPulseText">{workflowRecommendation.detail}</p>
            </div>
            <Link className="button" href={workflowRecommendation.href}>
              {workflowRecommendation.action}
            </Link>
            <button
              type="button"
              className="button secondary"
              aria-expanded={quickOptionsOpen}
              aria-controls="dashboard-quick-options"
              onClick={() => setQuickOptionsOpen((current) => !current)}
            >
              {quickOptionsOpen ? 'Hide quick options' : 'Quick options'}
            </button>
          </div>
          {quickOptionsOpen ? <div className="dashboard-shell__workflowPulseGrid" id="dashboard-quick-options">
            <div className="dashboard-shell__workflowPulseSection">
              <div className="dashboard-shell__workflowPulseLabel">Quick actions</div>
              <div className="dashboard-shell__workflowActionList">
                {shellQuickActions.map((action) => (
                  <Link key={`${action.label}-${action.href}`} className="dashboard-shell__workflowAction" href={action.href} onClick={() => setQuickOptionsOpen(false)}>
                    <strong>{action.label}</strong>
                    <span>{action.description}</span>
                  </Link>
                ))}
              </div>
            </div>
            <div className="dashboard-shell__workflowPulseSection">
              <div className="dashboard-shell__workflowPulseLabel">Recent destinations</div>
              <div className="dashboard-shell__workflowActionList">
                {recentDestinations.length ? (
                  recentDestinations.map((item) => (
                    <Link key={item.href} className="dashboard-shell__workflowAction dashboard-shell__workflowAction--muted" href={item.href} onClick={() => setQuickOptionsOpen(false)}>
                      <strong>{item.label}</strong>
                      <span>{item.description || 'Recent workspace destination.'}</span>
                    </Link>
                  ))
                ) : (
                  <div className="dashboard-shell__workflowEmpty">Recent destinations appear here after you move through the workspace.</div>
                )}
              </div>
            </div>
          </div> : null}
        </section>
      ) : null}

      {locationScopeCard && !showDesktopLocationScope ? <div style={{ marginBottom: 8 }}>{locationScopeCard}</div> : null}

      <div className="min-w-0 max-w-full md:flex md:items-start md:gap-4">
        <div className="min-w-0 max-w-full flex-1">{children}</div>
        {locationScopeCard && showDesktopLocationScope ? (
          <div className="md:w-[320px] md:shrink-0">{locationScopeCard}</div>
        ) : null}
      </div>

      {showSupportCard ? (
        <div className="card dashboard-shell__supportCard" data-testid="dashboard-support-card">
          <div>
            <strong>Help when you need it</strong>
            <p className="muted" style={{ margin: "6px 0 0 0" }}>
              Open Help for support, onboarding questions, or product feedback.
            </p>
          </div>
          <div className="dashboard-shell__supportActions">
            <Link className="button secondary" href="/dashboard/help?category=support">Open Help</Link>
            <Link className="button secondary" href="/dashboard/help?category=bug_report">Report issue</Link>
            <Link className="button secondary" href="/dashboard/help?category=feature_request">Share idea</Link>
          </div>
        </div>
      ) : null}

      {marketplaceEnabled && aiAllowed ? <AiAssistant /> : null}
    </div>
  );
}
