import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { isInventoryV1Enabled } from '../common/feature-flags';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { AllocateToJobDto, CreateStockMovementDto, UpsertPurchaseOrderDto, UpsertStockItemDto } from './dto';
import { InventoryService } from './inventory.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('items')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  items(@CurrentUser() user: JwtPayload, @Query('locationId') locationId?: string, @Query('q') q?: string) {
    if (!isInventoryV1Enabled()) return [];
    return this.inventoryService.listItems(user.companyId, { locationId, q });
  }

  @Post('items')
  @Roles('OWNER', 'ADMIN')
  createItem(@CurrentUser() user: JwtPayload, @Body() dto: UpsertStockItemDto) {
    if (!isInventoryV1Enabled()) return { ok: false, message: 'Inventory feature disabled' };
    return this.inventoryService.createItem(user.companyId, user.sub, dto);
  }

  @Patch('items/:id')
  @Roles('OWNER', 'ADMIN')
  patchItem(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: Partial<UpsertStockItemDto>) {
    if (!isInventoryV1Enabled()) return { ok: false, message: 'Inventory feature disabled' };
    return this.inventoryService.patchItem(user.companyId, user.sub, id, dto);
  }

  @Get('levels')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  levels(@CurrentUser() user: JwtPayload, @Query('locationId') locationId?: string) {
    if (!isInventoryV1Enabled()) return [];
    return this.inventoryService.levels(user.companyId, locationId);
  }

  @Post('movements')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  movements(@CurrentUser() user: JwtPayload, @Body() dto: CreateStockMovementDto) {
    if (!isInventoryV1Enabled()) return { ok: false, message: 'Inventory feature disabled' };
    return this.inventoryService.addMovement(user.companyId, user.sub, dto);
  }

  @Get('purchase-orders')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  purchaseOrders(@CurrentUser() user: JwtPayload) {
    if (!isInventoryV1Enabled()) return [];
    return this.inventoryService.listPurchaseOrders(user.companyId);
  }

  @Post('purchase-orders')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  createPo(@CurrentUser() user: JwtPayload, @Body() dto: UpsertPurchaseOrderDto) {
    if (!isInventoryV1Enabled()) return { ok: false, message: 'Inventory feature disabled' };
    return this.inventoryService.createPurchaseOrder(user.companyId, user.sub, dto);
  }

  @Patch('purchase-orders/:id')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  patchPo(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpsertPurchaseOrderDto) {
    if (!isInventoryV1Enabled()) return { ok: false, message: 'Inventory feature disabled' };
    return this.inventoryService.patchPurchaseOrder(user.companyId, user.sub, id, dto);
  }

  @Post('purchase-orders/:id/receive')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  receivePo(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    if (!isInventoryV1Enabled()) return { ok: false, message: 'Inventory feature disabled' };
    return this.inventoryService.receivePurchaseOrder(user.companyId, user.sub, id);
  }

  @Post('items/:id/allocate-to-job')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  allocate(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: AllocateToJobDto) {
    if (!isInventoryV1Enabled()) return { ok: false, message: 'Inventory feature disabled' };
    return this.inventoryService.allocateToJob(user.companyId, user.sub, id, dto);
  }
}

