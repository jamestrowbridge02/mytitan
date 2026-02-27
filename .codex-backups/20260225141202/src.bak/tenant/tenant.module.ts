import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TenantController, TenantPublicAssetsController } from './tenant.controller';
import { TenantService } from './tenant.service';

@Module({
  imports: [AuditModule],
  controllers: [TenantController, TenantPublicAssetsController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}
