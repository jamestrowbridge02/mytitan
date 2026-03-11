import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { assertPermission } from '../common/permissions';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { TechService } from './tech.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tech')
export class TechController {
  constructor(private readonly tech: TechService) {}

  @Get('queue')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async queue(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'technician.execute', action: 'technician.queue' });
    return this.tech.getMyQueue(user.companyId, user.sub);
  }

  @Post('jobs/:id/start')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async start(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: { note?: string }) {
    await assertPermission({ user, permission: 'technician.execute', action: 'technician.start' });
    return this.tech.advanceAssignedJob(user.companyId, user.sub, id, 'start', body?.note);
  }

  @Post('jobs/:id/complete')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async complete(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: { note?: string }) {
    await assertPermission({ user, permission: 'technician.execute', action: 'technician.complete' });
    return this.tech.advanceAssignedJob(user.companyId, user.sub, id, 'complete', body?.note);
  }

  @Post('jobs/:id/arrive')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async arrive(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: { note?: string }) {
    await assertPermission({ user, permission: 'technician.execute', action: 'technician.arrive' });
    return this.tech.arriveAssignedJob(user.companyId, user.sub, id, body?.note);
  }

  @Post('jobs/:id/note')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async note(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: { note?: string }) {
    await assertPermission({ user, permission: 'technician.execute', action: 'technician.note' });
    return this.tech.addJobNote(user.companyId, user.sub, id, body?.note || '');
  }
}
