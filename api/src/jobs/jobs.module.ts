import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AutomationsModule } from "../automations/automations.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { TemplatesModule } from "../templates/templates.module";
import { JobsController } from "./jobs.controller";
import { JobsService } from "./jobs.service";

@Module({
  imports: [AuditModule, TemplatesModule, NotificationsModule, AutomationsModule],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
