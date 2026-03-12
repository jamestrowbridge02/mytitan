import { BadRequestException, Body, Controller, Get, Param, Post, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { promises as fs } from "fs";
import { resolve } from "path";
import { CurrentCustomer } from "./current-customer.decorator";
import { CustomerJwtAuthGuard } from "./customer-auth.guard";
import { CustomerJwtPayload } from "./customer-auth.types";
import { CustomerApprovalResponseDto, CustomerJobExecutionAcknowledgementDto } from "./dto";
import { CustomerWorkspaceService } from "./customer-workspace.service";

@UseGuards(CustomerJwtAuthGuard)
@Controller("customer-workspace")
export class CustomerWorkspaceController {
  constructor(private readonly customerWorkspace: CustomerWorkspaceService) {}

  @Get()
  workspace(@CurrentCustomer() customer: CustomerJwtPayload) {
    return this.customerWorkspace.getCustomerWorkspace(customer.tenantId, customer.customerId);
  }

  @Post("approvals/:id/approve")
  approve(
    @CurrentCustomer() customer: CustomerJwtPayload,
    @Param("id") id: string,
    @Body() dto: CustomerApprovalResponseDto,
  ) {
    return this.customerWorkspace.respondToApproval(customer.tenantId, customer.customerId, id, "approve", dto.note);
  }

  @Post("approvals/:id/decline")
  decline(
    @CurrentCustomer() customer: CustomerJwtPayload,
    @Param("id") id: string,
    @Body() dto: CustomerApprovalResponseDto,
  ) {
    return this.customerWorkspace.respondToApproval(customer.tenantId, customer.customerId, id, "decline", dto.note);
  }

  @Get("artifacts/:artifactId")
  async artifact(
    @CurrentCustomer() customer: CustomerJwtPayload,
    @Param("artifactId") artifactId: string,
    @Res() res: Response,
  ) {
    const artifact = await this.customerWorkspace.getCustomerArtifactDownload(customer.tenantId, customer.customerId, artifactId);
    const root = resolve(process.cwd(), process.env.ARTIFACTS_STORAGE_ROOT || "uploads/artifacts");
    const filePath = resolve(root, artifact.storagePath || "");
    if (!filePath.startsWith(root)) {
      throw new BadRequestException("Invalid artifact path");
    }
    await fs.access(filePath);
    if (artifact.mimeType) {
      res.setHeader("Content-Type", artifact.mimeType);
    }
    if (artifact.fileName) {
      res.setHeader("Content-Disposition", `inline; filename=\"${artifact.fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}\"`);
    }
    return res.sendFile(filePath);
  }

  @Post("jobs/:id/acknowledge-completion")
  acknowledgeCompletion(
    @CurrentCustomer() customer: CustomerJwtPayload,
    @Param("id") id: string,
    @Body() dto: CustomerJobExecutionAcknowledgementDto,
  ) {
    return this.customerWorkspace.acknowledgeCustomerJobExecution(customer.tenantId, customer.customerId, id, dto.note);
  }
}
