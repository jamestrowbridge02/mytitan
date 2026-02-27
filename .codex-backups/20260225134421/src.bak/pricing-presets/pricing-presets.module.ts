import { Module } from '@nestjs/common';
import { PricingPresetsController } from './pricing-presets.controller';
import { PricingPresetsService } from './pricing-presets.service';

@Module({
  controllers: [PricingPresetsController],
  providers: [PricingPresetsService],
})
export class PricingPresetsModule {}
