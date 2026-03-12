import { Module } from "@nestjs/common";
import { ComplianceModule } from "../compliance/compliance.module";
import { PerformanceController } from "./performance.controller";
import { PerformanceService } from "./performance.service";

@Module({
  imports: [ComplianceModule],
  controllers: [PerformanceController],
  providers: [PerformanceService],
  exports: [PerformanceService],
})
export class PerformanceModule {}
