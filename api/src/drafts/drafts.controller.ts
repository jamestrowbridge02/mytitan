import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
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

  @Get()
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async list(@CurrentUser() user: JwtPayload) {
    const db = this.prisma as any;
    const [jobs, crm] = await Promise.all([
      db.jobDraft.findMany({
        where: { companyId: user.companyId, userId: user.sub },
        orderBy: { updatedAt: 'desc' },
        take: 30,
      }),
      db.crmDraft.findMany({
        where: { companyId: user.companyId, userId: user.sub },
        orderBy: { updatedAt: 'desc' },
        take: 30,
      }),
    ]);

    const items = [
      ...jobs.map((item: any) => ({
        id: `job:${item.trade}`,
        draftKind: 'JOB',
        trade: item.trade,
        payload: item.payload,
        updatedAt: item.updatedAt,
      })),
      ...crm.map((item: any) => ({
        id: `crm:${item.id}`,
        draftKind: 'CRM_NOTE',
        tradeAccountId: item.tradeAccountId || null,
        payload: item.payload,
        updatedAt: item.updatedAt,
      })),
    ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return { items };
  }

  @Get('latest')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async latest(@CurrentUser() user: JwtPayload, @Query('kind') kind = 'job') {
    const db = this.prisma as any;
    if (String(kind).toLowerCase() === 'job') {
      const item = await db.jobDraft.findFirst({
        where: { companyId: user.companyId, userId: user.sub },
        orderBy: { updatedAt: 'desc' },
      });
      return item
        ? { id: `job:${item.trade}`, draftKind: 'JOB', trade: item.trade, payload: item.payload, updatedAt: item.updatedAt }
        : null;
    }

    const item = await db.crmDraft.findFirst({
      where: { companyId: user.companyId, userId: user.sub },
      orderBy: { updatedAt: 'desc' },
    });
    return item
      ? {
          id: `crm:${item.id}`,
          draftKind: 'CRM_NOTE',
          tradeAccountId: item.tradeAccountId || null,
          payload: item.payload,
          updatedAt: item.updatedAt,
        }
      : null;
  }

  @Get('jobs/:trade')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async getJobDraft(@CurrentUser() user: JwtPayload, @Param('trade') trade: string) {
    const db = this.prisma as any;
    const item = await db.jobDraft.findUnique({
      where: { companyId_userId_trade: { companyId: user.companyId, userId: user.sub, trade: String(trade || 'WHEELS').toUpperCase() } },
    });
    return item || null;
  }

  @Put('jobs')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async upsertJobDraft(@CurrentUser() user: JwtPayload, @Body() body: { trade?: string; payload?: Record<string, any> }) {
    const trade = String(body?.trade || 'WHEELS').toUpperCase();
    const payload = body?.payload || {};
    const db = this.prisma as any;
    return db.jobDraft.upsert({
      where: { companyId_userId_trade: { companyId: user.companyId, userId: user.sub, trade } },
      create: { companyId: user.companyId, userId: user.sub, trade, payload },
      update: { payload, updatedAt: new Date() },
    });
  }

  @Put('crm-note')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async upsertCrmDraft(
    @CurrentUser() user: JwtPayload,
    @Body() body: { tradeAccountId?: string | null; payload?: Record<string, any> },
  ) {
    const db = this.prisma as any;
    const tradeAccountId = body?.tradeAccountId || null;
    const existing = await db.crmDraft.findFirst({
      where: { companyId: user.companyId, userId: user.sub, tradeAccountId },
    });
    if (!existing) {
      return db.crmDraft.create({
        data: {
          companyId: user.companyId,
          userId: user.sub,
          tradeAccountId,
          payload: body?.payload || {},
        },
      });
    }
    return db.crmDraft.update({
      where: { id: existing.id },
      data: { payload: body?.payload || {}, updatedAt: new Date() },
    });
  }

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

  @Put('job')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async saveJobDraftCompat(@CurrentUser() user: JwtPayload, @Body() body: { trade?: string; payload?: Record<string, any> }) {
    return this.upsertJobDraft(user, body);
  }

  @Post('job')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async saveJobDraft(@CurrentUser() user: JwtPayload, @Body() body: { trade?: string; payload?: Record<string, any> }) {
    return this.upsertJobDraft(user, body);
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

  @Put('crm')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async saveCrmDraftCompat(@CurrentUser() user: JwtPayload, @Body() body: { tradeAccountId?: string; payload?: Record<string, any> }) {
    return this.upsertCrmDraft(user, body);
  }

  @Post('crm')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async saveCrmDraft(@CurrentUser() user: JwtPayload, @Body() body: { tradeAccountId?: string; payload?: Record<string, any> }) {
    return this.upsertCrmDraft(user, body);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async deleteDraftById(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    const db = this.prisma as any;
    const [kind, value] = String(id || '').split(':');
    if (kind === 'job' && value) {
      await db.jobDraft.deleteMany({ where: { companyId: user.companyId, userId: user.sub, trade: value.toUpperCase() } });
      return { ok: true };
    }
    if (kind === 'crm' && value) {
      await db.crmDraft.deleteMany({ where: { companyId: user.companyId, userId: user.sub, id: value } });
      return { ok: true };
    }
    return { ok: true };
  }
}
