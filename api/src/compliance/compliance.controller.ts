import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtPayload } from "../auth/auth.types";
import { assertPermission } from "../common/permissions";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { ComplianceService } from "./compliance.service";
import {
  ListComplianceExceptionsDto,
  ListWorkflowSlaEventsDto,
  ResolveComplianceExceptionDto,
  UpsertWorkflowSlaPolicyDto,
} from "./dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("compliance")
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Get("sla-policies")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  async listPolicies(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: "dashboard.view_intelligence", action: "compliance.sla_policies.list" });
    return this.compliance.listPolicies(user.companyId);
  }

  @Post("sla-policies")
  @Roles("OWNER", "ADMIN", "STAFF")
  async createPolicy(@CurrentUser() user: JwtPayload, @Body() dto: UpsertWorkflowSlaPolicyDto) {
    await assertPermission({ user, permission: "settings.manage", action: "compliance.sla_policies.create" });
    return this.compliance.createPolicy(user.companyId, user.sub, dto);
  }

  @Patch("sla-policies/:id")
  @Roles("OWNER", "ADMIN", "STAFF")
  async updatePolicy(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpsertWorkflowSlaPolicyDto) {
    await assertPermission({ user, permission: "settings.manage", action: "compliance.sla_policies.update" });
    return this.compliance.updatePolicy(user.companyId, user.sub, id, dto);
  }

  @Get("sla-events")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  async listEvents(@CurrentUser() user: JwtPayload, @Query() query: ListWorkflowSlaEventsDto) {
    await assertPermission({ user, permission: "dashboard.view_intelligence", action: "compliance.sla_events.list" });
    return this.compliance.listEvents(user.companyId, query);
  }

  @Get("exceptions")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  async listExceptions(@CurrentUser() user: JwtPayload, @Query() query: ListComplianceExceptionsDto) {
    await assertPermission({ user, permission: "dashboard.view_intelligence", action: "compliance.exceptions.list" });
    return this.compliance.listComplianceExceptions(user.companyId, query);
  }

  @Post("exceptions/:id/resolve")
  @Roles("OWNER", "ADMIN", "STAFF")
  async resolveException(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: ResolveComplianceExceptionDto) {
    await assertPermission({ user, permission: "settings.manage", action: "compliance.exceptions.resolve" });
    return this.compliance.resolveComplianceException(user.companyId, user.sub, id, dto.note || null);
  }

  @Post("exceptions/:id/dismiss")
  @Roles("OWNER", "ADMIN", "STAFF")
  async dismissException(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: ResolveComplianceExceptionDto) {
    await assertPermission({ user, permission: "settings.manage", action: "compliance.exceptions.dismiss" });
    return this.compliance.dismissComplianceException(user.companyId, user.sub, id, dto.note || null);
  }

  @Get("summary")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  async getSummary(@CurrentUser() user: JwtPayload, @Query("locationId") locationId?: string) {
    await assertPermission({ user, permission: "dashboard.view_intelligence", action: "compliance.summary" });
    return this.compliance.getSummary(user.companyId, locationId);
  }
}
