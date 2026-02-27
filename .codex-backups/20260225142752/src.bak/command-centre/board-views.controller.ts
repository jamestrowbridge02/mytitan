import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { featureGate } from '../common/feature-gate';
import { isCommandCentreV2Enabled } from '../common/feature-flags';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('board-views')
export class BoardViewsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async list(@CurrentUser() user: JwtPayload) {
    featureGate({ enabled: isCommandCentreV2Enabled(), feature: 'COMMAND_CENTRE_V2', mode: 'read' });
    const db = this.prisma as any;
    return db.savedBoardView.findMany({
      where: { companyId: user.companyId, userId: user.sub },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() body: { name?: string; filters?: Record<string, any>; isDefault?: boolean; viewType?: string },
  ) {
    featureGate({ enabled: isCommandCentreV2Enabled(), feature: 'COMMAND_CENTRE_V2', mode: 'mutation' });
    const db = this.prisma as any;
    if (body?.isDefault) {
      await db.savedBoardView.updateMany({
        where: { companyId: user.companyId, userId: user.sub },
        data: { isDefault: false },
      });
    }
    return db.savedBoardView.create({
      data: {
        companyId: user.companyId,
        userId: user.sub,
        name: String(body?.name || 'Saved board').slice(0, 80),
        filtersJson: body?.filters || {},
        isDefault: Boolean(body?.isDefault),
        viewType: body?.viewType === 'list' ? 'list' : 'kanban',
      },
    });
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { name?: string; filters?: Record<string, any>; isDefault?: boolean; viewType?: string },
  ) {
    featureGate({ enabled: isCommandCentreV2Enabled(), feature: 'COMMAND_CENTRE_V2', mode: 'mutation' });
    const db = this.prisma as any;
    const existing = await db.savedBoardView.findFirst({ where: { id, companyId: user.companyId, userId: user.sub } });
    if (!existing) return { ok: false, message: 'View not found' };
    if (body?.isDefault) {
      await db.savedBoardView.updateMany({
        where: { companyId: user.companyId, userId: user.sub },
        data: { isDefault: false },
      });
    }
    return db.savedBoardView.update({
      where: { id },
      data: {
        name: body?.name ? String(body.name).slice(0, 80) : undefined,
        filtersJson: body?.filters ?? undefined,
        isDefault: body?.isDefault ?? undefined,
        viewType: body?.viewType ? (body.viewType === 'list' ? 'list' : 'kanban') : undefined,
      },
    });
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    featureGate({ enabled: isCommandCentreV2Enabled(), feature: 'COMMAND_CENTRE_V2', mode: 'mutation' });
    const db = this.prisma as any;
    const existing = await db.savedBoardView.findFirst({ where: { id, companyId: user.companyId, userId: user.sub } });
    if (!existing) return { ok: false, message: 'View not found' };
    await db.savedBoardView.delete({ where: { id } });
    return { ok: true };
  }
}
