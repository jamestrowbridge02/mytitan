import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { featureGate } from '../common/feature-gate';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { UpsertStockItemDto } from './dto';
import { InventoryService } from './inventory.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('parts')
export class PartsController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async list(@CurrentUser() user: JwtPayload, @Query('q') q?: string, @Query('active') active?: string) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    const fallback = featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'read', fallback: [] });
    if (fallback) return fallback;
    return this.inventoryService.listParts(user.companyId, { q, active });
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  async create(@CurrentUser() user: JwtPayload, @Body() dto: UpsertStockItemDto) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'mutation' });
    return this.inventoryService.createPart(user.companyId, user.sub, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  async patch(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: Partial<UpsertStockItemDto>) {
    await this.inventoryService.assertTruckStockEnabled(user.companyId, user);
    featureGate({ enabled: true, feature: 'TRUCK_STOCK_V1', mode: 'mutation' });
    return this.inventoryService.patchPart(user.companyId, user.sub, id, dto);
  }
}
