import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module';
import { MeController } from './me.controller';

@Module({
  imports: [LocationsModule],
  controllers: [MeController],
})
export class MeModule {}
