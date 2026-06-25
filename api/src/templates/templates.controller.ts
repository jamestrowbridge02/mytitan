import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtPayload } from "../auth/auth.types";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { TemplatesService } from "./templates.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("templates")
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get("default")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  async getDefault(@CurrentUser() user: JwtPayload, @Query("trade") trade?: string) {
    return this.templatesService.getDefaultTemplate(user.companyId, (trade || "WHEELS").toUpperCase());
  }

  @Get("library")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  async getLibrary(@CurrentUser() user: JwtPayload) {
    return this.templatesService.getTemplateLibrary(user.companyId);
  }

  @Post("apply/:templateId")
  @Roles("OWNER", "ADMIN")
  async applyTemplate(@CurrentUser() user: JwtPayload, @Param("templateId") templateId: string) {
    return this.templatesService.applyTemplateToWorkspace(user.companyId, user.sub, templateId);
  }

  @Post("submit")
  @Roles("OWNER", "ADMIN")
  async submitTemplate(@CurrentUser() user: JwtPayload, @Body() body: Record<string, any>) {
    return this.templatesService.submitTemplateProposal(user.companyId, user.sub, body || {});
  }
}
