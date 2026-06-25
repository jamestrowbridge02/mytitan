import { Body, Controller, Get, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { assertPermission } from '../common/permissions';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { Phase6BService } from './phase6b.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('phase-6b')
export class Phase6BController {
  constructor(private readonly phase6b: Phase6BService) {}

  @Get('colours')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  colours(@CurrentUser() user: JwtPayload) {
    return this.phase6b.getColours(user.companyId);
  }

  @Patch('colours/:entity/:id')
  @Roles('OWNER', 'ADMIN')
  async updateColour(
    @CurrentUser() user: JwtPayload,
    @Param('entity') entity: string,
    @Param('id') id: string,
    @Body() body: { color?: string | null },
  ) {
    await assertPermission({ user, permission: 'settings.manage', action: 'phase6b.colour.update' });
    return this.phase6b.updateColour(user.companyId, user.sub, entity, id, body?.color);
  }

  @Get('imports')
  @Roles('OWNER', 'ADMIN')
  async imports(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'settings.manage', action: 'phase6b.import.list' });
    return this.phase6b.listImports(user.companyId);
  }

  @Post('imports/preview')
  @Roles('OWNER', 'ADMIN')
  async preview(@CurrentUser() user: JwtPayload, @Body() body: any) {
    await assertPermission({ user, permission: 'settings.manage', action: 'phase6b.import.preview' });
    return this.phase6b.previewImport(user.companyId, user.sub, body || {});
  }

  @Post('imports/:id/commit')
  @Roles('OWNER', 'ADMIN')
  async commit(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await assertPermission({ user, permission: 'settings.manage', action: 'phase6b.import.commit' });
    return this.phase6b.commitImport(user.companyId, user.sub, id);
  }

  @Post('imports/:id/rollback')
  @Roles('OWNER', 'ADMIN')
  async rollback(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await assertPermission({ user, permission: 'settings.manage', action: 'phase6b.import.rollback' });
    return this.phase6b.rollbackImport(user.companyId, user.sub, id);
  }

  @Get('imports/:id/errors.csv')
  @Roles('OWNER', 'ADMIN')
  async errors(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Res() res: Response) {
    await assertPermission({ user, permission: 'settings.manage', action: 'phase6b.import.errors' });
    const csv = await this.phase6b.getErrorReport(user.companyId, id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="mytitan-import-${id}-errors.csv"`);
    return res.send(csv);
  }
}
