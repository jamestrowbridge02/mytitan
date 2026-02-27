import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TradePacksController } from './trade-packs.controller';
import { TradePacksService } from './trade-packs.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [TradePacksController],
  providers: [TradePacksService],
  exports: [TradePacksService],
})
export class TradePacksModule {}
