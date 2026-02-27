import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FeatureGuard } from '../common/feature.guard';
import { TenantModule } from '../tenant/tenant.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [AuditModule, TenantModule],
  controllers: [AiController],
  providers: [AiService, FeatureGuard],
})
export class AiModule {}
