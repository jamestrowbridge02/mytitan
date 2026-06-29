import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PlatformBillingStripeConfigService } from './platform-billing-stripe-config.service';
import { PlatformPaymentProviderConfigService } from './platform-payment-provider-config.service';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [PlatformPaymentProviderConfigService, PlatformBillingStripeConfigService],
  exports: [PlatformPaymentProviderConfigService, PlatformBillingStripeConfigService],
})
export class PlatformConfigModule {}
