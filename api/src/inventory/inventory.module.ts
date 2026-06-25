import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EnterpriseModule } from '../enterprise/enterprise.module';
import { EventsModule } from '../events/events.module';
import { InventoryController } from './inventory.controller';
import { PartsController } from './parts.controller';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { InventoryService } from './inventory.service';
import { InternalOnlySupplierPurchasingProvider } from './supplier-purchasing.provider';

@Module({
  imports: [AuditModule, EventsModule, EnterpriseModule],
  controllers: [InventoryController, PartsController, PurchaseOrdersController],
  providers: [InventoryService, InternalOnlySupplierPurchasingProvider],
  exports: [InventoryService],
})
export class InventoryModule {}
