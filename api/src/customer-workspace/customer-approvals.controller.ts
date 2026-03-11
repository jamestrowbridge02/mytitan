import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtPayload } from "../auth/auth.types";
import { assertPermission } from "../common/permissions";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { CreateCustomerApprovalDto, ListCustomerApprovalsDto } from "./dto";
import { CustomerWorkspaceService } from "./customer-workspace.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("customer-approvals")
export class CustomerApprovalsController {
  constructor(private readonly customerWorkspace: CustomerWorkspaceService) {}

  @Get()
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  async list(@CurrentUser() user: JwtPayload, @Query() query: ListCustomerApprovalsDto) {
    await assertPermission({ user, permission: "portal.manage", action: "customer_approvals.list" });
    return this.customerWorkspace.listApprovalsForOperator(user.companyId, {
      customerId: query.customerId,
      entityType: query.entityType,
      entityId: query.entityId,
      status: query.status,
    });
  }

  @Post()
  @Roles("OWNER", "ADMIN", "STAFF")
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCustomerApprovalDto) {
    await assertPermission({ user, permission: "portal.manage", action: "customer_approvals.create" });
    return this.customerWorkspace.createApprovalRequest(user.companyId, user.sub, dto);
  }
}
