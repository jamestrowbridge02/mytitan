import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtPayload } from "../auth/auth.types";
import { assertPermission, hasPermission } from "../common/permissions";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import {
  PatchTechnicianAvailabilityDto,
  PatchTechnicianCapacityExceptionDto,
  ScheduleCapacityQuery,
  SchedulePressureQuery,
  ScheduleRecommendationQuery,
  UpsertTechnicianAvailabilityDto,
  UpsertTechnicianCapacityExceptionDto,
} from "./dto";
import { ScheduleService } from "./schedule.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("schedule")
export class ScheduleController {
  constructor(private readonly schedule: ScheduleService) {}

  private assertViewAccess(user: JwtPayload) {
    if (
      hasPermission(user.role as any, "jobs.transition") ||
      hasPermission(user.role as any, "dashboard.view_intelligence") ||
      hasPermission(user.role as any, "technician.execute")
    ) {
      return;
    }
    return assertPermission({ user, permission: "jobs.transition", action: "schedule.read" });
  }

  @Get("capacity")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY", "TECHNICIAN")
  async capacity(@CurrentUser() user: JwtPayload, @Query() query: ScheduleCapacityQuery) {
    await this.assertViewAccess(user);
    return this.schedule.getCapacity(user.companyId, query);
  }

  @Get("pressure")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY", "TECHNICIAN")
  async pressure(@CurrentUser() user: JwtPayload, @Query() query: SchedulePressureQuery) {
    await this.assertViewAccess(user);
    return this.schedule.getTechnicianSchedulePressure(user.companyId, query);
  }

  @Get("recommendations")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY", "TECHNICIAN")
  async recommendations(@CurrentUser() user: JwtPayload, @Query() query: ScheduleRecommendationQuery) {
    await this.assertViewAccess(user);
    return this.schedule.recommendAssignableTechnicians(user.companyId, query);
  }

  @Post("availability")
  @Roles("OWNER", "ADMIN")
  async createAvailability(@CurrentUser() user: JwtPayload, @Body() dto: UpsertTechnicianAvailabilityDto) {
    await assertPermission({ user, permission: "settings.manage", action: "schedule.availability.create" });
    return this.schedule.createAvailability(user.companyId, dto);
  }

  @Patch("availability/:id")
  @Roles("OWNER", "ADMIN")
  async patchAvailability(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: PatchTechnicianAvailabilityDto) {
    await assertPermission({ user, permission: "settings.manage", action: "schedule.availability.update" });
    return this.schedule.updateAvailability(user.companyId, id, dto);
  }

  @Delete("availability/:id")
  @Roles("OWNER", "ADMIN")
  async deleteAvailability(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await assertPermission({ user, permission: "settings.manage", action: "schedule.availability.delete" });
    return this.schedule.deleteAvailability(user.companyId, id);
  }

  @Post("exceptions")
  @Roles("OWNER", "ADMIN")
  async createException(@CurrentUser() user: JwtPayload, @Body() dto: UpsertTechnicianCapacityExceptionDto) {
    await assertPermission({ user, permission: "settings.manage", action: "schedule.exceptions.create" });
    return this.schedule.createException(user.companyId, dto);
  }

  @Patch("exceptions/:id")
  @Roles("OWNER", "ADMIN")
  async patchException(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: PatchTechnicianCapacityExceptionDto) {
    await assertPermission({ user, permission: "settings.manage", action: "schedule.exceptions.update" });
    return this.schedule.updateException(user.companyId, id, dto);
  }

  @Delete("exceptions/:id")
  @Roles("OWNER", "ADMIN")
  async deleteException(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await assertPermission({ user, permission: "settings.manage", action: "schedule.exceptions.delete" });
    return this.schedule.deleteException(user.companyId, id);
  }
}
