import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtPayload } from "../auth/auth.types";
import { assertPermission } from "../common/permissions";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { CompensationService } from "./compensation.service";
import { ListCompensationRunsDto, PreviewCompensationRunDto, UpsertCompensationRuleDto } from "./dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("compensation")
export class CompensationController {
  constructor(private readonly compensation: CompensationService) {}

  @Get("rules")
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF")
  async listRules(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: "billing.manage", action: "compensation.rules.list" });
    return this.compensation.listRules(user.companyId);
  }

  @Post("rules")
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF")
  async createRule(@CurrentUser() user: JwtPayload, @Body() dto: UpsertCompensationRuleDto) {
    await assertPermission({ user, permission: "billing.manage", action: "compensation.rules.create" });
    return this.compensation.upsertRule(user.companyId, null, dto);
  }

  @Patch("rules/:id")
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF")
  async updateRule(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpsertCompensationRuleDto) {
    await assertPermission({ user, permission: "billing.manage", action: "compensation.rules.update" });
    return this.compensation.upsertRule(user.companyId, id, dto);
  }

  @Get("runs")
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF")
  async listRuns(@CurrentUser() user: JwtPayload, @Query() dto: ListCompensationRunsDto) {
    await assertPermission({ user, permission: "billing.manage", action: "compensation.runs.list" });
    return this.compensation.listRuns(user.companyId, dto);
  }

  @Post("runs/preview")
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF")
  async preview(@CurrentUser() user: JwtPayload, @Body() dto: PreviewCompensationRunDto) {
    await assertPermission({ user, permission: "billing.manage", action: "compensation.runs.preview" });
    return this.compensation.computeCompensationPreview(user.companyId, dto);
  }

  @Post("runs/:id/approve")
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF")
  async approve(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await assertPermission({ user, permission: "billing.manage", action: "compensation.runs.approve" });
    return this.compensation.approveRun(user.companyId, id);
  }

  @Post("runs/:id/cancel")
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF")
  async cancel(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await assertPermission({ user, permission: "billing.manage", action: "compensation.runs.cancel" });
    return this.compensation.cancelRun(user.companyId, id);
  }
}
