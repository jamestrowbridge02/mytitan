import { BadRequestException, Injectable } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { ActivityService } from "../events/activity.service";
import { PrismaService } from "../prisma/prisma.service";

export const AUTOMATION_RULE_TRIGGERS = [
  "booking.converted",
  "job.created",
  "job.completed",
  "invoice.issued",
  "invoice.overdue",
  "technician.arrived",
  "portal.document_signed",
] as const;

export const AUTOMATION_RULE_ACTION_TYPES = [
  "create_reminder",
  "send_internal_notification",
  "advance_job_stage",
  "send_customer_message",
] as const;

export type AutomationRuleTrigger = (typeof AUTOMATION_RULE_TRIGGERS)[number];
export type AutomationRuleActionType = (typeof AUTOMATION_RULE_ACTION_TYPES)[number];

export type AutomationRuleCondition = {
  currentStatus?: string | null;
  currentStatusIn?: string[] | null;
  invoiceIssued?: boolean | null;
  invoicePaid?: boolean | null;
  hasAssignedUser?: boolean | null;
};

export type CreateReminderAction = {
  type: "create_reminder";
  delayDays?: number | null;
  note?: string | null;
  channel?: string | null;
};

export type SendInternalNotificationAction = {
  type: "send_internal_notification";
  title: string;
  body?: string | null;
};

export type AdvanceJobStageAction = {
  type: "advance_job_stage";
  targetStatus: string;
};

export type SendCustomerMessageAction = {
  type: "send_customer_message";
  subject?: string | null;
  body: string;
};

export type AutomationRuleAction =
  | CreateReminderAction
  | SendInternalNotificationAction
  | AdvanceJobStageAction
  | SendCustomerMessageAction;

export type AutomationRulePayload = {
  jobId?: string | null;
  jobRef?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  bookingId?: string | null;
  status?: string | null;
  assignedUserId?: string | null;
  invoiceIssuedAt?: string | Date | null;
  invoicePaidAt?: string | Date | null;
  actorUserId?: string | null;
  [key: string]: any;
};

@Injectable()
export class AutomationRuleEngine {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly moduleRef: ModuleRef,
  ) {}

  private getJobsService() {
    // Lazy require avoids a module-level cycle between the rule engine and JobsService.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { JobsService } = require("../jobs/jobs.service");
    return this.moduleRef.get<any>(JobsService, { strict: false });
  }

  private normalizeCondition(input: unknown): AutomationRuleCondition | null {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null;
    const raw = input as Record<string, unknown>;
    return {
      currentStatus: raw.currentStatus ? String(raw.currentStatus).toUpperCase() : null,
      currentStatusIn: Array.isArray(raw.currentStatusIn)
        ? raw.currentStatusIn.map((value) => String(value || "").toUpperCase()).filter(Boolean)
        : null,
      invoiceIssued: typeof raw.invoiceIssued === "boolean" ? raw.invoiceIssued : null,
      invoicePaid: typeof raw.invoicePaid === "boolean" ? raw.invoicePaid : null,
      hasAssignedUser: typeof raw.hasAssignedUser === "boolean" ? raw.hasAssignedUser : null,
    };
  }

  normalizeAction(input: unknown): AutomationRuleAction {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new BadRequestException("Action is required");
    }
    const raw = input as Record<string, unknown>;
    const type = String(raw.type || "");
    if (!AUTOMATION_RULE_ACTION_TYPES.includes(type as AutomationRuleActionType)) {
      throw new BadRequestException("Unsupported automation action");
    }

    if (type === "create_reminder") {
      const delayDays = raw.delayDays == null ? 1 : Math.max(0, Math.min(30, Number(raw.delayDays)));
      if (Number.isNaN(delayDays)) {
        throw new BadRequestException("create_reminder.delayDays must be a number");
      }
      return {
        type: "create_reminder",
        delayDays,
        note: raw.note ? String(raw.note).slice(0, 200) : null,
        channel: raw.channel ? String(raw.channel) : "in_app",
      };
    }

    if (type === "send_internal_notification") {
      const title = String(raw.title || "").trim();
      if (!title) throw new BadRequestException("send_internal_notification.title is required");
      return {
        type: "send_internal_notification",
        title: title.slice(0, 160),
        body: raw.body ? String(raw.body).slice(0, 500) : null,
      };
    }

    if (type === "advance_job_stage") {
      const targetStatus = String(raw.targetStatus || "").toUpperCase();
      if (!targetStatus) throw new BadRequestException("advance_job_stage.targetStatus is required");
      return { type: "advance_job_stage", targetStatus };
    }

    const body = String(raw.body || "").trim();
    if (!body) throw new BadRequestException("send_customer_message.body is required");
    return {
      type: "send_customer_message",
      subject: raw.subject ? String(raw.subject).slice(0, 160) : null,
      body: body.slice(0, 1000),
    };
  }

  normalizeConditionInput(input: unknown) {
    return this.normalizeCondition(input);
  }

  private matchesCondition(condition: AutomationRuleCondition | null, payload: AutomationRulePayload) {
    if (!condition) return true;
    const currentStatus = String(payload.status || "").toUpperCase();
    if (condition.currentStatus && currentStatus !== condition.currentStatus) return false;
    if (condition.currentStatusIn?.length && !condition.currentStatusIn.includes(currentStatus)) return false;
    if (condition.invoiceIssued !== null && condition.invoiceIssued !== undefined) {
      const invoiceIssued = Boolean(payload.invoiceIssuedAt);
      if (invoiceIssued !== condition.invoiceIssued) return false;
    }
    if (condition.invoicePaid !== null && condition.invoicePaid !== undefined) {
      const invoicePaid = Boolean(payload.invoicePaidAt);
      if (invoicePaid !== condition.invoicePaid) return false;
    }
    if (condition.hasAssignedUser !== null && condition.hasAssignedUser !== undefined) {
      const hasAssignedUser = Boolean(payload.assignedUserId);
      if (hasAssignedUser !== condition.hasAssignedUser) return false;
    }
    return true;
  }

  private async resolveActorUserId(tenantId: string, preferred?: string | null) {
    if (preferred) return preferred;
    const db = this.prisma as any;
    const owner = await db.user.findFirst({
      where: { companyId: tenantId, role: { in: ["OWNER", "ADMIN"] } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    return owner?.id || null;
  }

  private async executeCreateReminder(
    tenantId: string,
    actorUserId: string | null,
    rule: any,
    action: CreateReminderAction,
    payload: AutomationRulePayload,
  ) {
    if (!payload.jobId) {
      return { outcome: "skipped", reason: "missing_job" };
    }
    const db = this.prisma as any;
    const note = action.note?.trim() || `Automation rule: ${rule.name}`;
    const existing = await db.jobReminder.findFirst({
      where: {
        companyId: tenantId,
        jobId: payload.jobId,
        completedAt: null,
        note,
      },
      select: { id: true, remindAt: true },
    });
    if (existing) {
      return { outcome: "skipped", reason: "existing_open_reminder", reminderId: existing.id };
    }

    const jobs = this.getJobsService();
    if (!jobs || !actorUserId) {
      return { outcome: "skipped", reason: "missing_actor_or_jobs_service" };
    }
    const delayDays = action.delayDays ?? 1;
    const remindAt = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000).toISOString();
    const reminder = await jobs.createReminder(tenantId, actorUserId, {
      jobId: payload.jobId,
      remindAt,
      channel: action.channel || "in_app",
      note,
    });
    return { outcome: "success", reminderId: reminder.id, remindAt: reminder.remindAt };
  }

  private async executeAdvanceJobStage(
    tenantId: string,
    actorUserId: string | null,
    action: AdvanceJobStageAction,
    payload: AutomationRulePayload,
  ) {
    if (!payload.jobId) return { outcome: "skipped", reason: "missing_job" };
    const jobs = this.getJobsService();
    if (!jobs || !actorUserId) {
      return { outcome: "skipped", reason: "missing_actor_or_jobs_service" };
    }
    if (String(payload.status || "").toUpperCase() === action.targetStatus) {
      return { outcome: "skipped", reason: "already_in_target_status" };
    }
    const updated = await jobs.updateStatus(tenantId, actorUserId, payload.jobId, action.targetStatus as any);
    return { outcome: "success", targetStatus: updated.status };
  }

  private async executeInternalNotification(
    tenantId: string,
    rule: any,
    action: SendInternalNotificationAction,
    payload: AutomationRulePayload,
  ) {
    await this.activity.push({
      tenantId,
      type: "automation.internal_notification",
      label: action.title,
      jobId: payload.jobId || null,
      jobRef: payload.jobRef || null,
      customerId: payload.customerId || null,
      customerName: payload.customerName || null,
      status: payload.status || null,
      payloadJson: {
        automationRuleId: rule.id,
        automationRuleName: rule.name,
        body: action.body || null,
        trigger: rule.trigger,
      },
    });
    return { outcome: "success" };
  }

  private async executeCustomerMessage(
    tenantId: string,
    actorUserId: string | null,
    rule: any,
    action: SendCustomerMessageAction,
    payload: AutomationRulePayload,
  ) {
    const db = this.prisma as any;
    if (!payload.jobId) return { outcome: "skipped", reason: "missing_job" };
    await db.jobActivity.create({
      data: {
        companyId: tenantId,
        jobId: payload.jobId,
        actorUserId: actorUserId || null,
        eventType: "automation.customer_message.queued",
        message: action.subject || "Customer follow-up queued",
        payloadJson: {
          body: action.body,
          automationRuleId: rule.id,
          automationRuleName: rule.name,
        },
      },
    });
    await this.activity.push({
      tenantId,
      type: "automation.customer_message",
      label: `Customer follow-up queued for ${payload.jobRef || payload.jobId}`,
      jobId: payload.jobId,
      jobRef: payload.jobRef || null,
      customerId: payload.customerId || null,
      customerName: payload.customerName || null,
      status: payload.status || null,
      payloadJson: {
        automationRuleId: rule.id,
        automationRuleName: rule.name,
        subject: action.subject || null,
        body: action.body,
        deliveryMode: "metadata_only",
      },
    });
    return { outcome: "success", deliveryMode: "metadata_only" };
  }

  private async executeRuleAction(
    tenantId: string,
    actorUserId: string | null,
    rule: any,
    action: AutomationRuleAction,
    payload: AutomationRulePayload,
  ) {
    if (action.type === "create_reminder") {
      return this.executeCreateReminder(tenantId, actorUserId, rule, action, payload);
    }
    if (action.type === "advance_job_stage") {
      return this.executeAdvanceJobStage(tenantId, actorUserId, action, payload);
    }
    if (action.type === "send_internal_notification") {
      return this.executeInternalNotification(tenantId, rule, action, payload);
    }
    return this.executeCustomerMessage(tenantId, actorUserId, rule, action, payload);
  }

  private async logRuleRun(
    tenantId: string,
    rule: any,
    payload: AutomationRulePayload,
    status: "success" | "skipped" | "failed",
    result: Record<string, any>,
  ) {
    await this.activity.push({
      tenantId,
      type: "automation.rule_run",
      label: `Rule ${rule.name} ${status}`,
      jobId: payload.jobId || null,
      jobRef: payload.jobRef || null,
      customerId: payload.customerId || null,
      customerName: payload.customerName || null,
      status,
      payloadJson: {
        automationRuleId: rule.id,
        automationRuleName: rule.name,
        trigger: rule.trigger,
        actionType: result?.actionType || null,
        result,
      },
    });
  }

  async evaluateAutomationRules(tenantId: string, trigger: string, payload: AutomationRulePayload) {
    const rules = await this.prisma.automationRule.findMany({
      where: { tenantId, trigger, enabled: true },
      orderBy: { createdAt: "asc" },
    });
    if (!rules.length) return { evaluated: 0, matched: 0 };

    let matched = 0;
    for (const rule of rules) {
      const condition = this.normalizeCondition(rule.conditionJson);
      if (!this.matchesCondition(condition, payload)) {
        continue;
      }
      matched += 1;
      const action = this.normalizeAction(rule.actionJson);
      const actorUserId = await this.resolveActorUserId(tenantId, payload.actorUserId || null);
      try {
        const result = await this.executeRuleAction(tenantId, actorUserId, rule, action, payload);
        await this.logRuleRun(tenantId, rule, payload, (result.outcome === "success" ? "success" : "skipped"), {
          ...result,
          actionType: action.type,
        });
      } catch (error: any) {
        await this.logRuleRun(tenantId, rule, payload, "failed", {
          actionType: action.type,
          outcome: "failed",
          error: String(error?.message || error || "unknown error").slice(0, 300),
        });
      }
    }
    return { evaluated: rules.length, matched };
  }
}
