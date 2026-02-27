import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('drafts')
export class DraftsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('job')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async getJobDrafts(@CurrentUser() user: JwtPayload) {
    const db = this.prisma as any;
    return db.jobDraft.findMany({
      where: { companyId: user.companyId, userId: user.sub },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
  }

  @Post('job')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async saveJobDraft(@CurrentUser() user: JwtPayload, @Body() body: { trade?: string; payload?: Record<string, any> }) {
    const trade = String(body?.trade || 'WHEELS').toUpperCase();
    const payload = body?.payload || {};
    const db = this.prisma as any;
    return db.jobDraft.upsert({
      where: { companyId_userId_trade: { companyId: user.companyId, userId: user.sub, trade } },
      create: { companyId: user.companyId, userId: user.sub, trade, payload },
      update: { payload, updatedAt: new Date() },
    });
  }

  @Delete('job/:trade')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async deleteJobDraft(@CurrentUser() user: JwtPayload, @Param('trade') trade: string) {
    const db = this.prisma as any;
    await db.jobDraft.deleteMany({ where: { companyId: user.companyId, userId: user.sub, trade: String(trade || '').toUpperCase() } });
    return { ok: true };
  }

  @Get('crm')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async getCrmDrafts(@CurrentUser() user: JwtPayload) {
    const db = this.prisma as any;
    return db.crmDraft.findMany({
      where: { companyId: user.companyId, userId: user.sub },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
  }

  @Post('crm')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async saveCrmDraft(@CurrentUser() user: JwtPayload, @Body() body: { tradeAccountId?: string; payload?: Record<string, any> }) {
    const db = this.prisma as any;
    const existing = await db.crmDraft.findFirst({ where: { companyId: user.companyId, userId: user.sub, tradeAccountId: body?.tradeAccountId || null } });
    if (!existing) {
      return db.crmDraft.create({
        data: {
          companyId: user.companyId,
          userId: user.sub,
          tradeAccountId: body?.tradeAccountId || null,
          payload: body?.payload || {},
        },
      });
    }
    return db.crmDraft.update({
      where: { id: existing.id },
      data: { payload: body?.payload || {}, updatedAt: new Date() },
    });
  }
}
