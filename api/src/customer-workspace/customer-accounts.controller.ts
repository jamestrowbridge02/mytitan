import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtPayload } from "../auth/auth.types";
import { assertPermission } from "../common/permissions";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { InviteCustomerAccountDto } from "./dto";
import { CustomerWorkspaceService } from "./customer-workspace.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("customer-accounts")
export class CustomerAccountsController {
  constructor(private readonly customerWorkspace: CustomerWorkspaceService) {}

  @Get(":customerId/status")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  async status(@CurrentUser() user: JwtPayload, @Param("customerId") customerId: string) {
    await assertPermission({ user, permission: "portal.manage", action: "customer_accounts.status" });
    return this.customerWorkspace.getCustomerAccountStatus(user.companyId, customerId);
  }

  @Post("invite")
  @Roles("OWNER", "ADMIN", "STAFF")
  async invite(@CurrentUser() user: JwtPayload, @Body() dto: InviteCustomerAccountDto) {
    await assertPermission({ user, permission: "portal.manage", action: "customer_accounts.invite" });
    return this.customerWorkspace.inviteCustomerAccount(user.companyId, user.sub, dto.customerId);
  }
}
