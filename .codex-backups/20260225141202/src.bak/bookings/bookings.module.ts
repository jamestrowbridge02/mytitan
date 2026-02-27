import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FeatureGuard } from '../common/feature.guard';
import { TenantModule } from '../tenant/tenant.module';
import { BookingProController } from './booking-pro.controller';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

@Module({
  imports: [AuditModule, TenantModule],
  controllers: [BookingsController, BookingProController],
  providers: [BookingsService, FeatureGuard],
  exports: [BookingsService],
})
export class BookingsModule {}
