import { Module } from "@nestjs/common";
import { AutomationsModule } from "../automations/automations.module";
import { ComplianceModule } from "../compliance/compliance.module";
import { EventsModule } from "../events/events.module";
import { JobsModule } from "../jobs/jobs.module";
import { QuotesController } from "./quotes.controller";
import { RevenueController } from "./revenue.controller";
import { RevenueService } from "./revenue.service";

@Module({
  imports: [JobsModule, EventsModule, AutomationsModule, ComplianceModule],
  controllers: [QuotesController, RevenueController],
  providers: [RevenueService],
  exports: [RevenueService],
})
export class RevenueModule {}
