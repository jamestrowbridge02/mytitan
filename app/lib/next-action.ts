/*
Rule order (first match wins):
Jobs:
1) If payment due and paymentLinkUrl exists -> Collect payment
2) If status OPEN/SCHEDULED -> Start job
3) If status IN_PROGRESS -> Mark completed
4) If status COMPLETED -> Issue invoice (status -> INVOICED)
5) If jobId exists -> View job
6) Fallback -> View jobs

Bookings:
1) If jobId exists -> View job
2) If status CANCELLED -> View bookings
3) If status PENDING/PLANNED/CONFIRMED/IN_PROGRESS/COMPLETED -> Convert to job
4) Fallback -> View bookings

Examples:
- Job COMPLETED + unpaid + paymentLinkUrl -> Collect payment (reason: Invoice unpaid)
- Booking PLANNED, no jobId -> Convert to Job (reason: Booking ready to fulfill)
*/

type NextAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  reason: string;
  key: string;
};

export function getJobNextAction(job: any, context?: { paymentUrl?: string }): NextAction {
  const status = String(job?.status || "").toUpperCase();
  const totalCents = Number(job?.totalCents || 0);
  const paymentUrl = context?.paymentUrl || job?.paymentLinkUrl || "";
  const invoicePaid = Boolean(job?.invoicePaidAt || job?.paymentReceiptUrl);
  const hasPaymentDue = totalCents > 0 && !invoicePaid;

  if (hasPaymentDue && paymentUrl) {
    return {
      label: "Collect payment",
      href: paymentUrl,
      reason: "Invoice unpaid",
      key: "collect_payment",
    };
  }

  if (status === "OPEN" || status === "SCHEDULED") {
    return { label: "Start Job", reason: "Job is scheduled", key: "start_job" };
  }

  if (status === "IN_PROGRESS") {
    return { label: "Mark Completed", reason: "Work in progress", key: "complete_job" };
  }

  if (status === "COMPLETED") {
    return { label: "Issue Invoice", reason: "Ready to invoice", key: "issue_invoice" };
  }

  if (job?.id) {
    return { label: "View Job", href: `/dashboard/jobs/${job.id}`, reason: "Open job detail", key: "view_job" };
  }

  return { label: "View Jobs", href: "/dashboard/jobs", reason: "Browse all jobs", key: "view_jobs" };
}

export function getBookingNextAction(booking: any, context?: { convertHref?: string }): NextAction {
  if (booking?.jobId) {
    return {
      label: "View Job",
      href: `/dashboard/jobs/${booking.jobId}`,
      reason: "Job already linked",
      key: "view_job",
    };
  }

  const status = String(booking?.status || "").toUpperCase();
  if (status === "CANCELLED") {
    return { label: "View Bookings", href: "/dashboard/bookings", reason: "Booking cancelled", key: "view_bookings" };
  }

  const convertHref = context?.convertHref || "/dashboard/jobs/new";
  if (["PENDING", "PLANNED", "CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(status)) {
    return { label: "Convert to Job", href: convertHref, reason: "Booking ready to fulfill", key: "convert_to_job" };
  }

  return { label: "View Bookings", href: "/dashboard/bookings", reason: "Browse all bookings", key: "view_bookings" };
}
