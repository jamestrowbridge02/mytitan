/*
Deterministic rule order (first match wins within each list):
Blocked:
1) No assignedUserId -> "Unassigned"
2) Status COMPLETED or INVOICED with unpaid invoice -> "Payment"
3) Status OPEN/SCHEDULED/IN_PROGRESS with missing customerPhone/email -> "Missing contact"

Risks:
1) invoiceDueAt in past and unpaid -> "Overdue invoice"
2) job status OPEN/SCHEDULED and startsAt/createdAt older than 14 days -> "Stale job"
3) status IN_PROGRESS and updatedAt older than 7 days -> "Stalled in progress"
*/

type JobSignals = {
  blockedBy: string[];
  risks: string[];
  severity: "none" | "info" | "warn" | "critical";
};

export function getJobSignals(job: any, now: Date = new Date()): JobSignals {
  const blockedBy: string[] = [];
  const risks: string[] = [];
  if (!job) return { blockedBy, risks, severity: "none" };

  const status = String(job.status || "").toUpperCase();
  const assignedUserId = job.assignedUserId || null;
  const invoicePaid = Boolean(job.invoicePaidAt || job.paymentReceiptUrl);
  const totalCents = Number(job.totalCents || 0);
  const hasPaymentDue = totalCents > 0 && !invoicePaid;
  const contactMissing = !job.customerPhone && !job.customerEmail;

  // Blocked signals
  if (!assignedUserId) blockedBy.push("Unassigned");
  if (["COMPLETED", "INVOICED"].includes(status) && hasPaymentDue) blockedBy.push("Payment");
  if (["OPEN", "SCHEDULED", "IN_PROGRESS"].includes(status) && contactMissing) blockedBy.push("Missing contact");

  // Risk signals
  if (job.invoiceDueAt && hasPaymentDue) {
    const due = new Date(job.invoiceDueAt);
    if (!Number.isNaN(due.getTime()) && due.getTime() < now.getTime()) {
      risks.push("Overdue invoice");
    }
  }

  const createdAt = job.createdAt ? new Date(job.createdAt) : null;
  if (createdAt && ["OPEN", "SCHEDULED"].includes(status)) {
    const ageDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > 14) risks.push("Stale job");
  }

  const updatedAt = job.updatedAt ? new Date(job.updatedAt) : null;
  if (updatedAt && status === "IN_PROGRESS") {
    const idleDays = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (idleDays > 7) risks.push("Stalled in progress");
  }

  let severity: JobSignals["severity"] = "none";
  if (blockedBy.length) {
    severity = blockedBy.includes("Payment") ? "critical" : "warn";
  } else if (risks.length) {
    severity = risks.includes("Overdue invoice") ? "warn" : "info";
  }

  return { blockedBy, risks, severity };
}
