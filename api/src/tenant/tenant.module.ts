import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EmailModule } from '../email/email.module';
import { RedisModule } from '../redis/redis.module';
import { TenantController, TenantPublicAssetsController } from './tenant.controller';
import { TenantService } from './tenant.service';

@Module({
  imports: [AuditModule, EmailModule, RedisModule],
  controllers: [TenantController, TenantPublicAssetsController],
  providers: [TenantService],
  exports: [TenantService],
})
export class TenantModule {}
