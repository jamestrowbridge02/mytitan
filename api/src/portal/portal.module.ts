import { Module } from '@nestjs/common';
import { AutomationsModule } from '../automations/automations.module';
import { AuditModule } from '../audit/audit.module';
import { BillingModule } from '../billing/billing.module';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

@Module({
  imports: [AuditModule, BillingModule, AutomationsModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
