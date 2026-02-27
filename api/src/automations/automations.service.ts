import { BadRequestException, Injectable } from "@nestjs/common";
import { JwtPayload } from "../auth/auth.types";
import { AuditService } from "../audit/audit.service";
import { assertPermission } from "../common/permissions";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateAutomationsSettingsDto } from "./automations.dto";

const DEFAULT_SETTINGS = {
  bookingRemindersEnabled: false,
  approvalRequestEnabled: false,
  reviewRequestEnabled: false,
  deliveryMode: "metadata_only" as const,
};

@Injectable()
export class AutomationsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private normalizeSettings(configJson: any) {
    const v1 = configJson?.automations?.v1 || {};
    return {
      bookingRemindersEnabled: Boolean(v1.bookingRemindersEnabled),
      approvalRequestEnabled: Boolean(v1.approvalRequestEnabled),
      reviewRequestEnabled: Boolean(v1.reviewRequestEnabled),
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
}
