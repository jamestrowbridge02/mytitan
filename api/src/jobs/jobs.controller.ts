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
import { AddJobExecutionEvidenceDto, ArchiveByDateDto, ArchiveJobsDto, BulkJobsDto, BulkJobsV2Dto, CreateArchivePeriodDto, CreateJobDto, CreateJobReminderDto, JobLifecycleActionDto, JobListQueryDto, JobsBoardQueryDto, PatchJobDto, RoutePreviewQueryDto, ShareJobSheetDto, StartJobExecutionDto, SubmitJobExecutionDto, UpdateCustomerJourneyDto, UpdateJobExecutionDto, UpdateJobStatusDto } from "./dto";
import { JobPartQuantityActionDto, PatchJobPartDto, UpsertJobPartDto } from "../inventory/dto";
import { InventoryService } from "../inventory/inventory.service";
import { JobCompletionLinkService } from "./job-completion-link.service";
import { CustomerJourneyService } from "./customer-journey.service";
import { JobExecutionService } from "./job-execution.service";
import { JobsService } from "./jobs.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("jobs")
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly jobExecutionService: JobExecutionService,
    private readonly jobCompletionLinks: JobCompletionLinkService,
    private readonly inventoryService: InventoryService,
    private readonly customerJourney: CustomerJourneyService,
  ) {}

  private restrictedOperator(user: JwtPayload) {
    return user.role === "TECHNICIAN" || user.role === "EXTERNAL_OPERATOR";
  }

  private async assertAssignedJob(user: JwtPayload, id: string) {
    if (!this.restrictedOperator(user)) return;
    await this.jobsService.getById(user.companyId, id, user.sub);
  }

  @Post()
  @Roles("OWNER", "ADMIN", "STAFF")
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateJobDto) {
    return this.jobsService.create(user.companyId, user.sub, dto);
  }

  @Get()
  @Roles("OWNER", "ADMIN", "DISPATCHER", "FINANCE", "TECHNICIAN", "EXTERNAL_OPERATOR", "VIEWER", "STAFF", "READ_ONLY")
  list(@CurrentUser() user: JwtPayload, @Query() query: JobListQueryDto) {
    return this.jobsService.list(user.companyId, query.locationId, {
      includeArchived: query.includeArchived === true || String(query.includeArchived || "").toLowerCase() === "true",
      assignedUserId: this.restrictedOperator(user) ? user.sub : null,
    });
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

  @Get("archive-periods")
  @Roles("OWNER", "ADMIN", "FINANCE", "STAFF", "READ_ONLY")
  archivePeriods(@CurrentUser() user: JwtPayload) {
    return this.jobsService.listArchivePeriods(user.companyId);
  }

  @Post("archive-periods")
  @Roles("OWNER", "ADMIN")
  async createArchivePeriod(@CurrentUser() user: JwtPayload, @Body() dto: CreateArchivePeriodDto) {
    await assertPermission({ user, permission: "jobs.transition", action: "jobs.archive_period.create" });
    return this.jobsService.createArchivePeriod(user.companyId, user.sub, dto);
  }

  @Post("archive-periods/:periodId/close")
  @Roles("OWNER", "ADMIN")
  async closeArchivePeriod(@CurrentUser() user: JwtPayload, @Param("periodId") periodId: string) {
    await assertPermission({ user, permission: "jobs.transition", action: "jobs.archive_period.close" });
    return this.jobsService.closeArchivePeriod(user.companyId, user.sub, periodId);
  }

  @Post("archive-periods/archive-selected")
  @Roles("OWNER", "ADMIN", "STAFF")
  async archiveSelected(@CurrentUser() user: JwtPayload, @Body() dto: ArchiveJobsDto) {
    await assertPermission({ user, permission: "jobs.transition", action: "jobs.archive_period.archive_selected" });
    return this.jobsService.archiveSelectedToPeriod(user.companyId, user.sub, dto.archivePeriodId, dto.jobIds);
  }

  @Post("archive-periods/archive-by-date")
  @Roles("OWNER", "ADMIN")
  async archiveByDate(@CurrentUser() user: JwtPayload, @Body() dto: ArchiveByDateDto) {
    await assertPermission({ user, permission: "jobs.transition", action: "jobs.archive_period.archive_by_date" });
    return this.jobsService.archiveByPeriodDateRange(user.companyId, user.sub, dto.archivePeriodId);
  }

  @Get("route-preview/customer-eta")
  @Roles("OWNER", "ADMIN", "DISPATCHER", "STAFF", "READ_ONLY")
  async routePreview(@CurrentUser() user: JwtPayload, @Query() query: RoutePreviewQueryDto) {
    return this.customerJourney.routePreview(user.companyId, user, query);
  }

  @Get(":id")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY", "EXTERNAL_OPERATOR")
  getById(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.jobsService.getById(user.companyId, id, this.restrictedOperator(user) ? user.sub : null);
  }

  @Get(":id/customer-journey")
  @Roles("OWNER", "ADMIN", "DISPATCHER", "TECHNICIAN", "EXTERNAL_OPERATOR", "STAFF", "READ_ONLY")
  async customerJourneyForJob(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await this.customerJourney.assertCustomerEtaEnabled(user.companyId, user);
    const job = await this.jobsService.getById(user.companyId, id);
    if (this.restrictedOperator(user) && job.assignedUserId !== user.sub) {
      throw new BadRequestException("Technicians can only view customer journeys for assigned jobs");
    }
    return this.customerJourney.buildCustomerJourney(user.companyId, job);
  }

  @Patch(":id/customer-journey")
  @Roles("OWNER", "ADMIN", "DISPATCHER", "TECHNICIAN", "STAFF")
  async updateCustomerJourney(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateCustomerJourneyDto) {
    return this.customerJourney.updateCustomerJourney(user.companyId, user, id, dto);
  }

  @Post(":id/pdf")
  @Roles("OWNER", "ADMIN", "DISPATCHER", "TECHNICIAN", "EXTERNAL_OPERATOR")
  generatePdf(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.jobsService.generatePdf(user.companyId, user.sub, id);
  }

  @Post(":id/share-job-sheet")
  @Roles("OWNER", "ADMIN", "DISPATCHER", "TECHNICIAN")
  async shareJobSheet(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: ShareJobSheetDto) {
    const job = await this.jobsService.getById(user.companyId, id);
    if (this.restrictedOperator(user) && job.assignedUserId !== user.sub) {
      throw new BadRequestException("Technicians can only share assigned job sheets");
    }
    return this.jobsService.shareJobSheet(user.companyId, user.sub, id, dto);
  }

  @Get(":id/map-links")
  @Roles("OWNER", "ADMIN", "DISPATCHER", "TECHNICIAN", "EXTERNAL_OPERATOR", "STAFF", "READ_ONLY")
  async mapLinks(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    const job = await this.jobsService.getById(user.companyId, id);
    if (this.restrictedOperator(user) && job.assignedUserId !== user.sub) {
      throw new BadRequestException("Technicians can only view map links for assigned jobs");
    }
    return this.jobsService.getMapLinks(user.companyId, id);
  }

  @Patch(":id/status")
  @Roles("OWNER", "ADMIN", "DISPATCHER", "TECHNICIAN")
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

  @Post(":id/complete")
  @Roles("OWNER", "ADMIN", "DISPATCHER", "TECHNICIAN")
  async complete(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await assertPermission({ user, permission: "jobs.transition", action: "jobs.complete" });
    return this.jobsService.complete(user.companyId, user.sub, id);
  }

  @Post(":id/cancel")
  @Roles("OWNER", "ADMIN", "DISPATCHER", "TECHNICIAN")
  async cancel(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: JobLifecycleActionDto) {
    await assertPermission({ user, permission: "jobs.transition", action: "jobs.cancel" });
    return this.jobsService.cancel(user.companyId, user.sub, id, dto?.reason);
  }

  @Post(":id/archive")
  @Roles("OWNER", "ADMIN", "DISPATCHER", "TECHNICIAN")
  async archive(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: Record<string, any>) {
    await assertPermission({ user, permission: "jobs.transition", action: "jobs.archive" });
    return this.jobsService.archive(user.companyId, user.sub, id, dto?.archivePeriodId);
  }

  @Post(":id/unarchive")
  @Roles("OWNER", "ADMIN", "STAFF")
  async unarchive(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await assertPermission({ user, permission: "jobs.transition", action: "jobs.unarchive" });
    return this.jobsService.unarchive(user.companyId, user.sub, id);
  }

  @Post(":id/delete")
  @Roles("OWNER", "ADMIN", "STAFF")
  async deleteSoft(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: JobLifecycleActionDto) {
    await assertPermission({ user, permission: "jobs.transition", action: "jobs.delete" });
    return this.jobsService.softDelete(user.companyId, user.sub, id, dto?.reason);
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
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY", "EXTERNAL_OPERATOR")
  async activity(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    featureGate({ enabled: isCommandCentreV2Enabled(), feature: 'COMMAND_CENTRE_V2', mode: 'read' });
    await this.assertAssignedJob(user, id);
    return this.jobsService.activity(user.companyId, id);
  }

  @Get(":id/execution")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY", "EXTERNAL_OPERATOR")
  async execution(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await this.assertAssignedJob(user, id);
    return this.jobExecutionService.getExecutionForJob(user.companyId, id);
  }

  @Post(":id/execution/start")
  @Roles("OWNER", "ADMIN", "STAFF", "EXTERNAL_OPERATOR")
  async startExecution(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: StartJobExecutionDto) {
    await assertPermission({ user, permission: "technician.execute", action: "jobs.execution.start" });
    await this.assertAssignedJob(user, id);
    return this.jobExecutionService.startExecution(user.companyId, user.sub, id, dto.summary);
  }

  @Patch(":id/execution")
  @Roles("OWNER", "ADMIN", "STAFF", "EXTERNAL_OPERATOR")
  async updateExecution(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpdateJobExecutionDto) {
    await assertPermission({ user, permission: "technician.execute", action: "jobs.execution.update" });
    await this.assertAssignedJob(user, id);
    return this.jobExecutionService.updateExecution(user.companyId, user.sub, id, dto);
  }

  @Post(":id/execution/submit")
  @Roles("OWNER", "ADMIN", "STAFF", "EXTERNAL_OPERATOR")
  async submitExecution(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: SubmitJobExecutionDto) {
    await assertPermission({ user, permission: "technician.execute", action: "jobs.execution.submit" });
    await this.assertAssignedJob(user, id);
    return this.jobExecutionService.submitExecution(user.companyId, user.sub, id, dto);
  }

  @Post(":id/execution/evidence")
  @Roles("OWNER", "ADMIN", "STAFF", "EXTERNAL_OPERATOR")
  async addExecutionEvidence(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: AddJobExecutionEvidenceDto) {
    await assertPermission({ user, permission: "technician.execute", action: "jobs.execution.evidence" });
    await this.assertAssignedJob(user, id);
    return this.jobExecutionService.addEvidence(user.companyId, user.sub, id, dto);
  }

  @Get(":id/completion-link")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  async completionLinkStatus(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.jobCompletionLinks.getStatus(user.companyId, id);
  }

  @Post(":id/completion-link")
  @Roles("OWNER", "ADMIN", "STAFF")
  async createCompletionLink(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.jobCompletionLinks.createLink(user.companyId, user.sub, id);
  }

  @Post(":id/completion-link/revoke")
  @Roles("OWNER", "ADMIN", "STAFF")
  async revokeCompletionLink(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.jobCompletionLinks.revokeLink(user.companyId, user.sub, id);
  }

  @Get(":id/parts")
  @Roles("OWNER", "ADMIN", "STAFF", "READ_ONLY")
  async listParts(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    return this.inventoryService.listJobParts(user.companyId, id);
  }

  @Post(":id/parts")
  @Roles("OWNER", "ADMIN", "STAFF")
  async addPart(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() dto: UpsertJobPartDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    return this.inventoryService.createJobPart(user.companyId, user.sub, id, dto, user);
  }

  @Patch(":id/parts/:jobPartId")
  @Roles("OWNER", "ADMIN", "STAFF")
  async patchPart(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Param("jobPartId") jobPartId: string, @Body() dto: PatchJobPartDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    return this.inventoryService.patchJobPart(user.companyId, user.sub, id, jobPartId, dto, user);
  }

  @Post(":id/parts/:jobPartId/reserve")
  @Roles("OWNER", "ADMIN", "STAFF")
  async reservePart(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Param("jobPartId") jobPartId: string, @Body() dto: JobPartQuantityActionDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    return this.inventoryService.reserveJobPart(user.companyId, user.sub, id, jobPartId, dto, user);
  }

  @Post(":id/parts/:jobPartId/use")
  @Roles("OWNER", "ADMIN", "STAFF")
  async usePart(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Param("jobPartId") jobPartId: string, @Body() dto: JobPartQuantityActionDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    return this.inventoryService.useJobPart(user.companyId, user.sub, id, jobPartId, dto, user);
  }

  @Post(":id/parts/:jobPartId/release")
  @Roles("OWNER", "ADMIN", "STAFF")
  async releasePart(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Param("jobPartId") jobPartId: string, @Body() dto: JobPartQuantityActionDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    return this.inventoryService.releaseJobPart(user.companyId, user.sub, id, jobPartId, dto, user);
  }

  @Post('undo-last')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  undoLast(@CurrentUser() user: JwtPayload) {
    featureGate({ enabled: isCommandCentreV1Enabled(), feature: 'COMMAND_CENTRE_V1', mode: 'mutation' });
    return this.jobsService.undoLastChange(user.companyId, user.sub);
  }
}
