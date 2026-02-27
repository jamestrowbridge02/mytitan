import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { IntegrationsController, OnboardingController, SetupController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

@Module({
  imports: [TenantModule, PrismaModule, AuditModule],
  controllers: [OnboardingController, SetupController, IntegrationsController],
  providers: [OnboardingService],
})
export class OnboardingModule {}
