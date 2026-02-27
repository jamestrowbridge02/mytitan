import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { PricingPresetsService } from './pricing-presets.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pricing-presets')
export class PricingPresetsController {
  constructor(private readonly pricingPresetsService: PricingPresetsService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  list(@CurrentUser() user: JwtPayload) {
    return this.pricingPresetsService.list(user.companyId);
  }
}
