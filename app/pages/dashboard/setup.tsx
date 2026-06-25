import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DashboardShell } from '../../components/dashboard-shell';
import { GuidedSetupProgress } from '../../components/guided-setup-progress';
import { OperatorActionTile, OperatorInsightIcon } from '../../components/ui/operator-insights';
import { apiFetch } from '../../lib/api';
import { isGuidedSetupV2Enabled, isMarketplaceEnabled, isTradePacksEnabled } from '../../lib/feature-flags';
import { useTenantSettings } from '../../lib/tenant-settings';

type ChecklistItem = {
  key: string;
  title: string;
  description: string;
  completed: boolean;
  href: string;
};

type JourneyItem = {
  key: string;
  title: string;
  description: string;
  completed: boolean;
  href: string;
};

type WorkspaceArea = {
  key: string;
  title: string;
  description: string;
  href: string;
};

export default function SetupChecklist() {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [installedPackCount, setInstalledPackCount] = useState(0);
  const [firstValueJourney, setFirstValueJourney] = useState<JourneyItem[]>([]);
  const [workspaceAreas, setWorkspaceAreas] = useState<WorkspaceArea[]>([]);
  const [error, setError] = useState('');
  const marketplaceEnabled = isMarketplaceEnabled();
  const tradePacksEnabled = isTradePacksEnabled();
  const guidedSetupEnabled = isGuidedSetupV2Enabled();
  const { settings } = useTenantSettings();

  useEffect(() => {
    if (!marketplaceEnabled) return;
    const load = async () => {
      try {
        const [checklist, installed] = await Promise.all([
          apiFetch('/setup/checklist'),
          tradePacksEnabled ? apiFetch('/trade-packs/installed') : Promise.resolve({ count: 0 }),
        ]);
        setItems(checklist.items || []);
        setCompletedCount(checklist.completedCount || 0);
        setTotal(checklist.total || 0);
        setFirstValueJourney(Array.isArray(checklist.firstValueJourney) ? checklist.firstValueJourney : []);
        setWorkspaceAreas(Array.isArray(checklist.workspaceAreas) ? checklist.workspaceAreas : []);
        setInstalledPackCount(Number(installed?.count || 0));
      } catch (err: any) {
        setError(err.message || 'Failed to load checklist');
      }
    };
    load();
  }, [marketplaceEnabled, tradePacksEnabled]);

  const recommendation = useMemo(() => {
    if (tradePacksEnabled && installedPackCount === 0) {
      return {
        title: 'Install a trade pack first',
        description: 'This gives you ready-made services, pricing presets, and customer messaging in one click.',
        href: '/dashboard/trade-packs',
      };
    }

    const next = [
      { key: 'workspace_details', title: 'Set business details', href: '/dashboard/settings', description: 'Add the business name and reply-to address customers should trust.' },
      { key: 'booking_link', title: 'Turn on your booking link', href: '/dashboard/booking/settings', description: 'Make it obvious where new work should come from.' },
      { key: 'first_service', title: 'Add the first service', href: '/dashboard/booking/settings', description: 'Give customers one clear thing they can book or approve.' },
      { key: 'working_hours', title: 'Set working hours', href: '/dashboard/booking/settings', description: 'Only show customers the times you genuinely want to accept work.' },
      { key: 'payment_method', title: 'Choose payment collection', href: '/dashboard/billing', description: 'Decide whether customers pay online or through manual follow-up.' },
      { key: 'first_booking_or_job', title: 'Create or receive the first booking', href: '/dashboard/jobs/new', description: 'Start the first live workflow instead of polishing settings forever.' },
      { key: 'complete_first_job', title: 'Complete the first job', href: '/dashboard/work', description: 'Run one job through the real operator workflow.' },
      { key: 'send_result', title: 'Send the result', href: '/dashboard/work', description: 'Show the customer outcome and make the next payment step clear.' },
    ];

    for (const candidate of next) {
      const item = items.find((entry) => entry.key === candidate.key);
      if (item && !item.completed) {
        return { title: candidate.title, description: candidate.description, href: candidate.href };
      }
    }

    return {
      title: 'Open your live workflow',
      description: 'Your setup basics are done. Create or receive the first booking, complete the job, and send the result.',
      href: '/dashboard/work',
    };
  }, [items, installedPackCount, tradePacksEnabled]);

  if (!marketplaceEnabled) {
    return (
      <DashboardShell>
        <div className="card">
          <h1>Setup checklist</h1>
          <p className="muted">The guided checklist is currently disabled.</p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <GuidedSetupProgress enabled={guidedSetupEnabled} incomplete={!settings?.guidedSetupCompletedAt} />
      <div className="card" style={{ marginBottom: 16 }}>
        <h1>Setup checklist</h1>
        <p className="muted">
          {completedCount}/{total} complete. Follow the shortest truthful path from setup to first booking, job, result, and payment follow-up.
        </p>
        <div className="integration-card" style={{ marginTop: 12 }}>
          <div>
            <strong>{recommendation.title}</strong>
            <p className="muted" style={{ marginTop: 6 }}>{recommendation.description}</p>
          </div>
          <div className="integration-actions">
            <Link className="button" href={recommendation.href}>Open</Link>
            {guidedSetupEnabled ? (
              <Link className="button secondary" href="/dashboard/setup-wizard">Open guided setup</Link>
            ) : null}
          </div>
        </div>
        {error && <p style={{ color: '#ff8a8a', marginTop: 12 }}>{error}</p>}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>What new teams need to do first</h2>
        <p className="muted">Keep the first run simple: set the basics, open the booking path, complete one real job, then send the result and collect payment the way you chose.</p>
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: 12 }}>
          <OperatorActionTile
            title="Set up the basics"
            description="Business details, booking link, first service, and working hours."
            icon="settings"
            tone="info"
            action={<Link className="button secondary" href="/dashboard/setup-wizard">Open guided setup</Link>}
          />
          <OperatorActionTile
            title="Start the first workflow"
            description="Create a booking or job as soon as the basics are ready."
            icon="flow"
            tone="warning"
            action={<Link className="button secondary" href="/dashboard/jobs/new">Create first job</Link>}
          />
          <OperatorActionTile
            title="Finish, send, get paid"
            description="Complete the work, send the customer-facing result, and follow the payment route you set."
            icon="billing"
            tone="success"
            action={<Link className="button secondary" href="/dashboard/work">Open work queue</Link>}
          />
        </div>
      </div>

      {firstValueJourney.length ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>First live workflow</h2>
          <p className="muted">Prioritise these before polishing anything advanced.</p>
          <div className="list">
            {firstValueJourney.map((item) => (
              <div key={item.key} className="integration-card">
                <div>
                  <strong>{item.title}</strong>
                  <p className="muted">{item.description}</p>
                </div>
                <div className="integration-actions">
                  <span className={`badge${item.completed ? '' : ' warn'}`}>{item.completed ? 'Done' : 'Next'}</span>
                  <Link className="button secondary" href={item.href}>{item.completed ? 'Open' : item.title}</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="list">
          {items.map((item) => (
            <div key={item.key} className="integration-card">
              <div>
                <strong>{item.title}</strong>
                <p className="muted">{item.description}</p>
                <p className="muted" style={{ marginTop: 6 }}>Why it matters: your customers will see this first.</p>
              </div>
              <div className="integration-actions">
                {item.completed ? <span className="badge">Done</span> : <span className="badge warn">Pending</span>}
                <Link className="button secondary" href={item.href}>
                  Open
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      {workspaceAreas.length ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Core workspace areas</h2>
          <p className="muted">Keep navigation simple at the start: jobs, customers, bookings, and calendar cover most day-one work.</p>
          <div className="list">
            {workspaceAreas.map((item) => (
              <div key={item.key} className="integration-card">
                <div>
                  <strong>{item.title}</strong>
                  <p className="muted">{item.description}</p>
                </div>
                <div className="integration-actions">
                  <Link className="button secondary" href={item.href}>Open</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <OperatorInsightIcon icon="mail" tone="info" label="Email guidance" />
          <div>
            <h2 style={{ marginTop: 0 }}>Email checks in this environment</h2>
            <p className="muted" style={{ marginBottom: 0 }}>
              Auth and customer email paths are still verified by readiness, code path, and end-to-end coverage. Live delivery is only safe to prove when SMTP readiness is genuinely ready and the target inbox is an operator-controlled real address.
            </p>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
