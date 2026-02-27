import { Controller, Get, UseGuards } from '@nestjs/common';
import { Body, Put } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { isLocationsV1Enabled } from '../common/feature-flags';
import { PrismaService } from '../prisma/prisma.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return user;
  }

  @Get('me/location')
  async getLocationContext(@CurrentUser() user: JwtPayload) {
    const db = this.prisma as any;
    const locations = isLocationsV1Enabled()
      ? await db.location.findMany({
          where: { companyId: user.companyId, isActive: true },
          orderBy: { name: 'asc' },
        })
      : [];
    const me = await db.user.findFirst({
      where: { id: user.sub, companyId: user.companyId },
      select: { defaultLocationId: true, onlyMyLocation: true },
    });
    return {
      activeLocationId: me?.defaultLocationId || 'all',
      onlyMyLocation: Boolean(me?.onlyMyLocation),
      available: [{ id: 'all', name: 'All locations' }, ...locations.map((l: any) => ({ id: l.id, name: l.name }))],
    };
  }

  @Put('me/location')
  async setLocationContext(@CurrentUser() user: JwtPayload, @Body() body: { locationId?: string | null }) {
    if (!isLocationsV1Enabled()) return { activeLocationId: 'all' };
    const db = this.prisma as any;
    const selected = body?.locationId && body.locationId !== 'all' ? String(body.locationId) : null;
    if (selected) {
      const location = await db.location.findFirst({ where: { id: selected, companyId: user.companyId, isActive: true } });
      if (!location) {
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
