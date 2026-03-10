import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActivityService } from '../events/activity.service';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TechService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly activity: ActivityService,
  ) {}

  async getMyQueue(companyId: string, userId: string) {
    const db = this.prisma as any;
    const now = new Date();
    const dayEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const [jobs, bookings] = await Promise.all([
      db.job.findMany({
        where: {
          companyId,
          assignedUserId: userId,
          status: { in: ['OPEN', 'SCHEDULED', 'IN_PROGRESS'] },
        },
        include: {
          activities: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
      }),
      db.booking.findMany({
        where: {
          companyId,
          assignedUserId: userId,
          startsAt: { gte: now, lte: dayEnd },
          status: { not: 'CANCELLED' },
        },
        orderBy: { startsAt: 'asc' },
        take: 20,
      }),
    ]);

    return {
      summary: {
        assignedJobs: jobs.length,
        inProgress: jobs.filter((job: any) => job.status === 'IN_PROGRESS').length,
        dueTodayBookings: bookings.length,
        overdueAssignedJobs: jobs.filter((job: any) => job.scheduledAt && new Date(job.scheduledAt).getTime() < now.getTime() && job.status !== 'IN_PROGRESS').length,
      },
      jobs: jobs.map((job: any) => ({
        ...job,
        lastFieldEvent: job.activities?.[0]
          ? {
              eventType: job.activities[0].eventType,
              message: job.activities[0].message,
              createdAt: job.activities[0].createdAt,
            }
          : null,
        urgency:
          job.status === 'IN_PROGRESS'
            ? 'active'
            : job.scheduledAt && new Date(job.scheduledAt).getTime() < now.getTime()
            ? 'overdue'
            : job.scheduledAt && new Date(job.scheduledAt).getTime() < now.getTime() + 2 * 60 * 60 * 1000
            ? 'due_soon'
            : 'normal',
      })),
      bookings,
    };
  }

  async advanceAssignedJob(companyId: string, userId: string, jobId: string, action: 'start' | 'complete', note?: string) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id: jobId, companyId } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.assignedUserId !== userId) {
      throw new BadRequestException('Job is not assigned to this technician');
    }

    const nextStatus = action === 'start' ? 'IN_PROGRESS' : 'COMPLETED';
    const updated = await this.jobs.updateStatus(companyId, userId, jobId, nextStatus as any);

    if (note) {
      await db.jobActivity.create({
        data: {
          companyId,
          jobId,
          actorUserId: userId,
          eventType: 'tech.note',
          message: note,
          payloadJson: { source: 'tech_mobile' },
        },
      });
      await this.activity.push({
        tenantId: companyId,
        type: 'technician.note_added',
        label: `Technician note added for ${updated.jobRef || updated.id}`,
        jobId: updated.id,
        jobRef: updated.jobRef || null,
        customerId: updated.customerId || null,
        customerName: updated.customerName || null,
        status: updated.status || null,
        payloadJson: { note },
      });
    }

    return updated;
  }

  async arriveAssignedJob(companyId: string, userId: string, jobId: string, note?: string) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id: jobId, companyId } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.assignedUserId !== userId) {
      throw new BadRequestException('Job is not assigned to this technician');
    }

    await db.jobActivity.create({
      data: {
        companyId,
        jobId,
        actorUserId: userId,
        eventType: 'tech.arrived',
        message: note || 'Technician arrived on site',
        payloadJson: { source: 'tech_mobile' },
      },
    });
    await this.activity.push({
      tenantId: companyId,
      type: 'technician.arrived',
      label: `Technician arrived for ${job.jobRef || job.id}`,
      jobId: job.id,
      jobRef: job.jobRef || null,
      customerId: job.customerId || null,
      customerName: job.customerName || null,
      status: job.status || null,
      payloadJson: { note: note || null },
    });
    return { ok: true };
  }

  async addJobNote(companyId: string, userId: string, jobId: string, note: string) {
    const db = this.prisma as any;
    const job = await db.job.findFirst({ where: { id: jobId, companyId } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.assignedUserId !== userId) {
      throw new BadRequestException('Job is not assigned to this technician');
    }
    const clean = String(note || '').trim();
    if (!clean) {
      throw new BadRequestException('Note is required');
    }

    await db.jobActivity.create({
      data: {
        companyId,
        jobId,
        actorUserId: userId,
        eventType: 'tech.note',
        message: clean,
        payloadJson: { source: 'tech_mobile' },
      },
    });
    await this.activity.push({
      tenantId: companyId,
      type: 'technician.note_added',
      label: `Technician note added for ${job.jobRef || job.id}`,
      jobId: job.id,
      jobRef: job.jobRef || null,
      customerId: job.customerId || null,
      customerName: job.customerName || null,
      status: job.status || null,
      payloadJson: { note: clean },
    });
    return { ok: true };
  }
}
