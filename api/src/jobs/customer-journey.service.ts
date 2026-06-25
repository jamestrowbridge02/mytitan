import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../auth/auth.types';
import { EnterpriseFeatureFlagsService } from '../enterprise/enterprise-feature-flags.service';
import { ActivityService } from '../events/activity.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCustomerJourneyDto } from './dto';

const JOURNEY_STAGES = [
  ['BOOKING_RECEIVED', 'Booking received'],
  ['AWAITING_CONFIRMATION', 'Awaiting confirmation'],
  ['SCHEDULED', 'Scheduled'],
  ['TECHNICIAN_ASSIGNED', 'Technician assigned'],
  ['PREPARING_FOR_VISIT', 'Preparing for visit'],
  ['ON_ROUTE', 'On route'],
  ['WORK_IN_PROGRESS', 'Work in progress'],
  ['AWAITING_APPROVAL', 'Awaiting approval'],
  ['COMPLETED', 'Completed'],
  ['INVOICED', 'Invoiced'],
  ['PAID', 'Paid'],
] as const;

@Injectable()
export class CustomerJourneyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly activity: ActivityService,
    private readonly enterpriseFlags: EnterpriseFeatureFlagsService,
  ) {}

  private db() {
    return this.prisma as any;
  }

  async assertCustomerEtaEnabled(tenantId: string, actor?: JwtPayload | null) {
    if (actor?.platformAdmin) throw new ForbiddenException('Platform admins cannot operate tenant customer journeys');
    return this.enterpriseFlags.assertEnabled({ tenantId, userId: actor?.sub || null, key: 'customer_eta_v1' });
  }

  async assertRoutePreviewEnabled(tenantId: string, actor?: JwtPayload | null) {
    if (actor?.platformAdmin) throw new ForbiddenException('Platform admins cannot operate tenant route previews');
    return this.enterpriseFlags.assertEnabled({ tenantId, userId: actor?.sub || null, key: 'route_preview_v1' });
  }

  private parseDate(value?: string | Date | null) {
    if (!value) return null;
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private addMinutes(date: Date, minutes: number) {
    return new Date(date.getTime() + minutes * 60_000);
  }

  private displayTechnician(user: any) {
    if (!user?.email) return null;
    return String(user.email).split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (value) => value.toUpperCase());
  }

  private hasActivity(job: any, type: string) {
    return (job.activities || []).some((activity: any) => activity.eventType === type);
  }

  private inferCurrentStage(job: any) {
    const manual = job.customerJourneyStage || null;
    if (manual && JOURNEY_STAGES.some(([key]) => key === manual)) return manual;
    if (job.invoicePaidAt) return 'PAID';
    if (job.invoiceIssuedAt || job.status === 'INVOICED') return 'INVOICED';
    if (job.status === 'COMPLETED') return job.approvedAt ? 'COMPLETED' : 'AWAITING_APPROVAL';
    if (job.status === 'IN_PROGRESS') return 'WORK_IN_PROGRESS';
    if (job.customerEtaStatus === 'ARRIVED' || this.hasActivity(job, 'tech.arrived')) return 'WORK_IN_PROGRESS';
    if (job.customerEtaStatus === 'ON_ROUTE' || this.hasActivity(job, 'customer_eta.on_route')) return 'ON_ROUTE';
    if (job.assignedUserId) return 'TECHNICIAN_ASSIGNED';
    if (job.scheduledAt) return 'SCHEDULED';
    if (job.status === 'OPEN') return 'AWAITING_CONFIRMATION';
    return 'BOOKING_RECEIVED';
  }

  private buildStages(job: any) {
    const current = this.inferCurrentStage(job);
    const currentIndex = Math.max(0, JOURNEY_STAGES.findIndex(([key]) => key === current));
    return JOURNEY_STAGES.map(([key, label], index) => ({
      key,
      label,
      state: index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'upcoming',
      visible: key !== 'ON_ROUTE' || job.customerEtaStatus === 'ON_ROUTE' || this.hasActivity(job, 'customer_eta.on_route'),
    })).filter((stage) => stage.visible);
  }

  private buildEta(job: any) {
    const scheduledAt = this.parseDate(job.scheduledAt);
    const windowStart = this.parseDate(job.customerEtaWindowStart) || scheduledAt;
    const duration = Number(job.customerEtaDurationMinutes || 120);
    const windowEnd = this.parseDate(job.customerEtaWindowEnd) || (windowStart ? this.addMinutes(windowStart, duration) : null);
    const status = job.customerEtaStatus || (scheduledAt ? 'ON_TIME' : 'NOT_AVAILABLE');
    const confidence = job.customerEtaConfidence || (job.customerEtaWindowStart ? 'confirmed' : scheduledAt ? 'scheduled' : 'not_available');
    const delayed = status === 'DELAYED' || Boolean(scheduledAt && windowStart && windowStart.getTime() > scheduledAt.getTime() + 10 * 60_000);
    const delayMinutes = scheduledAt && windowStart && delayed ? Math.max(0, Math.round((windowStart.getTime() - scheduledAt.getTime()) / 60_000)) : 0;
    return {
      available: Boolean(windowStart && windowEnd),
      scheduledAt: scheduledAt?.toISOString() || null,
      windowStart: windowStart?.toISOString() || null,
      windowEnd: windowEnd?.toISOString() || null,
      durationMinutes: duration,
      status,
      confidence,
      delayed,
      delayMinutes,
      customerNote: job.customerEtaNote || null,
      updatedAt: job.customerEtaUpdatedAt || null,
      label: windowStart && windowEnd
        ? `Expected between ${windowStart.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}-${windowEnd.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
        : 'Arrival window not confirmed yet',
      precisionNotice: 'Arrival times are based on scheduling updates only. Live GPS tracking is not used.',
    };
  }

  async buildCustomerJourney(tenantId: string, job: any, options?: { publicView?: boolean }) {
    const flag = await this.enterpriseFlags.resolve({ tenantId, userId: null, key: 'customer_eta_v1' });
    if (!flag.enabled) return { enabled: false, reason: 'customer_eta_v1_disabled' };
    const fullJob = job.activities && job.assignedUser ? job : await this.db().job.findFirst({
      where: { id: job.id, companyId: tenantId },
      include: {
        assignedUser: { select: { id: true, email: true } },
        activities: { orderBy: { createdAt: 'desc' }, take: 30 },
      },
    });
    if (!fullJob) throw new NotFoundException('Job not found');
    const eta = this.buildEta(fullJob);
    const showTechnicianName = Boolean(fullJob.customerTechnicianNameVisible);
    const technicianName = showTechnicianName ? this.displayTechnician(fullJob.assignedUser) : null;
    const publicEvents = (fullJob.activities || [])
      .filter((activity: any) => ['customer_eta.update', 'customer_eta.delayed', 'customer_eta.on_route', 'customer_eta.arrived', 'job.status', 'tech.arrived', 'billing.invoice.issued', 'billing.payment.received'].includes(String(activity.eventType || '')))
      .slice(0, 12)
      .map((activity: any) => ({
        eventType: activity.eventType,
        message: activity.eventType === 'tech.arrived' ? 'Technician arrived on site.' : activity.message,
        createdAt: activity.createdAt,
      }));
    return {
      enabled: true,
      currentStage: this.inferCurrentStage(fullJob),
      stages: this.buildStages(fullJob),
      eta,
      appointment: {
        scheduledAt: fullJob.scheduledAt || null,
        status: fullJob.customerEtaStatus || null,
        rescheduled: fullJob.customerEtaStatus === 'RESCHEDULED',
      },
      technician: {
        assigned: Boolean(fullJob.assignedUserId),
        displayName: technicianName,
        visible: showTechnicianName && Boolean(technicianName),
      },
      statusUpdate: fullJob.customerFacingStatus || null,
      preparationChecklist: [
        'Keep access details and parking instructions ready.',
        'Make sure the work area is reachable at the appointment window.',
        'Use this portal for approved documents, payment status, and service updates.',
      ],
      trustNotice: 'No live technician location or internal route is shared in this portal.',
      recentUpdates: publicEvents,
      publicView: Boolean(options?.publicView),
    };
  }

  private async notifyOperators(tenantId: string, actorUserId: string, job: any, type: string, title: string, body: string) {
    const users = await this.db().user.findMany({
      where: { companyId: tenantId, isActive: true, role: { in: ['OWNER', 'ADMIN', 'DISPATCHER'] } },
      select: { id: true },
      take: 20,
    });
    await this.db().notification.createMany({
      data: users.map((user: any) => ({
        companyId: tenantId,
        userId: user.id,
        type,
        title,
        body,
        entityType: 'job',
        entityId: job.id,
        idempotencyKey: `${type}:${job.id}:${Date.now()}:${user.id}`,
        metaJson: { href: `/dashboard/jobs/${job.id}`, jobId: job.id, customerFacing: true },
      })),
      skipDuplicates: true,
    });
    await this.activity.push({
      tenantId,
      type,
      label: title,
      jobId: job.id,
      jobRef: job.jobRef || null,
      customerId: job.customerId || null,
      customerName: job.customerName || null,
      status: job.status || null,
      payloadJson: { body, actorUserId },
    });
  }

  async updateCustomerJourney(tenantId: string, actor: JwtPayload, jobId: string, dto: UpdateCustomerJourneyDto) {
    await this.assertCustomerEtaEnabled(tenantId, actor);
    const job = await this.db().job.findFirst({ where: { id: jobId, companyId: tenantId } });
    if (!job) throw new NotFoundException('Job not found');
    if (actor.role === 'TECHNICIAN' && job.assignedUserId !== actor.sub) {
      throw new BadRequestException('Technicians can only update customer ETA for assigned jobs');
    }
    const etaStart = this.parseDate(dto.etaWindowStart);
    const etaEnd = this.parseDate(dto.etaWindowEnd);
    if ((dto.etaWindowStart && !etaStart) || (dto.etaWindowEnd && !etaEnd)) throw new BadRequestException('Invalid ETA window');
    if (etaStart && etaEnd && etaEnd.getTime() <= etaStart.getTime()) throw new BadRequestException('ETA window end must be after start');
    const etaStatus = dto.etaStatus || (dto.stage === 'ON_ROUTE' ? 'ON_ROUTE' : undefined);
    const eventType =
      etaStatus === 'DELAYED' ? 'customer_eta.delayed'
      : etaStatus === 'ON_ROUTE' ? 'customer_eta.on_route'
      : etaStatus === 'ARRIVED' ? 'customer_eta.arrived'
      : 'customer_eta.update';
    const message = dto.note || dto.customerFacingStatus || (
      etaStatus === 'ON_ROUTE' ? 'Technician is on route.'
      : etaStatus === 'ARRIVED' ? 'Technician has arrived.'
      : etaStatus === 'DELAYED' ? 'Appointment timing has been updated.'
      : 'Customer journey updated.'
    );
    const updated = await this.db().$transaction(async (tx: any) => {
      const row = await tx.job.update({
        where: { id: jobId },
        data: {
          customerJourneyStage: dto.stage || undefined,
          customerFacingStatus: dto.customerFacingStatus !== undefined ? dto.customerFacingStatus || null : undefined,
          customerFacingStatusUpdatedAt: dto.customerFacingStatus !== undefined ? new Date() : undefined,
          customerEtaWindowStart: dto.etaWindowStart !== undefined ? etaStart : undefined,
          customerEtaWindowEnd: dto.etaWindowEnd !== undefined ? etaEnd : undefined,
          customerEtaDurationMinutes: dto.durationMinutes !== undefined ? Number(dto.durationMinutes) : undefined,
          customerEtaConfidence: dto.confidence || undefined,
          customerEtaStatus: etaStatus || undefined,
          customerEtaNote: dto.note !== undefined ? dto.note || null : undefined,
          customerEtaUpdatedAt: new Date(),
          customerEtaUpdatedByUserId: actor.sub,
          customerTechnicianNameVisible: dto.showTechnicianName !== undefined ? Boolean(dto.showTechnicianName) : undefined,
        },
      });
      await tx.jobActivity.create({
        data: {
          companyId: tenantId,
          jobId,
          actorUserId: actor.sub,
          eventType,
          message,
          payloadJson: {
            public: true,
            stage: dto.stage || null,
            etaStatus: etaStatus || null,
            etaWindowStart: etaStart?.toISOString() || null,
            etaWindowEnd: etaEnd?.toISOString() || null,
            noGps: true,
          },
        },
      });
      return row;
    });
    await this.audit.log(tenantId, 'customer_eta.update', `Updated customer ETA for ${job.jobRef || job.id}`, actor.sub);
    await this.notifyOperators(tenantId, actor.sub, updated, eventType, 'Customer ETA updated', message);
    return this.buildCustomerJourney(tenantId, updated);
  }

  async routePreview(tenantId: string, actor: JwtPayload, query: { date?: string; technicianId?: string }) {
    await this.assertRoutePreviewEnabled(tenantId, actor);
    const date = this.parseDate(query.date) || new Date();
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const end = this.addMinutes(start, 24 * 60);
    const jobs = await this.db().job.findMany({
      where: {
        companyId: tenantId,
        deletedAt: null,
        scheduledAt: { gte: start, lt: end },
        ...(query.technicianId ? { assignedUserId: query.technicianId } : {}),
      },
      include: { assignedUser: { select: { id: true, email: true } } },
      orderBy: [{ assignedUserId: 'asc' }, { scheduledAt: 'asc' }],
    });
    return {
      enabled: true,
      informationalOnly: true,
      mutatesSchedule: false,
      usesGps: false,
      date: start.toISOString().slice(0, 10),
      capacityImpact: {
        scheduledVisits: jobs.length,
        assignedVisits: jobs.filter((job: any) => job.assignedUserId).length,
        unassignedVisits: jobs.filter((job: any) => !job.assignedUserId).length,
      },
      visits: jobs.map((job: any, index: number) => {
        const eta = this.buildEta(job);
        return {
          sequence: index + 1,
          jobId: job.id,
          jobRef: job.jobRef,
          status: job.status,
          assignedTechnicianId: job.assignedUserId || null,
          assignedTechnicianLabel: job.assignedUser ? this.displayTechnician(job.assignedUser) : null,
          estimatedWindowStart: eta.windowStart,
          estimatedWindowEnd: eta.windowEnd,
          confidence: eta.confidence,
        };
      }),
    };
  }
}
