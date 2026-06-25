import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module';
import { TenantModule } from '../tenant/tenant.module';
import { MeController } from './me.controller';

@Module({
  imports: [LocationsModule, TenantModule],
  controllers: [MeController],
})
export class MeModule {}
