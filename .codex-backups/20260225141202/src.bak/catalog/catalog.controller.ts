import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { UpsertCatalogItemDto } from './catalog.dto';
import { CatalogService } from './catalog.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('catalog/items')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  list(@CurrentUser() user: JwtPayload) {
    return this.catalogService.list(user.companyId);
  }

  @Get(':id')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  getById(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.catalogService.getById(user.companyId, id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'STAFF')
  create(@CurrentUser() user: JwtPayload, @Body() dto: UpsertCatalogItemDto) {
    return this.catalogService.create(user.companyId, user.sub, dto);
  }

  @Put(':id')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpsertCatalogItemDto) {
    return this.catalogService.update(user.companyId, user.sub, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.catalogService.remove(user.companyId, user.sub, id);
  }
}
