import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { DashboardShell } from "../../components/dashboard-shell";
import { GuidedTourOverlay } from "../../components/guided-tour-overlay";
import { EmptyState } from "../../components/states/EmptyState";
import { ErrorState } from "../../components/states/ErrorState";
import { ApiError, apiFetch, setToken } from "../../lib/api";
import {
  isCommandCentreEnabled,
  isCommandCentreV1Enabled,
  isDemoTourV1Enabled,
  isPublicDemoEnabled,
} from "../../lib/feature-flags";
import { getCommandCentreHref } from "../../lib/business-config";
import { useTenantSettings } from "../../lib/tenant-settings";
import { readActiveLocationId, writeActiveLocationId } from "../../lib/location-context";
import { resolveWorkforceTerminology } from "../../lib/workforce-terminology";

type Summary = {
  quickActions?: Array<{ key: string; label: string; href: string }>;
  todayBookings?: any[];
  dueAndOverdueJobs?: any[];
  unpaidJobs?: any[];
  drafts?: { jobs?: any[]; crm?: any[] };
  money?: { unpaidCount?: number; unpaidTotalCents?: number; subscriptionStatus?: string };
};

type ChecklistSummary = {
  firstValueJourney?: Array<{ key: string; title: string; description: string; completed: boolean; href: string }>;
  workspaceAreas?: Array<{ key: string; title: string; description: string; href: string }>;
  recommendedNextAction?: { title: string; description: string; href: string } | null;
};

type LocationContext = {
  activeLocationId: string;
  available: Array<{ id: string; name: string; code?: string | null }>;
};

type ActivityEvent = {
  id: string;
  type?: string | null;
  label?: string | null;
  at?: string | null;
  jobId?: string | null;
  jobRef?: string | null;
  customerId?: string | null;
  customerName?: string | null;
};

function canAccessDashboardHref(href: string | undefined, permissions: Record<string, boolean> | null | undefined) {
  if (!href) return true;
  const parsed = new URL(href, "http://mytitan.local");
  const pathname = parsed.pathname;
  if (pathname.startsWith("/dashboard/billing")) return Boolean(permissions?.["billing.manage"]);
  if (pathname.startsWith("/dashboard/finance")) return Boolean(permissions?.["billing.manage"]);
  if (pathname.startsWith("/dashboard/revenue")) return Boolean(permissions?.["billing.manage"]);
  if (pathname.startsWith("/dashboard/quotes")) return Boolean(permissions?.["billing.manage"]);
  if (pathname.startsWith("/dashboard/users")) return Boolean(permissions?.["users.invite"] || permissions?.["users.role_assign"]);
  if (pathname.startsWith("/dashboard/portal")) return Boolean(permissions?.["portal.manage"]);
  if (pathname.startsWith("/dashboard/technician")) return Boolean(permissions?.["technician.execute"]);
  if (pathname.startsWith("/dashboard/analytics")) return Boolean(permissions?.["dashboard.view_intelligence"]);
  if (pathname.startsWith("/dashboard/compliance")) return Boolean(permissions?.["dashboard.view_intelligence"]);
  if (pathname.startsWith("/dashboard/intelligence")) return Boolean(permissions?.["dashboard.view_intelligence"]);
  if (pathname.startsWith("/dashboard/settings")) return Boolean(permissions?.["settings.manage"]);
  return true;
}

function formatMoneyGBP(value: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value || 0);
}

function formatTime(value?: string | null) {
  if (!value) return "Time not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time not set";
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatDate(value = new Date()) {
  return value.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

function formatShortDateTime(value?: string | null) {
  if (!value) return "No recent update";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No recent update";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function displayName(me: any) {
  const candidates = [
    me?.displayName,
    me?.preferredName,
    me?.firstName,
    me?.fullName,
    me?.name,
  ];
  for (const candidate of candidates) {
    const clean = String(candidate || "").trim();
    const lowered = clean.toLowerCase();
    if (!clean || clean.includes("@")) continue;
    if (["hello", "admin", "owner", "there", "user"].includes(lowered)) continue;
    return clean.split(/\s+/)[0] || clean;
  }
  const email = String(me?.email || "").trim();
  const localPart = email.includes("@") ? email.split("@")[0] : "";
  const humanized = localPart.replace(/[._+-]+/g, " ").trim();
  if (humanized && !/^(admin|owner|hello|user|e2e|fixture)(\b|[-_\d])/i.test(humanized)) {
    return humanized.split(/\s+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  }
  return "";
}

function businessName(settings: any, me: any) {
  return String(settings?.companyName || settings?.tradingName || settings?.registeredBusinessName || me?.company?.name || "MyTitan").trim();
}

function draftHref(draft: any) {
  return `/dashboard/jobs/new?guided=1&resumeTrade=${encodeURIComponent(String(draft?.trade || "WHEELS").toUpperCase())}&entry=work`;
}

function statusLabel(value: any) {
  return String(value || "Open").replace(/_/g, " ").toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
}

function jobTitle(job: any) {
  return job?.jobRef || job?.serviceName || job?.customerName || "Job";
}

function bookingTitle(booking: any) {
  return booking?.serviceName || booking?.job?.serviceName || "Booking";
}

function activityHref(event: ActivityEvent) {
  if (event.jobId) return `/dashboard/jobs/${event.jobId}`;
  if (event.customerId) return `/dashboard/customers/${event.customerId}`;
  return "/dashboard/audit";
}

function activityIcon(type?: string | null) {
  const value = String(type || "").toLowerCase();
  if (value.includes("payment") || value.includes("invoice")) return "£";
  if (value.includes("booking")) return "B";
  if (value.includes("customer")) return "C";
  if (value.includes("notification") || value.includes("email") || value.includes("sms")) return "!";
  return "J";
}

function attentionTone(count: number) {
  return count > 0 ? "attention" : "neutral";
}

export default function Dashboard() {
  const router = useRouter();
  const { settings } = useTenantSettings();
  const commandCentreHref = getCommandCentreHref(settings);
  const terminology = resolveWorkforceTerminology(settings);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [checklist, setChecklist] = useState<ChecklistSummary | null>(null);
  const [me, setMe] = useState<any>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [locationCtx, setLocationCtx] = useState<LocationContext>({ activeLocationId: "all", available: [{ id: "all", name: "All locations" }] });
  const [loading, setLoading] = useState(true);
  const [summaryError, setSummaryError] = useState("");
  const [summaryRequestId, setSummaryRequestId] = useState<string | undefined>();
  const [activityError, setActivityError] = useState("");
  const [activityRequestId, setActivityRequestId] = useState<string | undefined>();
  const commandCentreEnabled = isCommandCentreEnabled() || isCommandCentreV1Enabled();
  const demoTourEnabled = isDemoTourV1Enabled();

  useEffect(() => {
    if (!router.isReady || !isPublicDemoEnabled()) return;
    const token = router.query.demo_token;
    if (typeof token === "string" && token.trim()) {
      setToken(token.trim());
      router.replace("/dashboard");
    }
  }, [router]);

  async function loadCore() {
    setLoading(true);
    setSummaryError("");
    setSummaryRequestId(undefined);
    try {
      const [summaryPayload, mePayload, checklistPayload, locationPayload] = await Promise.all([
        apiFetch("/command-centre/summary"),
        apiFetch("/me").catch(() => null),
        apiFetch("/setup/checklist").catch(() => null),
        apiFetch("/me/location").catch(() => null),
      ]);
      setSummary(summaryPayload as Summary);
      setMe(mePayload);
      setChecklist(checklistPayload as ChecklistSummary | null);
      if (locationPayload?.available?.length) {
        const active = String(locationPayload.activeLocationId || readActiveLocationId() || "all");
        setLocationCtx({ activeLocationId: active, available: locationPayload.available });
      }
    } catch (err: any) {
      setSummaryError(err?.message || "Dashboard unavailable");
      setSummaryRequestId(err instanceof ApiError ? err.requestId : undefined);
    } finally {
      setLoading(false);
    }
  }

  async function loadActivity() {
    setActivityError("");
    setActivityRequestId(undefined);
    try {
      const rows = await apiFetch("/activity/recent?limit=6");
      setActivity(Array.isArray(rows) ? rows : []);
    } catch (err: any) {
      setActivityError(err?.message || "Recent activity unavailable");
      setActivityRequestId(err instanceof ApiError ? err.requestId : undefined);
    }
  }

  useEffect(() => {
    void loadCore();
    void loadActivity();
  }, []);

  async function changeLocation(value: string) {
    const activeLocationId = writeActiveLocationId(value);
    setLocationCtx((current) => ({ ...current, activeLocationId }));
    await apiFetch("/me/location", { method: "PATCH", body: JSON.stringify({ activeLocationId }) }).catch(() => undefined);
  }

  const permissions = me?.permissions || {};
  const canManageBilling = Boolean(permissions["billing.manage"]);
  const canManageSettings = Boolean(permissions["settings.manage"]);
  const canCreateJob = canAccessDashboardHref("/dashboard/jobs/new", permissions);
  const canManagePortal = Boolean(permissions["portal.manage"]);

  const drafts = useMemo(() => {
    const jobDrafts = summary?.drafts?.jobs || [];
    const crmDrafts = summary?.drafts?.crm || [];
    return [
      ...jobDrafts.map((draft) => ({ ...draft, kind: "Job draft", title: `${String(draft?.trade || "Work").toUpperCase()} draft`, href: draftHref(draft) })),
      ...crmDrafts.map((draft) => ({ ...draft, kind: "CRM draft", title: "Customer note draft", href: draft.tradeAccountId ? `/dashboard/trade-accounts/${draft.tradeAccountId}` : "/dashboard/trade-accounts" })),
    ];
  }, [summary]);

  const dueJobs = summary?.dueAndOverdueJobs || [];
  const unpaidJobs = summary?.unpaidJobs || [];
  const todayBookings = summary?.todayBookings || [];
  const completedJob = dueJobs.find((job: any) => String(job?.status || "").toUpperCase() === "COMPLETED");
  const liveJobs = dueJobs.filter((job: any) => ["OPEN", "SCHEDULED", "IN_PROGRESS"].includes(String(job?.status || "").toUpperCase()));
  const readyJobs = dueJobs.filter((job: any) => ["COMPLETED", "INVOICED"].includes(String(job?.status || "").toUpperCase()));

  const primaryAction = canCreateJob
    ? { label: "Create job", href: "/dashboard/jobs/new?guided=1&entry=dashboard" }
    : canManagePortal
      ? { label: "Review approvals", href: "/dashboard/portal" }
      : permissions["technician.execute"]
        ? { label: "Open work", href: "/dashboard/technician" }
        : { label: "Open bookings", href: "/dashboard/bookings" };

  const priority = useMemo(() => {
    const unfinishedSetup = (checklist?.firstValueJourney || []).find((item) => !item.completed && canAccessDashboardHref(item.href, permissions));
    const recommended = checklist?.recommendedNextAction && canAccessDashboardHref(checklist.recommendedNextAction.href, permissions)
      ? checklist.recommendedNextAction
      : null;
    if (unfinishedSetup && canManageSettings) {
      const isFirstWorkStep = /booking|job/i.test(`${unfinishedSetup.title} ${unfinishedSetup.href}`);
      return {
        title: isFirstWorkStep ? "Run the first booking or job" : "Complete essential setup",
        detail: isFirstWorkStep ? "Setup" : unfinishedSetup.title,
        href: unfinishedSetup.href,
        action: isFirstWorkStep ? primaryAction.label : "Continue setup",
        tone: "attention",
      };
    }
    if (recommended && canManageSettings) return { title: recommended.title, detail: "Setup", href: recommended.href, action: "Open", tone: "attention" };
    if (drafts[0]) return { title: "Resume a draft", detail: drafts[0].title, href: drafts[0].href, action: "Continue draft", tone: "attention" };
    if (liveJobs.find((job: any) => !job?.assignedUserId && !job?.technicianId)) return { title: "Assign unassigned work", detail: jobTitle(liveJobs.find((job: any) => !job?.assignedUserId && !job?.technicianId)), href: "/dashboard/scheduling", action: "Open schedule", tone: "attention" };
    if (completedJob) return { title: "Send completed work", detail: jobTitle(completedJob), href: `/dashboard/jobs/${completedJob.id}`, action: "Finish and send", tone: "attention" };
    if (unpaidJobs[0] && canManageBilling) return { title: "Review overdue payment", detail: jobTitle(unpaidJobs[0]), href: `/dashboard/jobs/${unpaidJobs[0].id}`, action: "Review payment", tone: "attention" };
    if (todayBookings[0]) return { title: "Create first booking or job", detail: bookingTitle(todayBookings[0]), href: todayBookings[0].id ? `/dashboard/bookings/${todayBookings[0].id}` : "/dashboard/bookings", action: "Open booking", tone: "neutral" };
    return { title: "No urgent action", detail: "Nothing needs immediate attention.", href: commandCentreHref, action: "View live work", tone: "healthy" };
  }, [canManageBilling, canManageSettings, checklist, commandCentreHref, completedJob, drafts, liveJobs, permissions, primaryAction.label, todayBookings, unpaidJobs]);

  const snapshotCards = useMemo(() => {
    const base = [
      { label: "Bookings today", value: String(todayBookings.length), href: "/dashboard/bookings", testId: "dashboard-kpi-bookings-today", hint: "Bookings from today’s booking source." },
      { label: "Live jobs", value: String(liveJobs.length), href: "/dashboard/jobs", testId: "dashboard-kpi-live-jobs", hint: "Open, scheduled, or in-progress jobs." },
      ...(canManageBilling
        ? [{ label: "Revenue today", value: formatMoneyGBP(Number((summary as any)?.revenueToday ?? (summary as any)?.todayRevenue ?? (summary as any)?.counts?.revenueToday ?? 0)), href: "/dashboard/finance", testId: "dashboard-kpi-revenue-today", hint: "Finance value from available billing records." }]
        : []),
      { label: `${terminology.plural} working`, value: String(Number((summary as any)?.techniciansActive ?? (summary as any)?.activeTechnicians ?? (summary as any)?.counts?.techniciansActive ?? 0)), href: "/dashboard/technician", testId: "dashboard-kpi-team-working", hint: "Current workforce activity count." },
      { label: "Pending approvals", value: String(Number((summary as any)?.pendingApprovals ?? (summary as any)?.approvalsPending ?? (summary as any)?.counts?.pendingApprovals ?? 0)), href: "/dashboard/portal", testId: "dashboard-kpi-pending-approvals", hint: "Customer approval queue." },
      { label: "Drafts", value: String(drafts.length), href: "/dashboard/work", testId: "dashboard-kpi-drafts", hint: "Saved work drafts." },
    ];
    return base.filter((metric) => canAccessDashboardHref(metric.href, permissions)).slice(0, 4);
  }, [canManageBilling, drafts.length, liveJobs.length, permissions, summary, terminology.plural, todayBookings.length]);

  const liveWorkTabs = [
    { key: "drafts", label: "Drafts", count: drafts.length, href: "/dashboard/work", tone: attentionTone(drafts.length) },
    { key: "progress", label: "In progress", count: liveJobs.length, href: "/dashboard/work", tone: attentionTone(liveJobs.length) },
    { key: "ready", label: "Ready to send", count: readyJobs.length, href: "/dashboard/work", tone: attentionTone(readyJobs.length) },
    { key: "payment", label: "Awaiting payment", count: unpaidJobs.length, href: canManageBilling ? "/dashboard/billing/readiness" : commandCentreHref, tone: attentionTone(unpaidJobs.length) },
  ];

  if (!commandCentreEnabled) {
    return (
      <DashboardShell>
        <div className="dashboard-premium">
          <EmptyState title="Dashboard unavailable" description="This business is not using the dashboard right now." />
        </div>
      </DashboardShell>
    );
  }

  if (summaryError && !summary && !loading) {
    return (
      <DashboardShell>
        <div className="dashboard-premium">
          <ErrorState
            title="Dashboard unavailable"
            description="We could not load today’s work."
            requestId={summaryRequestId}
            primaryAction={{ label: "Retry", onClick: loadCore }}
            secondaryAction={{ label: "Open jobs", href: "/dashboard/jobs" }}
          />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <main className="dashboard-premium" data-testid="dashboard-premium-home">
        <GuidedTourOverlay enabled={demoTourEnabled} isDemoUser={Boolean(me?.demoUser || me?.email === "admin@mytitan.co.uk")} />

        <header className="dashboard-premium-header">
          <div>
            <h1 className="dashboard-premium-title">Dashboard</h1>
            <p className="dashboard-premium-greeting">{displayName(me) ? `${greeting()}, ${displayName(me)}` : greeting()}</p>
            <p className="dashboard-premium-meta">{businessName(settings, me)} · {formatDate()}</p>
          </div>
          <div className="dashboard-premium-header__actions">
            {locationCtx.available.length > 1 ? (
              <label className="dashboard-location-select">
                <span>Location</span>
                <select value={locationCtx.activeLocationId} onChange={(event) => void changeLocation(event.target.value)} data-testid="dashboard-location-selector">
                  {locationCtx.available.map((location) => (
                    <option key={location.id} value={location.id}>{location.code ? `${location.name} (${location.code})` : location.name}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <Link className="button dashboard-primary-action" href={primaryAction.href} data-testid="dashboard-primary-action">
              {primaryAction.label}
            </Link>
          </div>
        </header>

        {loading && !summary ? (
          <section className="dashboard-skeleton" role="status" aria-live="polite" data-testid="dashboard-loading-state">
            <div />
            <div />
            <div />
            <div />
          </section>
        ) : null}

        {summary ? (
          <>
            <section className="dashboard-snapshot" aria-labelledby="dashboard-snapshot-title">
              <div className="dashboard-section-heading">
                <h2 id="dashboard-snapshot-title">Business snapshot</h2>
                <Link href="/dashboard/analytics">Open analytics</Link>
              </div>
              <div className="dashboard-snapshot-grid" data-testid="dashboard-snapshot-grid">
                {snapshotCards.map((card) => (
                  <Link key={card.label} href={card.href} className="dashboard-snapshot-card" data-testid={card.testId} aria-label={`${card.label}: ${card.value}. ${card.hint}`}>
                    <span>{card.label}</span>
                    <strong>{card.value}</strong>
                  </Link>
                ))}
              </div>
            </section>

            <div className="dashboard-main-grid">
              <section className={`dashboard-priority dashboard-priority--${priority.tone}`} aria-labelledby="dashboard-priority-title" data-testid="dashboard-priority-action">
                <div>
                  <span className="dashboard-priority__eyebrow">Today’s priority</span>
                  <h2 id="dashboard-priority-title">{priority.title}</h2>
                  <p>{priority.detail}</p>
                </div>
                <Link className={priority.tone === "healthy" ? "button secondary" : "button"} href={priority.href}>
                  {priority.action}
                </Link>
              </section>

              <section className="dashboard-panel" aria-labelledby="dashboard-schedule-title" data-testid="dashboard-today-schedule">
                <div className="dashboard-section-heading">
                  <h2 id="dashboard-schedule-title">Today’s schedule</h2>
                  <Link href="/dashboard/calendar">Open calendar</Link>
                </div>
                <div className="dashboard-list">
                  {todayBookings.slice(0, 4).map((booking) => (
                    <Link className="dashboard-row" href={booking.id ? `/dashboard/bookings/${booking.id}` : "/dashboard/bookings"} key={booking.id || booking.startsAt} data-testid={`dashboard-schedule-row-${booking.id || "booking"}`}>
                      <span className="dashboard-row__time">{formatTime(booking.startsAt)}</span>
                      <span>
                        <strong>{booking.customerName || "Customer"}</strong>
                        <small>{bookingTitle(booking)} · {booking.locationName || booking.location?.name || "No location"} · {booking.assignedUser?.displayName || booking.technicianName || terminology.singular}</small>
                      </span>
                      <em>{booking.jobId ? "Linked" : statusLabel(booking.status || "Booked")}</em>
                    </Link>
                  ))}
                  {!todayBookings.length ? (
                    <div className="dashboard-empty">
                      <p>Nothing scheduled today.</p>
                      <Link className="button secondary" href="/dashboard/bookings">Create booking</Link>
                    </div>
                  ) : null}
                </div>
              </section>
            </div>

            <section className="dashboard-panel" aria-labelledby="dashboard-live-work-title" data-testid="dashboard-live-work">
              <div className="dashboard-section-heading">
                <h2 id="dashboard-live-work-title">Live work</h2>
                <Link href={commandCentreHref}>View all live work</Link>
              </div>
              <div className="dashboard-live-tabs" role="list" data-testid="dashboard-live-work-tabs">
                {liveWorkTabs.map((tab) => (
                  <Link key={tab.key} href={tab.href} className={`dashboard-live-tab dashboard-live-tab--${tab.tone}`} role="listitem">
                    <span>{tab.label}</span>
                    <strong>{tab.count}</strong>
                  </Link>
                ))}
              </div>
              <div className="dashboard-live-records">
                {[...drafts.slice(0, 1), ...liveJobs.slice(0, 2), ...readyJobs.slice(0, 1), ...unpaidJobs.slice(0, 1)].slice(0, 4).map((item: any) => {
                  const isDraft = item.kind;
                  const href = isDraft ? item.href : `/dashboard/jobs/${item.id}`;
                  return (
                    <article className="dashboard-work-row" key={`${isDraft ? item.kind : "job"}-${item.id || item.updatedAt}`}>
                      <div>
                        <strong>{isDraft ? item.title : jobTitle(item)}</strong>
                        <small>{item.locationName || item.location?.name || "No location"} · {item.assignedUser?.displayName || item.technicianName || "Unassigned"} · Updated {formatShortDateTime(item.updatedAt)}</small>
                      </div>
                      <span>{isDraft ? "Draft" : statusLabel(item.status)}</span>
                      <Link className="button secondary" href={href}>{isDraft ? "Continue" : "Open"}</Link>
                    </article>
                  );
                })}
                {!drafts.length && !liveJobs.length && !readyJobs.length && !unpaidJobs.length ? (
                  <div className="dashboard-empty">
                    <p>No live work needs attention.</p>
                    <Link className="button secondary" href="/dashboard/jobs/new?entry=dashboard">Create job</Link>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="dashboard-panel" aria-labelledby="dashboard-activity-title" data-testid="dashboard-recent-activity">
              <div className="dashboard-section-heading">
                <h2 id="dashboard-activity-title">Recent activity</h2>
                <Link href="/dashboard/audit">View activity</Link>
              </div>
              {activityError ? (
                <ErrorState
                  title="Activity unavailable"
                  description="We could not load recent activity."
                  requestId={activityRequestId}
                  primaryAction={{ label: "Retry", onClick: loadActivity }}
                />
              ) : (
                <div className="dashboard-activity-feed">
                  {activity.map((event) => (
                    <Link className="dashboard-activity-row" href={activityHref(event)} key={event.id} data-testid={`dashboard-activity-${event.id}`}>
                      <span aria-hidden="true">{activityIcon(event.type)}</span>
                      <strong>{event.label || event.type || "Activity"}</strong>
                      <small>{formatShortDateTime(event.at)}{event.customerName ? ` · ${event.customerName}` : ""}</small>
                    </Link>
                  ))}
                  {!activity.length ? <p className="dashboard-muted-empty">Activity will appear here as work moves through MyTitan.</p> : null}
                </div>
              )}
            </section>

            {summaryError ? (
              <ErrorState
                title="Some dashboard data may be stale"
                description={summaryError}
                requestId={summaryRequestId}
                primaryAction={{ label: "Retry", onClick: loadCore }}
              />
            ) : null}
          </>
        ) : null}
      </main>
    </DashboardShell>
  );
}
