import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtPayload } from "../auth/auth.types";
import { ActivityService } from "./activity.service";

@UseGuards(JwtAuthGuard)
@Controller("activity")
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get("recent")
  async recent(
    @Query("limit") limit?: string,
    @CurrentUser() user?: JwtPayload,
    @Query("jobId") jobId?: string,
    @Query("customerId") customerId?: string,
    @Query("customerName") customerName?: string,
    @Query("includeValidation") includeValidation?: string,
  ) {
    const n = Number(limit || 12);
    return this.activity.list(n, user?.companyId || null, {
      jobId: jobId || null,
      customerId: customerId || null,
      customerName: customerName || null,
      includeValidation: includeValidation === "1" || includeValidation === "true",
    });
  }

  @Post("events")
  async createEvent(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      type: string;
      label: string;
      tenantId?: string | null;
      customerId?: string | null;
      jobId?: string | null;
      jobRef?: string | null;
      customerName?: string | null;
      status?: string | null;
      vehicleReg?: string | null;
      technicianId?: string | null;
      payloadJson?: any;
    },
  ) {
    return this.activity.push({
      type: body.type,
      label: body.label,
      tenantId: user.companyId,
      customerId: body.customerId ?? null,
      jobId: body.jobId ?? null,
      jobRef: body.jobRef ?? null,
      customerName: body.customerName ?? null,
      status: body.status ?? null,
      vehicleReg: body.vehicleReg ?? null,
      technicianId: body.technicianId ?? null,
      payloadJson: body.payloadJson ?? null,
    });
  }

  @Post("communications/send")
  async sendCommunication(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      channel: "sms" | "email";
      customerName: string;
      subject?: string | null;
      message: string;
      customerId?: string | null;
      jobId?: string | null;
      jobRef?: string | null;
      tenantId?: string | null;
    },
  ) {
    const channel = body.channel === "email" ? "email" : "sms";
    const label =
      channel === "email"
        ? `Email sent to ${body.customerName}${body.subject ? `: ${body.subject}` : ""}`
        : `SMS sent to ${body.customerName}`;

    const row = await this.activity.push({
      type: `${channel}.sent`,
      label,
      tenantId: user.companyId,
      customerId: body.customerId ?? null,
      jobId: body.jobId ?? null,
      jobRef: body.jobRef ?? null,
      customerName: body.customerName || null,
      payloadJson: {
        channel,
        subject: body.subject ?? null,
        message: body.message ?? "",
        delivered: true,
      },
    });

    return { ok: true, eventId: row.id, label };
  }
}
