import { Module } from "@nestjs/common";
import { BookingsModule } from "../bookings/bookings.module";
import { EventsModule } from "../events/events.module";
import { JobsModule } from "../jobs/jobs.module";
import { ServicePlansController } from "./service-plans.controller";
import { ServicePlansService } from "./service-plans.service";

@Module({
  imports: [BookingsModule, JobsModule, EventsModule],
  controllers: [ServicePlansController],
  providers: [ServicePlansService],
  exports: [ServicePlansService],
})
export class ServicePlansModule {}
