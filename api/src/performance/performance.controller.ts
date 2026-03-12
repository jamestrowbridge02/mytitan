import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtPayload } from "../auth/auth.types";
import { assertPermission } from "../common/permissions";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import {
  ListPerformanceLeaderboardDto,
  ListPerformanceRisksDto,
  ListPerformanceScorecardsDto,
  UpsertPerformancePeriodDto,
} from "./dto";
import { PerformanceService } from "./performance.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("performance")
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}

  @Get("periods")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  async listPeriods(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: "dashboard.view_intelligence", action: "performance.periods.list" });
    return this.performance.listPeriods(user.companyId);
  }

  @Post("periods")
  @Roles("OWNER", "ADMIN", "STAFF")
  async createPeriod(@CurrentUser() user: JwtPayload, @Body() dto: UpsertPerformancePeriodDto) {
    await assertPermission({ user, permission: "settings.manage", action: "performance.periods.create" });
    return this.performance.upsertPeriod(user.companyId, null, dto);
  }

  @Patch("periods/:id")
  @Roles("OWNER", "ADMIN", "STAFF")
  async updatePeriod(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpsertPerformancePeriodDto) {
    await assertPermission({ user, permission: "settings.manage", action: "performance.periods.update" });
    return this.performance.upsertPeriod(user.companyId, id, dto);
  }

  @Get("scorecards")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  async listScorecards(@CurrentUser() user: JwtPayload, @Query() dto: ListPerformanceScorecardsDto) {
    await assertPermission({ user, permission: "dashboard.view_intelligence", action: "performance.scorecards.list" });
    return this.performance.listScorecards(user.companyId, dto);
  }

  @Get("leaderboard")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  async leaderboard(@CurrentUser() user: JwtPayload, @Query() dto: ListPerformanceLeaderboardDto) {
    await assertPermission({ user, permission: "dashboard.view_intelligence", action: "performance.leaderboard.list" });
    return this.performance.listPerformanceLeaders(user.companyId, dto);
  }

  @Get("risks")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  async risks(@CurrentUser() user: JwtPayload, @Query() dto: ListPerformanceRisksDto) {
    await assertPermission({ user, permission: "dashboard.view_intelligence", action: "performance.risks.list" });
    return this.performance.listPerformanceRisks(user.companyId, dto);
  }
}
