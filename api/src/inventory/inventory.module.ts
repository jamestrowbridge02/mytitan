import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EventsModule } from '../events/events.module';
import { InventoryController } from './inventory.controller';
import { PartsController } from './parts.controller';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [AuditModule, EventsModule],
  controllers: [InventoryController, PartsController, PurchaseOrdersController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
