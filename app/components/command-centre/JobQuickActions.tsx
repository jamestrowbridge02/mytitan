import type { CSSProperties } from "react";
import Link from "next/link";
import { getJobNextAction } from "../../lib/next-action";
import { getJobSignals } from "../../lib/ops-signals";
import { markDemoStepComplete } from "../../lib/onboarding-coach";

type JobQuickActionsProps = {
  job: any;
  onStatusChange?: (jobId: string, nextStatus: string) => Promise<void>;
  onError?: (message: string, requestId?: string) => void;
  compact?: boolean;
};

function mapStatusForKey(key: string) {
  if (key === "start_job") return "IN_PROGRESS";
  if (key === "complete_job") return "COMPLETED";
  if (key === "issue_invoice") return "INVOICED";
  return "";
}

export default function JobQuickActions({ job, onStatusChange, compact = false }: JobQuickActionsProps) {
  if (!job?.id) return null;
  const next = getJobNextAction(job, { paymentUrl: job?.paymentLinkUrl });
  const signals = getJobSignals(job);
  const secondary: { label: string; href?: string; onClick?: () => void } | null = (() => {
    if (signals.blockedBy.includes("Payment") && job?.paymentLinkUrl) {
      return { label: "Collect payment", href: job.paymentLinkUrl };
    }
    if (signals.blockedBy.includes("Unassigned")) {
      return { label: "Assign", href: `/dashboard/jobs/${job.id}` };
    }
    if (signals.risks.includes("Overdue invoice") && job?.paymentLinkUrl) {
      return { label: "Collect payment", href: job.paymentLinkUrl };
    }
    return null;
  })();

  const primary = (() => {
    if (next.href) return { label: next.label, href: next.href };
    const nextStatus = mapStatusForKey(next.key);
    if (nextStatus && onStatusChange) {
      return {
        label: next.label,
        onClick: () => {
          if (nextStatus === "COMPLETED" && typeof window !== "undefined") {
            if (!window.confirm("Mark this job completed?")) return;
          }
          if (nextStatus === "IN_PROGRESS") {
            markDemoStepComplete("start_job");
          }
          void onStatusChange(job.id, nextStatus);
        },
      };
    }
    return { label: "View", href: `/dashboard/jobs/${job.id}` };
  })();

  const rowStyle: CSSProperties = compact
    ? { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }
    : { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 };

  const viewHref = `/dashboard/jobs/${job.id}`;
  const showView = !(primary.href === viewHref);

  return (
    <div style={rowStyle}>
      {primary.href ? (
        <Link className="button" href={primary.href}>
          {primary.label}
        </Link>
      ) : (
        <button className="button" type="button" onClick={primary.onClick}>
          {primary.label}
        </button>
      )}
      {secondary ? (
        secondary.href ? (
          <Link className="button secondary" href={secondary.href}>
            {secondary.label}
          </Link>
        ) : (
          <button className="button secondary" type="button" onClick={secondary.onClick}>
            {secondary.label}
          </button>
        )
      ) : null}
      {showView ? (
        <Link className="button secondary" href={viewHref}>
          View
        </Link>
      ) : null}
    </div>
  );
}
