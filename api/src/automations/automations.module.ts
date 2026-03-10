import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { EventsModule } from "../events/events.module";
import { AutomationsController } from "./automations.controller";
import { AutomationsService } from "./automations.service";

@Module({
  imports: [AuditModule, EventsModule],
  controllers: [AutomationsController],
  providers: [AutomationsService],
  exports: [AutomationsService],
})
export class AutomationsModule {}
