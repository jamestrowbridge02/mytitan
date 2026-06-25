import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { isGeneratedWorkspaceIdentity, isPublicSignupHost } from '../auth/signup-hygiene';
import { AuditService } from '../audit/audit.service';
import { isLocationsV1Enabled } from '../common/feature-flags';
import { getPermissionSnapshot } from '../common/permissions';
import { isPlatformAdminUser } from '../common/platform-admin';
import { LocationsService } from '../locations/locations.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly locationsService: LocationsService,
    private readonly tenantService: TenantService,
  ) {}

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return {
      ...user,
      platformAdmin: isPlatformAdminUser(user),
      permissions: getPermissionSnapshot(user.role),
    };
  }

  @Get('me/entitlements')
  async entitlements(@CurrentUser() user: JwtPayload) {
    return this.tenantService.getEntitlements(user.companyId);
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

  @Post('me/e2e-cleanup-generated-workspace')
  async cleanupGeneratedWorkspace(@Req() req: Request, @CurrentUser() user: JwtPayload) {
    if (isPublicSignupHost(req.headers['x-forwarded-host'] || req.headers.host)) {
      throw new ForbiddenException('Generated workspace cleanup is unavailable on the live host');
    }
    if (user.role !== 'OWNER') {
      throw new ForbiddenException('Only owners can clean up generated workspaces');
    }

    const db = this.prisma as any;
    const account = await db.user.findFirst({
      where: { id: user.sub, companyId: user.companyId },
      select: {
        id: true,
        email: true,
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!account?.company?.id) {
      throw new BadRequestException('Workspace no longer exists');
    }

    if (!isGeneratedWorkspaceIdentity({ email: account.email, companyName: account.company.name })) {
      throw new ForbiddenException('Only generated test workspaces can be cleaned up here');
    }

    const [customers, customerAccounts, customerApprovals, jobs, quotes, bookings, tradeAccounts] = await Promise.all([
      db.customer.count({ where: { companyId: user.companyId } }),
      db.customerAccount.count({ where: { tenantId: user.companyId } }),
      db.customerApproval.count({ where: { tenantId: user.companyId } }),
      db.job.count({ where: { companyId: user.companyId } }),
      db.quote.count({ where: { tenantId: user.companyId } }),
      db.booking.count({ where: { companyId: user.companyId } }),
      db.tradeAccount.count({ where: { companyId: user.companyId } }),
    ]);

    if (customers || customerAccounts || customerApprovals || jobs || quotes || bookings || tradeAccounts) {
      throw new ForbiddenException('Generated workspace owns business data and cannot be auto-cleaned');
    }

    await db.company.delete({ where: { id: user.companyId } });
    return { ok: true, deleted: true };
  }

}
