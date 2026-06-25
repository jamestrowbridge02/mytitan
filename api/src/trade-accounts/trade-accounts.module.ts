import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CrmController } from './crm.controller';
import { TradeAccountsController } from './trade-accounts.controller';
import { PublicTradeController } from './public-trade.controller';
import { TradeApplicationsController } from './trade-applications.controller';
import { TradeAccountsService } from './trade-accounts.service';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [TradeAccountsController, CrmController, PublicTradeController, TradeApplicationsController],
  providers: [TradeAccountsService],
})
export class TradeAccountsModule {}
