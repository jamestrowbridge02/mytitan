import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { featureGate } from '../common/feature-gate';
import { isInventoryV1Enabled } from '../common/feature-flags';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ReceivePurchaseOrderDto, UpsertPurchaseOrderDto } from './dto';
import { InventoryService } from './inventory.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  list(@CurrentUser() user: JwtPayload) {
    const fallback = featureGate({ enabled: isInventoryV1Enabled(), feature: 'INVENTORY_V1', mode: 'read', fallback: [] });
    if (fallback) return fallback;
    return this.inventoryService.listPurchaseOrders(user.companyId);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'STAFF')
  create(@CurrentUser() user: JwtPayload, @Body() dto: UpsertPurchaseOrderDto) {
    featureGate({ enabled: isInventoryV1Enabled(), feature: 'INVENTORY_V1', mode: 'mutation' });
    return this.inventoryService.createPurchaseOrder(user.companyId, user.sub, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  patch(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpsertPurchaseOrderDto) {
    featureGate({ enabled: isInventoryV1Enabled(), feature: 'INVENTORY_V1', mode: 'mutation' });
    return this.inventoryService.patchPurchaseOrder(user.companyId, user.sub, id, dto);
  }

  @Post(':id/receive')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  receive(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: ReceivePurchaseOrderDto) {
    featureGate({ enabled: isInventoryV1Enabled(), feature: 'INVENTORY_V1', mode: 'mutation' });
    return this.inventoryService.receivePurchaseOrder(user.companyId, user.sub, id, dto);
  }
}
