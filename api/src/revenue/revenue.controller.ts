import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/auth.guard";
import { JwtPayload } from "../auth/auth.types";
import { assertPermission } from "../common/permissions";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { RevenueService } from "./revenue.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("revenue")
export class RevenueController {
  constructor(private readonly revenue: RevenueService) {}

  @Get("tasks")
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF")
  async tasks(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: "billing.manage", action: "revenue.tasks.list" });
    return this.revenue.listRevenueTasks(user.companyId);
  }

  @Post("tasks/:id/complete")
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF")
  async complete(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await assertPermission({ user, permission: "billing.manage", action: "revenue.tasks.complete" });
    return this.revenue.completeTask(user.companyId, user.sub, id);
  }

  @Post("tasks/:id/cancel")
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF")
  async cancel(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await assertPermission({ user, permission: "billing.manage", action: "revenue.tasks.cancel" });
    return this.revenue.cancelTask(user.companyId, user.sub, id);
  }
}
