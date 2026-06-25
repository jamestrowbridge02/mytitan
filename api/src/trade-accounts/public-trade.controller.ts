import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SubmitTradeApplicationDto } from './dto';
import { TradeAccountsService } from './trade-accounts.service';

@Controller('public/trade')
export class PublicTradeController {
  constructor(private readonly tradeAccountsService: TradeAccountsService) {}

  @Get('portal/:token')
  portal(@Param('token') token: string) {
    return this.tradeAccountsService.getPublicTradePortal(token);
  }

  @Get('applications/:token')
  applicationConfig(@Param('token') token: string) {
    return this.tradeAccountsService.getPublicApplicationConfig(token);
  }

  @Post('applications/:token')
  submitApplication(@Param('token') token: string, @Body() dto: SubmitTradeApplicationDto) {
    return this.tradeAccountsService.submitPublicApplication(token, dto);
  }

  @Get('application-status/:token')
  applicationStatus(@Param('token') token: string) {
    return this.tradeAccountsService.publicApplicationStatus(token);
  }
}
