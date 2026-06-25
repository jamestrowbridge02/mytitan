import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { BillingModule } from '../billing/billing.module';
import { EmailModule } from '../email/email.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { EnterpriseModule } from '../enterprise/enterprise.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DevAdminController } from './dev-admin.controller';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';
import { RedisModule } from '../redis/redis.module';
import { TemplatesModule } from '../templates/templates.module';
import { PlatformConfigModule } from '../platform-config/platform-config.module';
import { PlatformAutopilotService } from './platform-autopilot.service';

@Module({
  imports: [RedisModule, PrismaModule, BillingModule, AuditModule, AnalyticsModule, EmailModule, IntegrationsModule, TemplatesModule, EnterpriseModule, PlatformConfigModule],
  controllers: [DevAdminController, PlatformAdminController],
  providers: [PlatformAdminService, PlatformAutopilotService],
})
export class AdminModule {}
