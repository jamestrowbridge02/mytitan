import { Controller, Get, Query, UseGuards } from "@nestjs/common";
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
}
