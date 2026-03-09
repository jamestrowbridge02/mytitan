import Link from "next/link";
import { useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import { apiFetch } from "../../lib/api";

const DEMO_CUSTOMERS = [
  { id: "cust-jane-doe", name: "Jane Doe" },
  { id: "cust-alex-morgan", name: "Alex Morgan" },
];

export default function CustomersPage() {
  const [notice, setNotice] = useState("");

  async function createMessageEvent(customer: { id: string; name: string }, kind: "sms.sent" | "email.sent" | "portal.viewed") {
    try {
      const label =
        kind === "sms.sent"
          ? `SMS sent to ${customer.name}`
          : kind === "email.sent"
          ? `Email sent to ${customer.name}`
          : `${customer.name} opened the customer portal`;

      await apiFetch("/activity/events", {
        method: "POST",
        body: JSON.stringify({
          type: kind,
          label,
          customerName: customer.name,
          payloadJson: { customerId: customer.id, channel: kind },
        }),
      });

      setNotice(label);
      window.setTimeout(() => setNotice(""), 1800);
    } catch {
      setNotice("Could not create messaging event");
      window.setTimeout(() => setNotice(""), 1800);
    }
  }

  async function sendQuickCommunication(customer: { id: string; name: string }, channel: "sms" | "email") {
    try {
      const message =
        channel === "sms"
          ? `Hi ${customer.name}, your MyTitan update is ready.`
          : `Hello ${customer.name}, your latest MyTitan update is ready.`;

      const subject = channel === "email" ? "MyTitan customer update" : null;

      const res = await apiFetch("/activity/communications/send", {
        method: "POST",
        body: JSON.stringify({
          channel,
          customerName: customer.name,
          subject,
          message,
        }),
      });

      setNotice(res?.label || `${channel.toUpperCase()} sent`);
      window.setTimeout(() => setNotice(""), 1800);
    } catch {
      setNotice(`Could not send ${channel.toUpperCase()}`);
      window.setTimeout(() => setNotice(""), 1800);
    }
  }

  return (
    <DashboardShell>
      <div data-customer-comms="enabled" style={{ position: "absolute", left: -99999, top: -99999, width: 1, height: 1, overflow: "hidden" }}>
        CUSTOMER_COMMS_ENABLED
      </div>

      <div className="card settings-premium-card">
        <h1 className="settings-premium-title">CRM</h1>
        <p className="muted settings-premium-muted">
          Customer records, messaging events, communications, and timeline access from one workspace.
        </p>

        {notice ? <div className="ccv2-toast ccv2-toast--info">{notice}</div> : null}

        <div className="customer-grid">
          {DEMO_CUSTOMERS.map((customer) => (
            <div key={customer.id} className="card customer-card">
              <h3 style={{ marginTop: 0 }}>{customer.name}</h3>
              <div className="customer-card-actions">
                <button className="button secondary settings-premium-button" onClick={() => void createMessageEvent(customer, "sms.sent")}>
                  Log SMS
                </button>
                <button className="button secondary settings-premium-button" onClick={() => void createMessageEvent(customer, "email.sent")}>
                  Log email
                </button>
                <button className="button secondary settings-premium-button" onClick={() => void createMessageEvent(customer, "portal.viewed")}>
                  Log portal view
                </button>
                <button className="button secondary settings-premium-button" onClick={() => void sendQuickCommunication(customer, "sms")}>
                  Send SMS
                </button>
                <button className="button secondary settings-premium-button" onClick={() => void sendQuickCommunication(customer, "email")}>
                  Send email
                </button>
                <Link
                  href={`/dashboard/customers/${customer.id}?name=${encodeURIComponent(customer.name)}`}
                  className="button settings-premium-button"
                >
                  Open timeline
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
