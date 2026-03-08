import { DashboardShell } from "../../../components/dashboard-shell";

export default function IntegrationsPage() {
  return (
    <DashboardShell>
      <div className="card settings-premium-card">
        <h1 className="settings-premium-title">Integrations</h1>
        <p className="muted settings-premium-muted">
          Connect payments, messaging, calendars, and internal tooling from one place.
        </p>
        <div className="card settings-premium-card" style={{ marginTop: 14, padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>Available next</h3>
          <p className="muted" style={{ marginBottom: 0 }}>
            Calendar sync, invoicing, email, and operational webhooks.
          </p>
        </div>
      </div>
    </DashboardShell>
  );
}
