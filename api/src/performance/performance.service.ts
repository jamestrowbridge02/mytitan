import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ComplianceService } from "../compliance/compliance.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  ListPerformanceLeaderboardDto,
  ListPerformanceRisksDto,
  ListPerformanceScorecardsDto,
  UpsertPerformancePeriodDto,
} from "./dto";

type RoleType = "TECHNICIAN" | "DISPATCHER" | "FINANCE" | "MANAGER";

@Injectable()
export class PerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
  ) {}

  private get db() {
    return this.prisma as any;
  }

  private normalizeLocationId(locationId?: string | null) {
    const value = String(locationId || "").trim();
    return value && value !== "all" ? value : undefined;
  }

  private normalizeRoleType(role?: string | null): RoleType {
    if (role === "TECHNICIAN" || role === "DISPATCHER" || role === "FINANCE") return role;
    return "MANAGER";
  }

  private roleTypeForUserRole(role?: string | null): RoleType {
    if (role === "TECHNICIAN") return "TECHNICIAN";
    if (role === "DISPATCHER") return "DISPATCHER";
    if (role === "FINANCE") return "FINANCE";
    return "MANAGER";
  }

  private average(values: number[]) {
    if (!values.length) return null;
    return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
  }

  private ratio(numerator: number, denominator: number) {
    if (!denominator) return null;
    return Number(((numerator / denominator) * 100).toFixed(1));
  }

  private scoreMetric(value: number | null, target: number, invert = false) {
    if (value === null || !Number.isFinite(value)) return null;
    if (target <= 0) return 100;
    const ratio = invert ? Math.max(0, 1 - value / target) : Math.min(value / target, 1);
    return Math.max(0, Math.min(100, Math.round(ratio * 100)));
  }

  private async resolvePeriod(tenantId: string, periodId?: string) {
    if (periodId) {
      const period = await this.db.performancePeriod.findFirst({
        where: { id: periodId, tenantId },
      });
      if (!period) throw new NotFoundException("Performance period not found");
      return period;
    }

    const period = await this.db.performancePeriod.findFirst({
      where: { tenantId },
      orderBy: [{ status: "asc" }, { startsAt: "desc" }],
    });
    if (!period) throw new NotFoundException("No performance period found");
    return period;
  }

  async listPeriods(tenantId: string) {
    return this.db.performancePeriod.findMany({
      where: { tenantId },
      orderBy: [{ startsAt: "desc" }],
    });
  }

  async upsertPeriod(tenantId: string, id: string | null, dto: UpsertPerformancePeriodDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException("Performance period dates are invalid");
    }
    const payload = {
      name: String(dto.name || "").trim(),
      startsAt,
      endsAt,
      status: dto.status === "CLOSED" ? "CLOSED" : "OPEN",
    };
    if (!payload.name) throw new BadRequestException("Performance period name is required");
    if (id) {
      return this.db.performancePeriod.update({
        where: { id },
        data: payload,
      });
    }
    return this.db.performancePeriod.create({
      data: { tenantId, ...payload },
    });
  }

  private async listScopedUsers(tenantId: string, roleType?: RoleType, userId?: string) {
    const rows = await this.db.user.findMany({
      where: {
        companyId: tenantId,
        ...(userId ? { id: userId } : {}),
      },
      select: { id: true, email: true, role: true, defaultLocationId: true },
      orderBy: [{ email: "asc" }],
    });
    return rows.filter((row: any) => !roleType || this.roleTypeForUserRole(row.role) === roleType);
  }

  async computePerformanceMetrics(params: {
    tenantId: string;
    periodId?: string;
    roleType?: string;
    userId?: string;
    locationId?: string;
  }) {
    await this.compliance.syncTenantState(params.tenantId);
    const period = await this.resolvePeriod(params.tenantId, params.periodId);
    const roleType = params.roleType ? this.normalizeRoleType(params.roleType) : undefined;
    const locationId = this.normalizeLocationId(params.locationId);
    const users = await this.listScopedUsers(params.tenantId, roleType, params.userId);
    const startsAt = new Date(period.startsAt);
    const endsAt = new Date(period.endsAt);

    const scorecards = await Promise.all(
      users.map(async (user: any) => {
        const derivedRoleType = roleType || this.roleTypeForUserRole(user.role);
        const metrics = await this.buildMetricsForUser({
          tenantId: params.tenantId,
          user,
          roleType: derivedRoleType,
          startsAt,
          endsAt,
          locationId,
        });
        return this.upsertScorecard({
          tenantId: params.tenantId,
          userId: user.id,
          locationId: locationId || null,
          periodId: period.id,
          roleType: derivedRoleType,
          metrics,
        });
      }),
    );

    return {
      period,
      scorecards,
    };
  }

  private async buildMetricsForUser(params: {
    tenantId: string;
    user: any;
    roleType: RoleType;
    startsAt: Date;
    endsAt: Date;
    locationId?: string;
  }) {
    if (params.roleType === "TECHNICIAN") return this.buildTechnicianMetrics(params);
    if (params.roleType === "DISPATCHER") return this.buildDispatcherMetrics(params);
    if (params.roleType === "FINANCE") return this.buildFinanceMetrics(params);
    return this.buildManagerMetrics(params);
  }

  private async buildTechnicianMetrics(params: {
    tenantId: string;
    user: any;
    startsAt: Date;
    endsAt: Date;
    locationId?: string;
  }) {
    const scopedLocation = params.locationId;
    const [completedJobs, executionRecords, slaEvents, bookings, jobParts] = await Promise.all([
      this.db.job.findMany({
        where: {
          companyId: params.tenantId,
          assignedUserId: params.user.id,
          completedAt: { gte: params.startsAt, lte: params.endsAt },
          ...(scopedLocation ? { locationId: scopedLocation } : {}),
        },
        select: { id: true, completedAt: true, locationId: true },
      }),
      this.db.jobExecutionRecord.findMany({
        where: {
          tenantId: params.tenantId,
          technicianId: params.user.id,
          createdAt: { gte: params.startsAt, lte: params.endsAt },
          ...(scopedLocation ? { job: { is: { locationId: scopedLocation } } } : {}),
        },
        include: { evidence: { select: { id: true } }, job: { select: { completedAt: true, locationId: true } } },
      }),
      this.db.workflowSlaEvent.findMany({
        where: {
          tenantId: params.tenantId,
          assignedUserId: params.user.id,
          startedAt: { gte: params.startsAt, lte: params.endsAt },
          ...(scopedLocation ? { locationId: scopedLocation } : {}),
        },
        select: { status: true },
      }),
      this.db.booking.findMany({
        where: {
          companyId: params.tenantId,
          assignedUserId: params.user.id,
          startsAt: { gte: params.startsAt, lte: params.endsAt },
          status: { not: "CANCELLED" },
          ...(scopedLocation ? { locationId: scopedLocation } : {}),
        },
        select: { startsAt: true, endsAt: true },
      }),
      this.db.jobPart.findMany({
        where: {
          tenantId: params.tenantId,
          job: {
            is: {
              assignedUserId: params.user.id,
              completedAt: { gte: params.startsAt, lte: params.endsAt },
              ...(scopedLocation ? { locationId: scopedLocation } : {}),
            },
          },
        },
        select: { status: true, quantityPlanned: true, quantityUsed: true },
      }),
    ]);

    const submissionLags = executionRecords
      .filter((row: any) => row.submittedAt && row.job?.completedAt)
      .map((row: any) => Math.max(0, (new Date(row.submittedAt).getTime() - new Date(row.job.completedAt).getTime()) / 60000));
    const acknowledged = executionRecords.filter((row: any) => row.submittedAt).length;
    const acknowledgedDone = executionRecords.filter((row: any) => row.submittedAt && row.acknowledgedAt).length;
    const scheduledMinutes = bookings.reduce((sum: number, booking: any) => {
      const start = new Date(booking.startsAt).getTime();
      const end = new Date(booking.endsAt).getTime();
      return sum + Math.max(0, Math.round((end - start) / 60000));
    }, 0);
    const weekdays = Math.max(1, Math.ceil((params.endsAt.getTime() - params.startsAt.getTime()) / (1000 * 60 * 60 * 24)) * 5 / 7);
    const capacityMinutes = Math.round(weekdays * 8 * 60);
    const metCount = slaEvents.filter((row: any) => row.status === "MET").length;
    const breachedCount = slaEvents.filter((row: any) => row.status === "BREACHED").length;
    const partsCompleted = jobParts.filter((row: any) => row.status === "USED" || Number(row.quantityUsed || 0) >= Number(row.quantityPlanned || 0)).length;

    return {
      jobsCompleted: completedJobs.length,
      averageExecutionSubmissionLagMinutes: this.average(submissionLags),
      acknowledgementRate: this.ratio(acknowledgedDone, acknowledged),
      slaMetCount: metCount,
      slaBreachedCount: breachedCount,
      slaMetRate: this.ratio(metCount, metCount + breachedCount),
      utilizationRate: this.ratio(scheduledMinutes, capacityMinutes),
      partsUsageCompletionRate: this.ratio(partsCompleted, jobParts.length),
      executionSubmittedRate: this.ratio(executionRecords.filter((row: any) => row.submittedAt).length, Math.max(executionRecords.length, completedJobs.length)),
      evidenceSubmissionRate: this.ratio(executionRecords.filter((row: any) => Array.isArray(row.evidence) && row.evidence.length > 0).length, executionRecords.length),
    };
  }

  private async buildDispatcherMetrics(params: {
    tenantId: string;
    user: any;
    startsAt: Date;
    endsAt: Date;
    locationId?: string;
  }) {
    const scopedLocation = params.locationId;
    const [createdJobs, assignedJobs, convertedBookings, openBookings, schedulePressure, unassignedJobs] = await Promise.all([
      this.db.job.count({
        where: {
          companyId: params.tenantId,
          createdByUserId: params.user.id,
          createdAt: { gte: params.startsAt, lte: params.endsAt },
          ...(scopedLocation ? { locationId: scopedLocation } : {}),
        },
      }),
      this.db.job.count({
        where: {
          companyId: params.tenantId,
          assignedUserId: { not: null },
          updatedAt: { gte: params.startsAt, lte: params.endsAt },
          ...(scopedLocation ? { locationId: scopedLocation } : {}),
        },
      }),
      this.db.booking.count({
        where: {
          companyId: params.tenantId,
          createdAt: { gte: params.startsAt, lte: params.endsAt },
          jobId: { not: null },
          ...(scopedLocation ? { locationId: scopedLocation } : {}),
        },
      }),
      this.db.booking.count({
        where: {
          companyId: params.tenantId,
          createdAt: { gte: params.startsAt, lte: params.endsAt },
          status: { not: "CANCELLED" },
          ...(scopedLocation ? { locationId: scopedLocation } : {}),
        },
      }),
      this.db.technicianCapacityException.count({
        where: {
          tenantId: params.tenantId,
          date: { gte: params.startsAt, lte: params.endsAt },
        },
      }),
      this.db.job.count({
        where: {
          companyId: params.tenantId,
          status: { in: ["OPEN", "SCHEDULED"] },
          assignedUserId: null,
          createdAt: { gte: params.startsAt, lte: params.endsAt },
          ...(scopedLocation ? { locationId: scopedLocation } : {}),
        },
      }),
    ]);

    return {
      bookingConversionThroughput: convertedBookings,
      bookingConversionRate: this.ratio(convertedBookings, openBookings),
      assignmentResponsiveness: this.ratio(assignedJobs, Math.max(createdJobs, assignedJobs)),
      unassignedWorkOpen: unassignedJobs,
      schedulePressureSignals: schedulePressure,
      jobsCreated: createdJobs,
      assignmentCoverageRate: this.ratio(Math.max(createdJobs - unassignedJobs, 0), Math.max(createdJobs, 1)),
    };
  }

  private async buildFinanceMetrics(params: {
    tenantId: string;
    user: any;
    startsAt: Date;
    endsAt: Date;
    locationId?: string;
  }) {
    const scopedLocation = params.locationId;
    const locationWhere = scopedLocation ? { OR: [{ job: { is: { locationId: scopedLocation } } }, { booking: { is: { locationId: scopedLocation } } }] } : {};
    const [quotesSent, quotesApproved, quotesConverted, tasksCompleted, tasksOpen, overdueInvoices] = await Promise.all([
      this.db.quote.count({
        where: {
          tenantId: params.tenantId,
          status: { in: ["SENT", "APPROVED", "CONVERTED"] },
          createdAt: { gte: params.startsAt, lte: params.endsAt },
          ...locationWhere,
        },
      }),
      this.db.quote.count({
        where: {
          tenantId: params.tenantId,
          status: { in: ["APPROVED", "CONVERTED"] },
          approvedAt: { gte: params.startsAt, lte: params.endsAt },
          ...locationWhere,
        },
      }),
      this.db.quote.count({
        where: {
          tenantId: params.tenantId,
          status: "CONVERTED",
          convertedAt: { gte: params.startsAt, lte: params.endsAt },
          ...locationWhere,
        },
      }),
      this.db.revenueCollectionTask.count({
        where: {
          tenantId: params.tenantId,
          status: "COMPLETED",
          completedAt: { gte: params.startsAt, lte: params.endsAt },
          ...(scopedLocation ? { job: { is: { locationId: scopedLocation } } } : {}),
        },
      }),
      this.db.revenueCollectionTask.count({
        where: {
          tenantId: params.tenantId,
          createdAt: { gte: params.startsAt, lte: params.endsAt },
          ...(scopedLocation ? { job: { is: { locationId: scopedLocation } } } : {}),
        },
      }),
      this.db.job.count({
        where: {
          companyId: params.tenantId,
          invoiceIssuedAt: { not: null, gte: params.startsAt, lte: params.endsAt },
          invoicePaidAt: null,
          invoiceDueAt: { lt: params.endsAt },
          ...(scopedLocation ? { locationId: scopedLocation } : {}),
        },
      }),
    ]);

    return {
      quotesSent,
      quotesApproved,
      quotesConverted,
      quoteApprovalRate: this.ratio(quotesApproved, quotesSent),
      quoteConversionRate: this.ratio(quotesConverted, quotesApproved),
      collectionsCompleted: tasksCompleted,
      collectionsCompletionRate: this.ratio(tasksCompleted, tasksOpen),
      invoiceFollowUpThroughput: tasksCompleted,
      overdueInvoicePressure: overdueInvoices,
    };
  }

  private async buildManagerMetrics(params: {
    tenantId: string;
    startsAt: Date;
    endsAt: Date;
    locationId?: string;
  }) {
    const scopedLocation = params.locationId;
    const [jobsCompleted, revenueTasks, openExceptions, breachedEvents, servicePlansDue] = await Promise.all([
      this.db.job.count({
        where: {
          companyId: params.tenantId,
          completedAt: { gte: params.startsAt, lte: params.endsAt },
          ...(scopedLocation ? { locationId: scopedLocation } : {}),
        },
      }),
      this.db.revenueCollectionTask.count({
        where: {
          tenantId: params.tenantId,
          status: "COMPLETED",
          completedAt: { gte: params.startsAt, lte: params.endsAt },
          ...(scopedLocation ? { job: { is: { locationId: scopedLocation } } } : {}),
        },
      }),
      this.db.complianceException.count({
        where: {
          tenantId: params.tenantId,
          status: "OPEN",
          ...(scopedLocation ? { locationId: scopedLocation } : {}),
        },
      }),
      this.db.workflowSlaEvent.count({
        where: {
          tenantId: params.tenantId,
          status: "BREACHED",
          ...(scopedLocation ? { locationId: scopedLocation } : {}),
        },
      }),
      this.db.servicePlanRun.count({
        where: {
          tenantId: params.tenantId,
          status: "PENDING",
          scheduledFor: { lte: params.endsAt },
          ...(scopedLocation ? { plan: { is: { locationId: scopedLocation } } } : {}),
        },
      }),
    ]);
    return {
      jobsCompleted,
      revenueTasksCompleted: revenueTasks,
      openComplianceExceptions: openExceptions,
      breachedSlaEvents: breachedEvents,
      overdueServicePlanRuns: servicePlansDue,
    };
  }

  async computeScorecard(params: {
    tenantId: string;
    periodId?: string;
    roleType?: string;
    userId?: string;
    locationId?: string;
  }) {
    return this.computePerformanceMetrics(params);
  }

  private buildScoreJson(roleType: RoleType, metrics: Record<string, any>) {
    const cards: Array<{ key: string; value: number | null }> = [];
    if (roleType === "TECHNICIAN") {
      cards.push({ key: "jobsCompleted", value: this.scoreMetric(Number(metrics.jobsCompleted || 0), 8) });
      cards.push({ key: "ackRate", value: this.scoreMetric(Number(metrics.acknowledgementRate || 0), 90) });
      cards.push({ key: "slaMetRate", value: this.scoreMetric(Number(metrics.slaMetRate || 0), 90) });
      cards.push({ key: "utilization", value: this.scoreMetric(Number(metrics.utilizationRate || 0), 75) });
      cards.push({ key: "submissionLag", value: this.scoreMetric(Number(metrics.averageExecutionSubmissionLagMinutes || 0), 120, true) });
    } else if (roleType === "DISPATCHER") {
      cards.push({ key: "conversionRate", value: this.scoreMetric(Number(metrics.bookingConversionRate || 0), 70) });
      cards.push({ key: "coverageRate", value: this.scoreMetric(Number(metrics.assignmentCoverageRate || 0), 85) });
      cards.push({ key: "schedulePressure", value: this.scoreMetric(Number(metrics.schedulePressureSignals || 0), 4, true) });
    } else if (roleType === "FINANCE") {
      cards.push({ key: "quoteConversionRate", value: this.scoreMetric(Number(metrics.quoteConversionRate || 0), 60) });
      cards.push({ key: "approvalRate", value: this.scoreMetric(Number(metrics.quoteApprovalRate || 0), 70) });
      cards.push({ key: "collectionsCompletionRate", value: this.scoreMetric(Number(metrics.collectionsCompletionRate || 0), 80) });
      cards.push({ key: "overdueInvoicePressure", value: this.scoreMetric(Number(metrics.overdueInvoicePressure || 0), 4, true) });
    } else {
      cards.push({ key: "jobsCompleted", value: this.scoreMetric(Number(metrics.jobsCompleted || 0), 20) });
      cards.push({ key: "compliance", value: this.scoreMetric(Number(metrics.openComplianceExceptions || 0), 4, true) });
      cards.push({ key: "sla", value: this.scoreMetric(Number(metrics.breachedSlaEvents || 0), 3, true) });
    }
    const valid = cards.map((card) => card.value).filter((value) => value !== null) as number[];
    return {
      overallScore: valid.length ? Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length) : null,
      components: cards,
    };
  }

  private async upsertScorecard(params: {
    tenantId: string;
    userId: string;
    locationId: string | null;
    periodId: string;
    roleType: RoleType;
    metrics: Record<string, any>;
  }) {
    const existing = await this.db.performanceScorecard.findFirst({
      where: {
        tenantId: params.tenantId,
        userId: params.userId,
        periodId: params.periodId,
        roleType: params.roleType,
        locationId: params.locationId,
      },
    });
    const scoreJson = this.buildScoreJson(params.roleType, params.metrics);
    const notesJson = {
      explanation: "Deterministic scorecard grounded in jobs, scheduling, revenue, and compliance data already stored in the platform.",
      calculatedAt: new Date().toISOString(),
    };
    if (existing) {
      return this.db.performanceScorecard.update({
        where: { id: existing.id },
        data: { metricsJson: params.metrics, scoreJson, notesJson },
        include: {
          user: { select: { id: true, email: true, role: true } },
          location: { select: { id: true, name: true, code: true } },
          period: true,
        },
      });
    }
    return this.db.performanceScorecard.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId,
        locationId: params.locationId,
        periodId: params.periodId,
        roleType: params.roleType,
        metricsJson: params.metrics,
        scoreJson,
        notesJson,
      },
      include: {
        user: { select: { id: true, email: true, role: true } },
        location: { select: { id: true, name: true, code: true } },
        period: true,
      },
    });
  }

  async listScorecards(tenantId: string, dto: ListPerformanceScorecardsDto) {
    const computed = await this.computeScorecard({
      tenantId,
      periodId: dto.periodId,
      roleType: dto.roleType,
      userId: dto.userId,
      locationId: dto.locationId,
    });
    return computed.scorecards;
  }

  async listPerformanceLeaders(tenantId: string, dto: ListPerformanceLeaderboardDto) {
    const scorecards = await this.listScorecards(tenantId, dto);
    return scorecards
      .map((row: any) => ({
        id: row.id,
        userId: row.userId,
        userEmail: row.user?.email || "Unknown user",
        roleType: row.roleType,
        location: row.location ? { id: row.location.id, name: row.location.name, code: row.location.code } : null,
        overallScore: Number(row.scoreJson?.overallScore ?? -1),
        metricsJson: row.metricsJson || {},
      }))
      .sort((a: any, b: any) => b.overallScore - a.overallScore)
      .slice(0, 10);
  }

  async listPerformanceRisks(tenantId: string, dto: ListPerformanceRisksDto) {
    const scorecards = await this.listScorecards(tenantId, dto);
    return scorecards
      .map((row: any) => {
        const score = Number(row.scoreJson?.overallScore ?? 0);
        const metrics = row.metricsJson || {};
        const pressure =
          Number(metrics.slaBreachedCount || metrics.breachedSlaEvents || 0) +
          Number(metrics.openComplianceExceptions || 0) +
          Number(metrics.overdueInvoicePressure || 0) +
          Number(metrics.unassignedWorkOpen || 0);
        return {
          id: row.id,
          userId: row.userId,
          userEmail: row.user?.email || "Unknown user",
          roleType: row.roleType,
          overallScore: score,
          pressure,
          summary:
            score < 65
              ? "Scorecard is trending below target."
              : pressure > 0
                ? "Operational pressure is building around this role."
                : "Stable",
          metricsJson: metrics,
        };
      })
      .filter((row: any) => row.overallScore < 65 || row.pressure > 0)
      .sort((a: any, b: any) => (a.overallScore - b.overallScore) || (b.pressure - a.pressure))
      .slice(0, 10);
  }
}
