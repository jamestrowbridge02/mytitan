import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AutomationsModule } from "../automations/automations.module";
import { EventsModule } from "../events/events.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { TemplatesModule } from "../templates/templates.module";
import { JobExecutionService } from "./job-execution.service";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";

@Module({
  imports: [AuditModule, TemplatesModule, NotificationsModule, AutomationsModule, EventsModule],
  controllers: [JobsController],
  providers: [JobsService, JobExecutionService],
  exports: [JobsService, JobExecutionService],
})
export class JobsModule {}
