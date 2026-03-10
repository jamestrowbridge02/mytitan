import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { PortalService } from './portal.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('portal')
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get('overview')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  overview(@CurrentUser() user: JwtPayload) {
    return this.portal.overview(user.companyId);
  }

  @Post('jobs/:id/link')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  ensureLink(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.portal.ensureJobPortal(user.companyId, user.sub, id);
  }

  @Post('jobs/:id/revoke')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  revoke(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.portal.revokeJobPortal(user.companyId, user.sub, id);
  }

  @Post('jobs/:id/regenerate')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  regenerate(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.portal.regenerateJobPortal(user.companyId, user.sub, id);
  }
}
