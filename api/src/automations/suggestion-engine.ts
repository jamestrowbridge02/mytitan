import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AutomationRuleAction, AutomationRuleCondition } from "./rule-engine";

export type AutomationSuggestionPriority = "high" | "medium" | "low";
export type AutomationSuggestionStatus = "new" | "applied" | "dismissed";

export type AutomationSuggestion = {
  key: string;
  title: string;
  description: string;
  benefit: string;
  trigger: string;
  conditionJson: AutomationRuleCondition | null;
  actionJson: AutomationRuleAction;
  reasonJson: {
    metric: string;
    count: number;
    threshold: number;
    windowDays?: number;
    detail: string;
  };
  priority: AutomationSuggestionPriority;
  whyThisAppeared: string;
  actionSummary: string;
};

type WorkspaceRuleCoverage = {
  trigger: string;
  actionType: string;
};

@Injectable()
export class AutomationSuggestionEngine {
  constructor(private readonly prisma: PrismaService) {}

  private getActionSummary(action: AutomationRuleAction) {
    if (action.type === "create_reminder") {
      return `Create a reminder ${action.delayDays ?? 0} day(s) after the event`;
    }
    if (action.type === "send_internal_notification") {
      return `Notify the team internally: ${action.title}`;
    }
    if (action.type === "advance_job_stage") {
      return `Advance the job to ${action.targetStatus}`;
    }
    return "Queue a customer follow-up message";
  }

  private hasRuleCoverage(rules: WorkspaceRuleCoverage[], trigger: string, actionType: AutomationRuleAction["type"]) {
    return rules.some((rule) => rule.trigger === trigger && rule.actionType === actionType);
  }

  async buildSuggestions(tenantId: string): Promise<AutomationSuggestion[]> {
    const db = this.prisma as any;
    const now = new Date();
    const last14Days = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [workspaceRules, overdueInvoices, recentArrivals, recentPortalSignatures, completedUnpaidJobs, recentConvertedUnassigned] = await Promise.all([
      db.automationRule.findMany({
        where: { tenantId },
        select: {
          trigger: true,
          actionJson: true,
        },
      }),
      db.job.count({
        where: {
          companyId: tenantId,
          invoiceIssuedAt: { not: null },
          invoicePaidAt: null,
          invoiceDueAt: { lt: now },
        },
      }),
      db.activityEvent.count({
        where: {
          tenantId,
          type: "technician.arrived",
          at: { gte: last14Days },
        },
      }),
      db.job.count({
        where: {
          companyId: tenantId,
          signedAt: { not: null, gte: last30Days },
          approvedAt: { not: null },
        },
      }),
      db.job.count({
        where: {
          companyId: tenantId,
          status: { in: ["COMPLETED", "INVOICED"] },
          invoicePaidAt: null,
          completedAt: { not: null },
        },
      }),
      db.jobReminder.count({
        where: {
          companyId: tenantId,
          note: "Automation dispatch follow-up",
          createdAt: { gte: last14Days },
          completedAt: null,
        },
      }),
    ]);

    const ruleCoverage = (workspaceRules || []).map((rule: any) => ({
      trigger: String(rule.trigger || ""),
      actionType: String(rule.actionJson?.type || ""),
    }));

    const suggestions: AutomationSuggestion[] = [];

    if (overdueInvoices > 0 && !this.hasRuleCoverage(ruleCoverage, "invoice.overdue", "create_reminder")) {
      const actionJson: AutomationRuleAction = {
        type: "create_reminder",
        delayDays: 0,
        note: "Automation overdue invoice follow-up",
        channel: "in_app",
      };
      suggestions.push({
        key: "invoice-overdue-follow-up",
        title: "Add an overdue invoice follow-up automation",
        description: "Create a reminder automatically when invoices move into overdue collections.",
        benefit: "Reduce manual collections work and keep overdue invoices from sitting idle.",
        trigger: "invoice.overdue",
        conditionJson: { invoicePaid: false },
        actionJson,
        reasonJson: {
          metric: "overdue_invoices",
          count: overdueInvoices,
          threshold: 1,
          detail: `${overdueInvoices} invoice${overdueInvoices === 1 ? "" : "s"} are overdue and still unpaid.`,
        },
        priority: overdueInvoices >= 3 ? "high" : "medium",
        whyThisAppeared: `${overdueInvoices} overdue invoice${overdueInvoices === 1 ? "" : "s"} currently need collections follow-up.`,
        actionSummary: this.getActionSummary(actionJson),
      });
    }

    if (recentArrivals > 0 && !this.hasRuleCoverage(ruleCoverage, "technician.arrived", "send_internal_notification")) {
      const actionJson: AutomationRuleAction = {
        type: "send_internal_notification",
        title: "Technician arrival check-in",
        body: "A technician arrived on site. Dispatch can confirm the office follow-up is complete.",
      };
      suggestions.push({
        key: "technician-arrival-office-notify",
        title: "Notify the office when technicians arrive",
        description: "Send an internal notification when field work starts so the office can coordinate handoff.",
        benefit: "Improve dispatch awareness without relying on manual check-ins.",
        trigger: "technician.arrived",
        conditionJson: null,
        actionJson,
        reasonJson: {
          metric: "technician_arrivals_14d",
          count: recentArrivals,
          threshold: 1,
          windowDays: 14,
          detail: `${recentArrivals} technician arrival event${recentArrivals === 1 ? "" : "s"} were logged in the last 14 days.`,
        },
        priority: recentArrivals >= 3 ? "high" : "medium",
        whyThisAppeared: `${recentArrivals} recent arrival event${recentArrivals === 1 ? "" : "s"} suggest field handoff is active and office visibility matters.`,
        actionSummary: this.getActionSummary(actionJson),
      });
    }

    if (recentPortalSignatures > 0 && !this.hasRuleCoverage(ruleCoverage, "portal.document_signed", "send_internal_notification")) {
      const actionJson: AutomationRuleAction = {
        type: "send_internal_notification",
        title: "Portal document signed",
        body: "A customer signed their portal document. Review the job and confirm the next office action.",
      };
      suggestions.push({
        key: "portal-signature-follow-up",
        title: "Follow up when portal documents are signed",
        description: "Create an office notification after customers sign portal paperwork.",
        benefit: "Keep signed approvals from getting lost between portal completion and internal follow-up.",
        trigger: "portal.document_signed",
        conditionJson: null,
        actionJson,
        reasonJson: {
          metric: "portal_signatures_30d",
          count: recentPortalSignatures,
          threshold: 1,
          windowDays: 30,
          detail: `${recentPortalSignatures} signed portal job${recentPortalSignatures === 1 ? "" : "s"} were found in recent workspace activity.`,
        },
        priority: "medium",
        whyThisAppeared: `${recentPortalSignatures} signed portal job${recentPortalSignatures === 1 ? "" : "s"} indicate customers are completing portal paperwork that may need office follow-up.`,
        actionSummary: this.getActionSummary(actionJson),
      });
    }

    if (
      completedUnpaidJobs > 0 &&
      !this.hasRuleCoverage(ruleCoverage, "job.completed", "create_reminder")
    ) {
      const actionJson: AutomationRuleAction = {
        type: "create_reminder",
        delayDays: 1,
        note: "Automation post-completion billing follow-up",
        channel: "in_app",
      };
      suggestions.push({
        key: "completed-job-billing-follow-up",
        title: "Follow up on completed jobs that still need billing action",
        description: "Create a billing reminder after completed work when payment is still outstanding.",
        benefit: "Turn completed work into collections follow-through without relying on memory.",
        trigger: "job.completed",
        conditionJson: { invoicePaid: false },
        actionJson,
        reasonJson: {
          metric: "completed_unpaid_jobs",
          count: completedUnpaidJobs,
          threshold: 1,
          detail: `${completedUnpaidJobs} completed or invoiced job${completedUnpaidJobs === 1 ? "" : "s"} remain unpaid.`,
        },
        priority: completedUnpaidJobs >= 4 ? "high" : "medium",
        whyThisAppeared: `${completedUnpaidJobs} completed job${completedUnpaidJobs === 1 ? "" : "s"} still need billing closure.`,
        actionSummary: this.getActionSummary(actionJson),
      });
    }

    if (recentConvertedUnassigned > 0 && !this.hasRuleCoverage(ruleCoverage, "booking.converted", "send_internal_notification")) {
      const actionJson: AutomationRuleAction = {
        type: "send_internal_notification",
        title: "Dispatch follow-up required",
        body: "A booking was converted and still needs dispatch review.",
      };
      suggestions.push({
        key: "booking-converted-dispatch-notify",
        title: "Notify dispatch when converted work still needs assignment",
        description: "Send an internal dispatch notification after converted bookings that remain unassigned.",
        benefit: "Reduce lag between intake conversion and field assignment.",
        trigger: "booking.converted",
        conditionJson: { hasAssignedUser: false },
        actionJson,
        reasonJson: {
          metric: "dispatch_follow_ups_14d",
          count: recentConvertedUnassigned,
          threshold: 1,
          windowDays: 14,
          detail: `${recentConvertedUnassigned} converted job${recentConvertedUnassigned === 1 ? "" : "s"} still have an open dispatch follow-up.`,
        },
        priority: "medium",
        whyThisAppeared: `${recentConvertedUnassigned} converted job${recentConvertedUnassigned === 1 ? "" : "s"} still need assignment follow-up.`,
        actionSummary: this.getActionSummary(actionJson),
      });
    }

    const priorityOrder: Record<AutomationSuggestionPriority, number> = { high: 0, medium: 1, low: 2 };
    return suggestions.sort((a, b) => {
      const priorityDelta = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDelta !== 0) return priorityDelta;
      return b.reasonJson.count - a.reasonJson.count;
    });
  }
}
