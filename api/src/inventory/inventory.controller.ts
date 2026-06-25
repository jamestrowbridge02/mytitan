import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { featureGate } from '../common/feature-gate';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import {
  AdjustInventoryStockDto,
  AssignTechnicianStockDto,
  AllocateToJobDto,
  CreatePurchaseOrderFromJobDto,
  CreateStockMovementDto,
  ReceiveStockDto,
  ReceivePurchaseOrderDto,
  PurchaseOrderTransitionDto,
  TransferStockDto,
  UpsertInventoryCategoryDto,
  UpsertInventoryLocationDto,
  UpsertPurchaseOrderDto,
  UpsertSupplierItemMappingDto,
  UpsertStockItemDto,
} from './dto';
import { InventoryService } from './inventory.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('items')
  @Roles('OWNER', 'ADMIN', 'DISPATCHER', 'FINANCE', 'STAFF', 'READ_ONLY')
  async items(@CurrentUser() user: JwtPayload, @Query('locationId') locationId?: string, @Query('q') q?: string) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    const fallback = featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'read', fallback: [] });
    if (fallback) return fallback;
    return this.inventoryService.listItems(user.companyId, { locationId, q });
  }

  @Post('items')
  @Roles('OWNER', 'ADMIN')
  async createItem(@CurrentUser() user: JwtPayload, @Body() dto: UpsertStockItemDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'mutation' });
    return this.inventoryService.createItem(user.companyId, user.sub, dto);
  }

  @Patch('items/:id')
  @Roles('OWNER', 'ADMIN')
  async patchItem(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: Partial<UpsertStockItemDto>) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'mutation' });
    return this.inventoryService.patchItem(user.companyId, user.sub, id, dto);
  }

  @Get('levels')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async levels(@CurrentUser() user: JwtPayload, @Query('locationId') locationId?: string) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    const fallback = featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'read', fallback: [] });
    if (fallback) return fallback;
    return this.inventoryService.levels(user.companyId, locationId);
  }

  @Post('movements')
  @Roles('OWNER', 'ADMIN')
  async movements(@CurrentUser() user: JwtPayload, @Body() dto: CreateStockMovementDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'mutation' });
    return this.inventoryService.addMovement(user.companyId, user.sub, dto);
  }

  @Get('movements')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async listMovements(@CurrentUser() user: JwtPayload) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    const fallback = featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'read', fallback: [] });
    if (fallback) return fallback;
    return this.inventoryService.listMovements(user.companyId);
  }

  @Get('purchase-orders')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async purchaseOrders(@CurrentUser() user: JwtPayload, @Query('locationId') locationId?: string) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    const fallback = featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'read', fallback: [] });
    if (fallback) return fallback;
    return this.inventoryService.listPurchaseOrders(user.companyId, locationId);
  }

  @Post('purchase-orders')
  @Roles('OWNER', 'ADMIN', 'DISPATCHER')
  async createPo(@CurrentUser() user: JwtPayload, @Body() dto: UpsertPurchaseOrderDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'mutation' });
    return this.inventoryService.createPurchaseOrder(user.companyId, user.sub, dto);
  }

  @Post('purchase-orders/from-job-need')
  @Roles('OWNER', 'ADMIN', 'DISPATCHER', 'TECHNICIAN')
  async createPoFromJobNeed(@CurrentUser() user: JwtPayload, @Body() dto: CreatePurchaseOrderFromJobDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'mutation' });
    return this.inventoryService.createPurchaseOrderFromJobNeed(user.companyId, user.sub, dto, user);
  }

  @Patch('purchase-orders/:id')
  @Roles('OWNER', 'ADMIN')
  async patchPo(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpsertPurchaseOrderDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'mutation' });
    return this.inventoryService.patchPurchaseOrder(user.companyId, user.sub, id, dto);
  }

  @Post('purchase-orders/:id/submit')
  @Roles('OWNER', 'ADMIN', 'DISPATCHER', 'TECHNICIAN')
  async submitPo(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: PurchaseOrderTransitionDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'mutation' });
    return this.inventoryService.submitPurchaseOrder(user.companyId, user.sub, id, dto);
  }

  @Post('purchase-orders/:id/approve')
  @Roles('OWNER', 'ADMIN')
  async approvePo(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: PurchaseOrderTransitionDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'mutation' });
    return this.inventoryService.approvePurchaseOrder(user.companyId, user.sub, id, dto);
  }

  @Post('purchase-orders/:id/cancel')
  @Roles('OWNER', 'ADMIN')
  async cancelPo(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: PurchaseOrderTransitionDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'mutation' });
    return this.inventoryService.cancelPurchaseOrder(user.companyId, user.sub, id, dto);
  }

  @Post('purchase-orders/:id/receive')
  @Roles('OWNER', 'ADMIN', 'DISPATCHER')
  async receivePo(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: ReceivePurchaseOrderDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'mutation' });
    return this.inventoryService.receivePurchaseOrder(user.companyId, user.sub, id, dto);
  }

  @Get('locations')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async locations(@CurrentUser() user: JwtPayload, @Query('locationId') locationId?: string) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    const fallback = featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'read', fallback: [] });
    if (fallback) return fallback;
    return this.inventoryService.listInventoryLocations(user.companyId, locationId);
  }

  @Post('locations')
  @Roles('OWNER', 'ADMIN', 'DISPATCHER')
  async createLocation(@CurrentUser() user: JwtPayload, @Body() dto: UpsertInventoryLocationDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'mutation' });
    return this.inventoryService.createInventoryLocation(user.companyId, user.sub, dto);
  }

  @Patch('locations/:id')
  @Roles('OWNER', 'ADMIN', 'DISPATCHER')
  async patchLocation(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: Partial<UpsertInventoryLocationDto>) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'mutation' });
    return this.inventoryService.patchInventoryLocation(user.companyId, user.sub, id, dto);
  }

  @Get('stock')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async stock(
    @CurrentUser() user: JwtPayload,
    @Query('inventoryLocationId') inventoryLocationId?: string,
    @Query('locationId') locationId?: string,
    @Query('q') q?: string,
  ) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    const fallback = featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'read', fallback: [] });
    if (fallback) return fallback;
    return this.inventoryService.listStock(user.companyId, { inventoryLocationId, locationId, q });
  }

  @Post('stock/adjust')
  @Roles('OWNER', 'ADMIN', 'DISPATCHER')
  async adjustStock(@CurrentUser() user: JwtPayload, @Body() dto: AdjustInventoryStockDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'mutation' });
    return this.inventoryService.adjustStock(user.companyId, user.sub, dto);
  }

  @Post('items/:id/allocate-to-job')
  @Roles('OWNER', 'ADMIN', 'DISPATCHER')
  async allocate(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: AllocateToJobDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'mutation' });
    return this.inventoryService.allocateToJob(user.companyId, user.sub, id, dto);
  }

  @Get('alerts')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async alerts(@CurrentUser() user: JwtPayload, @Query('locationId') locationId?: string) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    const fallback = featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'read', fallback: [] });
    if (fallback) return fallback;
    return this.inventoryService.lowStockAlerts(user.companyId, locationId);
  }

  @Get('valuation')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async valuation(@CurrentUser() user: JwtPayload) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    const fallback = featureGate({
      enabled: true,
      feature: 'TRUCK_STOCK_V1',
      mode: 'read',
      fallback: { totalValue: 0, items: [] },
    });
    if (fallback) return fallback;
    return this.inventoryService.valuation(user.companyId);
  }

  @Post('items/:id/reorder-draft')
  @Roles('OWNER', 'ADMIN', 'DISPATCHER')
  async reorderDraft(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: { qtyOrdered?: number; locationId?: string }) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'mutation' });
    return this.inventoryService.createReorderDraft(user.companyId, user.sub, id, body?.qtyOrdered, body?.locationId);
  }

  @Get('dashboard')
  @Roles('OWNER', 'ADMIN', 'DISPATCHER', 'FINANCE', 'TECHNICIAN', 'VIEWER', 'STAFF', 'READ_ONLY')
  async dashboard(@CurrentUser() user: JwtPayload) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    return this.inventoryService.dashboard(user.companyId);
  }

  @Get('supplier-bridge/readiness')
  @Roles('OWNER', 'ADMIN', 'DISPATCHER', 'FINANCE', 'STAFF', 'READ_ONLY')
  async supplierBridgeReadiness(@CurrentUser() user: JwtPayload) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    return this.inventoryService.supplierBridgeReadiness();
  }

  @Post('stock/transfer')
  @Roles('OWNER', 'ADMIN', 'DISPATCHER', 'TECHNICIAN')
  async transferStock(@CurrentUser() user: JwtPayload, @Body() dto: TransferStockDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    return this.inventoryService.transferStock(user.companyId, user.sub, dto, user);
  }

  @Post('stock/receive')
  @Roles('OWNER', 'ADMIN', 'DISPATCHER')
  async receiveStock(@CurrentUser() user: JwtPayload, @Body() dto: ReceiveStockDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    return this.inventoryService.receiveStock(user.companyId, user.sub, dto);
  }

  @Post('stock/return')
  @Roles('OWNER', 'ADMIN', 'DISPATCHER', 'TECHNICIAN')
  async returnStock(@CurrentUser() user: JwtPayload, @Body() dto: ReceiveStockDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    return this.inventoryService.returnStock(user.companyId, user.sub, dto, user);
  }

  @Get('technician-assignments')
  @Roles('OWNER', 'ADMIN', 'DISPATCHER', 'STAFF', 'READ_ONLY')
  async technicianAssignments(@CurrentUser() user: JwtPayload) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    return this.inventoryService.listTechnicianAssignments(user.companyId);
  }

  @Post('technician-assignments')
  @Roles('OWNER', 'ADMIN', 'DISPATCHER')
  async assignTechnician(@CurrentUser() user: JwtPayload, @Body() dto: AssignTechnicianStockDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    return this.inventoryService.assignTechnicianStock(user.companyId, user.sub, dto);
  }

  @Get('categories')
  @Roles('OWNER', 'ADMIN', 'DISPATCHER', 'FINANCE', 'TECHNICIAN', 'VIEWER', 'STAFF', 'READ_ONLY')
  async categories(@CurrentUser() user: JwtPayload) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    return this.inventoryService.listCategories(user.companyId);
  }

  @Post('categories')
  @Roles('OWNER', 'ADMIN')
  async upsertCategory(@CurrentUser() user: JwtPayload, @Body() dto: UpsertInventoryCategoryDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    return this.inventoryService.upsertCategory(user.companyId, user.sub, dto);
  }

  @Get('supplier-mappings')
  @Roles('OWNER', 'ADMIN', 'DISPATCHER', 'FINANCE', 'STAFF', 'READ_ONLY')
  async supplierMappings(@CurrentUser() user: JwtPayload, @Query('stockItemId') stockItemId?: string) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    return this.inventoryService.listSupplierMappings(user.companyId, stockItemId);
  }

  @Post('supplier-mappings')
  @Roles('OWNER', 'ADMIN')
  async upsertSupplierMapping(@CurrentUser() user: JwtPayload, @Body() dto: UpsertSupplierItemMappingDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    return this.inventoryService.upsertSupplierMapping(user.companyId, user.sub, dto);
  }
}
