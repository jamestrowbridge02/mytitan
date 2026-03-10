import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import {
  OperatorDataTable,
  OperatorDataTableHeader,
  OperatorDataTableRow,
  OperatorEmptyStateCard,
  OperatorGuidance,
  OperatorPageHeader,
  OperatorRowActions,
} from "../../../components/ui/operator-page";
import { apiFetch } from "../../../lib/api";

type BillingReadiness = {
  paymentsEnabled: boolean;
  stripeConfigured: boolean;
  summary: {
    completedJobs: number;
    invoiceReady: number;
    invoiceIssued: number;
    issuedAwaitingPayment: number;
    paid: number;
    paymentReady: number;
    portalReady: number;
    overdueInvoices: number;
    overdueBillingFollowUps: number;
    billingEscalationsLast7Days: number;
  };
  jobs: Array<{
    id: string;
    jobRef: string;
    customerName: string;
    status: string;
    totalCents: number;
    currency: string;
    completedAt?: string | null;
    invoiceIssuedAt?: string | null;
    invoiceDueAt?: string | null;
    invoicePaidAt?: string | null;
    invoiceReady: boolean;
    paymentReady: boolean;
    portalReady: boolean;
    invoiceOverdue?: boolean;
    lifecycleState?: string;
    nextStep?: string;
    billingFollowUpAt?: string | null;
    billingFollowUpOverdue?: boolean;
    invoiceDocumentReady?: boolean;
    receiptReady?: boolean;
    billingTimeline?: Array<{ eventType?: string | null; message?: string | null; createdAt?: string | null }>;
    portalUrl?: string | null;
    paymentLinkUrl?: string | null;
  }>;
};

function money(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format((cents || 0) / 100);
}

export default function BillingReadinessPage() {
  const [data, setData] = useState<BillingReadiness | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyJobId, setBusyJobId] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await apiFetch("/billing/readiness");
      setData(res);
      setError("");
    } catch (err: any) {
      setError(err?.message || "Failed to load billing readiness");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function run(jobId: string, action: "issue-invoice" | "mark-paid" | "queue-follow-up" | "escalate-follow-up") {
    setBusyJobId(jobId);
    try {
      await apiFetch(`/billing/jobs/${jobId}/${action}`, { method: "POST" });
      setNotice(
        action === "issue-invoice"
          ? "Invoice issued"
          : action === "mark-paid"
          ? "Payment recorded"
          : action === "escalate-follow-up"
          ? "Billing follow-up escalated"
          : "Billing follow-up queued",
      );
      await load();
    } catch (err: any) {
      setError(err?.message || `Failed to ${action}`);
    } finally {
      setBusyJobId(null);
    }
  }

  const stats = useMemo(() => {
    if (!data) return [];
    return [
      { label: "Invoice-ready", value: String(data.summary.invoiceReady), hint: "Completed work awaiting invoice flow" },
      { label: "Issued", value: String(data.summary.invoiceIssued), hint: "Invoice already issued" },
      { label: "Awaiting payment", value: String(data.summary.issuedAwaitingPayment), hint: "Issued invoices still open" },
      { label: "Overdue invoices", value: String(data.summary.overdueInvoices), hint: "Issued invoices already past due" },
      { label: "Paid", value: String(data.summary.paid), hint: "Paid jobs tracked by current billing fields" },
      { label: "Payment-ready", value: String(data.summary.paymentReady), hint: data.stripeConfigured ? "Stripe can attach later" : "Stripe not configured" },
      { label: "Overdue follow-ups", value: String(data.summary.overdueBillingFollowUps), hint: "Billing reminders already past due" },
      { label: "Escalations 7d", value: String(data.summary.billingEscalationsLast7Days), hint: "Billing reminders pushed into faster collections follow-up" },
    ];
  }, [data]);

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Business OS"
          title="Billing readiness"
          subtitle="A revenue-operations slice over completed work, invoice state, payment readiness, and portal access."
          actions={[
            { label: "Billing", href: "/dashboard/billing", variant: "secondary" },
            { label: "Portal Ops", href: "/dashboard/portal" },
          ]}
          shortcuts={["This is a readiness layer, not a fake processor", "Use it to move completed work toward invoice and payment"]}
          stats={stats}
        />

        <OperatorGuidance
          title="Readiness guidance"
          items={[
            "Invoice-ready means the job is completed but still waiting for invoice issuance.",
            "Payment-ready means the workspace can attach a payment flow later with the current billing configuration.",
            "Portal-ready means the job already has an active customer portal link available.",
          ]}
        />

        {error ? <p role="alert" style={{ color: "#ff8a8a", marginTop: 0 }}>{error}</p> : null}
        {notice ? <div aria-live="polite" className="ccv2-toast ccv2-toast--info" role="status">{notice}</div> : null}

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Completed work queue</h2>
              <p className="operator-section__subtitle">Real completed and invoiced jobs, with future billing and customer portal readiness layered on top.</p>
            </div>
          </div>

          {data?.jobs?.length ? (
            <OperatorDataTable columns="minmax(220px, 1.4fr) minmax(140px, 0.9fr) minmax(160px, 1fr) minmax(180px, auto)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Job</div>
                <div className="operator-table__cell">Value</div>
                <div className="operator-table__cell">Readiness</div>
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
                      <span><strong>{money(job.totalCents, job.currency)}</strong></span>
                      <span>{job.completedAt ? `Completed ${new Date(job.completedAt).toLocaleDateString()}` : "Completion date unavailable"}</span>
                    </div>
                  </div>
                  <div className="operator-table__cell">
                    <div className="operator-cellMeta">
                      <span><strong>{job.invoiceIssuedAt ? "Invoice issued" : job.invoiceReady ? "Invoice ready" : "Not ready"}</strong></span>
                      <span>{job.invoicePaidAt ? "Paid" : job.paymentReady ? "Payment-capable" : "Payment not ready"}</span>
                      {job.lifecycleState ? <span>Lifecycle {job.lifecycleState.replaceAll("_", " ")}</span> : null}
                      {job.invoiceDueAt ? (
                        <span>{job.invoiceOverdue ? `Payment overdue since ${new Date(job.invoiceDueAt).toLocaleDateString()}` : `Payment due ${new Date(job.invoiceDueAt).toLocaleDateString()}`}</span>
                      ) : null}
                      <span>{job.portalReady ? "Portal ready" : "Portal link missing"}</span>
                      {job.billingFollowUpAt ? (
                        <span>{job.billingFollowUpOverdue ? `Follow-up overdue since ${new Date(job.billingFollowUpAt).toLocaleDateString()}` : `Follow-up due ${new Date(job.billingFollowUpAt).toLocaleDateString()}`}</span>
                      ) : null}
                      {job.nextStep ? <span>{job.nextStep}</span> : null}
                      {job.billingTimeline?.[0]?.createdAt ? (
                        <span>{job.billingTimeline[0].message || job.billingTimeline[0].eventType} · {new Date(job.billingTimeline[0].createdAt).toLocaleString()}</span>
                      ) : null}
                      <span>{job.invoiceDocumentReady ? "Invoice artifact linked" : "Invoice artifact not linked"}</span>
                      <span>{job.receiptReady ? "Receipt stored" : "Receipt not stored"}</span>
                    </div>
                  </div>
                  <div className="operator-table__cell operator-table__cell--actions">
                    <OperatorRowActions
                      primaryAction={
                        !job.invoiceIssuedAt
                          ? { label: busyJobId === job.id ? "Issuing..." : "Issue invoice", onClick: () => void run(job.id, "issue-invoice"), disabled: busyJobId === job.id }
                          : !job.invoicePaidAt
                          ? { label: busyJobId === job.id ? "Recording..." : "Mark paid", onClick: () => void run(job.id, "mark-paid"), disabled: busyJobId === job.id }
                          : { label: "Open job", href: `/dashboard/jobs/${job.id}` }
                      }
                      actions={[
                        ...(!job.invoicePaidAt
                          ? [
                              {
                                label: busyJobId === job.id ? "Queuing..." : "Queue follow-up",
                                onClick: () => void run(job.id, "queue-follow-up"),
                                group: "Payments",
                                description: "Create or refresh a billing reminder for this job",
                                disabled: busyJobId === job.id,
                              },
                              ...(job.billingFollowUpOverdue
                                ? [{
                                    label: busyJobId === job.id ? "Escalating..." : "Escalate follow-up",
                                    onClick: () => void run(job.id, "escalate-follow-up"),
                                    group: "Payments",
                                    description: "Pull an overdue billing follow-up forward for operator attention",
                                    disabled: busyJobId === job.id,
                                  }]
                                : []),
                            ]
                          : []),
                        { label: "Open job", href: `/dashboard/jobs/${job.id}`, group: "Internal", description: "Open the internal job record" },
                        ...(job.portalUrl ? [{ label: "Open portal", href: job.portalUrl, group: "Customer access", description: "Open the current customer-facing job summary" }] : []),
                        ...(job.paymentLinkUrl ? [{ label: "Open payment link", href: job.paymentLinkUrl, group: "Payments", description: "Open the current payment URL" }] : []),
                        { label: "Open billing", href: "/dashboard/billing", group: "Payments", description: "Review Stripe and tenant billing configuration" },
                      ]}
                    />
                  </div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard
              title="No completed work yet"
              description="Completed and invoiced jobs will appear here once work is ready to move into billing operations."
              actions={[{ label: "Open jobs", href: "/dashboard/jobs" }]}
            />
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
