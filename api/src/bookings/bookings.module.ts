import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AutomationsModule } from '../automations/automations.module';
import { FeatureGuard } from '../common/feature.guard';
import { EventsModule } from '../events/events.module';
import { JobsModule } from '../jobs/jobs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TenantModule } from '../tenant/tenant.module';
import { BookingProController } from './booking-pro.controller';
import { BookingConversionService } from './booking-conversion.service';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [AuditModule, TenantModule, NotificationsModule, AutomationsModule, EventsModule, JobsModule],
  controllers: [BookingsController, BookingProController],
  providers: [BookingsService, BookingConversionService, FeatureGuard],
  exports: [BookingsService],
})
export class BookingsModule {}
