import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AutomationsService } from '../automations/automations.service';
import { isAutomationsV1Enabled, isNotificationsV1Enabled } from '../common/feature-flags';
import { ActivityService } from '../events/activity.service';
import { JobsService } from '../jobs/jobs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { assertWorkflowStageReadiness } from '../config/workflow-stage-readiness';

@Injectable()
export class BookingConversionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly automations: AutomationsService,
    private readonly activity: ActivityService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private toIso(value?: Date | string | null) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  async convert(companyId: string, userId: string, bookingId: string) {
    const db = this.prisma as any;
    const result = await db.$transaction(async (tx: any) => {
      const booking = await tx.booking.findFirst({
        where: { id: bookingId, companyId },
        include: {
          job: true,
          service: { select: { id: true, name: true } },
          proService: { select: { id: true, name: true } },
        },
      });

      if (!booking) {
        throw new BadRequestException('Booking not found');
      }
      const settings = await tx.tenantSetting.findUnique({
        where: { tenantId: companyId },
        select: { businessConfigJson: true },
      });

      const readinessIssues: string[] = [];
      if (!String(booking.customerName || '').trim()) readinessIssues.push('customer_name_missing');
      if (!booking.startsAt || !booking.endsAt) readinessIssues.push('time_window_missing');
      if (readinessIssues.length > 0) {
        throw new BadRequestException({
          code: 'BOOKING_CONVERSION_NOT_READY',
          issues: readinessIssues,
        });
      }

      if (booking.jobId && booking.job) {
        return {
          booking,
          job: booking.job,
          alreadyLinked: true,
          completionTriggered: false,
          contactGapEvaluationNeeded: false,
          conversion: {
            linkedAt: booking.updatedAt,
            dispatchFollowUpCreated: false,
            dispatchReminderId: null,
            activityId: null,
            duplicatePrevented: false,
            readinessIssues: [],
          },
        };
      }

      const { created } = await this.jobs.createCoreJobRecord(tx, companyId, userId, {
        locationId: booking.locationId || undefined,
        customerName: String(booking.customerName || '').trim() || 'Booking customer',
        customerEmail: String(booking.customerEmail || '').trim() || undefined,
        customerPhone: String(booking.customerPhone || '').trim() || undefined,
        serviceName: booking.proService?.name || booking.service?.name || undefined,
        scheduledAt: this.toIso(booking.startsAt) || undefined,
        formData: {
          sourceBookingId: booking.id,
          bookingSource: booking.source,
          bookingStatus: booking.status,
          scheduledAt: this.toIso(booking.startsAt),
          customerName: booking.customerName || null,
          customerEmail: booking.customerEmail || null,
          customerPhone: booking.customerPhone || null,
        },
      } as any);

      await tx.jobActivity.create({
        data: {
          companyId,
          jobId: created.id,
          actorUserId: userId,
          eventType: 'job.create',
          message: `Job ${created.jobRef || created.id} created from booking conversion`,
          payloadJson: {
            sourceBookingId: booking.id,
          },
        },
      });

      const nextStatus =
        booking.status === 'IN_PROGRESS'
          ? 'IN_PROGRESS'
          : booking.status === 'COMPLETED'
          ? 'COMPLETED'
          : 'SCHEDULED';

      await assertWorkflowStageReadiness({
        prisma: tx,
        tenantId: companyId,
        entityType: 'job',
        entityId: created.id,
        status: nextStatus,
        settings,
        action: `convert the booking into a ${nextStatus} job`,
      });

      const patchedJob = await tx.job.update({
        where: { id: created.id },
        data: {
          status: nextStatus,
          assignedUserId: booking.assignedUserId || null,
          scheduledAt: booking.startsAt || null,
          locationId: booking.locationId || null,
          completedAt: nextStatus === 'COMPLETED' ? new Date() : null,
        },
      });

      await tx.jobActivity.create({
        data: {
          companyId,
          jobId: patchedJob.id,
          actorUserId: userId,
          eventType: 'job.patch',
          message: 'Booking conversion applied scheduling and ownership fields',
          payloadJson: {
            status: patchedJob.status,
            assignedUserId: patchedJob.assignedUserId,
            scheduledAt: patchedJob.scheduledAt,
            locationId: patchedJob.locationId,
          },
        },
      });

      const linkData = {
        jobId: patchedJob.id,
        status: booking.status === 'PENDING' || booking.status === 'PLANNED' ? 'CONFIRMED' : booking.status,
      };
      await assertWorkflowStageReadiness({
        prisma: tx,
        tenantId: companyId,
        entityType: 'booking',
        entityId: booking.id,
        status: linkData.status,
        settings,
        action: 'convert the booking',
      });
      const linked = await tx.booking.updateMany({
        where: {
          id: booking.id,
          companyId,
          jobId: null,
        },
        data: linkData,
      });

      if (linked.count === 0) {
        const latestBooking = await tx.booking.findFirst({
          where: { id: booking.id, companyId },
          include: { job: true },
        });
        if (latestBooking?.jobId && latestBooking.jobId !== patchedJob.id) {
          await tx.job.update({
            where: { id: patchedJob.id },
            data: { status: 'CANCELLED' },
          });
          await tx.jobActivity.create({
            data: {
              companyId,
              jobId: patchedJob.id,
              actorUserId: userId,
              eventType: 'booking.convert.duplicate_prevented',
              message: `Duplicate conversion prevented after booking ${booking.id} linked to ${latestBooking.job?.jobRef || latestBooking.jobId}`,
              payloadJson: {
                bookingId: booking.id,
                supersedingJobId: latestBooking.jobId,
              },
            },
          });
          return {
            booking: latestBooking,
            job: latestBooking.job,
            alreadyLinked: true,
            completionTriggered: false,
            contactGapEvaluationNeeded: false,
            conversion: {
              linkedAt: latestBooking.updatedAt,
              dispatchFollowUpCreated: false,
              dispatchReminderId: null,
              activityId: null,
              duplicatePrevented: true,
              readinessIssues: [],
            },
          };
        }
        throw new ConflictException({
          code: 'BOOKING_CONVERSION_LINK_CONFLICT',
          message: 'Booking conversion could not acquire a stable link',
        });
      }

      const linkedBooking = await tx.booking.findFirst({
        where: { id: booking.id, companyId },
      });
      if (!linkedBooking) {
        throw new BadRequestException('Booking link could not be confirmed');
      }

      let dispatchFollowUpCreated = false;
      let dispatchReminderId: string | null = null;
      if (!patchedJob.assignedUserId) {
        const existingDispatchReminder = await tx.jobReminder.findFirst({
          where: {
            companyId,
            jobId: patchedJob.id,
            completedAt: null,
            note: 'Automation dispatch follow-up',
          },
        });
        if (!existingDispatchReminder) {
          const reminder = await tx.jobReminder.create({
            data: {
              companyId,
              jobId: patchedJob.id,
              remindAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
              channel: 'in_app',
              note: 'Automation dispatch follow-up',
            },
          });
          dispatchFollowUpCreated = true;
          dispatchReminderId = reminder.id;
          await tx.jobActivity.create({
            data: {
              companyId,
              jobId: patchedJob.id,
              actorUserId: userId,
              eventType: 'job.reminder.create',
              message: 'Dispatch follow-up created after booking conversion',
              payloadJson: { remindAt: reminder.remindAt, note: reminder.note, reminderId: reminder.id },
            },
          });
        }
      }

      const conversionActivity = await tx.jobActivity.create({
        data: {
          companyId,
          jobId: patchedJob.id,
          actorUserId: userId,
          eventType: 'booking.converted',
          message: `Booking ${booking.id} converted into ${patchedJob.jobRef || patchedJob.id}`,
          payloadJson: {
            bookingId: booking.id,
            bookingSource: booking.source,
            bookingStartsAt: booking.startsAt,
          },
        },
      });

      return {
        booking: linkedBooking,
        job: patchedJob,
        alreadyLinked: false,
        completionTriggered: patchedJob.status === 'COMPLETED',
        contactGapEvaluationNeeded: true,
        conversion: {
          linkedAt: linkedBooking.updatedAt,
          dispatchFollowUpCreated,
          dispatchReminderId,
          activityId: conversionActivity.id,
          duplicatePrevented: false,
          readinessIssues: [],
        },
      };
    });

    if (!result.alreadyLinked) {
      await this.activity.push({
        tenantId: companyId,
        type: 'booking.converted',
        label: `Booking ${result.booking.id} converted to ${result.job?.jobRef || result.job?.id}`,
        jobId: result.job?.id || null,
        jobRef: result.job?.jobRef || null,
        customerId: result.job?.customerId || null,
        customerName: result.job?.customerName || result.booking.customerName || null,
        status: result.job?.status || null,
        technicianId: result.job?.assignedUserId || result.booking.assignedUserId || null,
        payloadJson: {
          bookingId: result.booking.id,
          bookingSource: result.booking.source,
          bookingStatus: result.booking.status,
          conversionActivityId: result.conversion.activityId,
          dispatchReminderId: result.conversion.dispatchReminderId,
        },
      });

      if (isAutomationsV1Enabled()) {
        await this.automations.handleBookingConverted(companyId, userId, result.booking, result.job);
        await this.automations.evaluateRuleTrigger(companyId, "booking.converted", {
          actorUserId: userId,
          bookingId: result.booking.id,
          jobId: result.job.id,
          jobRef: result.job.jobRef || null,
          customerId: result.job.customerId || null,
          customerName: result.job.customerName || result.booking.customerName || null,
          status: result.job.status || null,
          assignedUserId: result.job.assignedUserId || null,
        });
        if (result.contactGapEvaluationNeeded) {
          await this.automations.handleJobContactGap(companyId, userId, result.job);
        }
        if (result.completionTriggered) {
          await this.automations.handleJobCompleted(companyId, userId, result.job);
        }
      }

      if (result.completionTriggered && isNotificationsV1Enabled()) {
        await this.notifications.notifyJobCompleted(companyId, result.job.id);
      }

      await this.audit.log(companyId, 'booking.convert', `Converted booking ${result.booking.id} into ${result.job?.jobRef || result.job?.id}`, userId);
    } else if (result.conversion.duplicatePrevented) {
      await this.audit.log(companyId, 'booking.convert.duplicate', `Prevented duplicate conversion for booking ${result.booking.id}`, userId);
    }

    return result;
  }
}
