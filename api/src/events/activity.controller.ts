import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ActivityService } from "./activity.service";

@Controller("activity")
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get("recent")
  async recent(
    @Query("limit") limit?: string,
    @Query("tenantId") tenantId?: string,
    @Query("jobId") jobId?: string,
    @Query("customerName") customerName?: string,
  ) {
    const n = Number(limit || 12);
    const rows = await this.activity.list(n, tenantId || null);
    return rows.filter((x: any) => {
      if (jobId && String(x?.jobId || "") !== String(jobId)) return false;
      if (customerName && String(x?.customerName || "").toLowerCase() !== String(customerName).toLowerCase()) return false;
      return true;
    });
  }

  @Post("events")
  async createEvent(
    @Body()
    body: {
      type: string;
      label: string;
      tenantId?: string | null;
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
      tenantId: body.tenantId ?? null,
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
    @Body()
    body: {
      channel: "sms" | "email";
      customerName: string;
      subject?: string | null;
      message: string;
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
      tenantId: body.tenantId ?? null,
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
