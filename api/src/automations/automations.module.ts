import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { EventsModule } from "../events/events.module";
import { AutomationsController } from "./automations.controller";
import { AutomationsService } from "./automations.service";
import { AutomationRuleEngine } from "./rule-engine";

@Module({
  imports: [AuditModule, EventsModule],
  controllers: [AutomationsController],
  providers: [AutomationsService, AutomationRuleEngine],
  exports: [AutomationsService, AutomationRuleEngine],
})
export class AutomationsModule {}
