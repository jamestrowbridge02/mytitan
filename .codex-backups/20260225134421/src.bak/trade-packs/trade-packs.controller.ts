import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { isTradePacksEnabled, requireTradePacksEnabled } from '../common/feature-flags';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TradePackMutationDto } from './trade-packs.dto';
import { TradePacksService } from './trade-packs.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('trade-packs')
export class TradePacksController {
  constructor(private readonly tradePacks: TradePacksService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async list(@CurrentUser() user: JwtPayload) {
    if (!isTradePacksEnabled()) {
      return [];
    }
    return this.tradePacks.listAvailable(user.companyId);
  }

  @Get('installed')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  installed(@CurrentUser() user: JwtPayload) {
    if (!isTradePacksEnabled()) {
      return { items: [], count: 0 };
    }
    return this.tradePacks.getInstalled(user.companyId);
  }

  @Post('install')
  @Roles('OWNER', 'ADMIN')
  install(@CurrentUser() user: JwtPayload, @Body() dto: TradePackMutationDto) {
    requireTradePacksEnabled();
    return this.tradePacks.install(user.companyId, user.sub, dto.packCode);
  }

  @Post('uninstall')
  @Roles('OWNER', 'ADMIN')
  uninstall(@CurrentUser() user: JwtPayload, @Body() dto: TradePackMutationDto) {
    requireTradePacksEnabled();
    return this.tradePacks.uninstall(user.companyId, user.sub, dto.packCode);
  }
}
