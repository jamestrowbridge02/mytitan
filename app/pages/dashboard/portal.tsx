import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import {
  OperatorDataTable,
  OperatorDataTableHeader,
  OperatorDataTableRow,
  OperatorEmptyStateCard,
  OperatorGuidance,
  OperatorPageHeader,
  OperatorRowActions,
} from "../../components/ui/operator-page";
import { apiFetch } from "../../lib/api";

type PortalOverview = {
  enabled: boolean;
  paymentsEnabled: boolean;
  stripeConfigured: boolean;
  summary: {
    activeLinks: number;
    awaitingApproval: number;
    paymentReady: number;
  };
  jobs: Array<{
    id: string;
    jobRef: string;
    customerName: string;
    status: string;
    approvedAt?: string | null;
    invoiceIssuedAt?: string | null;
    invoicePaidAt?: string | null;
    portalTokenActive: boolean;
    portalUrl?: string | null;
    paymentReady: boolean;
  }>;
};

export default function PortalOpsPage() {
  const [data, setData] = useState<PortalOverview | null>(null);
  const [error, setError] = useState("");
  const [busyJobId, setBusyJobId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await apiFetch("/portal/overview");
      setData(res);
      setError("");
    } catch (err: any) {
      setError(err?.message || "Failed to load portal operations");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function provisionLink(jobId: string) {
    setBusyJobId(jobId);
    try {
      await apiFetch(`/portal/jobs/${jobId}/link`, { method: "POST" });
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to prepare portal link");
    } finally {
      setBusyJobId(null);
    }
  }

  const stats = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Active links", value: String(data.summary.activeLinks), hint: "Jobs with portal access live now" },
      { label: "Awaiting approval", value: String(data.summary.awaitingApproval), hint: "Completed work still waiting on sign-off" },
      { label: "Payment ready", value: String(data.summary.paymentReady), hint: data.stripeConfigured ? "Portal can hand off to payment" : "Stripe not configured" },
    ];
  }, [data]);

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Business OS"
          title="Portal Ops"
          subtitle="Internal control over customer-facing job links, approval state, and payment-capable portal handoff."
          actions={[
            { label: "Billing readiness", href: "/dashboard/billing/readiness", variant: "secondary" },
            { label: "Jobs", href: "/dashboard/jobs" },
          ]}
          shortcuts={["Portal links stay internal until explicitly opened", "This view manages customer access from the operator side"]}
          stats={stats}
        />

        <OperatorGuidance
          title="Portal operations"
          items={[
            "This page is internal only. Public access still depends on tokenized portal routes.",
            "Use Prepare link to provision or refresh a customer-safe portal URL for a job.",
            "Portal readiness and payment readiness are shown separately so the customer-facing boundary stays explicit.",
          ]}
        />

        {error ? <p role="alert" style={{ color: "#ff8a8a", marginTop: 0 }}>{error}</p> : null}

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Customer-facing job access</h2>
              <p className="operator-section__subtitle">Secure internal management over public job tokens and customer portal readiness.</p>
            </div>
          </div>

          {data?.jobs?.length ? (
            <OperatorDataTable columns="minmax(220px, 1.4fr) minmax(160px, 1fr) minmax(160px, 0.9fr) minmax(180px, auto)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Job</div>
                <div className="operator-table__cell">Portal state</div>
                <div className="operator-table__cell">Commercial state</div>
                <div className="operator-table__cell">Actions</div>
              </OperatorDataTableHeader>
              {data.jobs.map((job) => (
                <OperatorDataTableRow key={job.id}>
                  <div className="operator-table__cell">
                    <div className="operator-cellTitle">{job.jobRef}</div>
                    <div className="operator-cellSubtle">{job.customerName} · {job.status}</div>
                  </div>
                  <div className="operator-table__cell">
                    <div className="operator-cellMeta">
                      <span><strong>{job.portalTokenActive ? "Link active" : "No active link"}</strong></span>
                      <span>{job.approvedAt ? "Approved" : "Awaiting approval state"}</span>
                    </div>
                  </div>
                  <div className="operator-table__cell">
                    <div className="operator-cellMeta">
                      <span><strong>{job.invoicePaidAt ? "Paid" : job.invoiceIssuedAt ? "Invoice issued" : "Pre-invoice"}</strong></span>
                      <span>{job.paymentReady ? "Payment-capable portal" : "Portal-only / payment disabled"}</span>
                    </div>
                  </div>
                  <div className="operator-table__cell operator-table__cell--actions">
                    <OperatorRowActions
                      primaryAction={
                        job.portalUrl
                          ? { label: "Open portal", href: job.portalUrl }
                          : { label: busyJobId === job.id ? "Preparing..." : "Prepare link", onClick: () => void provisionLink(job.id), disabled: busyJobId === job.id }
                      }
                      actions={[
                        { label: "Open job", href: `/dashboard/jobs/${job.id}`, group: "Internal", description: "Review the internal job record" },
                        { label: "Open billing readiness", href: "/dashboard/billing/readiness", group: "Internal", description: "Review billing and payment readiness" },
                      ]}
                    />
                  </div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard
              title="No portal-manageable jobs yet"
              description="Jobs with internal/customer handoff value will appear here once work starts moving through approval and payment states."
              actions={[{ label: "Open jobs", href: "/dashboard/jobs" }]}
            />
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
