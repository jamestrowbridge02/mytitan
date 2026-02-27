import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtPayload } from "../auth/auth.types";
import { isCommandCentreV1Enabled } from "../common/feature-flags";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { BulkJobsDto, CreateJobDto, JobsBoardQueryDto, PatchJobDto, UpdateJobStatusDto } from "./dto";
import { JobsService } from "./jobs.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("jobs")
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @Roles("OWNER", "ADMIN", "STAFF")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateJobDto) {
    return this.jobsService.create(user.companyId, user.sub, dto);
  }

  @Get()
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  list(@CurrentUser() user: JwtPayload) {
    return this.jobsService.list(user.companyId);
  }

  @Get("board")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  board(@CurrentUser() user: JwtPayload, @Query() query: JobsBoardQueryDto) {
    if (!isCommandCentreV1Enabled()) return { grouped: {}, counts: {} };
    return this.jobsService.board(user.companyId, user.sub, query);
  }

  @Get(":id")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  getById(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.jobsService.getById(user.companyId, id);
  }

  @Post(":id/pdf")
  @Roles("OWNER", "ADMIN", "STAFF")
  generatePdf(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.jobsService.generatePdf(user.companyId, user.sub, id);
  }

  @Patch(":id/status")
  @Roles("OWNER", "ADMIN", "STAFF")
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateJobStatusDto,
  ) {
    return this.jobsService.updateStatus(user.companyId, user.sub, id, dto.status);
  }

  @Patch(":id")
  @Roles("OWNER", "ADMIN", "STAFF")
  patchInline(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: PatchJobDto) {
    return this.jobsService.patchPartial(user.companyId, user.sub, id, dto);
  }

  @Post("bulk")
  @Roles("OWNER", "ADMIN", "STAFF")
  bulk(@CurrentUser() user: JwtPayload, @Body() dto: BulkJobsDto) {
    if (!isCommandCentreV1Enabled()) return { successCount: 0, failed: dto.jobIds.map((id) => ({ id, reason: "feature disabled" })) };
    return this.jobsService.bulk(user.companyId, user.sub, dto);
  }

  @Post('undo-last')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  undoLast(@CurrentUser() user: JwtPayload) {
    return this.jobsService.undoLastChange(user.companyId, user.sub);
  }
}
