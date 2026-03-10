import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { EventsModule } from "../events/events.module";
import { AutomationsController } from "./automations.controller";
import { AutomationsService } from "./automations.service";
import { AutomationRuleEngine } from "./rule-engine";
import { AutomationSuggestionEngine } from "./suggestion-engine";

@Module({
  imports: [AuditModule, EventsModule],
  controllers: [AutomationsController],
  providers: [AutomationsService, AutomationRuleEngine, AutomationSuggestionEngine],
  exports: [AutomationsService, AutomationRuleEngine, AutomationSuggestionEngine],
})
export class AutomationsModule {}
