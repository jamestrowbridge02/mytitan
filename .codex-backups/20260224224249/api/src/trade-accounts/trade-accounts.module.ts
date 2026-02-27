import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { TradeAccountsController } from './trade-accounts.controller';
import { TradeAccountsService } from './trade-accounts.service';

@Module({
  imports: [AuditModule],
  controllers: [TradeAccountsController],
  providers: [TradeAccountsService],
})
export class TradeAccountsModule {}
