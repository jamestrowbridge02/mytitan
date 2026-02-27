import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AutomationsModule } from '../automations/automations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BillingController, StripeWebhookController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [AuditModule, NotificationsModule, AutomationsModule],
  controllers: [BillingController, StripeWebhookController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
