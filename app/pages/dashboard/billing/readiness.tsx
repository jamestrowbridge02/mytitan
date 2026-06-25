import { useEffect, useMemo, useState } from "react";
import { OperatorNotice } from "../../../components/feedback/OperatorNotice";
import { useOperatorNotice } from "../../../components/feedback/useOperatorNotice";
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
import { humanizeUnderscoreLabel } from "../../../lib/text-format";
import { emptyPermissionSnapshot, hasWorkspacePermission, normalizePermissionSnapshot } from "../../../lib/workspace-permissions";

type BillingReadiness = {
  paymentsEnabled: boolean;
  stripeConfigured: boolean;
  paymentSetupLabel?: string;
  paymentSetupDetail?: string;
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
    paymentSetupLabel?: string | null;
    paymentSetupDetail?: string | null;
  }>;
};

function money(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "GBP" }).format((cents || 0) / 100);
}

export default function BillingReadinessPage() {
  const [data, setData] = useState<BillingReadiness | null>(null);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState(() => emptyPermissionSnapshot());
  const [permissionsReady, setPermissionsReady] = useState(false);
  const { notice, showError, showSuccess, clearNotice } = useOperatorNotice();

  const load = async () => {
    try {
      const res = await apiFetch("/billing/readiness");
      setData(res);
      if (notice?.kind === "error") clearNotice();
    } catch (err: any) {
      showError(err?.message || "Failed to load billing readiness");
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadMe = async () => {
      try {
        const me = await apiFetch("/me");
        if (!cancelled) {
          setPermissions(normalizePermissionSnapshot(me?.permissions));
        }
      } catch {
        if (!cancelled) {
          setPermissions(emptyPermissionSnapshot());
        }
      } finally {
        if (!cancelled) {
          setPermissionsReady(true);
        }
      }
    };
    void loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!permissionsReady || !hasWorkspacePermission(permissions, "billing.manage")) return;
    void load();
  }, [permissions, permissionsReady]);

  async function run(jobId: string, action: "issue-invoice" | "mark-paid" | "queue-follow-up" | "escalate-follow-up") {
    setBusyJobId(jobId);
    try {
      await apiFetch(`/billing/jobs/${jobId}/${action}`, { method: "POST" });
      showSuccess(
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
      showError(err?.message || `Failed to ${action}`);
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
      { label: "Payment path", value: String(data.summary.paymentReady), hint: data.paymentSetupLabel || "Manual collection or business provider setup" },
      { label: "Overdue follow-ups", value: String(data.summary.overdueBillingFollowUps), hint: "Billing reminders already past due" },
      { label: "Escalations 7d", value: String(data.summary.billingEscalationsLast7Days), hint: "Billing reminders pushed into faster collections follow-up" },
    ];
  }, [data]);

  if (permissionsReady && !hasWorkspacePermission(permissions, "billing.manage")) {
    return (
      <DashboardShell>
        <div className="operator-stack" data-testid="billing-governance-blocked">
          <OperatorPageHeader
            eyebrow="Business OS"
            title="Billing readiness"
            subtitle="Billing actions are restricted to roles trusted with invoice and payment operations."
            stats={[]}
          />
          <OperatorEmptyStateCard
            title="Billing access restricted"
            description="Your workspace role cannot issue invoices or record payments. Ask an owner, admin, finance user, or legacy staff operator for access."
          />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow="Business OS"
          title="Billing readiness"
          subtitle="A compact view of completed work, invoice state, customer payment setup, and customer-page access."
          actions={[
            { label: "Billing", href: "/dashboard/billing", variant: "secondary" },
            { label: "Finance", href: "/dashboard/finance", variant: "secondary" },
            { label: "Portal Ops", href: "/dashboard/portal" },
          ]}
          shortcuts={["This is a readiness layer, not a fake processor", "Use it to move completed work toward invoice and payment"]}
          stats={stats}
        />

        <OperatorGuidance
          title="Readiness guidance"
          items={[
            "Invoice-ready means the job is completed but still waiting for invoice issuance.",
            "Payment path means the job can move forward with the current business payment setup, even if collection is manual.",
            "Customer page ready means the job already has an active customer-facing link available.",
          ]}
        />

        <OperatorNotice notice={notice} onDismiss={clearNotice} />

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Completed work queue</h2>
              <p className="operator-section__subtitle">Completed and invoiced jobs, with truthful payment-setup guidance and customer-page access alongside them.</p>
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
                      <span>{job.invoicePaidAt ? "Paid" : job.paymentSetupLabel || (job.paymentReady ? "Manual collection" : "Payment setup needed")}</span>
                      {job.lifecycleState ? <span>Lifecycle {humanizeUnderscoreLabel(job.lifecycleState)}</span> : null}
                      {job.invoiceDueAt ? (
                        <span>{job.invoiceOverdue ? `Payment overdue since ${new Date(job.invoiceDueAt).toLocaleDateString()}` : `Payment due ${new Date(job.invoiceDueAt).toLocaleDateString()}`}</span>
                      ) : null}
                      <span>{job.portalReady ? "Portal ready" : "Portal link missing"}</span>
                      {job.billingFollowUpAt ? (
                        <span>{job.billingFollowUpOverdue ? `Follow-up overdue since ${new Date(job.billingFollowUpAt).toLocaleDateString()}` : `Follow-up due ${new Date(job.billingFollowUpAt).toLocaleDateString()}`}</span>
                      ) : null}
                      {job.nextStep ? <span>{job.nextStep}</span> : null}
                      {job.paymentSetupDetail ? <span>{job.paymentSetupDetail}</span> : null}
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
                          ? { label: busyJobId === job.id ? "Issuing..." : "Issue invoice", onClick: () => void run(job.id, "issue-invoice"), disabled: busyJobId === job.id, testId: `billing-issue-invoice-${job.id}` }
                          : !job.invoicePaidAt
                          ? { label: busyJobId === job.id ? "Recording..." : "Mark paid", onClick: () => void run(job.id, "mark-paid"), disabled: busyJobId === job.id, testId: `billing-mark-paid-${job.id}` }
                          : { label: "Open job", href: `/dashboard/jobs/${job.id}`, testId: `billing-open-job-${job.id}` }
                      }
                      actions={[
                        ...(!job.invoicePaidAt
                          ? [
                              {
                                label: busyJobId === job.id ? "Queuing..." : "Queue follow-up",
                                onClick: () => void run(job.id, "queue-follow-up"),
                                group: "Payments",
                                description: job.billingFollowUpAt ? "Refresh the current billing reminder for this job" : "Create a billing reminder for this job",
                                disabled: busyJobId === job.id,
                                testId: `billing-queue-follow-up-${job.id}`,
                              },
                              ...(job.billingFollowUpOverdue
                                ? [{
                                    label: busyJobId === job.id ? "Escalating..." : "Escalate follow-up",
                                    onClick: () => void run(job.id, "escalate-follow-up"),
                                    group: "Payments",
                                    description: "Pull an overdue billing follow-up forward for operator attention",
                                    disabled: busyJobId === job.id,
                                    testId: `billing-escalate-follow-up-${job.id}`,
                                  }]
                                : []),
                            ]
                          : []),
                        { label: "Open job", href: `/dashboard/jobs/${job.id}`, group: "Internal", description: "Open the internal job record" },
                        ...(job.portalUrl ? [{ label: "Open customer page", href: job.portalUrl, group: "Customer access", description: "Open the current customer-facing job summary" }] : []),
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
