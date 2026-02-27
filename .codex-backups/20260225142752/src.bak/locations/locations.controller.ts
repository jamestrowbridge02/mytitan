import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { featureGate } from '../common/feature-gate';
import { isLocationsAdvancedV1Enabled, isLocationsV1Enabled } from '../common/feature-flags';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { UpsertLocationDto } from './dto';
import { LocationsService } from './locations.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  list(@CurrentUser() user: JwtPayload) {
    const fallback = featureGate({ enabled: isLocationsV1Enabled(), feature: 'LOCATIONS_V1', mode: 'read', fallback: [] });
    if (fallback) return fallback;
    return this.locationsService.list(user.companyId);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(@CurrentUser() user: JwtPayload, @Body() dto: UpsertLocationDto) {
    featureGate({ enabled: isLocationsV1Enabled(), feature: 'LOCATIONS_V1', mode: 'mutation' });
    return this.locationsService.create(user.companyId, user.sub, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpsertLocationDto) {
    featureGate({ enabled: isLocationsV1Enabled(), feature: 'LOCATIONS_V1', mode: 'mutation' });
    return this.locationsService.update(user.companyId, user.sub, id, dto);
  }

  @Post(':id/archive')
  @Roles('OWNER', 'ADMIN')
  archive(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    featureGate({ enabled: isLocationsV1Enabled(), feature: 'LOCATIONS_V1', mode: 'mutation' });
    return this.locationsService.archive(user.companyId, user.sub, id);
  }

  @Post('staff-restriction')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  setStaffRestriction(@CurrentUser() user: JwtPayload, @Body() body: { onlyMyLocation?: boolean }) {
    featureGate({ enabled: isLocationsAdvancedV1Enabled(), feature: 'LOCATIONS_ADVANCED_V1', mode: 'mutation' });
    return this.locationsService.setOnlyMyLocation(user.companyId, user.sub, Boolean(body?.onlyMyLocation));
  }
}
