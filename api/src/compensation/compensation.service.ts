import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PerformanceService } from "../performance/performance.service";
import { PrismaService } from "../prisma/prisma.service";
import { ListCompensationRunsDto, PreviewCompensationRunDto, UpsertCompensationRuleDto } from "./dto";

@Injectable()
export class CompensationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly performance: PerformanceService,
  ) {}

  private get db() {
    return this.prisma as any;
  }

  async listRules(tenantId: string) {
    return this.db.compensationRule.findMany({
      where: { tenantId },
      orderBy: [{ active: "desc" }, { roleType: "asc" }, { name: "asc" }],
    });
  }

  async upsertRule(tenantId: string, id: string | null, dto: UpsertCompensationRuleDto) {
    const payload = {
      name: String(dto.name || "").trim(),
      roleType: dto.roleType,
      active: dto.active ?? true,
      metricType: dto.metricType,
      calculationType: dto.calculationType,
      thresholdJson: dto.thresholdJson || null,
      payoutJson: dto.payoutJson || null,
    };
    if (!payload.name) throw new BadRequestException("Compensation rule name is required");
    if (id) {
      return this.db.compensationRule.update({
        where: { id },
        data: payload,
      });
    }
    return this.db.compensationRule.create({
      data: { tenantId, ...payload },
    });
  }

  async listRuns(tenantId: string, dto: ListCompensationRunsDto) {
    return this.db.compensationRun.findMany({
      where: {
        tenantId,
        ...(dto.periodId ? { periodId: dto.periodId } : {}),
        ...(dto.userId ? { userId: dto.userId } : {}),
        ...(dto.ruleId ? { ruleId: dto.ruleId } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
      include: {
        user: { select: { id: true, email: true, role: true } },
        rule: true,
        period: true,
      },
      orderBy: [{ createdAt: "desc" }],
    });
  }

  private numberMetric(metrics: Record<string, any>, metricType: string) {
    const byType: Record<string, string[]> = {
      JOBS_COMPLETED: ["jobsCompleted"],
      SLA_MET_RATE: ["slaMetRate"],
      QUOTE_CONVERSION_RATE: ["quoteConversionRate"],
      COLLECTIONS_COMPLETED: ["collectionsCompleted"],
      UTILIZATION_RATE: ["utilizationRate"],
      ACKNOWLEDGEMENT_RATE: ["acknowledgementRate"],
      EXECUTION_SUBMITTED_RATE: ["executionSubmittedRate"],
    };
    const key = (byType[metricType] || [])[0];
    return Number(metrics?.[key] || 0);
  }

  async computeCompensationPreview(tenantId: string, dto: PreviewCompensationRunDto) {
    const period = await this.db.performancePeriod.findFirst({
      where: { tenantId, id: dto.periodId },
    });
    if (!period) throw new NotFoundException("Performance period not found");

    const rules = await this.db.compensationRule.findMany({
      where: {
        tenantId,
        active: true,
        ...(dto.ruleId ? { id: dto.ruleId } : {}),
      },
      orderBy: [{ roleType: "asc" }, { name: "asc" }],
    });
    if (!rules.length) throw new BadRequestException("No active compensation rules found");

    const previews: any[] = [];
    for (const rule of rules) {
      const scorecards = await this.performance.listScorecards(tenantId, {
        periodId: dto.periodId,
        roleType: rule.roleType,
        userId: dto.userId,
        locationId: dto.locationId,
      });
      for (const scorecard of scorecards) {
        const calculation = this.calculateAmount(rule, scorecard.metricsJson || {}, scorecard.scoreJson || {});
        const existing = await this.db.compensationRun.findFirst({
          where: {
            tenantId,
            periodId: dto.periodId,
            userId: scorecard.userId,
            ruleId: rule.id,
          },
        });
        const payload = {
          amountCents: calculation.amountCents,
          currency: "GBP",
          calculationJson: {
            ...calculation,
            scorecardId: scorecard.id,
            scorecardUserEmail: scorecard.user?.email || null,
          },
          status: existing?.status && existing.status !== "DRAFT" ? existing.status : "DRAFT",
        };
        const run = existing
          ? await this.db.compensationRun.update({
              where: { id: existing.id },
              data: payload,
              include: { user: { select: { id: true, email: true, role: true } }, rule: true, period: true },
            })
          : await this.db.compensationRun.create({
              data: {
                tenantId,
                periodId: dto.periodId,
                userId: scorecard.userId,
                ruleId: rule.id,
                ...payload,
              },
              include: { user: { select: { id: true, email: true, role: true } }, rule: true, period: true },
            });
        previews.push(run);
      }
    }
    return previews;
  }

  private calculateAmount(rule: any, metrics: Record<string, any>, score: Record<string, any>) {
    const metricValue = this.numberMetric(metrics, rule.metricType);
    const minimum = Number(rule.thresholdJson?.minimum ?? 0);
    const amountCents = Number(rule.payoutJson?.amountCents ?? 0);
    const percentBps = Number(rule.payoutJson?.percentBps ?? 0);
    const basisCents = Number(rule.payoutJson?.basisCents ?? 0);
    const metThreshold = metricValue >= minimum;
    let payout = 0;
    if (rule.calculationType === "FLAT_BONUS") {
      payout = metThreshold ? amountCents : 0;
    } else if (rule.calculationType === "PERCENTAGE_BONUS") {
      payout = metThreshold ? Math.round((basisCents * percentBps) / 10000) : 0;
    } else {
      const stepAmount = Number(rule.payoutJson?.stepAmountCents ?? amountCents);
      payout = metricValue >= minimum ? stepAmount : 0;
    }
    return {
      metricType: rule.metricType,
      metricValue,
      minimum,
      metThreshold,
      amountCents: payout,
      score: score?.overallScore ?? null,
    };
  }

  async approveRun(tenantId: string, id: string) {
    const run = await this.db.compensationRun.findFirst({ where: { id, tenantId } });
    if (!run) throw new NotFoundException("Compensation run not found");
    if (run.status !== "DRAFT") throw new BadRequestException("Only draft runs can be approved");
    return this.db.compensationRun.update({
      where: { id },
      data: { status: "APPROVED" },
    });
  }

  async cancelRun(tenantId: string, id: string) {
    const run = await this.db.compensationRun.findFirst({ where: { id, tenantId } });
    if (!run) throw new NotFoundException("Compensation run not found");
    if (run.status === "PAID") throw new BadRequestException("Paid runs cannot be cancelled");
    return this.db.compensationRun.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
  }
}
