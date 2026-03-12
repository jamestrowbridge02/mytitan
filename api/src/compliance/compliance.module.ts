import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AutomationsModule } from "../automations/automations.module";
import { EventsModule } from "../events/events.module";
import { ComplianceController } from "./compliance.controller";
import { ComplianceService } from "./compliance.service";

@Module({
  imports: [AuditModule, EventsModule, AutomationsModule],
  controllers: [ComplianceController],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
