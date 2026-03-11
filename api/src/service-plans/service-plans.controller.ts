import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtPayload } from "../auth/auth.types";
import { assertPermission } from "../common/permissions";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { PatchServicePlanDto, UpsertServicePlanDto } from "./dto";
import { ServicePlansService } from "./service-plans.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("service-plans")
export class ServicePlansController {
  constructor(private readonly servicePlans: ServicePlansService) {}

  @Get()
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  list(
    @CurrentUser() user: JwtPayload,
    @Query("customerId") customerId?: string,
  ) {
    return this.servicePlans.list(user.companyId, { customerId: customerId || undefined });
  }

  @Post()
  @Roles("OWNER", "ADMIN", "STAFF")
  async create(@CurrentUser() user: JwtPayload, @Body() dto: UpsertServicePlanDto) {
    await assertPermission({ user, permission: "settings.manage", action: "service_plans.create" });
    return this.servicePlans.create(user.companyId, user.sub, dto);
  }

  @Patch(":id")
  @Roles("OWNER", "ADMIN", "STAFF")
  async patch(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: PatchServicePlanDto) {
    await assertPermission({ user, permission: "settings.manage", action: "service_plans.update" });
    return this.servicePlans.update(user.companyId, user.sub, id, dto);
  }

  @Delete(":id")
  @Roles("OWNER", "ADMIN", "STAFF")
  async remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await assertPermission({ user, permission: "settings.manage", action: "service_plans.delete" });
    return this.servicePlans.delete(user.companyId, user.sub, id);
  }

  @Get(":id/runs")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  runs(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.servicePlans.getRuns(user.companyId, id);
  }

  @Post(":id/run-now")
  @Roles("OWNER", "ADMIN", "STAFF")
  async runNow(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await assertPermission({ user, permission: "settings.manage", action: "service_plans.run_now" });
    return this.servicePlans.runNow(user.companyId, user.sub, id);
  }

  @Post(":id/pause")
  @Roles("OWNER", "ADMIN", "STAFF")
  async pause(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await assertPermission({ user, permission: "settings.manage", action: "service_plans.pause" });
    return this.servicePlans.pause(user.companyId, user.sub, id);
  }

  @Post(":id/resume")
  @Roles("OWNER", "ADMIN", "STAFF")
  async resume(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await assertPermission({ user, permission: "settings.manage", action: "service_plans.resume" });
    return this.servicePlans.resume(user.companyId, user.sub, id);
  }
}
