import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { ApiTokenAuthGuard } from './api-token-auth.guard';
import { IntegrationClientFactory } from './integration-client.factory';
import { IntegrationOrchestrationService } from './integration-orchestration.service';
import { IntegrationPlatformService } from './integration-platform.service';
import { IntegrationsCallbackController, IntegrationsController, IntegrationsInboundWebhookController, IntegrationsPlatformController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({
  imports: [PrismaModule, TenantModule, AuditModule, EmailModule, NotificationsModule],
  controllers: [IntegrationsController, IntegrationsCallbackController, IntegrationsPlatformController, IntegrationsInboundWebhookController],
  providers: [IntegrationsService, IntegrationPlatformService, IntegrationClientFactory, IntegrationOrchestrationService, ApiTokenAuthGuard],
  exports: [IntegrationsService, IntegrationPlatformService, IntegrationClientFactory, IntegrationOrchestrationService, ApiTokenAuthGuard],
})
export class IntegrationsModule {}
