import Link from "next/link";
import { DashboardShell } from "../../components/dashboard-shell";

export default function CustomersPage() {
  return (
    <DashboardShell>
      <div className="card settings-premium-card">
        <h1 className="settings-premium-title">CRM</h1>
        <p className="muted settings-premium-muted">
          Customer records, segments, and notes now have a stable entry point.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <Link href="/dashboard/jobs" className="button settings-premium-button">View jobs</Link>
          <Link href="/dashboard/command-centre-v2" className="button secondary settings-premium-button">Open Command Centre</Link>
          <Link href="/dashboard/settings" className="button secondary settings-premium-button">Settings</Link>
        </div>
      </div>
    </DashboardShell>
  );
}
