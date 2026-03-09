import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { apiFetch } from "../../../lib/api";

export default function CustomerTimelinePage() {
  const router = useRouter();
  const { id, name } = router.query;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!router.isReady) return;
    const run = async () => {
      try {
        const customerName = typeof name === "string" ? name : "";
        const rows = await apiFetch(`/activity/recent?limit=30&customerName=${encodeURIComponent(customerName)}`);
        setItems(Array.isArray(rows) ? rows : []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [router.isReady, name]);

  return (
    <DashboardShell>
      <div data-customer-timeline="enabled" style={{ position: "absolute", left: -99999, top: -99999, width: 1, height: 1, overflow: "hidden" }}>
        CUSTOMER_TIMELINE_ENABLED
      </div>

      <div className="card customer-timeline-card">
        <div className="customer-timeline-head">
          <div>
            <h1 className="settings-premium-title" style={{ marginTop: 0, marginBottom: 6 }}>Customer timeline</h1>
            <p className="muted settings-premium-muted" style={{ margin: 0 }}>
              {typeof name === "string" && name ? name : `Customer ${typeof id === "string" ? id : ""}`}
            </p>
          </div>
        </div>

        <div className="customer-timeline-list">
          {loading ? (
            <div className="muted">Loading customer activity…</div>
          ) : items.length ? (
            items.map((item) => (
              <div key={item.id || `${item.type}-${item.at}`} className="customer-timeline-item">
                <div className="customer-timeline-dot"></div>
                <div className="customer-timeline-content">
                  <div className="customer-timeline-label">{item.label || item.type}</div>
                  <div className="customer-timeline-meta">
                    <span>{item.jobRef || "Customer event"}</span>
                    <span>•</span>
                    <span>{item.at ? new Date(item.at).toLocaleString() : ""}</span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="muted">No customer activity recorded yet.</div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
