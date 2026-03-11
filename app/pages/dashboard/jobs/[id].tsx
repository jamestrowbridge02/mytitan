import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { EntityCustomFieldsCard } from "../../../components/custom-fields/EntityCustomFieldsCard";
import { DashboardShell } from "../../../components/dashboard-shell";
import OnboardingCoach from "../../../components/coach/OnboardingCoach";
import EntityHeader, { type EntityAction } from "../../../components/entity/EntityHeader";
import RelatedLinks from "../../../components/entity/RelatedLinks";
import EntitySection from "../../../components/entity/EntitySection";
import EntityTimeline, { type EntityTimelineItem } from "../../../components/entity/EntityTimeline";
import OpsSignalsBar from "../../../components/entity/OpsSignalsBar";
import SendUpdatePanel from "../../../components/notifications/SendUpdatePanel";
import { ErrorState } from "../../../components/states/ErrorState";
import { LoadingState } from "../../../components/states/LoadingState";
import { ApiError, apiFetch } from "../../../lib/api";
import { markDemoStepComplete } from "../../../lib/onboarding-coach";
import { isCommandCentreV2Enabled, isNotificationsV1Enabled } from "../../../lib/feature-flags";
import { getJobNextAction } from "../../../lib/next-action";
import { getJobSignals } from "../../../lib/ops-signals";
import { sortTimelineItems, toTimelineItemsFromCommsEvents, toTimelineItemsFromJobActivity } from "../../../lib/timeline-adapter";

function money(cents: number, currency = "GBP") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format((cents || 0) / 100);
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

type JobActivity = {
  id: string;
  eventType?: string;
  message?: string;
  createdAt?: string;
  payloadJson?: any;
};

type CommsEvent = {
  id: string;
  channel?: string;
  status?: string;
  reasonKey?: string;
  title?: string;
  createdAt?: string;
};

type StatusAction = {
  label: string;
  nextStatus: string;
};

function primaryStatusAction(status?: string): StatusAction | null {
  switch (status) {
    case "OPEN":
    case "SCHEDULED":
      return { label: "Start Job", nextStatus: "IN_PROGRESS" };
    case "IN_PROGRESS":
      return { label: "Mark Completed", nextStatus: "COMPLETED" };
    case "COMPLETED":
      return { label: "Issue Invoice", nextStatus: "INVOICED" };
    default:
      return null;
  }
}

function overdueBadge(dueAt?: string, paidAt?: string) {
  if (!dueAt || paidAt) return null;
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return null;
  const now = new Date();
  if (due.getTime() < now.getTime()) {
    return <span className="badge warn">Invoice overdue</span>;
  }
  return <span className="badge">Due {due.toLocaleDateString()}</span>;
}

function billingStatusLabel(issued: boolean, paid: boolean) {
  if (paid) return "Paid";
  if (issued) return "Issued";
  return "Not issued";
}

export default function JobDetailPage() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const [job, setJob] = useState<any>(null);
  const [activity, setActivity] = useState<JobActivity[]>([]);
  const [commsEvents, setCommsEvents] = useState<CommsEvent[]>([]);
  const [commsLoading, setCommsLoading] = useState(false);
  const [commsError, setCommsError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string | undefined>(undefined);
  const [statusMessage, setStatusMessage] = useState("");
  const [activityItems, setActivityItems] = useState<any[]>([]);

  const commandCentreV2Enabled = isCommandCentreV2Enabled();
  const commsEnabled = isNotificationsV1Enabled();

  const load = useMemo(() => {
    return async () => {
      if (!id) return;
      setError("");
      setRequestId(undefined);
      setCommsError("");
      setLoading(true);
      if (commsEnabled) setCommsLoading(true);
      try {
        const [jobPayload, activityPayload] = await Promise.all([
          apiFetch(`/jobs/${id}`),
          commandCentreV2Enabled ? apiFetch(`/jobs/${id}/activity`).catch(() => []) : Promise.resolve([]),
        ]);
        setJob(jobPayload);
        setActivity(Array.isArray(activityPayload) ? activityPayload : []);
        if (commsEnabled) {
          await loadComms();
        }
      } catch (err: any) {
        setError(err?.message || "Failed to load job");
        setRequestId(err instanceof ApiError ? err.requestId : undefined);
      } finally {
        setLoading(false);
        setCommsLoading(false);
      }
    };
  }, [id, commandCentreV2Enabled, commsEnabled]);

  async function loadComms() {
    if (!commsEnabled || !id) return;
    setCommsLoading(true);
    try {
      const res = await apiFetch(`/notifications/entity?entityType=job&entityId=${id}`);
      setCommsEvents(Array.isArray(res) ? res : []);
    } catch (err: any) {
      setCommsError(err?.message || "Failed to load communications");
    } finally {
      setCommsLoading(false);
    }
  }

  async function loadActivityHistory(jobId: string) {
    try {
      const rows = await apiFetch(`/activity/recent?limit=20&jobId=${encodeURIComponent(jobId)}`);
      setActivityItems(Array.isArray(rows) ? rows : []);
    } catch {
      setActivityItems([]);
    }
  }

  useEffect(() => {
    load();
    if (id) {
      void loadActivityHistory(String(id));
    }
  }, [load]);

  async function updateStatus(nextStatus: string) {
    if (!id || !nextStatus) return;
    setStatusMessage("");
    setError("");
    setRequestId(undefined);
    if (nextStatus === "IN_PROGRESS") {
      markDemoStepComplete("start_job");
    }
    try {
      await apiFetch(`/jobs/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      setStatusMessage(`Status updated to ${nextStatus.replace(/_/g, " ")}`);
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to update job status");
      setRequestId(err instanceof ApiError ? err.requestId : undefined);
    }
  }

  const title = `${job?.customerName || "Job"} - ${job?.jobRef || job?.id || id || ""}`.trim();
  const vehicleLabel = [job?.vehicleMake, job?.vehicleModel, job?.vehicleReg].filter(Boolean).join(" ");
  const subtitle = [vehicleLabel, job?.serviceName].filter(Boolean).join(" | ");

  const primaryStatus = primaryStatusAction(job?.status);
  const pdfUrl = job?.pdf?.url || job?.invoicePdfUrl || "";
  const paymentUrl = job?.paymentLinkUrl || "";
  const portalUrl = job?.whatsappCompletionLink || "";
  const totalCents = Number(job?.totalCents || 0);
  const invoiceIssued = Boolean(job?.invoiceIssuedAt || job?.invoiceNumber || pdfUrl);
  const invoicePaid = Boolean(job?.invoicePaidAt || job?.paymentReceiptUrl);
  const paidCents = invoicePaid ? totalCents : 0;
  const dueCents = Math.max(totalCents - paidCents, 0);
  const hasPaymentDue = dueCents > 0 && !invoicePaid;

  const handleCollectPayment = () => {
    markDemoStepComplete("collect_payment");
  };

  const secondaryActions: EntityAction[] = [];
  if (pdfUrl) secondaryActions.push({ label: "View PDF", href: pdfUrl, target: "_blank", rel: "noreferrer noopener" });
  if (portalUrl) secondaryActions.push({ label: "Open Portal", href: portalUrl, target: "_blank", rel: "noreferrer noopener" });
  if (paymentUrl) secondaryActions.push({ label: "Payment Link", href: paymentUrl, target: "_blank", rel: "noreferrer noopener", onClick: handleCollectPayment });

  const nextAction = getJobNextAction(job, { paymentUrl });
  const primaryAction = nextAction.href
    ? { label: nextAction.label, href: nextAction.href, target: "_blank", rel: "noreferrer noopener", onClick: nextAction.key === "collect_payment" ? handleCollectPayment : undefined }
    : nextAction.key === "start_job" && primaryStatus
    ? { label: nextAction.label, onClick: () => updateStatus(primaryStatus.nextStatus) }
    : nextAction.key === "complete_job" && primaryStatus
    ? { label: nextAction.label, onClick: () => updateStatus(primaryStatus.nextStatus) }
    : nextAction.key === "issue_invoice"
    ? { label: nextAction.label, onClick: () => updateStatus("INVOICED") }
    : nextAction.href
    ? { label: nextAction.label, href: nextAction.href }
    : undefined;

  const timelineItems: EntityTimelineItem[] = sortTimelineItems([
    ...toTimelineItemsFromJobActivity(activity),
    ...toTimelineItemsFromCommsEvents(commsEvents),
  ]);
  const signals = getJobSignals(job);

  if (loading && !job) {
    return (
      <DashboardShell>
        <LoadingState title="Loading job" description="Fetching job details and activity." />
      </DashboardShell>
    );
  }

  if (error && !job) {
    return (
      <DashboardShell>
        <ErrorState
          title="Could not load job"
          description={error}
          requestId={requestId}
          primaryAction={{ label: "Try again", onClick: load }}
          secondaryAction={{ label: "Back to jobs", href: "/dashboard/jobs" }}
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div data-job-history="enabled" style={{ position: "absolute", left: -99999, top: -99999, width: 1, height: 1, overflow: "hidden" }}>CCV2_JOB_HISTORY_ENABLED</div>
      <EntityHeader
        title={title}
        subtitle={subtitle || "Job overview"}
        badges={
          <>
            <span className="badge">{job?.status || "OPEN"}</span>
            {overdueBadge(job?.invoiceDueAt, job?.invoicePaidAt)}
          </>
        }
        primaryAction={primaryAction}
        primaryActionHint={nextAction.reason}
        secondaryActions={secondaryActions}
      />
      <OpsSignalsBar blockedBy={signals.blockedBy} risks={signals.risks} severity={signals.severity} />

      {error ? (
        <ErrorState
          title="Action failed"
          description={error}
          requestId={requestId}
          primaryAction={{ label: "Reload", onClick: load }}
        />
      ) : null}
      {statusMessage ? <p style={{ color: "#5eead4" }}>{statusMessage}</p> : null}

      <div className="entity-grid">
        <div>
          <RelatedLinks
            tradeAccountId={job?.tradeAccountId || null}
            tradeAccountLabel={job?.tradeAccountId ? `Trade ${job.tradeAccountId}` : null}
            vehicleLabel={vehicleLabel || null}
          />
          <EntitySection title="Summary" subtitle="Key dates and totals for this job.">
            <div className="two-col">
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Job reference
                </p>
                <p style={{ marginTop: 4 }}>{job?.jobRef || job?.id || "-"}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Status
                </p>
                <p style={{ marginTop: 4 }}>{job?.status || "OPEN"}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Total
                </p>
                <p style={{ marginTop: 4 }}>{money(Number(job?.totalCents || 0), job?.currency || "GBP")}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Created
                </p>
                <p style={{ marginTop: 4 }}>{formatDate(job?.createdAt)}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Due date
                </p>
                <p style={{ marginTop: 4 }}>{formatDate(job?.invoiceDueAt)}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Scheduled
                </p>
                <p style={{ marginTop: 4 }}>{formatDate((job as any)?.scheduledAt)}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Completed
                </p>
                <p style={{ marginTop: 4 }}>{formatDate(job?.completedAt)}</p>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>Billing</h3>
              <div className="two-col">
                <div>
                  <p className="muted" style={{ margin: 0 }}>
                    Invoice
                  </p>
                  <p style={{ marginTop: 4 }}>
                    {job?.invoiceNumber || job?.id || "-"} - {billingStatusLabel(invoiceIssued, invoicePaid)}
                  </p>
                </div>
                <div>
                  <p className="muted" style={{ margin: 0 }}>
                    Invoice issued
                  </p>
                  <p style={{ marginTop: 4 }}>{formatDate(job?.invoiceIssuedAt)}</p>
                </div>
                <div>
                  <p className="muted" style={{ margin: 0 }}>
                    Total
                  </p>
                  <p style={{ marginTop: 4 }}>{money(totalCents, job?.currency || "GBP")}</p>
                </div>
                <div>
                  <p className="muted" style={{ margin: 0 }}>
                    Paid
                  </p>
                  <p style={{ marginTop: 4 }}>{money(paidCents, job?.currency || "GBP")}</p>
                </div>
                <div>
                  <p className="muted" style={{ margin: 0 }}>
                    Due
                  </p>
                  <p style={{ marginTop: 4 }}>{money(dueCents, job?.currency || "GBP")}</p>
                </div>
                <div>
                  <p className="muted" style={{ margin: 0 }}>
                    Payment link
                  </p>
                  {paymentUrl ? (
                    <a href={paymentUrl} target="_blank" rel="noreferrer noopener" onClick={handleCollectPayment}>
                      Open payment link
                    </a>
                  ) : (
                    <p style={{ marginTop: 4 }}>No link</p>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                {pdfUrl ? (
                  <a className="button secondary" href={pdfUrl} target="_blank" rel="noreferrer noopener">
                    View invoice PDF
                  </a>
                ) : null}
                {!invoiceIssued && job?.status === "COMPLETED" ? (
                  <button className="button secondary" type="button" onClick={() => updateStatus("INVOICED")}>
                    Issue invoice
                  </button>
                ) : null}
                {hasPaymentDue && paymentUrl ? (
                  <a className="button" href={paymentUrl} target="_blank" rel="noreferrer noopener" onClick={handleCollectPayment}>
                    Collect payment
                  </a>
                ) : null}
              </div>
            </div>
          </EntitySection>

          <EntitySection title="Customer & Vehicle" subtitle="Contact details and vehicle information.">
            <div className="two-col">
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Customer
                </p>
                <p style={{ marginTop: 4 }}>{job?.customerName || "-"}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Email
                </p>
                {job?.customerEmail ? <a href={`mailto:${job.customerEmail}`}>{job.customerEmail}</a> : <p style={{ marginTop: 4 }}>-</p>}
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Phone
                </p>
                {job?.customerPhone ? (
                  <a href={`https://wa.me/${String(job.customerPhone).replace(/[^\d]/g, "")}`}>{job.customerPhone}</a>
                ) : (
                  <p style={{ marginTop: 4 }}>-</p>
                )}
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Vehicle
                </p>
                <p style={{ marginTop: 4 }}>{vehicleLabel || "-"}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Service
                </p>
                <p style={{ marginTop: 4 }}>{job?.serviceName || job?.jobType || "-"}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Trade account
                </p>
                {job?.tradeAccountId ? (
                  <Link href={`/dashboard/trade-accounts/${job.tradeAccountId}`}>{job.tradeAccountId}</Link>
                ) : (
                  <p style={{ marginTop: 4 }}>-</p>
                )}
              </div>
            </div>
          </EntitySection>

          <EntityCustomFieldsCard
            title="Job custom fields"
            entityType="job"
            entityId={id}
          />

          <EntitySection title="Scheduling & Assignment" subtitle="Who owns this job and key schedule touchpoints.">
            <div className="two-col">
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Assigned user id
                </p>
                <p style={{ marginTop: 4 }}>{job?.assignedUserId || "-"}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Location id
                </p>
                <p style={{ marginTop: 4 }}>{job?.locationId || "-"}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Invoice issued
                </p>
                <p style={{ marginTop: 4 }}>{formatDate(job?.invoiceIssuedAt)}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Invoice paid
                </p>
                <p style={{ marginTop: 4 }}>{formatDate(job?.invoicePaidAt)}</p>
              </div>
            </div>
          </EntitySection>

          <EntitySection title="Notes" subtitle="Internal pricing notes and guidance.">
            {job?.pricingNotes ? <p style={{ marginTop: 0 }}>{job.pricingNotes}</p> : <p className="muted">No notes yet.</p>}
          </EntitySection>

          <EntitySection title="Media & Attachments" subtitle="Assets captured for this job.">
            {Array.isArray(job?.assets) && job.assets.length > 0 ? (
              <div className="list">
                {job.assets.map((asset: any) => (
                  <div key={asset.id} className="integration-card">
                    <div>
                      <strong>{asset.kind || "Asset"}</strong>
                      <p className="muted" style={{ margin: "4px 0" }}>{formatDateTime(asset.createdAt)}</p>
                    </div>
                    <a className="button secondary" href={asset.url} target="_blank" rel="noreferrer noopener">
                      Open
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No attachments yet.</p>
            )}
          </EntitySection>

          <EntitySection title="Quick Actions" subtitle="Common follow-ups for this job.">
            <div style={{ display: "grid", gap: 10 }}>
              {job?.customerEmail ? (
                <a className="button secondary" href={`mailto:${job.customerEmail}`}>
                  Email Customer
                </a>
              ) : null}
              {job?.customerPhone ? (
                <a
                  className="button secondary"
                  href={`https://wa.me/${String(job.customerPhone).replace(/[^\d]/g, "")}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  WhatsApp Customer
                </a>
              ) : null}
              {pdfUrl ? (
                <a className="button secondary" href={pdfUrl} target="_blank" rel="noreferrer noopener">
                  Open PDF
                </a>
              ) : null}
            </div>
          </EntitySection>
        </div>
        <div className="entity-rail">
          <OnboardingCoach
            actions={{
              start_job: job?.status === "OPEN" || job?.status === "SCHEDULED"
                ? [{ label: "Start job", onClick: () => updateStatus("IN_PROGRESS") }]
                : undefined,
              collect_payment: hasPaymentDue && paymentUrl
                ? [{ label: "Collect payment", href: paymentUrl, onClick: handleCollectPayment }]
                : undefined,
            }}
          />
          <SendUpdatePanel
            entityType="job"
            entityId={job?.id || id}
            defaultTemplateKey="job.update"
            defaultChannel="sms"
            onSent={loadComms}
          />
          {commsLoading && timelineItems.length === 0 ? (
            <LoadingState title="Loading timeline" description="Fetching job activity and communications." />
          ) : (
            <EntityTimeline
              timelineItems={timelineItems}
              emptyTitle={commandCentreV2Enabled ? "No job activity yet" : "Job activity not enabled"}
              emptyDescription={
                commandCentreV2Enabled
                  ? "Updates such as status changes, reminders, and notes will appear here."
                  : "Enable Command Centre V2 to see job activity history."
              }
            />
          )}
          {commsError ? (
            <p className="muted" style={{ marginTop: 8 }}>{commsError}</p>
          ) : null}
        </div>
      </div>
      <style jsx>{`
        .entity-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 320px;
          gap: 16px;
          align-items: start;
        }

        .entity-rail {
          position: sticky;
          top: 90px;
        }

        @media (max-width: 900px) {
          .entity-grid {
            grid-template-columns: 1fr;
          }

          .entity-rail {
            position: static;
          }
        }
      `}</style>
      <div className="card job-history-card">
        <div className="job-history-head">
          <h3 style={{ margin: 0 }}>Activity</h3>
          <span className="muted">Persistent job history</span>
        </div>
        <div className="job-history-list">
          {activityItems.length ? activityItems.map((item) => (
            <div key={item.id || `${item.type}-${item.at}`} className="job-history-item">
              <div className="job-history-dot"></div>
              <div className="job-history-content">
                <div className="job-history-label">{item.label || item.type}</div>
                <div className="job-history-meta">
                  <span>{item.status || "Event"}</span>
                  <span>•</span>
                  <span>{item.at ? new Date(item.at).toLocaleString() : ""}</span>
                </div>
              </div>
            </div>
          )) : (
            <div className="muted">No persistent history yet for this job.</div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
