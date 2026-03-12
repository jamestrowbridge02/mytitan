import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtPayload } from "../auth/auth.types";
import { featureGate } from "../common/feature-gate";
import { isCommandCentreV1Enabled, isCommandCentreV2Enabled } from "../common/feature-flags";
import { JOB_STATUSES, normalizeJobStatusInput } from "../common/constants";
import { assertPermission } from "../common/permissions";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { AddJobExecutionEvidenceDto, BulkJobsDto, BulkJobsV2Dto, CreateJobDto, CreateJobReminderDto, JobsBoardQueryDto, PatchJobDto, StartJobExecutionDto, SubmitJobExecutionDto, UpdateJobExecutionDto, UpdateJobStatusDto } from "./dto";
import { JobPartQuantityActionDto, PatchJobPartDto, UpsertJobPartDto } from "../inventory/dto";
import { InventoryService } from "../inventory/inventory.service";
import { JobExecutionService } from "./job-execution.service";
import { JobsService } from "./jobs.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("jobs")
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly jobExecutionService: JobExecutionService,
    private readonly inventoryService: InventoryService,
  ) {}

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
  async updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() dto: UpdateJobStatusDto,
  ) {
    await assertPermission({ user, permission: "jobs.transition", action: "jobs.status.update" });
    const normalized = normalizeJobStatusInput(dto.status);
    if (!normalized) {
      throw new BadRequestException({ code: "INVALID_STATUS", allowed: JOB_STATUSES });
    }
    return this.jobsService.updateStatus(user.companyId, user.sub, id, normalized);
  }

  @Patch(":id")
  @Roles("OWNER", "ADMIN", "STAFF")
  async patchInline(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: PatchJobDto) {
    if (dto && Object.prototype.hasOwnProperty.call(dto, "status")) {
      await assertPermission({ user, permission: "jobs.transition", action: "jobs.patch.status" });
    }
    return this.jobsService.patchPartial(user.companyId, user.sub, id, dto);
  }

  @Post("bulk")
  @Roles("OWNER", "ADMIN", "STAFF")
  async bulk(@CurrentUser() user: JwtPayload, @Body() dto: BulkJobsDto) {
    featureGate({ enabled: isCommandCentreV1Enabled(), feature: 'COMMAND_CENTRE_V1', mode: 'mutation' });
    if (dto?.status) {
      await assertPermission({ user, permission: "jobs.transition", action: "jobs.bulk.status" });
    }
    return this.jobsService.bulk(user.companyId, user.sub, dto);
  }

  @Post("bulk-v2")
  @Roles("OWNER", "ADMIN", "STAFF")
  async bulkV2(@CurrentUser() user: JwtPayload, @Body() dto: BulkJobsV2Dto) {
    featureGate({ enabled: isCommandCentreV2Enabled(), feature: 'COMMAND_CENTRE_V2', mode: 'mutation' });
    if (dto?.status) {
      await assertPermission({ user, permission: "jobs.transition", action: "jobs.bulk_v2.status" });
    }
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

  @Get(":id/execution")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  execution(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.jobExecutionService.getExecutionForJob(user.companyId, id);
  }

  @Post(":id/execution/start")
  @Roles("OWNER", "ADMIN", "STAFF")
  async startExecution(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: StartJobExecutionDto) {
    await assertPermission({ user, permission: "technician.execute", action: "jobs.execution.start" });
    return this.jobExecutionService.startExecution(user.companyId, user.sub, id, dto.summary);
  }

  @Patch(":id/execution")
  @Roles("OWNER", "ADMIN", "STAFF")
  async updateExecution(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateJobExecutionDto) {
    await assertPermission({ user, permission: "technician.execute", action: "jobs.execution.update" });
    return this.jobExecutionService.updateExecution(user.companyId, user.sub, id, dto);
  }

  @Post(":id/execution/submit")
  @Roles("OWNER", "ADMIN", "STAFF")
  async submitExecution(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: SubmitJobExecutionDto) {
    await assertPermission({ user, permission: "technician.execute", action: "jobs.execution.submit" });
    return this.jobExecutionService.submitExecution(user.companyId, user.sub, id, dto);
  }

  @Post(":id/execution/evidence")
  @Roles("OWNER", "ADMIN", "STAFF")
  async addExecutionEvidence(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: AddJobExecutionEvidenceDto) {
    await assertPermission({ user, permission: "technician.execute", action: "jobs.execution.evidence" });
    return this.jobExecutionService.addEvidence(user.companyId, user.sub, id, dto);
  }

  @Get(":id/parts")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  listParts(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.inventoryService.listJobParts(user.companyId, id);
  }

  @Post(":id/parts")
  @Roles("OWNER", "ADMIN", "STAFF")
  addPart(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpsertJobPartDto) {
    return this.inventoryService.createJobPart(user.companyId, user.sub, id, dto);
  }

  @Patch(":id/parts/:jobPartId")
  @Roles("OWNER", "ADMIN", "STAFF")
  patchPart(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Param("jobPartId") jobPartId: string, @Body() dto: PatchJobPartDto) {
    return this.inventoryService.patchJobPart(user.companyId, user.sub, id, jobPartId, dto);
  }

  @Post(":id/parts/:jobPartId/reserve")
  @Roles("OWNER", "ADMIN", "STAFF")
  reservePart(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Param("jobPartId") jobPartId: string, @Body() dto: JobPartQuantityActionDto) {
    return this.inventoryService.reserveJobPart(user.companyId, user.sub, id, jobPartId, dto);
  }

  @Post(":id/parts/:jobPartId/use")
  @Roles("OWNER", "ADMIN", "STAFF")
  usePart(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Param("jobPartId") jobPartId: string, @Body() dto: JobPartQuantityActionDto) {
    return this.inventoryService.useJobPart(user.companyId, user.sub, id, jobPartId, dto);
  }

  @Post(":id/parts/:jobPartId/release")
  @Roles("OWNER", "ADMIN", "STAFF")
  releasePart(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Param("jobPartId") jobPartId: string, @Body() dto: JobPartQuantityActionDto) {
    return this.inventoryService.releaseJobPart(user.companyId, user.sub, id, jobPartId, dto);
  }

  @Post('undo-last')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  undoLast(@CurrentUser() user: JwtPayload) {
    featureGate({ enabled: isCommandCentreV1Enabled(), feature: 'COMMAND_CENTRE_V1', mode: 'mutation' });
    return this.jobsService.undoLastChange(user.companyId, user.sub);
  }
}
