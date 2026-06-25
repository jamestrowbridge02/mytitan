import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ReviewTradeApplicationDto, TradeApplicationSettingsDto } from './dto';
import { TradeAccountsService } from './trade-accounts.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('trade-account-applications')
export class TradeApplicationsController {
  constructor(private readonly tradeAccountsService: TradeAccountsService) {}

  @Get('settings')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  settings(@CurrentUser() user: JwtPayload) {
    return this.tradeAccountsService.getApplicationSettings(user.companyId);
  }

  @Patch('settings')
  @Roles('OWNER', 'ADMIN')
  updateSettings(@CurrentUser() user: JwtPayload, @Body() dto: TradeApplicationSettingsDto) {
    return this.tradeAccountsService.updateApplicationSettings(user.companyId, user.sub, dto);
  }

  @Get()
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  list(@CurrentUser() user: JwtPayload) {
    return this.tradeAccountsService.listApplications(user.companyId);
  }

  @Post(':applicationId/review')
  @Roles('OWNER', 'ADMIN')
  review(@CurrentUser() user: JwtPayload, @Param('applicationId') applicationId: string, @Body() dto: ReviewTradeApplicationDto) {
    return this.tradeAccountsService.reviewApplication(user.companyId, user.sub, applicationId, dto);
  }
}
