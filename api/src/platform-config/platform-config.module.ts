import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PlatformPaymentProviderConfigService } from './platform-payment-provider-config.service';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [PlatformPaymentProviderConfigService],
  exports: [PlatformPaymentProviderConfigService],
})
export class PlatformConfigModule {}
