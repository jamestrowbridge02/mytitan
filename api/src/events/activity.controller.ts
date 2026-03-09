import { Controller, Get, Query } from "@nestjs/common";
import { ActivityService } from "./activity.service";

@Controller("activity")
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get("recent")
  recent(@Query("limit") limit?: string) {
    const n = Number(limit || 12);
    return this.activity.list(n);
  }
}
