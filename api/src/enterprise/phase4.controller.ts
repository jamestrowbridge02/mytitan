import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { assertPermission } from '../common/permissions';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { Phase4Service } from './phase4.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('enterprise/phase-4')
export class Phase4Controller {
  constructor(private readonly phase4: Phase4Service) {}

  @Get('overview')
  @Roles('OWNER', 'ADMIN', 'DISPATCHER', 'FINANCE', 'STAFF', 'READ_ONLY')
  async overview(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'phase4.overview' });
    return this.phase4.getOverview(user);
  }

  @Get('record-authority')
  @Roles('OWNER', 'ADMIN', 'DISPATCHER', 'FINANCE', 'STAFF', 'READ_ONLY')
  async recordAuthority(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'phase4.record_authority' });
    return (await this.phase4.getOverview(user)).recordKeeping;
  }

  @Get('maps-routing')
  @Roles('OWNER', 'ADMIN', 'DISPATCHER', 'STAFF', 'READ_ONLY')
  async mapsRouting(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'phase4.maps_routing' });
    return (await this.phase4.getOverview(user)).mapsRouting;
  }

  @Get('forecasting')
  @Roles('OWNER', 'ADMIN', 'FINANCE', 'STAFF', 'READ_ONLY')
  async forecasting(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'phase4.forecasting' });
    return (await this.phase4.getOverview(user)).forecasting;
  }

  @Get('support-mode')
  @Roles('OWNER', 'ADMIN')
  async supportMode(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'settings.manage', action: 'phase4.support_mode' });
    return (await this.phase4.getOverview(user)).supportMode;
  }
}
