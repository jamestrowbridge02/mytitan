import { Module } from "@nestjs/common";
import { PerformanceModule } from "../performance/performance.module";
import { CompensationController } from "./compensation.controller";
import { CompensationService } from "./compensation.service";

@Module({
  imports: [PerformanceModule],
  controllers: [CompensationController],
  providers: [CompensationService],
  exports: [CompensationService],
})
export class CompensationModule {}
