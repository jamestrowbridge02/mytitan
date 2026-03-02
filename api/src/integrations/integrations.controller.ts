import { Controller, ForbiddenException, Get, HttpException, HttpStatus, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { isAuthSecurityV1Enabled, isMarketplaceEnabled, requireMarketplaceEnabled } from '../common/feature-flags';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from './integrations.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService, private readonly prisma: PrismaService) {}

  private async assertEmailVerified(user: JwtPayload) {
    if (!isAuthSecurityV1Enabled()) return;
    if (user.demoUser || user.email === '@mytitan.co.uk') return;
    const db = this.prisma as any;
    const fullUser = await db.user.findFirst({ where: { id: user.sub, companyId: user.companyId } });
    if (!fullUser?.emailVerified) {
      throw new ForbiddenException('Please verify your email before connecting integrations.');
    }
  }

  @Get('xero/status')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  statusXero(@CurrentUser() user: JwtPayload) {
    if (!isMarketplaceEnabled()) {
      return { provider: 'XERO', connected: false, allowed: false, enabled: false };
    }
    return this.integrations.getStatus(user.companyId, 'XERO');
  }

  @Post('xero/connect')
  @Roles('OWNER', 'ADMIN')
  async connectXero(@CurrentUser() user: JwtPayload) {
    requireMarketplaceEnabled();
    await this.assertEmailVerified(user);
    return this.integrations.createAuthUrl(user.companyId, 'XERO');
  }

  @Post('xero/disconnect')
  @Roles('OWNER', 'ADMIN')
  disconnectXero(@CurrentUser() user: JwtPayload) {
    requireMarketplaceEnabled();
    return this.integrations.disconnect(user.companyId, 'XERO');
  }

  @Post('xero/sync')
  @Roles('OWNER', 'ADMIN')
  syncXero() {
    throw new HttpException('Xero sync not implemented yet.', HttpStatus.NOT_IMPLEMENTED);
  }

  @Get('qbo/status')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  statusQbo(@CurrentUser() user: JwtPayload) {
    if (!isMarketplaceEnabled()) {
      return { provider: 'QBO', connected: false, allowed: false, enabled: false };
    }
    return this.integrations.getStatus(user.companyId, 'QBO');
  }

  @Post('qbo/connect')
  @Roles('OWNER', 'ADMIN')
  async connectQbo(@CurrentUser() user: JwtPayload) {
    requireMarketplaceEnabled();
    await this.assertEmailVerified(user);
    return this.integrations.createAuthUrl(user.companyId, 'QBO');
  }

  @Post('qbo/disconnect')
  @Roles('OWNER', 'ADMIN')
  disconnectQbo(@CurrentUser() user: JwtPayload) {
    requireMarketplaceEnabled();
    return this.integrations.disconnect(user.companyId, 'QBO');
  }

  @Post('qbo/sync')
  @Roles('OWNER', 'ADMIN')
  syncQbo() {
    throw new HttpException('QuickBooks sync not implemented yet.', HttpStatus.NOT_IMPLEMENTED);
  }

  @Get('google/status')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  statusGoogle(@CurrentUser() user: JwtPayload) {
    if (!isMarketplaceEnabled()) {
      return { provider: 'GOOGLE_CALENDAR', connected: false, allowed: false, enabled: false };
    }
    return this.integrations.getStatus(user.companyId, 'GOOGLE_CALENDAR');
  }

  @Post('google/connect')
  @Roles('OWNER', 'ADMIN')
  async connectGoogle(@CurrentUser() user: JwtPayload) {
    requireMarketplaceEnabled();
    await this.assertEmailVerified(user);
    return this.integrations.createAuthUrl(user.companyId, 'GOOGLE_CALENDAR');
  }

  @Post('google/disconnect')
  @Roles('OWNER', 'ADMIN')
  disconnectGoogle(@CurrentUser() user: JwtPayload) {
    requireMarketplaceEnabled();
    return this.integrations.disconnect(user.companyId, 'GOOGLE_CALENDAR');
  }

  @Post('google/sync')
  @Roles('OWNER', 'ADMIN')
  syncGoogle() {
    throw new HttpException('Google Calendar sync not implemented yet.', HttpStatus.NOT_IMPLEMENTED);
  }
}

@Controller('integrations')
export class IntegrationsCallbackController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get('xero/callback')
  async xeroCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    requireMarketplaceEnabled();
    await this.integrations.handleCallback('XERO', code, state);
    const appUrl = process.env.APP_PUBLIC_URL || 'https://app.mytitan.co.uk';
    res.redirect(`${appUrl}/dashboard/integrations?connected=xero`);
  }

  @Get('qbo/callback')
  async qboCallback(@Query('code') code: string, @Query('state') state: string, @Query('realmId') realmId: string, @Res() res: Response) {
    requireMarketplaceEnabled();
    await this.integrations.handleCallback('QBO', code, state, realmId);
    const appUrl = process.env.APP_PUBLIC_URL || 'https://app.mytitan.co.uk';
    res.redirect(`${appUrl}/dashboard/integrations?connected=qbo`);
  }

  @Get('google/callback')
  async googleCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    requireMarketplaceEnabled();
    await this.integrations.handleCallback('GOOGLE_CALENDAR', code, state);
    const appUrl = process.env.APP_PUBLIC_URL || 'https://app.mytitan.co.uk';
    res.redirect(`${appUrl}/dashboard/integrations?connected=google`);
  }
}
