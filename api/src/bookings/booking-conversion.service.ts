import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { AuditService } from '../audit/audit.service';
import { AutomationsService } from '../automations/automations.service';
import { buildAppUrl } from '../common/public-url';
import { isAutomationsV1Enabled, isNotificationsV1Enabled } from '../common/feature-flags';
import { EmailService } from '../email/email.service';
import { buildBookingConfirmedEmailTemplate } from '../email/email-templates';
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
    private readonly email: EmailService,
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
          serviceLines: { orderBy: { sortOrder: 'asc' } },
          answers: {
            include: { question: { select: { questionKey: true, label: true, type: true, required: true, optionsJson: true } } },
            orderBy: { createdAt: 'asc' },
          },
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

      const bookingServiceLines = Array.isArray(booking.serviceLines) ? booking.serviceLines : [];
      const bookingServiceSummary = bookingServiceLines.map((line: any) => ({
        proServiceId: line.proServiceId || null,
        serviceName: line.serviceNameSnapshot,
        quantity: Number(line.quantity || 1),
        durationMinutes: Number(line.durationSnapshot || 0),
        lineTotalCents: Number(line.lineTotalCents || 0),
        priceSnapshot: line.priceSnapshot || null,
      }));
      const expectedDurationMinutes = bookingServiceSummary.length
        ? bookingServiceSummary.reduce((sum, line) => sum + Math.max(0, Number(line.durationMinutes || 0)) * Math.max(1, Number(line.quantity || 1)), 0)
        : booking.startsAt && booking.endsAt
          ? Math.max(0, Math.round((new Date(booking.endsAt).getTime() - new Date(booking.startsAt).getTime()) / 60000))
          : null;
      const publicStatusToken = String(booking.publicStatusToken || '').trim();
      const customerBookingDetails =
        booking.pricingSnapshotJson?.customerBookingDetails && typeof booking.pricingSnapshotJson.customerBookingDetails === 'object'
          ? booking.pricingSnapshotJson.customerBookingDetails
          : {};
      const bookingCustomerFields = (Array.isArray(booking.answers) ? booking.answers : []).map((answer: any) => {
        const stored = answer.valueJson && typeof answer.valueJson === 'object' && !Array.isArray(answer.valueJson)
          ? answer.valueJson
          : {};
        const snapshot = stored.snapshot && typeof stored.snapshot === 'object' && !Array.isArray(stored.snapshot)
          ? stored.snapshot
          : {};
        return {
          key: snapshot.key || answer.question?.questionKey || answer.questionId,
          label: snapshot.label || answer.question?.label || 'Booking field',
          type: snapshot.type || answer.question?.type || 'text',
          required: snapshot.required ?? answer.question?.required === true,
          visibility: snapshot.visibility || answer.question?.optionsJson?.visibility || 'PUBLIC',
          value: stored.value ?? answer.valueText ?? null,
          capturedAt: snapshot.capturedAt || this.toIso(answer.createdAt),
        };
      });
      const { created } = await this.jobs.createCoreJobRecord(tx, companyId, userId, {
        locationId: booking.locationId || undefined,
        customerName: String(booking.customerName || '').trim() || 'Booking customer',
        customerEmail: String(booking.customerEmail || '').trim() || undefined,
        customerPhone: String(booking.customerPhone || '').trim() || undefined,
        vehicleReg: String(customerBookingDetails.vehicleRegistration || '').trim() || undefined,
        serviceName: bookingServiceSummary[0]?.serviceName || booking.proService?.name || booking.service?.name || undefined,
        scheduledAt: this.toIso(booking.startsAt) || undefined,
        formData: {
          autoPopulatedFromBooking: true,
          autoPopulationVersion: 'phase_4c_booking_to_job_v1',
          sourceBookingId: booking.id,
          bookingSource: booking.source,
          bookingStatus: booking.status,
          scheduledAt: this.toIso(booking.startsAt),
          appointmentWindow: {
            startsAt: this.toIso(booking.startsAt),
            endsAt: this.toIso(booking.endsAt),
          },
          expectedDurationMinutes,
          customerName: booking.customerName || null,
          customerEmail: booking.customerEmail || null,
          customerPhone: booking.customerPhone || null,
          registration: customerBookingDetails.vehicleRegistration || null,
          vehicleReg: customerBookingDetails.vehicleRegistration || null,
          lockingWheelNutAvailable: customerBookingDetails.lockingWheelNutAvailable === true,
          bookingServiceCategory: customerBookingDetails.serviceCategory || null,
          bookingCustomerFields,
          bookingPricingSnapshot: booking.pricingSnapshotJson || null,
          bookingPaymentState: booking.paymentStateJson || null,
          bookingServiceLines: bookingServiceSummary,
          estimatePaymentDepositContext: {
            pricingSnapshot: booking.pricingSnapshotJson || null,
            paymentState: booking.paymentStateJson || null,
          },
          customerPortalStatus: {
            publicStatusToken: publicStatusToken ? `${publicStatusToken.slice(0, 8)}...` : null,
            statusUrl: publicStatusToken ? buildAppUrl(`/portal/booking/status/${publicStatusToken}`) : null,
          },
          bookingAttachments: [],
        },
      } as any);

      if (bookingServiceLines.length > 0) {
        await tx.jobLineItem.createMany({
          data: bookingServiceLines.map((line: any) => {
            const quantity = Math.max(1, Number(line.quantity || 1));
            const lineTotal = Math.max(0, Number(line.lineTotalCents || 0)) / 100;
            return {
              companyId,
              jobId: created.id,
              description: String(line.serviceNameSnapshot || 'Booked service'),
              qty: quantity,
              unitPrice: quantity > 0 ? lineTotal / quantity : lineTotal,
              total: lineTotal,
            };
          }),
        });
      }

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

      await tx.jobActivity.create({
        data: {
          companyId,
          jobId: created.id,
          actorUserId: userId,
          eventType: 'booking.job_sheet.autopopulated',
          message: 'Job sheet auto-populated from booking data',
          payloadJson: {
            sourceBookingId: booking.id,
            serviceLineCount: bookingServiceSummary.length,
            expectedDurationMinutes,
            locationId: booking.locationId || null,
            technicianAssigned: Boolean(booking.assignedUserId),
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

    let publicStatusToken = String((result.booking as any)?.publicStatusToken || '').trim();
    if (!result.alreadyLinked) {
      publicStatusToken = publicStatusToken
        || String(
          (
            await (this.prisma as any).booking.update({
              where: { id: result.booking.id },
              data: { publicStatusToken: crypto.randomBytes(24).toString('base64url') },
              select: { publicStatusToken: true },
            })
          )?.publicStatusToken || '',
        ).trim();
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
      await this.audit.log(companyId, 'booking.job_sheet.autopopulate', `Auto-populated job sheet from booking ${result.booking.id}`, userId);

      await this.notifications.sendEntityUpdate(companyId, userId, {
        entityType: 'booking',
        entityId: result.booking.id,
        templateKey: 'booking.converted_to_job',
        channel: 'in_app',
        note: `Linked to ${result.job?.jobRef || result.job?.id}`,
        context: {
          jobId: result.job?.id || null,
          jobRef: result.job?.jobRef || null,
          startsAt: result.booking?.startsAt ? new Date(result.booking.startsAt).toISOString() : null,
        },
      });
    } else if (result.conversion.duplicatePrevented) {
      await this.audit.log(companyId, 'booking.convert.duplicate', `Prevented duplicate conversion for booking ${result.booking.id}`, userId);
    }

    if (!result.alreadyLinked && result.booking?.source === 'PUBLIC' && result.booking?.customerEmail) {
      const branding = await this.email.getBranding(companyId, { ownership: 'workspace' });
      const pricingSnapshot = result.booking?.pricingSnapshotJson && typeof result.booking.pricingSnapshotJson === 'object'
        ? result.booking.pricingSnapshotJson
        : {};
      const template = buildBookingConfirmedEmailTemplate(branding, {
        serviceName: String((pricingSnapshot as any)?.serviceName || result.job?.serviceName || 'Service'),
        startsAtLabel: this.toIso(result.booking?.startsAt)
          ? new Date(String(result.booking.startsAt)).toLocaleString('en-GB', {
              weekday: 'short',
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'UTC',
            })
          : 'Scheduled soon',
        depositLabel:
          Number((pricingSnapshot as any)?.depositDueCents || 0) > 0
            ? `Deposit due: £${(Number((pricingSnapshot as any)?.depositDueCents || 0) / 100).toFixed(2)}`
            : 'No deposit due before the visit',
        balanceLabel:
          Number((pricingSnapshot as any)?.remainingBalanceCents || 0) > 0
            ? `Remaining balance: £${(Number((pricingSnapshot as any)?.remainingBalanceCents || 0) / 100).toFixed(2)}`
            : 'No remaining balance recorded',
        statusUrl: publicStatusToken ? buildAppUrl(`/portal/booking/status/${publicStatusToken}`) : undefined,
      });
      await this.email.sendOperationalEmail(
        companyId,
        {
          to: result.booking.customerEmail,
          subject: template.subject,
          text: template.text,
          html: template.html,
          fromName: branding.senderName,
          replyToEmail: branding.replyToEmail,
        },
      );
    }

    return result;
  }
}
