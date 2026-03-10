import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtPayload } from "../auth/auth.types";
import { requireAutomationsV1Enabled } from "../common/feature-flags";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { CreateAutomationRuleDto, UpdateAutomationRuleDto, UpdateAutomationsSettingsDto } from "./automations.dto";
import { AutomationsService } from "./automations.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("automations")
export class AutomationsController {
  constructor(private readonly automations: AutomationsService) {}

  @Get("settings")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  getSettings(@CurrentUser() user: JwtPayload) {
    requireAutomationsV1Enabled();
    return this.automations.getSettings(user.companyId);
  }

  @Patch("settings")
  @Roles("OWNER", "ADMIN", "STAFF")
  updateSettings(@CurrentUser() user: JwtPayload, @Body() dto: UpdateAutomationsSettingsDto) {
    requireAutomationsV1Enabled();
    return this.automations.updateSettings(user, dto);
  }

  @Get("preview")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  preview(@CurrentUser() user: JwtPayload, @Query("windowDays") windowDays?: string) {
    requireAutomationsV1Enabled();
    const raw = Number(windowDays || 7);
    if (Number.isNaN(raw)) {
      throw new BadRequestException("windowDays must be a number");
    }
    const clamped = Math.max(1, Math.min(30, Math.floor(raw)));
    return this.automations.preview(user.companyId, clamped);
  }

  @Get("rules")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  rules(@CurrentUser() user: JwtPayload) {
    requireAutomationsV1Enabled();
    return this.automations.listRules(user.companyId);
  }

  @Get("runs")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  runs(@CurrentUser() user: JwtPayload, @Query("limit") limit?: string) {
    requireAutomationsV1Enabled();
    const parsed = Number(limit || 20);
    const clamped = Number.isNaN(parsed) ? 20 : Math.max(1, Math.min(100, Math.floor(parsed)));
    return this.automations.listRuns(user.companyId, clamped);
  }

  @Get("diagnostics")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  diagnostics(@CurrentUser() user: JwtPayload) {
    requireAutomationsV1Enabled();
    return this.automations.getDiagnostics(user.companyId);
  }

  @Get("workspace-rules")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  workspaceRules(@CurrentUser() user: JwtPayload) {
    requireAutomationsV1Enabled();
    return this.automations.listWorkspaceRules(user.companyId);
  }

  @Post("workspace-rules")
  @Roles("OWNER", "ADMIN", "STAFF")
  createWorkspaceRule(@CurrentUser() user: JwtPayload, @Body() dto: CreateAutomationRuleDto) {
    requireAutomationsV1Enabled();
    return this.automations.createWorkspaceRule(user, dto);
  }

  @Patch("workspace-rules/:id")
  @Roles("OWNER", "ADMIN", "STAFF")
  updateWorkspaceRule(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateAutomationRuleDto) {
    requireAutomationsV1Enabled();
    return this.automations.updateWorkspaceRule(user, id, dto);
  }

  @Delete("workspace-rules/:id")
  @Roles("OWNER", "ADMIN", "STAFF")
  deleteWorkspaceRule(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    requireAutomationsV1Enabled();
    return this.automations.deleteWorkspaceRule(user, id);
  }
}
