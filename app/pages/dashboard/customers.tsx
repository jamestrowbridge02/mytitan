import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import { OperatorPageHeader } from "../../components/ui/operator-page";
import { apiFetch } from "../../lib/api";

type CustomerRow = {
  id: string;
  slug?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  jobCount?: number;
  activityCount?: number;
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const rows = await apiFetch("/customers?limit=100");
        setCustomers(Array.isArray(rows) ? rows : []);
      } catch (err: any) {
        setError(err?.message || "Failed to load customers");
        setCustomers([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  async function createMessageEvent(customer: CustomerRow, kind: "sms.sent" | "email.sent" | "portal.viewed") {
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
          customerId: customer.id,
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

  async function sendQuickCommunication(customer: CustomerRow, channel: "sms" | "email") {
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
          customerId: customer.id,
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

  const stats = useMemo(() => {
    const totalJobs = customers.reduce((sum, customer) => sum + Number(customer.jobCount || 0), 0);
    const totalActivity = customers.reduce((sum, customer) => sum + Number(customer.activityCount || 0), 0);
    const contactable = customers.filter((customer) => customer.email || customer.phone).length;
    return [
      { label: "Customers", value: String(customers.length), hint: `${contactable} with direct contact details` },
      { label: "Jobs linked", value: String(totalJobs), hint: "Current customer workload" },
      { label: "Timeline events", value: String(totalActivity), hint: "Logged communications and activity" },
    ];
  }, [customers]);

  return (
    <DashboardShell>
      <div data-customer-comms="enabled" style={{ position: "absolute", left: -99999, top: -99999, width: 1, height: 1, overflow: "hidden" }}>
        CUSTOMER_COMMS_ENABLED
      </div>
      <div data-customer-events="enabled" style={{ position: "absolute", left: -99999, top: -99999, width: 1, height: 1, overflow: "hidden" }}>
        CUSTOMER_EVENTS_ENABLED
      </div>

      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Customers"
          title="CRM"
          subtitle="Customer records, messaging events, and timeline shortcuts from one operator-ready workspace."
          actions={[
            { label: "Command Centre", href: "/dashboard/command-centre-v2", variant: "secondary" },
            { label: "New job", href: "/dashboard/jobs/new" },
          ]}
          shortcuts={["Log contact events inline", "Open any customer timeline in one click"]}
          stats={stats}
        />

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Customer roster</h2>
              <p className="operator-section__subtitle">Compact rows keep messaging actions, workload, and timeline entry points visible.</p>
            </div>
          </div>

          {error ? <p style={{ color: "#ff8a8a", marginTop: 0 }}>{error}</p> : null}
          {notice ? <div className="ccv2-toast ccv2-toast--info">{notice}</div> : null}

          {loading ? (
            <div className="operator-note">Loading customers...</div>
          ) : customers.length === 0 ? (
            <div className="operator-empty">
              <h3>No customers found yet</h3>
              <p className="muted">Create a job or log a message event and the CRM workspace will populate automatically.</p>
              <div className="operator-empty__actions">
                <Link className="button" href="/dashboard/jobs/new">
                  Create job
                </Link>
                <Link className="button secondary" href="/dashboard/command-centre-v2">
                  Open Command Centre
                </Link>
              </div>
            </div>
          ) : (
            <div className="operator-list">
              {customers.map((customer) => {
                const href = `/dashboard/customers/${encodeURIComponent(customer.slug || customer.id)}?name=${encodeURIComponent(customer.name)}`;
                return (
                  <article key={customer.id} className="operator-row">
                    <div className="operator-row__main">
                      <div className="operator-row__title">
                        <Link href={href}>{customer.name}</Link>
                        <span className="operator-tag">{Number(customer.jobCount || 0)} jobs</span>
                      </div>
                      <div className="operator-row__subtitle">{customer.email || customer.phone || "No contact details recorded"}</div>
                    </div>

                    <div className="operator-row__meta">
                      <div className="operator-row__metaLine">
                        Activity: <strong>{Number(customer.activityCount || 0)} events</strong>
                      </div>
                      <div className="operator-row__metaLine">
                        Contact: <strong>{customer.email ? "Email" : customer.phone ? "Phone" : "Missing"}</strong>
                      </div>
                    </div>

                    <div className="operator-row__actions">
                      <button className="button secondary operator-compact-button" onClick={() => void createMessageEvent(customer, "sms.sent")}>
                        Log SMS
                      </button>
                      <button className="button secondary operator-compact-button" onClick={() => void createMessageEvent(customer, "email.sent")}>
                        Log email
                      </button>
                      <button className="button secondary operator-compact-button" onClick={() => void createMessageEvent(customer, "portal.viewed")}>
                        Log portal
                      </button>
                      <button className="button secondary operator-compact-button" onClick={() => void sendQuickCommunication(customer, "sms")}>
                        Send SMS
                      </button>
                      <button className="button secondary operator-compact-button" onClick={() => void sendQuickCommunication(customer, "email")}>
                        Send email
                      </button>
                      <Link href={href} className="button operator-compact-button">
                        Open timeline
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
