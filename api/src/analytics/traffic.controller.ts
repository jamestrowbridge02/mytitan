import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { assertPermission } from '../common/permissions';
import { AnalyticsService } from './analytics.service';

@Controller('analytics/traffic')
export class TrafficController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly jwt: JwtService,
  ) {}

  private optionalTenantId(req: Request) {
    const header = String(req.headers.authorization || '').trim();
    const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
    if (!token) return null;
    try {
      const decoded = this.jwt.verify<JwtPayload>(token);
      return String(decoded.companyId || '').trim() || null;
    } catch {
      return null;
    }
  }

  @Post()
  async record(@Body() body: Record<string, any>, @Req() req: Request) {
    return this.analytics.recordWebsiteVisit({
      tenantId: this.optionalTenantId(req),
      path: body?.path,
      surface: body?.surface,
      source: body?.source,
      sessionId: body?.sessionId,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('summary')
  async summary(@CurrentUser() user: JwtPayload) {
    await assertPermission({ user, permission: 'dashboard.view_intelligence', action: 'analytics.traffic_summary' });
    return this.analytics.getWebsiteTrafficSummary({ tenantId: user.companyId });
  }
}
