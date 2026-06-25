import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { featureGate } from '../common/feature-gate';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CreatePurchaseOrderFromJobDto, PurchaseOrderTransitionDto, ReceivePurchaseOrderDto, UpsertPurchaseOrderDto } from './dto';
import { InventoryService } from './inventory.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'DISPATCHER', 'FINANCE', 'STAFF', 'READ_ONLY')
  async list(@CurrentUser() user: JwtPayload, @Query('locationId') locationId?: string) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    const fallback = featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'read', fallback: [] });
    if (fallback) return fallback;
    return this.inventoryService.listPurchaseOrders(user.companyId, locationId);
  }

  @Get('supplier-bridge/readiness')
  @Roles('OWNER', 'ADMIN', 'DISPATCHER', 'FINANCE', 'STAFF', 'READ_ONLY')
  async supplierBridgeReadiness(@CurrentUser() user: JwtPayload) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    return this.inventoryService.supplierBridgeReadiness();
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  async create(@CurrentUser() user: JwtPayload, @Body() dto: UpsertPurchaseOrderDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'mutation' });
    return this.inventoryService.createPurchaseOrder(user.companyId, user.sub, dto);
  }

  @Post('from-job-need')
  @Roles('OWNER', 'ADMIN', 'DISPATCHER', 'TECHNICIAN')
  async createFromJobNeed(@CurrentUser() user: JwtPayload, @Body() dto: CreatePurchaseOrderFromJobDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'mutation' });
    return this.inventoryService.createPurchaseOrderFromJobNeed(user.companyId, user.sub, dto, user);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  async patch(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpsertPurchaseOrderDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'mutation' });
    return this.inventoryService.patchPurchaseOrder(user.companyId, user.sub, id, dto);
  }

  @Post(':id/submit')
  @Roles('OWNER', 'ADMIN', 'DISPATCHER', 'TECHNICIAN')
  async submit(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: PurchaseOrderTransitionDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'mutation' });
    return this.inventoryService.submitPurchaseOrder(user.companyId, user.sub, id, dto);
  }

  @Post(':id/approve')
  @Roles('OWNER', 'ADMIN')
  async approve(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: PurchaseOrderTransitionDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'mutation' });
    return this.inventoryService.approvePurchaseOrder(user.companyId, user.sub, id, dto);
  }

  @Post(':id/cancel')
  @Roles('OWNER', 'ADMIN')
  async cancel(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: PurchaseOrderTransitionDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'mutation' });
    return this.inventoryService.cancelPurchaseOrder(user.companyId, user.sub, id, dto);
  }

  @Post(':id/receive')
  @Roles('OWNER', 'ADMIN', 'DISPATCHER')
  async receive(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: ReceivePurchaseOrderDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'mutation' });
    return this.inventoryService.receivePurchaseOrder(user.companyId, user.sub, id, dto);
  }
}
