import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { assertPermission } from '../common/permissions';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { PortalService } from './portal.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('portal')
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get('overview')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async overview(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'portal.manage', action: 'portal.overview' });
    return this.portal.overview(user.companyId);
  }

  @Post('jobs/:id/link')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async ensureLink(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await assertPermission({ user, permission: 'portal.manage', action: 'portal.link' });
    return this.portal.ensureJobPortal(user.companyId, user.sub, id);
  }

  @Post('jobs/:id/revoke')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async revoke(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await assertPermission({ user, permission: 'portal.manage', action: 'portal.revoke' });
    return this.portal.revokeJobPortal(user.companyId, user.sub, id);
  }

  @Post('jobs/:id/regenerate')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async regenerate(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await assertPermission({ user, permission: 'portal.manage', action: 'portal.regenerate' });
    return this.portal.regenerateJobPortal(user.companyId, user.sub, id);
  }
}
