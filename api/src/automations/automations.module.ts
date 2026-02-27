import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AutomationsController } from "./automations.controller";
import { AutomationsService } from "./automations.service";

@Module({
  imports: [AuditModule],
  controllers: [AutomationsController],
  providers: [AutomationsService],
  exports: [AutomationsService],
})
export class AutomationsModule {}
