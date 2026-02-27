import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BillingModule } from '../billing/billing.module';
import { BookingsModule } from '../bookings/bookings.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PublicBookingController } from './public-booking.controller';
import { PublicController } from './public.controller';

@Module({
  imports: [PrismaModule, AuditModule, BillingModule, BookingsModule],
  controllers: [PublicController, PublicBookingController],
})
export class PublicModule {}
