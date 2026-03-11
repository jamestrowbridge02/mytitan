import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { ApiTokenAuthGuard } from './api-token-auth.guard';
import { IntegrationPlatformService } from './integration-platform.service';
import { IntegrationsCallbackController, IntegrationsController, IntegrationsPlatformController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({
  imports: [PrismaModule, TenantModule, AuditModule],
  controllers: [IntegrationsController, IntegrationsCallbackController, IntegrationsPlatformController],
  providers: [IntegrationsService, IntegrationPlatformService, ApiTokenAuthGuard],
  exports: [IntegrationsService, IntegrationPlatformService, ApiTokenAuthGuard],
})
export class IntegrationsModule {}
