import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BillingController, StripeWebhookController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [AuditModule],
  controllers: [BillingController, StripeWebhookController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
