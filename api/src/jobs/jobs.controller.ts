import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtPayload } from "../auth/auth.types";
import { featureGate } from "../common/feature-gate";
import { isCommandCentreV1Enabled, isCommandCentreV2Enabled } from "../common/feature-flags";
import { JOB_STATUSES, normalizeJobStatusInput } from "../common/constants";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { BulkJobsDto, BulkJobsV2Dto, CreateJobDto, CreateJobReminderDto, JobsBoardQueryDto, PatchJobDto, UpdateJobStatusDto } from "./dto";
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
    const fallback = featureGate({
      enabled: isCommandCentreV1Enabled(),
      feature: 'COMMAND_CENTRE_V1',
      mode: 'read',
      fallback: { grouped: {}, counts: {} },
    });
    if (fallback) return fallback;
    return this.jobsService.board(user.companyId, user.sub, query);
  }

  @Get("board-v2")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  boardV2(@CurrentUser() user: JwtPayload, @Query() query: JobsBoardQueryDto) {
    featureGate({ enabled: isCommandCentreV2Enabled(), feature: 'COMMAND_CENTRE_V2', mode: 'read' });
    return this.jobsService.boardV2(user.companyId, user.sub, query);
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
    const normalized = normalizeJobStatusInput(dto.status);
    if (!normalized) {
      throw new BadRequestException({ code: "INVALID_STATUS", allowed: JOB_STATUSES });
    }
    return this.jobsService.updateStatus(user.companyId, user.sub, id, normalized);
  }

  @Patch(":id")
  @Roles("OWNER", "ADMIN", "STAFF")
  patchInline(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: PatchJobDto) {
    return this.jobsService.patchPartial(user.companyId, user.sub, id, dto);
  }

  @Post("bulk")
  @Roles("OWNER", "ADMIN", "STAFF")
  bulk(@CurrentUser() user: JwtPayload, @Body() dto: BulkJobsDto) {
    featureGate({ enabled: isCommandCentreV1Enabled(), feature: 'COMMAND_CENTRE_V1', mode: 'mutation' });
    return this.jobsService.bulk(user.companyId, user.sub, dto);
  }

  @Post("bulk-v2")
  @Roles("OWNER", "ADMIN", "STAFF")
  bulkV2(@CurrentUser() user: JwtPayload, @Body() dto: BulkJobsV2Dto) {
    featureGate({ enabled: isCommandCentreV2Enabled(), feature: 'COMMAND_CENTRE_V2', mode: 'mutation' });
    return this.jobsService.bulkV2(user.companyId, user.sub, dto);
  }

  @Post("reminder")
  @Roles("OWNER", "ADMIN", "STAFF")
  reminder(@CurrentUser() user: JwtPayload, @Body() dto: CreateJobReminderDto) {
    featureGate({ enabled: isCommandCentreV2Enabled(), feature: 'COMMAND_CENTRE_V2', mode: 'mutation' });
    return this.jobsService.createReminder(user.companyId, user.sub, dto);
  }

  @Get(":id/activity")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  activity(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    featureGate({ enabled: isCommandCentreV2Enabled(), feature: 'COMMAND_CENTRE_V2', mode: 'read' });
    return this.jobsService.activity(user.companyId, id);
  }

  @Post('undo-last')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  undoLast(@CurrentUser() user: JwtPayload) {
    featureGate({ enabled: isCommandCentreV1Enabled(), feature: 'COMMAND_CENTRE_V1', mode: 'mutation' });
    return this.jobsService.undoLastChange(user.companyId, user.sub);
  }
}
