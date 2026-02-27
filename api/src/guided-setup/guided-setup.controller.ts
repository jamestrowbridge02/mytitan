import { BadRequestException, Body, Controller, Get, Post, ServiceUnavailableException, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtPayload } from "../auth/auth.types";
import { isGuidedSetupV2Enabled } from "../common/feature-flags";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { GuidedSetupStepDto } from "./guided-setup.dto";
import { GuidedSetupService } from "./guided-setup.service";

const MAX_GUIDED_SETUP_STEP = 5;

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("guided-setup")
export class GuidedSetupController {
  constructor(private readonly guidedSetupService: GuidedSetupService) {}

  private assertEnabled() {
    if (!isGuidedSetupV2Enabled()) {
      throw new ServiceUnavailableException("Feature is not enabled.");
    }
  }

  @Get("status")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  async status(@CurrentUser() user: JwtPayload) {
    this.assertEnabled();
    return this.guidedSetupService.getStatus(user.companyId);
  }

  @Post("reset")
  @Roles("OWNER")
  async reset(@CurrentUser() user: JwtPayload) {
    this.assertEnabled();
    return this.guidedSetupService.reset(user.companyId, user.sub);
  }

  @Post("step")
  @Roles("OWNER", "ADMIN", "STAFF")
  async step(@CurrentUser() user: JwtPayload, @Body() dto: GuidedSetupStepDto) {
    this.assertEnabled();
    const step = Number(dto.step);
    if (!Number.isFinite(step) || step < 0 || step > MAX_GUIDED_SETUP_STEP) {
      throw new BadRequestException("Invalid step");
    }
    return this.guidedSetupService.applyStep(user.companyId, user.sub, user.role, step, dto.data || {}, Boolean(dto.skipped));
  }

  @Post("complete")
  @Roles("OWNER", "ADMIN", "STAFF")
  async complete(@CurrentUser() user: JwtPayload) {
    this.assertEnabled();
    return this.guidedSetupService.complete(user.companyId, user.sub);
  }
}
