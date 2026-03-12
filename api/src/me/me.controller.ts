import { Controller, Get, UseGuards } from '@nestjs/common';
import { Body, Put } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { isLocationsV1Enabled } from '../common/feature-flags';
import { getPermissionSnapshot } from '../common/permissions';
import { LocationsService } from '../locations/locations.service';
import { PrismaService } from '../prisma/prisma.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly locationsService: LocationsService,
  ) {}

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return {
      ...user,
      permissions: getPermissionSnapshot(user.role),
    };
  }

  @Get('me/location')
  async getLocationContext(@CurrentUser() user: JwtPayload) {
    const db = this.prisma as any;
    const locations = isLocationsV1Enabled()
      ? await this.locationsService.getAccessibleLocations(user.companyId, user.sub, user.role)
      : [];
    const me = await db.user.findFirst({
      where: { id: user.sub, companyId: user.companyId },
      select: { defaultLocationId: true, onlyMyLocation: true },
    });
    const availableIds = new Set(locations.map((location: any) => String(location.id)));
    const activeLocationId = me?.defaultLocationId && availableIds.has(String(me.defaultLocationId))
      ? me.defaultLocationId
      : 'all';
    return {
      activeLocationId,
      onlyMyLocation: Boolean(me?.onlyMyLocation),
      available: [{ id: 'all', name: 'All locations', kind: 'GLOBAL' }, ...locations.map((l: any) => ({
        id: l.id,
        name: l.name,
        code: l.code || null,
        kind: l.kind || 'BRANCH',
      }))],
    };
  }

  @Put('me/location')
  async setLocationContext(@CurrentUser() user: JwtPayload, @Body() body: { locationId?: string | null }) {
    if (!isLocationsV1Enabled()) return { activeLocationId: 'all' };
    const db = this.prisma as any;
    const selected = body?.locationId && body.locationId !== 'all' ? String(body.locationId) : null;
    const accessible = await this.locationsService.getAccessibleLocations(user.companyId, user.sub, user.role);
    const accessibleIds = new Set(accessible.map((location: any) => String(location.id)));
    if (selected) {
      if (!accessibleIds.has(selected)) {
        return { activeLocationId: 'all' };
      }
    }
    await db.user.update({
      where: { id: user.sub },
      data: { defaultLocationId: selected },
    });
    await this.audit.log(user.companyId, 'me.location.set', `Set active location context to ${selected || 'all'}`, user.sub);
    return { activeLocationId: selected || 'all' };
  }

}
