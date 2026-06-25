import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { EnterpriseFeatureFlagsController } from './enterprise-feature-flags.controller';
import { EnterpriseFeatureFlagsService } from './enterprise-feature-flags.service';
import { EnterpriseProvidersController } from './enterprise-providers.controller';
import { EnterpriseProvidersService } from './enterprise-providers.service';
import { Phase1KController } from './phase1k.controller';
import { Phase1KService } from './phase1k.service';
import { Phase2Controller } from './phase2.controller';
import { Phase2Service } from './phase2.service';
import { Phase4Controller } from './phase4.controller';
import { Phase4Service } from './phase4.service';
import { Phase9Controller } from './phase9.controller';
import { Phase9Service } from './phase9.service';

@Module({
  imports: [AuditModule, IntegrationsModule],
  controllers: [EnterpriseFeatureFlagsController, EnterpriseProvidersController, Phase1KController, Phase2Controller, Phase4Controller, Phase9Controller],
  providers: [EnterpriseFeatureFlagsService, EnterpriseProvidersService, Phase1KService, Phase2Service, Phase4Service, Phase9Service],
  exports: [EnterpriseFeatureFlagsService, EnterpriseProvidersService, Phase1KService, Phase2Service, Phase4Service, Phase9Service],
})
export class EnterpriseModule {}
