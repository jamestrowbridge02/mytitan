import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { featureGate } from '../common/feature-gate';
import { isInventoryV1Enabled } from '../common/feature-flags';
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
  list(@CurrentUser() user: JwtPayload, @Query('q') q?: string, @Query('active') active?: string) {
    const fallback = featureGate({ enabled: isInventoryV1Enabled(), feature: 'INVENTORY_V1', mode: 'read', fallback: [] });
    if (fallback) return fallback;
    return this.inventoryService.listParts(user.companyId, { q, active });
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'STAFF')
  create(@CurrentUser() user: JwtPayload, @Body() dto: UpsertStockItemDto) {
    featureGate({ enabled: isInventoryV1Enabled(), feature: 'INVENTORY_V1', mode: 'mutation' });
    return this.inventoryService.createPart(user.companyId, user.sub, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  patch(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: Partial<UpsertStockItemDto>) {
    featureGate({ enabled: isInventoryV1Enabled(), feature: 'INVENTORY_V1', mode: 'mutation' });
    return this.inventoryService.patchPart(user.companyId, user.sub, id, dto);
  }
}
