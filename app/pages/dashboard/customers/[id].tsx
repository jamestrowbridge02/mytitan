import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { apiFetch } from "../../../lib/api";

export default function CustomerTimelinePage() {
  const router = useRouter();
  const { id, name } = router.query;
  const [customer, setCustomer] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");

  async function loadTimeline(activeCustomer?: any) {
    try {
      const customerName =
        String(activeCustomer?.name || "")
        || (typeof name === "string" ? name : "");
      const customerId = String(activeCustomer?.id || "");
      const qs = customerId
        ? `/activity/recent?limit=30&customerId=${encodeURIComponent(customerId)}`
        : `/activity/recent?limit=30&customerName=${encodeURIComponent(customerName)}`;
      const rows = await apiFetch(qs);
      setItems(Array.isArray(rows) ? rows : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!router.isReady) return;
    const run = async () => {
      setLoading(true);
      let resolved: any = null;
      try {
        if (typeof id === "string" && id) {
          resolved = await apiFetch(`/customers/${encodeURIComponent(id)}`);
          setCustomer(resolved || null);
        }
      } catch {
        setCustomer(null);
      }
      await loadTimeline(resolved);
    };
    void run();
  }, [router.isReady, id, name]);

  async function sendCommunication() {
    try {
      const customerName = String(customer?.name || "") || (typeof name === "string" ? name : "Customer");
      const res = await apiFetch("/activity/communications/send", {
        method: "POST",
        body: JSON.stringify({
          channel,
          customerId: customer?.id || null,
          customerName,
          subject: channel === "email" ? subject : null,
          message,
        }),
      });
      setNotice(res?.label || "Sent");
      setMessage("");
      setSubject("");
      await loadTimeline(customer);
      window.setTimeout(() => setNotice(""), 1800);
    } catch {
      setNotice("Could not send communication");
      window.setTimeout(() => setNotice(""), 1800);
    }
  }

  return (
    <DashboardShell>
      <div data-customer-comms-timeline="enabled" style={{ position: "absolute", left: -99999, top: -99999, width: 1, height: 1, overflow: "hidden" }}>
        CUSTOMER_COMMS_TIMELINE_ENABLED
      </div>
      <div data-customer-timeline="enabled" style={{ position: "absolute", left: -99999, top: -99999, width: 1, height: 1, overflow: "hidden" }}>
        CUSTOMER_TIMELINE_ENABLED
      </div>

      <div className="card customer-timeline-card">
        <div className="customer-timeline-head">
          <div>
            <h1 className="settings-premium-title" style={{ marginTop: 0, marginBottom: 6 }}>Customer timeline</h1>
            <p className="muted settings-premium-muted" style={{ margin: 0 }}>
              {customer?.name || (typeof name === "string" && name ? name : `Customer ${typeof id === "string" ? id : ""}`)}
            </p>
          </div>
        </div>

        <div className="card customer-comms-card">
          <div className="customer-comms-head">
            <h3 style={{ margin: 0 }}>Send communication</h3>
            {notice ? <div className="ccv2-toast ccv2-toast--info">{notice}</div> : null}
          </div>

          <div className="customer-comms-form">
            <label className="settings-premium-label">Channel</label>
            <select className="input settings-premium-input" value={channel} onChange={(e) => setChannel(e.target.value as "sms" | "email")}>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
            </select>

            {channel === "email" ? (
              <>
                <label className="settings-premium-label">Subject</label>
                <input className="input settings-premium-input" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </>
            ) : null}

            <label className="settings-premium-label">Message</label>
            <textarea className="textarea settings-premium-input customer-comms-textarea" value={message} onChange={(e) => setMessage(e.target.value)} />

            <button className="button settings-premium-button" type="button" onClick={() => void sendCommunication()}>
              Send
            </button>
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
