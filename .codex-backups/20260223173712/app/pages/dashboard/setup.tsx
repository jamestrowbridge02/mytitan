import { useEffect, useState } from 'react';
import { DashboardShell } from '../../components/dashboard-shell';
import { apiFetch } from '../../lib/api';
import { isMarketplaceEnabled } from '../../lib/feature-flags';

type ChecklistItem = {
  key: string;
  title: string;
  description: string;
  completed: boolean;
  href: string;
};

export default function SetupChecklist() {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const marketplaceEnabled = isMarketplaceEnabled();

  useEffect(() => {
    if (!marketplaceEnabled) return;
    const load = async () => {
      try {
        const data = await apiFetch('/setup/checklist');
        setItems(data.items || []);
        setCompletedCount(data.completedCount || 0);
        setTotal(data.total || 0);
      } catch (err: any) {
        setError(err.message || 'Failed to load checklist');
      }
    };
    load();
  }, []);

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
      <div className="card">
        <h1>Setup checklist</h1>
        <p className="muted">
          {completedCount}/{total} complete. Follow the quick actions to finish your setup.
        </p>
        {error && <p style={{ color: '#ff8a8a' }}>{error}</p>}
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
                <a className="button secondary" href={item.href}>
                  Open
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
