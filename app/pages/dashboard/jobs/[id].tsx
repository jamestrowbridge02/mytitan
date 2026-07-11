import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { EntityArtifactsCard } from "../../../components/artifacts/EntityArtifactsCard";
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
import { OperatorStatusBadge } from "../../../components/ui/operator-page";
import { ApiError, apiFetch } from "../../../lib/api";
import { markDemoStepComplete } from "../../../lib/onboarding-coach";
import { isCommandCentreV2Enabled, isNotificationsV1Enabled } from "../../../lib/feature-flags";
import { getJobNextAction } from "../../../lib/next-action";
import { getJobSignals } from "../../../lib/ops-signals";
import { sortTimelineItems, toTimelineItemsFromCommsEvents, toTimelineItemsFromJobActivity } from "../../../lib/timeline-adapter";
import { emptyPermissionSnapshot, hasWorkspacePermission, normalizePermissionSnapshot } from "../../../lib/workspace-permissions";

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
      return { label: "Start job", nextStatus: "IN_PROGRESS" };
    case "IN_PROGRESS":
      return { label: "Complete job", nextStatus: "COMPLETED" };
    case "COMPLETED":
      return { label: "Create invoice", nextStatus: "INVOICED" };
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

function commsChannelLabel(channel?: string) {
  const value = String(channel || "").toLowerCase();
  if (value === "sms") return "SMS";
  if (value === "email") return "Email";
  if (value === "whatsapp") return "WhatsApp";
  if (value === "in_app") return "In-app";
  return "Update";
}

function executionTone(status?: string) {
  const value = String(status || "").toLowerCase();
  if (["submitted", "completed", "acknowledged"].includes(value)) return "success" as const;
  if (["draft", "not started"].includes(value)) return "warning" as const;
  if (["revoked", "expired", "failed"].includes(value)) return "critical" as const;
  return "info" as const;
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
  const [approvalRequests, setApprovalRequests] = useState<any[]>([]);
  const [complianceExceptions, setComplianceExceptions] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [enterpriseFlags, setEnterpriseFlags] = useState<any[]>([]);
  const [estimateDraft, setEstimateDraft] = useState({
    title: "",
    summary: "",
    lineTitle: "",
    quantity: 1,
    unitPrice: "",
    tax: "",
  });
  const [estimateBusy, setEstimateBusy] = useState<"" | "create" | "send" | "approve" | "convert">("");
  const [executionRecord, setExecutionRecord] = useState<any>(null);
  const [jobParts, setJobParts] = useState<any[]>([]);
  const [partsCatalog, setPartsCatalog] = useState<any[]>([]);
  const [inventoryLocations, setInventoryLocations] = useState<any[]>([]);
  const [jobPartDraft, setJobPartDraft] = useState({ stockItemId: "", quantityPlanned: 1, sourceLocationId: "" });
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [jobPartsBusy, setJobPartsBusy] = useState(false);
  const [jobPartAction, setJobPartAction] = useState<"" | "add" | "reserve" | "use" | "release">("");
  const [statusBusy, setStatusBusy] = useState<"" | "IN_PROGRESS" | "COMPLETED" | "INVOICED">("");
  const [lifecycleBusy, setLifecycleBusy] = useState<"" | "archive" | "unarchive" | "cancel" | "delete" | "mark-paid">("");
  const [permissions, setPermissions] = useState(() => emptyPermissionSnapshot());
  const [completionLinkState, setCompletionLinkState] = useState<any>(null);
  const [generatedCompletionLink, setGeneratedCompletionLink] = useState("");
  const [completionLinkBusy, setCompletionLinkBusy] = useState<"" | "create" | "revoke">("");
  const [emailReadiness, setEmailReadiness] = useState<any>(null);
  const [paymentRequestState, setPaymentRequestState] = useState<any>(null);
  const [paymentRequestBusy, setPaymentRequestBusy] = useState<"" | "create" | "manual-paid">("");
  const [paymentEvidenceItems, setPaymentEvidenceItems] = useState<any[]>([]);
  const [paymentEvidenceBusy, setPaymentEvidenceBusy] = useState(false);
  const [paymentEvidenceFile, setPaymentEvidenceFile] = useState<File | null>(null);
  const [paymentEvidenceLabel, setPaymentEvidenceLabel] = useState("");
  const [paymentEvidenceVisible, setPaymentEvidenceVisible] = useState(false);
  const [manualPaymentDraft, setManualPaymentDraft] = useState({
    method: "bank_transfer",
    reference: "",
    amountReceivedCents: "",
    receivedAt: "",
    evidenceArtifactId: "",
    internalNote: "",
    customerReceiptNote: "",
  });

  const commandCentreV2Enabled = isCommandCentreV2Enabled();
  const commsEnabled = isNotificationsV1Enabled();
  const canManageCompletionLink =
    hasWorkspacePermission(permissions, "technician.execute") ||
    hasWorkspacePermission(permissions, "jobs.transition") ||
    hasWorkspacePermission(permissions, "portal.manage");

  const load = useMemo(() => {
    return async () => {
      if (!id) return;
      setError("");
      setRequestId(undefined);
      setCommsError("");
      setLoading(true);
      if (commsEnabled) setCommsLoading(true);
      try {
        const [jobPayload, activityPayload, me, flagPayload, paymentRequestPayload] = await Promise.all([
          apiFetch(`/jobs/${id}`),
          commandCentreV2Enabled ? apiFetch(`/jobs/${id}/activity`).catch(() => []) : Promise.resolve([]),
          apiFetch("/me").catch(() => null),
          apiFetch("/enterprise/feature-flags").catch(() => null),
          apiFetch(`/billing/jobs/${id}/payment-request`).catch(() => null),
        ]);
        setJob(jobPayload);
        setActivity(Array.isArray(activityPayload) ? activityPayload : []);
        setPermissions(normalizePermissionSnapshot(me?.permissions));
        setEnterpriseFlags(Array.isArray(flagPayload?.flags) ? flagPayload.flags : []);
        setPaymentRequestState(paymentRequestPayload || null);
        if (commsEnabled) {
          await loadComms();
        }
        await loadCompletionLink();
        await loadExecution();
        await loadApprovals();
        await loadCompliance();
        await loadJobParts();
        await loadPaymentEvidence();
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

  async function loadCompletionLink() {
    if (!id) return;
    try {
      const payload = await apiFetch(`/jobs/${id}/completion-link`);
      setCompletionLinkState(payload || null);
    } catch {
      setCompletionLinkState(null);
    }
  }

  async function loadPaymentRequest() {
    if (!id) return;
    try {
      const payload = await apiFetch(`/billing/jobs/${id}/payment-request`);
      setPaymentRequestState(payload || null);
    } catch {
      setPaymentRequestState(null);
    }
  }

  async function loadPaymentEvidence() {
    if (!id) return;
    try {
      const items = await apiFetch(`/artifacts/entities/job/${id}`);
      setPaymentEvidenceItems(Array.isArray(items) ? items : []);
    } catch {
      setPaymentEvidenceItems([]);
    }
  }

  async function uploadPaymentEvidence() {
    if (!id || !paymentEvidenceFile) return;
    setPaymentEvidenceBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", paymentEvidenceFile);
      form.append("kind", paymentEvidenceVisible ? "PORTAL_DOCUMENT" : "JOB_ATTACHMENT");
      form.append("label", paymentEvidenceLabel.trim() || "Payment evidence");
      form.append("portalVisible", paymentEvidenceVisible ? "true" : "false");
      const uploaded = await apiFetch(`/artifacts/entities/job/${id}/upload`, {
        method: "POST",
        body: form,
      });
      await loadPaymentEvidence();
      setManualPaymentDraft((current) => ({ ...current, evidenceArtifactId: uploaded?.id || current.evidenceArtifactId }));
      setPaymentEvidenceFile(null);
      setPaymentEvidenceLabel("");
      setPaymentEvidenceVisible(false);
      setStatusMessage("Payment evidence uploaded and selected.");
    } catch (err: any) {
      setError(err?.message || "Failed to upload payment evidence");
    } finally {
      setPaymentEvidenceBusy(false);
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

  async function loadApprovals() {
    if (!id) return;
    try {
      const rows = await apiFetch(`/customer-approvals?entityType=JOB&entityId=${encodeURIComponent(id)}`);
      setApprovalRequests(Array.isArray(rows) ? rows : []);
    } catch {
      setApprovalRequests([]);
    }
  }

  async function loadCompliance() {
    if (!id) return;
    try {
      const rows = await apiFetch(`/compliance/exceptions?entityType=JOB&entityId=${encodeURIComponent(id)}`);
      setComplianceExceptions(Array.isArray(rows) ? rows : []);
    } catch {
      setComplianceExceptions([]);
    }
  }

  async function loadExecution() {
    if (!id) return;
    try {
      const payload = await apiFetch(`/jobs/${id}/execution`);
      setExecutionRecord(payload?.record || null);
    } catch {
      setExecutionRecord(null);
    }
  }

  async function loadJobParts() {
    if (!id) return;
    try {
      const [partRows, catalogRows, locationRows] = await Promise.all([
        apiFetch(`/jobs/${id}/parts`).catch(() => []),
        apiFetch("/parts").catch(() => []),
        apiFetch("/inventory/locations").catch(() => []),
      ]);
      setJobParts(Array.isArray(partRows) ? partRows : []);
      setPartsCatalog(Array.isArray(catalogRows) ? catalogRows : []);
      setInventoryLocations(Array.isArray(locationRows) ? locationRows : []);
    } catch {
      setJobParts([]);
      setPartsCatalog([]);
      setInventoryLocations([]);
    }
  }

  async function loadQuotes() {
    if (!id) return;
    try {
      const rows = await apiFetch(`/quotes/job/${encodeURIComponent(id)}/estimates`);
      setQuotes(Array.isArray(rows) ? rows : []);
    } catch {
      setQuotes([]);
    }
  }

  useEffect(() => {
    load();
    if (id) {
      void loadActivityHistory(String(id));
      void loadQuotes();
    }
  }, [load]);

  useEffect(() => {
    if (!id) return;
    apiFetch("/tenant/settings/email-readiness")
      .then((data) => setEmailReadiness(data || null))
      .catch(() => setEmailReadiness(null));
  }, [id]);

  async function updateStatus(nextStatus: string) {
    if (!id || !nextStatus) return;
    setStatusMessage("");
    setError("");
    setRequestId(undefined);
    if (nextStatus === "IN_PROGRESS" || nextStatus === "COMPLETED" || nextStatus === "INVOICED") {
      setStatusBusy(nextStatus);
    }
    if (nextStatus === "IN_PROGRESS") {
      markDemoStepComplete("start_job");
    }
    try {
      await apiFetch(`/jobs/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      setStatusMessage(
        nextStatus === "IN_PROGRESS"
          ? "Work started. Finish it from this job."
          : nextStatus === "COMPLETED"
          ? "Work done. Review it, send it, and take payment from this job."
          : nextStatus === "INVOICED"
          ? "Invoice ready. Keep payment moving from this job."
          : `Status updated to ${nextStatus.replace(/_/g, " ")}`,
      );
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to update job status");
      setRequestId(err instanceof ApiError ? err.requestId : undefined);
    } finally {
      setStatusBusy("");
    }
  }

  async function runLifecycleAction(
    action: "archive" | "unarchive" | "cancel" | "delete" | "mark-paid",
    options?: {
      confirmMessage?: string;
      reason?: string;
      redirectToJobs?: boolean;
      successMessage?: string;
    },
  ) {
    if (!id) return;
    if (options?.confirmMessage && !window.confirm(options.confirmMessage)) return;
    setLifecycleBusy(action);
    setStatusMessage("");
    setError("");
    setRequestId(undefined);
    try {
      if (action === "mark-paid") {
        await apiFetch(`/billing/jobs/${id}/mark-paid`, { method: "POST" });
      } else {
        await apiFetch(`/jobs/${id}/${action}`, {
          method: "POST",
          body: JSON.stringify(options?.reason ? { reason: options.reason } : {}),
        });
      }
      if (options?.redirectToJobs) {
        await router.push("/dashboard/jobs");
        return;
      }
      setStatusMessage(options?.successMessage || "Job updated");
      await load();
    } catch (err: any) {
      setError(err?.message || "Could not update this job");
      setRequestId(err instanceof ApiError ? err.requestId : undefined);
    } finally {
      setLifecycleBusy("");
    }
  }

  async function requestApproval() {
    if (!job?.customerId || !id) return;
    setApprovalBusy(true);
    setError("");
    try {
      await apiFetch("/customer-approvals", {
        method: "POST",
        body: JSON.stringify({
          customerId: job.customerId,
          entityType: "JOB",
          entityId: id,
          kind: "WORK_AUTHORIZATION",
        }),
      });
      setStatusMessage("Approval request sent. Watch this job for the customer response.");
      await loadApprovals();
    } catch (err: any) {
      setError(err?.message || "Failed to create approval request");
    } finally {
      setApprovalBusy(false);
    }
  }

  function parseMoneyToCents(value: string) {
    const normalized = String(value || "").trim().replace(/^£\s?/, "");
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return NaN;
    const [pounds, pence = ""] = normalized.split(".");
    return Number(pounds) * 100 + Number(pence.padEnd(2, "0"));
  }

  async function createJobEstimate(event: React.FormEvent) {
    event.preventDefault();
    if (!id) return;
    const unitPriceCents = parseMoneyToCents(estimateDraft.unitPrice);
    const taxCents = estimateDraft.tax ? parseMoneyToCents(estimateDraft.tax) : 0;
    if (!Number.isFinite(unitPriceCents) || unitPriceCents <= 0 || !Number.isFinite(taxCents) || taxCents < 0) {
      setError("Enter a valid estimate price such as £19.00.");
      return;
    }
    setEstimateBusy("create");
    setError("");
    try {
      await apiFetch(`/quotes/job/${id}/estimates`, {
        method: "POST",
        body: JSON.stringify({
          title: estimateDraft.title || job?.serviceName || "Job estimate",
          summary: estimateDraft.summary || undefined,
          currency: "GBP",
          taxCents,
          lineItems: [
            {
              type: "LABOUR",
              title: estimateDraft.lineTitle || estimateDraft.title || job?.serviceName || "Work",
              quantity: Number(estimateDraft.quantity || 1),
              unitPriceCents,
            },
          ],
        }),
      });
      setEstimateDraft({ title: "", summary: "", lineTitle: "", quantity: 1, unitPrice: "", tax: "" });
      setStatusMessage("Estimate drafted on this job. Send it for customer approval when it is ready.");
      await loadQuotes();
      await loadActivityHistory(String(id));
    } catch (err: any) {
      setError(err?.message || "Failed to create estimate");
    } finally {
      setEstimateBusy("");
    }
  }

  async function actOnEstimate(quoteId: string, action: "send" | "approve" | "convert") {
    if (!id) return;
    setEstimateBusy(action);
    setError("");
    try {
      const path =
        action === "convert"
          ? `/quotes/job/${id}/estimates/${quoteId}/convert`
          : `/quotes/${quoteId}/${action}`;
      await apiFetch(path, { method: "POST" });
      setStatusMessage(
        action === "send"
          ? "Estimate sent. Customer approval stays attached to this job."
          : action === "approve"
          ? "Estimate approved. It can now be converted into the job sheet."
          : "Estimate converted into the job sheet with pricing history preserved.",
      );
      await Promise.all([loadQuotes(), load(), loadActivityHistory(String(id))]);
    } catch (err: any) {
      setError(err?.message || "Estimate action failed");
    } finally {
      setEstimateBusy("");
    }
  }

  async function createCompletionLink() {
    if (!id) return;
    setCompletionLinkBusy("create");
    setError("");
    try {
      const payload = await apiFetch(`/jobs/${id}/completion-link`, { method: "POST" });
      setGeneratedCompletionLink(String(payload?.url || ""));
      setStatusMessage("Completion-only link ready. Send it to the device that should finish this job sheet.");
      await loadCompletionLink();
    } catch (err: any) {
      setError(err?.message || "Failed to create completion link");
    } finally {
      setCompletionLinkBusy("");
    }
  }

  async function revokeCompletionLink() {
    if (!id) return;
    setCompletionLinkBusy("revoke");
    setError("");
    try {
      await apiFetch(`/jobs/${id}/completion-link/revoke`, { method: "POST" });
      setGeneratedCompletionLink("");
      setStatusMessage("Completion-only link revoked.");
      await loadCompletionLink();
    } catch (err: any) {
      setError(err?.message || "Failed to revoke completion link");
    } finally {
      setCompletionLinkBusy("");
    }
  }

  async function addJobPart(event: React.FormEvent) {
    event.preventDefault();
    if (!id) return;
    setJobPartsBusy(true);
    setJobPartAction("add");
    setError("");
    try {
      await apiFetch(`/jobs/${id}/parts`, {
        method: "POST",
        body: JSON.stringify(jobPartDraft),
      });
      setStatusMessage("Job part added. Reserve or use it when the field work reaches this step.");
      setJobPartDraft({ stockItemId: "", quantityPlanned: 1, sourceLocationId: "" });
      await loadJobParts();
    } catch (err: any) {
      setError(err?.message || "Failed to add job part");
    } finally {
      setJobPartsBusy(false);
      setJobPartAction("");
    }
  }

  async function actOnJobPart(jobPartId: string, action: "reserve" | "use" | "release") {
    if (!id) return;
    setJobPartsBusy(true);
    setJobPartAction(action);
    setError("");
    try {
      await apiFetch(`/jobs/${id}/parts/${jobPartId}/${action}`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setStatusMessage(
        action === "reserve"
          ? "Part reserved for this job."
          : action === "use"
          ? "Part marked as used on this job."
          : "Part released back to available stock.",
      );
      await Promise.all([loadJobParts(), loadExecution()]);
    } catch (err: any) {
      setError(err?.message || `Failed to ${action} job part`);
    } finally {
      setJobPartsBusy(false);
      setJobPartAction("");
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
  const resultReady = Boolean(pdfUrl || portalUrl);
  const invoiceIssued = Boolean(job?.invoiceIssuedAt || job?.invoiceNumber || pdfUrl);
  const invoicePaid = Boolean(job?.invoicePaidAt || job?.paymentReceiptUrl);
  const isArchived = Boolean(job?.archivedAt);
  const isCancelled = String(job?.status || "").toUpperCase() === "CANCELLED";
  const canArchive = Boolean(job?.lifecycle?.canArchive);
  const canCancel = Boolean(job?.lifecycle?.canCancel);
  const canDelete = Boolean(job?.lifecycle?.canDelete);
  const deleteBlockedReasons = Array.isArray(job?.lifecycle?.deleteBlockedReasons) ? job.lifecycle.deleteBlockedReasons : [];
  const paidCents = invoicePaid ? totalCents : 0;
  const dueCents = Math.max(totalCents - paidCents, 0);
  const hasPaymentDue = dueCents > 0 && !invoicePaid;
  const latestCommsEvent = [...commsEvents].sort((a, b) => {
    const at = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bt = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bt - at;
  })[0];
  const latestCommsStatus = String(latestCommsEvent?.status || "").toLowerCase();
  const latestCommsWasSent = latestCommsStatus === "sent";
  const latestCommsFailed = latestCommsStatus === "failed";
  const latestCommsQueued = latestCommsStatus === "queued";
  const latestCommsSummary = latestCommsEvent
    ? `${commsChannelLabel(latestCommsEvent.channel)} ${latestCommsStatus || "update"}${latestCommsEvent.createdAt ? ` • ${formatDateTime(latestCommsEvent.createdAt)}` : ""}`
    : "";

  const sendActionLabel = latestCommsWasSent
    ? "Review last send"
    : latestCommsFailed
    ? "Retry send"
    : latestCommsQueued
    ? "Review queued send"
    : "Send to customer";
  const primaryShareAction: EntityAction | undefined = portalUrl
    ? { label: sendActionLabel, href: portalUrl, target: "_blank", rel: "noreferrer noopener" }
    : pdfUrl
    ? { label: latestCommsFailed ? "Retry with summary" : "Open summary", href: pdfUrl, target: "_blank", rel: "noreferrer noopener" }
    : undefined;

  const customerFollowUpActions: EntityAction[] = [
    pdfUrl && primaryShareAction?.href !== pdfUrl
      ? { label: "Open summary", href: pdfUrl, target: "_blank", rel: "noreferrer noopener" }
      : null,
    portalUrl && primaryShareAction?.href !== portalUrl
      ? { label: "Open customer page", href: portalUrl, target: "_blank", rel: "noreferrer noopener" }
      : null,
  ].filter(Boolean) as EntityAction[];

  const handleCollectPayment = () => {
    markDemoStepComplete("collect_payment");
  };

  async function preparePaymentRequest(provider?: string) {
    if (!id) return;
    setPaymentRequestBusy("create");
    setError("");
    try {
      const payload = await apiFetch(`/billing/jobs/${id}/payment-request`, {
        method: "POST",
        body: JSON.stringify({ provider, send: true }),
      });
      setPaymentRequestState(payload || null);
      setStatusMessage("Payment request prepared for this job.");
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to prepare payment request");
    } finally {
      setPaymentRequestBusy("");
    }
  }

  async function markPaymentRequestPaid() {
    const requestId = paymentRequestState?.request?.id;
    if (!id || !requestId) return;
    setPaymentRequestBusy("manual-paid");
    setError("");
    try {
      const payload = await apiFetch(`/billing/jobs/${id}/payment-request/${requestId}/manual-paid`, {
        method: "POST",
        body: JSON.stringify({
          method: manualPaymentDraft.method,
          reference: manualPaymentDraft.reference || undefined,
          amountReceivedCents: manualPaymentDraft.amountReceivedCents ? Number(manualPaymentDraft.amountReceivedCents) : undefined,
          receivedAt: manualPaymentDraft.receivedAt || undefined,
          evidenceArtifactId: manualPaymentDraft.evidenceArtifactId || undefined,
          internalNote: manualPaymentDraft.internalNote || undefined,
          customerReceiptNote: manualPaymentDraft.customerReceiptNote || undefined,
        }),
      });
      setPaymentRequestState((prev: any) => ({ ...(prev || {}), ...(payload || {}) }));
      setStatusMessage(payload?.request?.status === "partial_manual" ? "Partial manual payment recorded for finance review." : "Manual payment recorded. This job now shows as paid.");
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to record manual payment");
    } finally {
      setPaymentRequestBusy("");
    }
  }
  const handoffStatus =
    isArchived
      ? "Archived"
      : isCancelled
      ? "Cancelled"
      : invoicePaid
      ? "Paid"
      : hasPaymentDue
      ? "Waiting for payment"
      : latestCommsWasSent
      ? "Sent to customer"
      : latestCommsQueued
      ? "Sending to customer"
      : latestCommsFailed
      ? "Retry send"
      : job?.status === "COMPLETED"
      ? "Ready for customer"
      : "Finish the work";
  const handoffSummary = isArchived
    ? "This job is out of the daily queue but still available whenever you need the proof again."
    : isCancelled
    ? "This job is cancelled and kept for reference."
    : invoicePaid
    ? "This job is finished and paid."
    : hasPaymentDue
    ? "The work is out with the customer. Payment is the last step."
    : latestCommsWasSent
    ? "The customer can review the finished work now. Stay here until payment is wrapped up."
    : latestCommsQueued
    ? "The send is queued. Keep this job open until it lands, then take payment if needed."
    : latestCommsFailed
    ? "The last send did not go out. Review it, resend it, then continue into payment."
    : job?.status === "COMPLETED"
    ? "Proof and sign-off are in. Review it, send it, then continue into payment."
    : "Finish the work first, then send it and take payment from here.";
  const communicationStatus =
    isArchived
      ? "Archived"
      : isCancelled
      ? "Cancelled"
      : latestCommsFailed
      ? "Send needs retry"
      : latestCommsQueued
      ? "Ready to land"
      : latestCommsWasSent
      ? "Customer can view it"
      : job?.status === "COMPLETED" || job?.status === "INVOICED" || invoicePaid
      ? resultReady
        ? "Ready for customer"
        : "Getting it ready"
      : "Finish the work first";
  const communicationSummary =
    latestCommsFailed
      ? "The last send did not go out. Retry it from this job once everything is ready."
      : latestCommsQueued
      ? "The send is queued. Stay on this job until the customer can view it."
      : latestCommsWasSent
      ? "The send has already gone out. The customer can view the completed work."
      : resultReady
      ? "Everything is ready. Send it from this job when you are ready."
      : "Finish the work first so the send stays attached to the same job.";
  const handoffReadinessState =
    latestCommsWasSent
      ? "SENT"
      : resultReady && (job?.status === "COMPLETED" || job?.status === "INVOICED" || invoicePaid)
      ? "READY_FOR_HANDOFF"
      : "NOT_READY";
  const handoffReadinessSummary =
    latestCommsWasSent
      ? "The finished result has already been sent from this job. Keep payment here."
      : resultReady && (job?.status === "COMPLETED" || job?.status === "INVOICED" || invoicePaid)
      ? "Everything is ready and this job can be sent from here."
      : "Not ready to send yet.";
  const paymentStatus =
    invoicePaid
      ? "Paid"
      : isCancelled
      ? "Not collecting payment"
      : hasPaymentDue
      ? "Waiting for payment"
      : !invoiceIssued && job?.status === "COMPLETED"
      ? "Ready to invoice"
      : "Payment stays here";
  const paymentSummary =
    invoicePaid
      ? "Payment is already settled for this job."
      : hasPaymentDue
      ? paymentRequestState?.request
        ? "The customer payment request is tracked here. Online checkout appears when payment setup is ready."
        : "Prepare a customer payment request from this job. It stays manual until online payment setup is ready."
      : !invoiceIssued && job?.status === "COMPLETED"
      ? "Issue the invoice from this completed job once it has been sent."
      : "The next payment step stays on this job.";
  const currentPaymentRequest = paymentRequestState?.request || null;
  const paymentReadiness = paymentRequestState?.readiness || null;
  const selectedPaymentProvider = (paymentReadiness?.providers || []).find((provider: any) => provider.provider === paymentReadiness?.selectedProvider) || null;
  const paymentRequestStatus = currentPaymentRequest?.status
    ? String(currentPaymentRequest.status).replace(/_/g, " ")
    : selectedPaymentProvider?.label || "Manual collection";
  const customerPaymentActionUrl =
    currentPaymentRequest?.actionUrl && ["provider_pending", "payment_processing"].includes(String(currentPaymentRequest.status || ""))
      ? String(currentPaymentRequest.actionUrl)
      : "";
  const paymentSetupHref = "/dashboard/billing#customer-payments";
  const lifecycleRows = [
    {
      label: "Ready",
      value: handoffReadinessState === "READY_FOR_HANDOFF" || handoffReadinessState === "SENT" || hasPaymentDue || invoicePaid ? "Ready" : "Waiting",
      detail: resultReady
        ? "The summary is ready from this job."
        : "Finish the work and let the customer copy finish preparing.",
    },
    {
      label: "Sent",
      value: latestCommsWasSent ? "Sent" : latestCommsQueued ? "Queued" : latestCommsFailed ? "Needs retry" : "Not sent",
      detail: latestCommsWasSent
        ? "The customer has the finished result from this job."
        : latestCommsQueued
        ? "The finished result is queued to go out."
        : latestCommsFailed
        ? "The last send failed. Review and resend from this job."
        : "Use the send action on this job when everything is ready.",
    },
    {
      label: "Payment",
      value: invoicePaid ? "Paid" : hasPaymentDue ? "Awaiting payment" : invoiceIssued ? "Invoice issued" : "Not issued",
      detail: invoicePaid
        ? "Payment is closed."
        : hasPaymentDue
        ? "Stay on this job until the balance is collected."
        : invoiceIssued
        ? "The invoice is out and this job remains the payment source of truth."
        : "Issue the invoice after handoff when payment follow-up is needed.",
    },
  ];

  const secondaryActions: EntityAction[] = [];
  if (pdfUrl) secondaryActions.push({ label: "Open summary PDF", href: pdfUrl, target: "_blank", rel: "noreferrer noopener" });
  if (portalUrl) secondaryActions.push({ label: "Open customer page", href: portalUrl, target: "_blank", rel: "noreferrer noopener" });

  const nextAction = getJobNextAction(job, { paymentUrl });
  const primaryActionLabel =
    nextAction.key === "start_job" && statusBusy === "IN_PROGRESS"
      ? "Starting job..."
      : nextAction.key === "complete_job" && statusBusy === "COMPLETED"
      ? "Saving completion..."
      : nextAction.key === "issue_invoice" && statusBusy === "INVOICED"
      ? "Issuing invoice..."
      : nextAction.label;
  const primaryAction = isArchived
    ? { label: lifecycleBusy === "unarchive" ? "Restoring..." : "Unarchive job", onClick: () => void runLifecycleAction("unarchive", { successMessage: "Job restored. It is back in the main queue." }), disabled: lifecycleBusy === "unarchive" }
    : nextAction.href
    ? { label: primaryActionLabel, href: nextAction.href, target: "_blank", rel: "noreferrer noopener", onClick: nextAction.key === "collect_payment" ? handleCollectPayment : undefined }
    : nextAction.key === "start_job" && primaryStatus
    ? { label: primaryActionLabel, onClick: () => updateStatus(primaryStatus.nextStatus), disabled: statusBusy === "IN_PROGRESS" }
    : nextAction.key === "complete_job" && primaryStatus
    ? { label: primaryActionLabel, onClick: () => updateStatus(primaryStatus.nextStatus), disabled: statusBusy === "COMPLETED" }
    : nextAction.key === "issue_invoice"
    ? { label: primaryActionLabel, onClick: () => updateStatus("INVOICED"), disabled: statusBusy === "INVOICED" }
    : nextAction.href
    ? { label: primaryActionLabel, href: nextAction.href }
    : undefined;

  const timelineItems: EntityTimelineItem[] = sortTimelineItems([
    ...toTimelineItemsFromJobActivity(activity),
    ...toTimelineItemsFromCommsEvents(commsEvents),
  ]);
  const signals = getJobSignals(job);
  const canManagePortal = hasWorkspacePermission(permissions, "portal.manage");
  const estimatesFlag = enterpriseFlags.find((flag) => flag?.key === "enterprise_estimates_v1");
  const estimatesEnabled = estimatesFlag ? Boolean(estimatesFlag.enabled) : true;

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
      <div data-job-history="enabled" hidden>CCV2_JOB_HISTORY_ENABLED</div>
      <EntityHeader
        title={title}
        subtitle={subtitle || "This job sheet keeps the work, proof, customer handoff, and payment next step together in one place."}
        badges={
          <>
            <span className="badge">{job?.status || "OPEN"}</span>
            {isArchived ? <span className="badge">Archived</span> : null}
            {invoicePaid ? <span className="badge">Paid</span> : null}
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
      {statusMessage ? <div className="job-feedback-banner job-feedback-banner--success">{statusMessage}</div> : null}

      <div className="entity-grid">
        <div>
          <RelatedLinks
            tradeAccountId={job?.tradeAccountId || null}
            tradeAccountLabel={job?.tradeAccountId ? `Trade ${job.tradeAccountId}` : null}
            vehicleLabel={vehicleLabel || null}
          />
          <EntitySection title="Run this job" subtitle="See the work, finish it cleanly, and keep the next action obvious.">
            <div className="integration-card mt-focus-panel" data-testid="job-next-step-card">
              <div>
                <strong>{handoffStatus}</strong>
                <p className="muted" style={{ margin: "4px 0 0 0" }}>{handoffSummary}</p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {primaryAction ? (
                  primaryAction.href ? (
                    <a className="button" href={primaryAction.href} target={primaryAction.target} rel={primaryAction.rel} onClick={primaryAction.onClick}>
                      {primaryAction.label}
                    </a>
                  ) : (
                    <button className="button" type="button" onClick={primaryAction.onClick} disabled={primaryAction.disabled}>
                      {primaryAction.label}
                    </button>
                  )
                ) : null}
                {pdfUrl ? (
                  <a className="button secondary" href={pdfUrl} target="_blank" rel="noreferrer noopener">
                    Open summary
                  </a>
                ) : null}
                {portalUrl ? (
                  <a className="button secondary" href={portalUrl} target="_blank" rel="noreferrer noopener">
                    Open customer page
                  </a>
                ) : null}
                <Link className="button secondary" href="/dashboard/work">
                  Back to Work
                </Link>
              </div>
            </div>
            <div className="integration-card mt-focus-panel mt-focus-panel--quiet" data-testid="job-lifecycle-card">
              <div>
                <strong>Complete, send, get paid</strong>
                <p className="muted" style={{ margin: "4px 0 0 0" }}>
                  The work, send, and payment step stay attached to this same job.
                </p>
              </div>
              <div className="jobs-lifecycleGrid">
                {lifecycleRows.map((row) => (
                  <div key={row.label} className="jobs-lifecycleStep">
                    <span className="jobs-lifecycleLabel">{row.label}</span>
                    <strong>{row.value}</strong>
                    <p className="muted" style={{ margin: "6px 0 0 0" }}>{row.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </EntitySection>

          <EntitySection title="Single job authority" subtitle="One permanent business record for booking, work, proof, billing, customer handoff, and audit trail.">
            <div className="integration-card mt-focus-panel" data-testid="single-job-authority-view">
              <div>
                <strong>{job?.jobRef || job?.id || "Job record"}</strong>
                <p className="muted" style={{ margin: "4px 0 0 0" }}>
                  This screen is the authoritative record. Booking, job sheet, customer, location, technician assignment, services, materials, media, signature, invoice, payment, communications, audit events, and PDF stay attached here.
                </p>
              </div>
              <div className="jobs-lifecycleGrid" data-testid="single-job-authority-coverage">
                {[
                  ["Booking", (job as any)?.bookingId || (job as any)?.sourceBookingId || "Linked when created from booking"],
                  ["Job sheet", job?.status || "Open"],
                  ["Customer", job?.customerName || "Missing"],
                  ["Location", (job as any)?.location?.name || (job as any)?.locationName || job?.locationId || "Unassigned location"],
                  ["Technician / completed by", (job as any)?.assignedUser?.name || (job as any)?.assignedUserName || "Assign later"],
                  ["Services", job?.serviceName || job?.jobType || "Not set"],
                  ["Materials", `${Array.isArray((job as any)?.jobParts) ? (job as any).jobParts.length : 0} linked`],
                  ["Photos and videos", "Managed in media folders below"],
                  ["Signatures", job?.signedAt || job?.signatureName ? "Captured" : "Not captured"],
                  ["Notes", job?.pricingNotes || (job as any)?.formData ? "Recorded" : "No notes yet"],
                  ["Invoice", invoiceIssued ? "Issued" : "Draft or not issued"],
                  ["Payment", invoicePaid ? "Paid" : hasPaymentDue ? "Awaiting payment" : "Not due"],
                  ["Communications", `${timelineItems.length} timeline item${timelineItems.length === 1 ? "" : "s"}`],
                  ["Audit trail", "Activity timeline in right rail"],
                  ["PDF snapshot", pdfUrl ? "Available" : "Not generated yet"],
                ].map(([label, value]) => (
                  <div key={label} className="jobs-lifecycleStep">
                    <span className="jobs-lifecycleLabel">{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </EntitySection>

          <EntitySection title="Job details" subtitle="Key dates, totals, and billing truth for this job.">
            <details className="dashboard-home-details mt-technical-details" style={{ marginBottom: 16 }}>
              <summary>View lifecycle controls</summary>
              <div style={{ marginTop: 12 }}>
            <div className="integration-card" data-testid="job-lifecycle-controls">
              <div>
                <strong>{isArchived ? "Archived job" : "Lifecycle controls"}</strong>
                <p className="muted" style={{ margin: "4px 0 0 0" }}>
                  Archive hides this job from daily work but keeps it available. Delete is only for jobs with no proof, booking, or billing history yet.
                </p>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                {job?.status === "IN_PROGRESS" ? (
                  <button className="button" type="button" onClick={() => updateStatus("COMPLETED")} disabled={statusBusy === "COMPLETED"}>
                    {statusBusy === "COMPLETED" ? "Completing..." : "Complete job"}
                  </button>
                ) : null}
                {invoiceIssued && !invoicePaid && !isCancelled ? (
                  <button
                    className="button"
                    type="button"
                    onClick={() =>
                      void runLifecycleAction("mark-paid", {
                        confirmMessage: "Record an offline payment for this job?",
                        successMessage: "Payment recorded. This job now shows as paid.",
                      })
                    }
                    disabled={lifecycleBusy === "mark-paid"}
                  >
                    {lifecycleBusy === "mark-paid" ? "Recording..." : "Record payment"}
                  </button>
                ) : null}
                {canArchive ? (
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() =>
                      void runLifecycleAction("archive", {
                        confirmMessage: "Archive this job? It will leave the main queue but stay available in Archive.",
                        successMessage: "Job archived. It has left the main queue.",
                      })
                    }
                    disabled={lifecycleBusy === "archive"}
                  >
                    {lifecycleBusy === "archive" ? "Archiving..." : "Archive job"}
                  </button>
                ) : null}
                {isArchived ? (
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() =>
                      void runLifecycleAction("unarchive", {
                        successMessage: "Job restored. It is back in the main queue.",
                      })
                    }
                    disabled={lifecycleBusy === "unarchive"}
                  >
                    {lifecycleBusy === "unarchive" ? "Restoring..." : "Unarchive job"}
                  </button>
                ) : null}
                {canCancel ? (
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() =>
                      void runLifecycleAction("cancel", {
                        confirmMessage: "Cancel this job? It will leave the active queue and move into the cancelled view.",
                        successMessage: "Job cancelled.",
                      })
                    }
                    disabled={lifecycleBusy === "cancel"}
                  >
                    {lifecycleBusy === "cancel" ? "Cancelling..." : "Cancel job"}
                  </button>
                ) : null}
                <button
                  className="button secondary"
                  type="button"
                  onClick={() =>
                    void runLifecycleAction("delete", {
                      confirmMessage: "Delete this job from normal use? This is only allowed when no proof, booking, or billing history exists.",
                      redirectToJobs: true,
                    })
                  }
                  disabled={lifecycleBusy === "delete" || !canDelete}
                >
                  {lifecycleBusy === "delete" ? "Deleting..." : "Delete job"}
                </button>
              </div>
              {!canDelete && deleteBlockedReasons.length ? (
                <p className="muted" style={{ margin: "12px 0 0 0" }}>
                  Delete is blocked: {deleteBlockedReasons.join(" ")}
                </p>
              ) : null}
              {invoicePaid && !isArchived ? (
                <p className="muted" style={{ margin: "12px 0 0 0" }}>
                  This job is complete and paid. Archive it when you want it out of the daily queue.
                </p>
              ) : null}
            </div>
              </div>
            </details>
            <div className="two-col">
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Job reference
                </p>
                <p style={{ marginTop: 4 }}>{job?.jobRef || job?.id || "-"}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Where it stands
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
            </div>
          </EntitySection>

          <EntitySection title="Customer handoff" subtitle="Share the finished work and move into payment from the same job.">
            <div className="list" data-testid="job-workflow-handoff">
              <div className="integration-card" data-testid="job-authority-card">
                <div>
                  <strong>One finished job</strong>
                  <p className="muted" style={{ margin: "4px 0 0 0" }}>
                    Pricing, proof, signatures, and customer send all come from this submitted job.
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {pdfUrl ? (
                    <a className="button secondary" href={pdfUrl} target="_blank" rel="noreferrer noopener">
                      Open summary
                    </a>
                  ) : null}
                  <Link className="button secondary" href="/dashboard/work">
                    Back to Work
                  </Link>
                </div>
              </div>

              <div className="integration-card mt-focus-panel mt-focus-panel--quiet" data-testid="job-handoff-readiness-card">
                <div>
                  <strong>{handoffReadinessState === "READY_FOR_HANDOFF" ? "Ready" : handoffReadinessState === "SENT" ? "Sent" : "Waiting"}</strong>
                  <p className="muted" style={{ margin: "4px 0 0 0" }}>
                    {handoffReadinessSummary}
                  </p>
                  <p className="muted" style={{ margin: "8px 0 0 0" }}>
                    {latestCommsWasSent ? "Sent from this job." : "Not sent yet."}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {primaryShareAction ? (
                    primaryShareAction.href ? (
                      <a className="button" href={primaryShareAction.href} target={primaryShareAction.target} rel={primaryShareAction.rel}>
                        {primaryShareAction.label}
                      </a>
                    ) : (
                      <button className="button" type="button" onClick={primaryShareAction.onClick}>
                        {primaryShareAction.label}
                      </button>
                    )
                  ) : null}
                </div>
              </div>

              <div className="integration-card mt-focus-panel" data-testid="job-customer-handoff-card">
                <div>
                  <strong>{communicationStatus}</strong>
                  <p className="muted" style={{ margin: "4px 0 0 0" }}>
                    {communicationSummary}
                  </p>
                  <p className="muted" style={{ margin: "8px 0 0 0" }}>
                    {latestCommsSummary || "No customer update has gone out from this job yet."}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {primaryShareAction ? (
                    primaryShareAction.href ? (
                      <a className="button" href={primaryShareAction.href} target={primaryShareAction.target} rel={primaryShareAction.rel}>
                        {primaryShareAction.label}
                      </a>
                    ) : (
                      <button className="button" type="button" onClick={primaryShareAction.onClick}>
                        {primaryShareAction.label}
                      </button>
                    )
                  ) : null}
                  {!latestCommsWasSent ? (
                    <Link className="button secondary" href="/dashboard/settings?tab=messages">
                      Open Email settings
                    </Link>
                  ) : null}
                  {customerFollowUpActions.map((action) =>
                    action.href ? (
                      <a
                        key={`${action.label}-${action.href}`}
                        className="button secondary"
                        href={action.href}
                        target={action.target}
                        rel={action.rel}
                        onClick={action.onClick}
                      >
                        {action.label}
                      </a>
                    ) : (
                      <button key={action.label} className="button secondary" type="button" onClick={action.onClick}>
                        {action.label}
                      </button>
                    ),
                  )}
                </div>
              </div>

              {job?.customerEmail ? (
                <div className="integration-card" data-testid="job-customer-email-readiness">
                  <strong>Customer email path</strong>
                  <p className="muted" style={{ margin: "6px 0 0 0" }}>
                    {emailReadiness?.effective?.canSend
                      ? emailReadiness?.effective?.notice || "Service-record and follow-up emails use your business name through the MyTitan email service."
                      : emailReadiness?.effective?.guidance || "Customer email needs attention. Check Customer email status in Settings."}
                  </p>
                </div>
              ) : null}

              {commsEnabled ? (
                <SendUpdatePanel
                  entityType="job"
                  entityId={job?.id || id}
                  defaultTemplateKey="job.update"
                  defaultChannel="sms"
                  onSent={loadComms}
                  title="Need one more update?"
                  description="Use this only when the customer needs an extra message."
                  buttonLabel="Send extra update"
                  testId="job-manual-follow-up-panel"
                />
              ) : null}

              <div className="integration-card mt-focus-panel" data-testid="job-payment-follow-up-card">
                <div>
                  <strong>{paymentStatus}</strong>
                  <p className="muted" style={{ margin: "4px 0 0 0" }}>
                    {paymentSummary}
                  </p>
                  <p className="muted" style={{ margin: "6px 0 0 0" }}>
                    Request: {paymentRequestStatus}. MyTitan Stripe is not used for customer money.
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {!invoiceIssued && job?.status === "COMPLETED" ? (
                    <button className="button" type="button" onClick={() => updateStatus("INVOICED")} disabled={statusBusy === "INVOICED"}>
                      {statusBusy === "INVOICED" ? "Issuing invoice..." : "Issue invoice"}
                    </button>
                  ) : null}
                  {hasPaymentDue && !currentPaymentRequest ? (
                    <button className="button" type="button" onClick={() => void preparePaymentRequest()} disabled={paymentRequestBusy === "create"}>
                      {paymentRequestBusy === "create" ? "Preparing..." : "Prepare payment request"}
                    </button>
                  ) : null}
                  {hasPaymentDue && currentPaymentRequest?.status === "provider_unavailable" ? (
                    <Link className="button secondary" href={paymentSetupHref}>
                      Open payment setup
                    </Link>
                  ) : null}
                  {hasPaymentDue && customerPaymentActionUrl ? (
                    <a className="button" href={customerPaymentActionUrl} target="_blank" rel="noreferrer noopener" onClick={handleCollectPayment}>
                      Open customer checkout
                    </a>
                  ) : null}
                  {hasPaymentDue && currentPaymentRequest && currentPaymentRequest.status !== "paid" ? (
                    <button className="button secondary" type="button" onClick={() => void markPaymentRequestPaid()} disabled={paymentRequestBusy === "manual-paid"}>
                      {paymentRequestBusy === "manual-paid" ? "Recording..." : "Record manual paid"}
                    </button>
                  ) : null}
                  {hasPaymentDue && paymentUrl ? (
                    <a className="button" href={paymentUrl} target="_blank" rel="noreferrer noopener" onClick={handleCollectPayment}>
                      Collect payment
                    </a>
                  ) : null}
                  <Link className="button secondary" href="/dashboard/work">
                    Start next job
                  </Link>
                </div>
                {hasPaymentDue && currentPaymentRequest && currentPaymentRequest.status !== "paid" ? (
                  <div className="two-col" style={{ marginTop: 12 }}>
                    <label>
                      <span>Manual method</span>
                      <select className="input" value={manualPaymentDraft.method} onChange={(event) => setManualPaymentDraft((current) => ({ ...current, method: event.target.value }))}>
                        <option value="bank_transfer">Bank transfer</option>
                        <option value="cash">Cash</option>
                        <option value="card_machine">Card machine</option>
                        <option value="cheque">Cheque</option>
                        <option value="other">Other/manual</option>
                      </select>
                    </label>
                    <label>
                      <span>Amount received (pence)</span>
                      <input className="input" type="number" min="1" step="1" value={manualPaymentDraft.amountReceivedCents} onChange={(event) => setManualPaymentDraft((current) => ({ ...current, amountReceivedCents: event.target.value }))} placeholder={String(currentPaymentRequest.amountCents || job?.totalCents || "")} />
                    </label>
                    <label>
                      <span>Reference</span>
                      <input className="input" value={manualPaymentDraft.reference} onChange={(event) => setManualPaymentDraft((current) => ({ ...current, reference: event.target.value }))} placeholder="Bank ref, receipt number, or cheque number" />
                    </label>
                    <label>
                      <span>Received date</span>
                      <input className="input" type="date" value={manualPaymentDraft.receivedAt} onChange={(event) => setManualPaymentDraft((current) => ({ ...current, receivedAt: event.target.value }))} />
                    </label>
                    <label>
                      <span>Existing evidence</span>
                      <select className="input" value={manualPaymentDraft.evidenceArtifactId} onChange={(event) => setManualPaymentDraft((current) => ({ ...current, evidenceArtifactId: event.target.value }))} data-testid="payment-evidence-picker">
                        <option value="">No evidence selected</option>
                        {paymentEvidenceItems.map((item: any) => (
                          <option key={item.id} value={item.id}>
                            {item.label} {item.portalVisible ? "(customer visible)" : "(finance only)"}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Receipt note for customer</span>
                      <input className="input" value={manualPaymentDraft.customerReceiptNote} onChange={(event) => setManualPaymentDraft((current) => ({ ...current, customerReceiptNote: event.target.value }))} placeholder="Optional safe receipt note" />
                    </label>
                    <div style={{ gridColumn: "1 / -1", display: "grid", gap: 10, padding: 12, border: "1px solid var(--border-subtle)", borderRadius: 8 }}>
                      <strong>Upload payment evidence</strong>
                      <p className="muted" style={{ margin: 0 }}>
                        Upload bank screenshots, POS receipts, cheque images, remittance advice, or signed confirmations. Evidence is finance-only unless you make it customer visible.
                      </p>
                      <div className="two-col">
                        <label>
                          <span>Evidence label</span>
                          <input className="input" value={paymentEvidenceLabel} onChange={(event) => setPaymentEvidenceLabel(event.target.value)} placeholder="Bank transfer screenshot" data-testid="payment-evidence-label" />
                        </label>
                        <label>
                          <span>Evidence file</span>
                          <input className="input" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt" onChange={(event) => setPaymentEvidenceFile(event.target.files?.[0] || null)} data-testid="payment-evidence-file" />
                        </label>
                      </div>
                      {paymentEvidenceFile ? (
                        <p className="muted" style={{ margin: 0 }}>
                          Selected: {paymentEvidenceFile.name} · {Math.round(paymentEvidenceFile.size / 1024)} KB · scanner not configured
                        </p>
                      ) : null}
                      <label className="muted" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input type="checkbox" checked={paymentEvidenceVisible} onChange={(event) => setPaymentEvidenceVisible(event.target.checked)} data-testid="payment-evidence-visible" />
                        Make evidence visible to the customer receipt view
                      </label>
                      <div>
                        <button className="button secondary" type="button" onClick={() => void uploadPaymentEvidence()} disabled={paymentEvidenceBusy || !paymentEvidenceFile} data-testid="payment-evidence-upload">
                          {paymentEvidenceBusy ? "Uploading..." : "Upload and select evidence"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="integration-card">
                <div>
                  <strong>Customer copy</strong>
                  <p className="muted" style={{ margin: "4px 0 0 0" }}>
                    {pdfUrl
                      ? "The summary PDF is ready from this job."
                      : job?.status === "COMPLETED" || job?.status === "INVOICED"
                      ? "Send it from this job as soon as the customer copy is ready."
                      : "Finish the job first, then the customer copy stays attached here."}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {pdfUrl ? (
                    <a className="button secondary" href={pdfUrl} target="_blank" rel="noreferrer noopener">
                      Open summary
                    </a>
                  ) : null}
                  {portalUrl ? (
                    <a className="button secondary" href={portalUrl} target="_blank" rel="noreferrer noopener">
                      Open customer page
                    </a>
                  ) : null}
                </div>
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

          <EntityArtifactsCard
            title="Documents & Artifacts"
            entityType="job"
            entityId={id}
          />

          <EntitySection title="Completed work record" subtitle="Field proof and technician close-out stay explicit and reviewable.">
            <div data-testid="execution-record-card" style={{ display: "grid", gap: 10 }}>
              <div className={`quicklink-panel ${completionLinkState?.active ? "quicklink-panel--success" : "quicklink-panel--warning"}`} data-testid="job-completion-link-card">
                <div className="quicklink-panel__header">
                  <div className="quicklink-heading">
                    <span className="quicklink-icon" aria-hidden="true">↗</span>
                    <div>
                      <strong>Open on another device</strong>
                      <p className="muted" style={{ margin: "4px 0 0 0" }}>
                        Send a completion-only link for this job sheet. It opens the finish-work flow only and does not expose wider app access.
                      </p>
                    </div>
                  </div>
                  <OperatorStatusBadge
                    label={completionLinkState?.active ? "Active link" : "No active link"}
                    tone={completionLinkState?.active ? "success" : "warning"}
                  />
                </div>
                <div className="quicklink-panel__meta">
                  {completionLinkState?.activeLink ? (
                    <p className="muted" style={{ margin: 0 }}>
                      Active until {formatDateTime(completionLinkState.activeLink.expiresAt)}
                      {completionLinkState.activeLink.lastUsedAt ? ` • Last opened ${formatDateTime(completionLinkState.activeLink.lastUsedAt)}` : ""}
                    </p>
                  ) : (
                    <p className="muted" style={{ margin: 0 }}>No completion-only link is live right now.</p>
                  )}
                </div>
                <div className="quicklink-row" style={{ justifyContent: "flex-end" }}>
                  <button className="button secondary" type="button" onClick={() => void createCompletionLink()} disabled={completionLinkBusy !== "" || !canManageCompletionLink} data-testid="job-create-completion-link">
                    {completionLinkBusy === "create" ? "Preparing..." : completionLinkState?.active ? "Generate fresh link" : "Send to another device"}
                  </button>
                  {completionLinkState?.active ? (
                    <button className="button secondary" type="button" onClick={() => void revokeCompletionLink()} disabled={completionLinkBusy !== "" || !canManageCompletionLink} data-testid="job-revoke-completion-link">
                      {completionLinkBusy === "revoke" ? "Revoking..." : "Revoke link"}
                    </button>
                  ) : null}
                </div>
              </div>
              {generatedCompletionLink ? (
                <div className="quicklink-panel quicklink-panel--revenue" data-testid="job-generated-completion-link">
                  <div style={{ display: "grid", gap: 8 }}>
                    <div className="quicklink-panel__header">
                      <div className="quicklink-heading">
                        <span className="quicklink-icon" aria-hidden="true">⎘</span>
                        <strong>Completion-only link</strong>
                      </div>
                      <OperatorStatusBadge label="Ready to share" tone="info" />
                    </div>
                    <input className="input" readOnly value={generatedCompletionLink} data-testid="job-generated-completion-link-input" />
                    <div className="quicklink-row">
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(generatedCompletionLink)}
                        data-testid="job-copy-completion-link"
                      >
                        Copy link
                      </button>
                      <a className="button" href={generatedCompletionLink} target="_blank" rel="noreferrer" data-testid="job-open-completion-link">
                        Open on another device
                      </a>
                    </div>
                  </div>
                </div>
              ) : null}
              {executionRecord ? (
                <>
                  <div className={`quicklink-panel quicklink-panel--${executionTone(executionRecord.status)}`}>
                    <div className="quicklink-panel__header">
                      <div className="quicklink-heading">
                        <span className="quicklink-icon" aria-hidden="true">✓</span>
                        <div>
                          <strong>{executionRecord.status}</strong>
                          <p className="muted" style={{ margin: "4px 0 0 0" }}>
                            {executionRecord.summary || "No execution summary recorded yet."}
                          </p>
                        </div>
                      </div>
                      <OperatorStatusBadge label={String(executionRecord.status || "Draft")} tone={executionTone(executionRecord.status)} />
                    </div>
                    <div className="quicklink-panel__meta">
                      <p className="muted" style={{ margin: "4px 0 0 0" }}>
                        {executionRecord.submittedAt ? `Submitted ${formatDateTime(executionRecord.submittedAt)}` : "Draft"}
                        {executionRecord.acknowledgedAt ? ` • Acknowledged ${formatDateTime(executionRecord.acknowledgedAt)}` : ""}
                      </p>
                    </div>
                  </div>
                  <div data-testid="execution-checklist" className="quicklink-checklist">
                    {(executionRecord.checklist || []).map((item: any) => (
                      <div key={item.key || item.label} className={`quicklink-panel quicklink-checklist__item ${item.completed ? "quicklink-panel--success" : "quicklink-panel--warning"}`}>
                        <div className="quicklink-panel__header">
                          <strong>{item.label}</strong>
                          <OperatorStatusBadge label={item.completed ? "Completed" : "Open"} tone={item.completed ? "success" : "warning"} compact />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div data-testid="execution-evidence-list" style={{ display: "grid", gap: 8 }}>
                    {(executionRecord.evidence || []).length ? (
                      executionRecord.evidence.map((item: any) => (
                        <div key={item.id} className="integration-card">
                          <div>
                            <strong>{item.label}</strong>
                            <p className="muted" style={{ margin: "4px 0 0 0" }}>{String(item.kind || "").replaceAll("_", " ")}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="muted">No execution evidence references attached yet.</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="muted">No completed work record has been started for this job yet.</p>
              )}
            </div>
          </EntitySection>

          <EntitySection title="Parts and inventory" subtitle="Planned, reserved, and used parts stay explicit against the live stock layer.">
            <form className="job-parts-form" onSubmit={addJobPart} style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.4fr) minmax(120px, 0.6fr) minmax(220px, 1fr) auto", gap: 10, marginBottom: 14 }}>
              <select className="input" value={jobPartDraft.stockItemId} onChange={(event) => setJobPartDraft((current) => ({ ...current, stockItemId: event.target.value }))} required>
                <option value="">Select part</option>
                {partsCatalog.map((part) => (
                  <option key={part.id} value={part.id}>{part.sku} · {part.name}</option>
                ))}
              </select>
              <input className="input" type="number" min="0.01" step="0.01" value={jobPartDraft.quantityPlanned} onChange={(event) => setJobPartDraft((current) => ({ ...current, quantityPlanned: Number(event.target.value || 0) }))} required />
              <select className="input" value={jobPartDraft.sourceLocationId} onChange={(event) => setJobPartDraft((current) => ({ ...current, sourceLocationId: event.target.value }))}>
                <option value="">Optional source location</option>
                {inventoryLocations.map((location) => (
                  <option key={location.id} value={location.id}>{location.name}</option>
                ))}
              </select>
              <button className="button secondary" type="submit" disabled={jobPartsBusy}>
                {jobPartsBusy && jobPartAction === "add" ? "Adding part..." : "Add part"}
              </button>
            </form>
            <div data-testid="job-parts-list" style={{ display: "grid", gap: 10 }}>
              {jobParts.length ? (
                jobParts.map((row) => (
                  <div key={row.id} className="integration-card">
                    <div>
                      <strong>{row.part?.sku} · {row.part?.name}</strong>
                      <p className="muted" style={{ margin: "4px 0 0 0" }}>
                        Planned {Number(row.quantityPlanned || 0).toFixed(2)} • Reserved {Number(row.quantityReserved || 0).toFixed(2)} • Used {Number(row.quantityUsed || 0).toFixed(2)} • {row.sourceLocationName || "No source location"} • {row.status}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button className="button secondary" data-testid="job-part-reserve" type="button" onClick={() => void actOnJobPart(row.id, "reserve")} disabled={jobPartsBusy || !row.sourceLocationId || row.status === "USED" || row.status === "CANCELLED"}>
                        {jobPartsBusy && jobPartAction === "reserve" ? "Reserving..." : "Reserve"}
                      </button>
                      <button className="button" data-testid="job-part-use" type="button" onClick={() => void actOnJobPart(row.id, "use")} disabled={jobPartsBusy || !row.sourceLocationId || row.status === "CANCELLED"}>
                        {jobPartsBusy && jobPartAction === "use" ? "Marking used..." : "Use"}
                      </button>
                      <button className="button secondary" type="button" onClick={() => void actOnJobPart(row.id, "release")} disabled={jobPartsBusy || Number(row.quantityReserved || 0) <= 0}>
                        {jobPartsBusy && jobPartAction === "release" ? "Releasing..." : "Release"}
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="muted">No parts planned for this job yet.</p>
              )}
            </div>
          </EntitySection>

          <EntitySection title="Compliance controls" subtitle="Internal workflow controls remain auditable and attached to the real job state only.">
            <div data-testid="job-compliance-exceptions" style={{ display: "grid", gap: 10 }}>
              {complianceExceptions.length ? (
                complianceExceptions.map((exception) => (
                  <div key={exception.id} className="integration-card">
                    <div>
                      <strong>{exception.summary}</strong>
                      <p className="muted" style={{ margin: "4px 0 0 0" }}>
                        {exception.kind.replaceAll("_", " ")} • {exception.severity} • {exception.status}
                      </p>
                    </div>
                    <Link href="/dashboard/compliance">Open compliance workspace</Link>
                  </div>
                ))
              ) : (
                <p className="muted">No open compliance exceptions are currently attached to this job.</p>
              )}
            </div>
          </EntitySection>

          <EntitySection title="Customer approvals" subtitle="Request explicit customer approval without breaking the existing portal flow.">
            <div data-testid="approval-request-list" style={{ display: "grid", gap: 10 }}>
              {approvalRequests.length ? (
                approvalRequests.map((approval) => (
                  <div key={approval.id} className="integration-card">
                    <div>
                      <strong>{approval.entityLabel || approval.kind}</strong>
                      <p className="muted" style={{ margin: "4px 0 0 0" }}>
                        {approval.kind.replaceAll("_", " ")} • {approval.status} • Requested {formatDateTime(approval.requestedAt)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="muted">No explicit approval requests yet.</p>
              )}
            </div>
            {canManagePortal ? (
              <div style={{ marginTop: 12 }}>
                <button className="button" type="button" onClick={() => void requestApproval()} disabled={approvalBusy || !job?.customerId} data-testid="approval-request-create">
                  {approvalBusy ? "Creating..." : "Request work authorization"}
                </button>
              </div>
            ) : (
              <p className="muted" style={{ marginTop: 12 }}>Your role cannot create customer approval requests.</p>
            )}
          </EntitySection>

          <EntitySection title="Estimates" subtitle="Build, approve, and convert customer pricing without leaving the job sheet.">
            <div id="job-estimates" style={{ display: "grid", gap: 12 }}>
              {estimatesEnabled ? (
                <form className="integration-card" onSubmit={createJobEstimate} data-testid="job-estimate-builder">
                  <div>
                    <strong>Draft estimate</strong>
                    <p className="muted" style={{ margin: "4px 0 0 0" }}>
                      Pricing is stored as quote history, then converted into this job only after approval.
                    </p>
                  </div>
                  <div className="two-col" style={{ marginTop: 12 }}>
                    <label>
                      <span className="label">Estimate title</span>
                      <input
                        className="input"
                        value={estimateDraft.title}
                        onChange={(event) => setEstimateDraft((current) => ({ ...current, title: event.target.value }))}
                        placeholder={job?.serviceName || "Job estimate"}
                      />
                    </label>
                    <label>
                      <span className="label">Line item</span>
                      <input
                        className="input"
                        value={estimateDraft.lineTitle}
                        onChange={(event) => setEstimateDraft((current) => ({ ...current, lineTitle: event.target.value }))}
                        placeholder="Work to complete"
                      />
                    </label>
                    <label>
                      <span className="label">Quantity</span>
                      <input
                        className="input"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={estimateDraft.quantity}
                        onChange={(event) => setEstimateDraft((current) => ({ ...current, quantity: Number(event.target.value || 1) }))}
                      />
                    </label>
                    <label>
                      <span className="label">Unit price</span>
                      <input
                        className="input"
                        inputMode="decimal"
                        value={estimateDraft.unitPrice}
                        onChange={(event) => setEstimateDraft((current) => ({ ...current, unitPrice: event.target.value }))}
                        placeholder="£19.00"
                      />
                    </label>
                  </div>
                  <label style={{ display: "block", marginTop: 12 }}>
                    <span className="label">Summary</span>
                    <textarea
                      className="input"
                      rows={2}
                      value={estimateDraft.summary}
                      onChange={(event) => setEstimateDraft((current) => ({ ...current, summary: event.target.value }))}
                      placeholder="Customer-visible scope summary"
                    />
                  </label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
                    <button className="button" type="submit" disabled={estimateBusy === "create" || !job?.customerId}>
                      {estimateBusy === "create" ? "Drafting..." : "Create estimate"}
                    </button>
                    {!job?.customerId ? <span className="muted">Link a customer before drafting an estimate.</span> : null}
                  </div>
                </form>
              ) : (
                <div className="integration-card">
                  <div>
                    <strong>Enterprise estimates disabled</strong>
                    <p className="muted" style={{ margin: "4px 0 0 0" }}>
                      This workspace is not enrolled for job-sheet estimates yet.
                    </p>
                  </div>
                </div>
              )}
              {quotes.length ? (
                quotes.map((quote) => (
                  <div key={quote.id} className="integration-card" data-testid="job-estimate-card">
                    <div>
                      <strong>{quote.quoteNumber}</strong>
                      <p className="muted" style={{ margin: "4px 0 0 0" }}>
                        {quote.title} • {quote.status} • {money(Number(quote.totalCents || 0), quote.currency || "GBP")}
                      </p>
                      <p className="muted" style={{ margin: "4px 0 0 0" }}>
                        {quote.status === "CONVERTED"
                          ? "Converted into this job sheet."
                          : quote.status === "APPROVED"
                          ? "Approved and ready to convert."
                          : quote.status === "SENT"
                          ? "Waiting for customer approval."
                          : "Editable before approval."}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {quote.status === "DRAFT" || quote.status === "EXPIRED" ? (
                        <button className="button secondary" type="button" onClick={() => void actOnEstimate(quote.id, "send")} disabled={Boolean(estimateBusy)}>
                          Send
                        </button>
                      ) : null}
                      {quote.status === "SENT" ? (
                        <button className="button secondary" type="button" onClick={() => void actOnEstimate(quote.id, "approve")} disabled={Boolean(estimateBusy)}>
                          Mark approved
                        </button>
                      ) : null}
                      {quote.status === "APPROVED" ? (
                        <button className="button" type="button" onClick={() => void actOnEstimate(quote.id, "convert")} disabled={Boolean(estimateBusy)}>
                          Convert to job
                        </button>
                      ) : null}
                      <Link className="button secondary" href="/dashboard/quotes">Open quotes</Link>
                    </div>
                  </div>
                ))
              ) : (
                <p className="muted">No estimates are linked to this job yet.</p>
              )}
            </div>
          </EntitySection>

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

        </div>
        <div className="entity-rail">
          <OnboardingCoach
            actions={{
              start_job: job?.status === "OPEN" || job?.status === "SCHEDULED"
                ? [{ label: statusBusy === "IN_PROGRESS" ? "Starting job..." : "Start job", onClick: () => updateStatus("IN_PROGRESS") }]
                : undefined,
              collect_payment: hasPaymentDue && paymentUrl
                ? [{ label: "Collect payment", href: paymentUrl, onClick: handleCollectPayment }]
                : undefined,
            }}
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

        .job-feedback-banner {
          margin-bottom: 14px;
          padding: 12px 14px;
          border-radius: 14px;
          font-weight: 600;
        }

        .job-feedback-banner--success {
          color: #0f766e;
          background: linear-gradient(180deg, #ecfdf5 0%, #f5fffa 100%);
          border: 1px solid rgba(15, 118, 110, 0.18);
        }

        .jobs-lifecycleGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-top: 14px;
        }

        .jobs-lifecycleStep {
          padding: 12px 14px;
          border-radius: 14px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(255, 255, 255, 0.76);
        }

        .jobs-lifecycleLabel {
          display: block;
          margin-bottom: 6px;
          color: #526071;
          font-size: 0.76rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        @media (max-width: 900px) {
          .entity-grid {
            grid-template-columns: 1fr;
          }

          .entity-rail {
            position: static;
          }

          .jobs-lifecycleGrid {
            grid-template-columns: 1fr;
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
