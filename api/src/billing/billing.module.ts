import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AutomationsModule } from '../automations/automations.module';
import { EnterpriseModule } from '../enterprise/enterprise.module';
import { EmailModule } from '../email/email.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
import { BillingController, CustomerPaymentWebhookController, StripeConnectWebhookAliasController, StripeWebhookController } from './billing.controller';
import { BillingService } from './billing.service';
import { DocumentControlModule } from '../document-control/document-control.module';

@Module({
  imports: [AuditModule, NotificationsModule, EmailModule, AutomationsModule, IntegrationsModule, EnterpriseModule, PlatformConfigModule, DocumentControlModule],
  controllers: [BillingController, StripeWebhookController, CustomerPaymentWebhookController, StripeConnectWebhookAliasController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
