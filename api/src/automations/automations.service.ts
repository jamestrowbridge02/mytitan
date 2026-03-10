import { BadRequestException, Injectable } from "@nestjs/common";
import { JwtPayload } from "../auth/auth.types";
import { AuditService } from "../audit/audit.service";
import { assertPermission } from "../common/permissions";
import { ActivityService } from "../events/activity.service";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateAutomationsSettingsDto } from "./automations.dto";

const DEFAULT_SETTINGS = {
  bookingRemindersEnabled: false,
  approvalRequestEnabled: false,
  reviewRequestEnabled: false,
  jobCompletionFollowUpEnabled: false,
  jobContactGapEnabled: false,
  deliveryMode: "metadata_only" as const,
};

@Injectable()
export class AutomationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly activity: ActivityService,
  ) {}

  private normalizeSettings(configJson: any) {
    const v1 = configJson?.automations?.v1 || {};
    return {
      bookingRemindersEnabled: Boolean(v1.bookingRemindersEnabled),
      approvalRequestEnabled: Boolean(v1.approvalRequestEnabled),
      reviewRequestEnabled: Boolean(v1.reviewRequestEnabled),
      jobCompletionFollowUpEnabled: Boolean(v1.jobCompletionFollowUpEnabled),
      jobContactGapEnabled: Boolean(v1.jobContactGapEnabled),
      deliveryMode: v1.deliveryMode === "live_send" ? "live_send" : "metadata_only",
    };
  }

  async getSettings(tenantId: string) {
    const db = this.prisma as any;
    const row = await db.automationsSetting.findUnique({ where: { tenantId } });
    if (!row?.configJson) return { ...DEFAULT_SETTINGS };
    const normalized = this.normalizeSettings(row.configJson);
    return { ...DEFAULT_SETTINGS, ...normalized };
  }

  async updateSettings(user: JwtPayload, dto: UpdateAutomationsSettingsDto) {
    const db = this.prisma as any;
    const tenantId = user.companyId;
    const currentRow = await db.automationsSetting.findUnique({ where: { tenantId } });
    const current = currentRow?.configJson ? this.normalizeSettings(currentRow.configJson) : { ...DEFAULT_SETTINGS };
    let nextDeliveryMode = current.deliveryMode;
    if (dto.deliveryMode) {
      nextDeliveryMode = dto.deliveryMode;
      if (dto.deliveryMode === "live_send" && current.deliveryMode !== "live_send") {
        if (!dto.confirmLiveSend) {
          throw new BadRequestException({ code: "CONFIRM_REQUIRED", message: "confirmLiveSend is required" });
        }
        await assertPermission({
          user,
          permission: "AUTOMATIONS_ADMIN",
          audit: this.audit,
          action: "automations.enable_live_send",
        });
      }
    }
    const next = {
      bookingRemindersEnabled: dto.bookingRemindersEnabled ?? current.bookingRemindersEnabled,
      approvalRequestEnabled: dto.approvalRequestEnabled ?? current.approvalRequestEnabled,
      reviewRequestEnabled: dto.reviewRequestEnabled ?? current.reviewRequestEnabled,
      jobCompletionFollowUpEnabled: dto.jobCompletionFollowUpEnabled ?? current.jobCompletionFollowUpEnabled,
      jobContactGapEnabled: dto.jobContactGapEnabled ?? current.jobContactGapEnabled,
      deliveryMode: nextDeliveryMode,
    };
    const configJson = {
      ...(currentRow?.configJson || {}),
      automations: {
        ...(currentRow?.configJson?.automations || {}),
        v1: next,
      },
    };

    await db.automationsSetting.upsert({
      where: { tenantId },
      create: { tenantId, configJson },
      update: { configJson },
    });

    await this.audit.log(tenantId, "automations.settings.update", `Automation settings updated`, user.sub);
    return next;
  }

  async isApprovalRequestEnabled(tenantId: string) {
    const settings = await this.getSettings(tenantId);
    return Boolean(settings.approvalRequestEnabled);
  }

  async getDeliveryMode(tenantId: string) {
    const settings = await this.getSettings(tenantId);
    return settings.deliveryMode === "live_send" ? "live_send" : "metadata_only";
  }

  async isLiveSendEnabled(tenantId: string) {
    return (await this.getDeliveryMode(tenantId)) === "live_send";
  }

  async preview(tenantId: string, windowDays: number) {
    const db = this.prisma as any;
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const windowMs = windowDays * dayMs;
    const windowEnd = new Date(now.getTime() + windowMs);

    const reminder24Start = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const reminder24End = new Date(windowEnd.getTime() + 24 * 60 * 60 * 1000);
    const reminder2Start = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const reminder2End = new Date(windowEnd.getTime() + 2 * 60 * 60 * 1000);

    const bookingStatuses = ['PENDING', 'PLANNED', 'CONFIRMED'];

    const [bookings24, bookings2] = await Promise.all([
      db.booking.findMany({
        where: {
          companyId: tenantId,
          status: { in: bookingStatuses },
          startsAt: { gte: reminder24Start, lte: reminder24End },
        },
        select: { id: true, startsAt: true },
      }),
      db.booking.findMany({
        where: {
          companyId: tenantId,
          status: { in: bookingStatuses },
          startsAt: { gte: reminder2Start, lte: reminder2End },
        },
        select: { id: true, startsAt: true },
      }),
    ]);

    const bookingIds24 = bookings24.map((b: any) => b.id);
    const bookingIds2 = bookings2.map((b: any) => b.id);

    const [existing24, existing2] = await Promise.all([
      bookingIds24.length
        ? db.notification.findMany({
            where: {
              companyId: tenantId,
              entityType: 'booking',
              entityId: { in: bookingIds24 },
              AND: [{ metaJson: { path: ['reasonKey'], equals: 'booking_reminder_24h' } }],
            },
            select: { entityId: true, metaJson: true },
          })
        : [],
      bookingIds2.length
        ? db.notification.findMany({
            where: {
              companyId: tenantId,
              entityType: 'booking',
              entityId: { in: bookingIds2 },
              AND: [{ metaJson: { path: ['reasonKey'], equals: 'booking_reminder_2h' } }],
            },
            select: { entityId: true, metaJson: true },
          })
        : [],
    ]);

    const existingSet24 = new Set(
      (existing24 || []).map((row: any) => `${row.entityId}:${row?.metaJson?.context?.scheduledFor || 'any'}`),
    );
    const existingSet2 = new Set(
      (existing2 || []).map((row: any) => `${row.entityId}:${row?.metaJson?.context?.scheduledFor || 'any'}`),
    );

    const reminders24 = bookings24.filter((booking: any) => {
      const scheduledFor = new Date(booking.startsAt);
      scheduledFor.setTime(scheduledFor.getTime() - 24 * 60 * 60 * 1000);
      const key = `${booking.id}:${scheduledFor.toISOString()}`;
      return !existingSet24.has(key) && !existingSet24.has(`${booking.id}:any`);
    }).length;

    const reminders2 = bookings2.filter((booking: any) => {
      const scheduledFor = new Date(booking.startsAt);
      scheduledFor.setTime(scheduledFor.getTime() - 2 * 60 * 60 * 1000);
      const key = `${booking.id}:${scheduledFor.toISOString()}`;
      return !existingSet2.has(key) && !existingSet2.has(`${booking.id}:any`);
    }).length;

    const [approvalCandidates, reviewCandidates] = await Promise.all([
      db.job.findMany({
        where: {
          companyId: tenantId,
          status: 'COMPLETED',
          approvedAt: null,
        },
        select: { id: true },
      }),
      db.job.findMany({
        where: {
          companyId: tenantId,
          invoicePaidAt: { not: null },
        },
        select: { id: true },
      }),
    ]);

    const approvalIds = approvalCandidates.map((job: any) => job.id);
    const reviewIds = reviewCandidates.map((job: any) => job.id);

    const [approvalExisting, reviewExisting] = await Promise.all([
      approvalIds.length
        ? db.notification.findMany({
            where: {
              companyId: tenantId,
              entityType: 'job',
              entityId: { in: approvalIds },
              AND: [{ metaJson: { path: ['reasonKey'], equals: 'approval_request' } }],
            },
            select: { entityId: true },
          })
        : [],
      reviewIds.length
        ? db.notification.findMany({
            where: {
              companyId: tenantId,
              entityType: 'job',
              entityId: { in: reviewIds },
              AND: [{ metaJson: { path: ['reasonKey'], equals: 'review_request' } }],
            },
            select: { entityId: true },
          })
        : [],
    ]);

    const approvalExistingSet = new Set((approvalExisting || []).map((row: any) => row.entityId));
    const reviewExistingSet = new Set((reviewExisting || []).map((row: any) => row.entityId));

    const jobsAwaitingApproval = approvalIds.filter((id: string) => !approvalExistingSet.has(id)).length;
    const jobsEligible = reviewIds.filter((id: string) => !reviewExistingSet.has(id)).length;

    return {
      windowDays,
      rules: await this.listRules(tenantId),
      bookingReminders: {
        reminders24h: reminders24,
        reminders2h: reminders2,
        total: reminders24 + reminders2,
      },
      approvalRequests: {
        jobsAwaitingApproval,
      },
      reviewRequests: {
        jobsEligible,
      },
    };
  }

  async listRules(tenantId: string) {
    const settings = await this.getSettings(tenantId);
    return [
      {
        key: "booking_reminders",
        label: "Booking reminders",
        enabled: Boolean(settings.bookingRemindersEnabled),
        trigger: "booking.scheduled",
        action: "Queue in-app reminder notifications before the booking window",
        deliveryMode: settings.deliveryMode,
      },
      {
        key: "approval_request",
        label: "Approval request",
        enabled: Boolean(settings.approvalRequestEnabled),
        trigger: "job.completed",
        action: "Queue an in-app approval request when completed work needs sign-off",
        deliveryMode: settings.deliveryMode,
      },
      {
        key: "review_request",
        label: "Review request",
        enabled: Boolean(settings.reviewRequestEnabled),
        trigger: "payment.received",
        action: "Queue a review follow-up after payment lands",
        deliveryMode: settings.deliveryMode,
      },
      {
        key: "job_completion_follow_up",
        label: "Billing follow-up reminder",
        enabled: Boolean(settings.jobCompletionFollowUpEnabled),
        trigger: "job.completed",
        action: "Create a follow-up reminder when completed work still needs invoice/payment handling",
        deliveryMode: settings.deliveryMode,
      },
      {
        key: "job_contact_gap",
        label: "Missing contact follow-up",
        enabled: Boolean(settings.jobContactGapEnabled),
        trigger: "job.created_or_updated",
        action: "Create a follow-up reminder when a job cannot be reached by email or phone",
        deliveryMode: settings.deliveryMode,
      },
    ];
  }

  async listRuns(tenantId: string, limit = 20) {
    const rows = await this.prisma.activityEvent.findMany({
      where: {
        tenantId,
        type: { startsWith: "automation." },
      },
      orderBy: { at: "desc" },
      take: Math.max(1, Math.min(limit, 100)),
    });

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      label: row.label,
      at: row.at,
      jobId: row.jobId,
      customerId: row.customerId,
      jobRef: row.jobRef,
      customerName: row.customerName,
      status: row.status,
      payloadJson: row.payloadJson,
    }));
  }

  async getDiagnostics(tenantId: string) {
    const db = this.prisma as any;
    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [rules, pendingRuns, pendingBillingFollowUps, contactGapJobs, staleUnassignedJobs, publicBookingsAwaitingConversion] = await Promise.all([
      this.listRules(tenantId),
      this.listRuns(tenantId, 12),
      db.jobReminder.count({
        where: {
          companyId: tenantId,
          completedAt: null,
          note: "Automation billing follow-up",
        },
      }),
      db.job.count({
        where: {
          companyId: tenantId,
          status: { in: ["OPEN", "SCHEDULED", "IN_PROGRESS", "COMPLETED"] },
          customerEmail: null,
          customerPhone: null,
        },
      }),
      db.job.count({
        where: {
          companyId: tenantId,
          assignedUserId: null,
          status: { in: ["OPEN", "SCHEDULED"] },
          createdAt: { lt: new Date(now.getTime() - 48 * 60 * 60 * 1000) },
        },
      }),
      db.booking.count({
        where: {
          companyId: tenantId,
          source: "PUBLIC",
          jobId: null,
          status: { in: ["PENDING", "PLANNED", "CONFIRMED"] },
          createdAt: { gte: last7Days },
        },
      }),
    ]);

    return {
      summary: {
        enabledRules: rules.filter((rule) => rule.enabled).length,
        totalRules: rules.length,
        pendingBillingFollowUps,
        contactGapJobs,
        staleUnassignedJobs,
        publicBookingsAwaitingConversion,
      },
      alerts: [
        contactGapJobs > 0
          ? {
              key: "job_contact_gap",
              severity: "warn",
              label: "Jobs missing customer contact",
              count: contactGapJobs,
              href: "/dashboard/jobs",
            }
          : null,
        staleUnassignedJobs > 0
          ? {
              key: "stale_unassigned_jobs",
              severity: "warn",
              label: "Unassigned jobs older than 48h",
              count: staleUnassignedJobs,
              href: "/dashboard/jobs",
            }
          : null,
        publicBookingsAwaitingConversion > 0
          ? {
              key: "public_booking_conversion",
              severity: "info",
              label: "Public bookings awaiting conversion",
              count: publicBookingsAwaitingConversion,
              href: "/dashboard/bookings",
            }
          : null,
      ].filter(Boolean),
      runs: pendingRuns,
    };
  }

  async handleJobCompleted(companyId: string, userId: string | null, job: any) {
    const settings = await this.getSettings(companyId);
    if (!settings.jobCompletionFollowUpEnabled) {
      return { logged: false, reminderCreated: false, reason: "disabled" };
    }

    const db = this.prisma as any;
    const reminderAt = job?.invoiceDueAt
      ? new Date(job.invoiceDueAt)
      : new Date((job?.completedAt ? new Date(job.completedAt).getTime() : Date.now()) + 24 * 60 * 60 * 1000);

    const existing = await db.jobReminder.findFirst({
      where: {
        companyId,
        jobId: job.id,
        note: "Automation billing follow-up",
        completedAt: null,
      },
    });

    let reminderCreated = false;
    if (!existing && !job.invoicePaidAt) {
      await db.jobReminder.create({
        data: {
          companyId,
          jobId: job.id,
          remindAt: reminderAt,
          channel: "in_app",
          note: "Automation billing follow-up",
        },
      });
      reminderCreated = true;
    }

    await this.activity.push({
      tenantId: companyId,
      type: "automation.job_completion_follow_up",
      label: reminderCreated
        ? `Automation created a billing follow-up for ${job.jobRef || job.id}`
        : `Automation evaluated ${job.jobRef || job.id} with no new follow-up needed`,
      jobId: job.id,
      jobRef: job.jobRef || null,
      customerId: job.customerId || null,
      customerName: job.customerName || null,
      status: job.status || null,
      payloadJson: {
        automationKey: "job_completion_follow_up",
        reminderCreated,
        remindAt: reminderCreated ? reminderAt.toISOString() : existing?.remindAt?.toISOString?.() || null,
        invoiceDueAt: job.invoiceDueAt ? new Date(job.invoiceDueAt).toISOString() : null,
        invoicePaidAt: job.invoicePaidAt ? new Date(job.invoicePaidAt).toISOString() : null,
      },
    });

    return { logged: true, reminderCreated, reason: reminderCreated ? "created" : "already_exists_or_paid" };
  }

  async handleJobContactGap(companyId: string, userId: string | null, job: any) {
    const settings = await this.getSettings(companyId);
    if (!settings.jobContactGapEnabled) {
      return { logged: false, reminderCreated: false, reason: "disabled" };
    }

    const hasContact = Boolean(String(job?.customerEmail || "").trim() || String(job?.customerPhone || "").trim());
    if (hasContact) {
      return { logged: false, reminderCreated: false, reason: "contact_present" };
    }

    const db = this.prisma as any;
    const existing = await db.jobReminder.findFirst({
      where: {
        companyId,
        jobId: job.id,
        note: "Automation customer contact follow-up",
        completedAt: null,
      },
    });

    let reminderCreated = false;
    if (!existing) {
      await db.jobReminder.create({
        data: {
          companyId,
          jobId: job.id,
          remindAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
          channel: "in_app",
          note: "Automation customer contact follow-up",
        },
      });
      reminderCreated = true;
    }

    await this.activity.push({
      tenantId: companyId,
      type: "automation.job_contact_gap",
      label: reminderCreated
        ? `Automation flagged a customer contact gap for ${job.jobRef || job.id}`
        : `Automation re-evaluated contact coverage for ${job.jobRef || job.id}`,
      jobId: job.id,
      jobRef: job.jobRef || null,
      customerId: job.customerId || null,
      customerName: job.customerName || null,
      status: job.status || null,
      payloadJson: {
        automationKey: "job_contact_gap",
        reminderCreated,
        customerEmail: job.customerEmail || null,
        customerPhone: job.customerPhone || null,
      },
    });

    return { logged: true, reminderCreated, reason: reminderCreated ? "created" : "already_exists" };
  }
}
