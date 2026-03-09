import { Controller, Get, Query } from "@nestjs/common";
import { ActivityService } from "./activity.service";

@Controller("activity")
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get("recent")
  async recent(@Query("limit") limit?: string, @Query("tenantId") tenantId?: string, @Query("jobId") jobId?: string) {
    const n = Number(limit || 12);
    const rows = await this.activity.list(n, tenantId || null);
    return jobId ? rows.filter((x: any) => String(x?.jobId || "") === String(jobId)) : rows;
  }
}
