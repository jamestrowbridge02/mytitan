import { BadRequestException, Body, Controller, Get, Headers, HttpException, HttpStatus, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import * as crypto from 'crypto';
import type { Request } from 'express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { requireNotificationsV1Enabled } from '../common/feature-flags';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import {
  DispatchSummaryEmailsDto,
  MarkAllNotificationsReadDto,
  MarkNotificationReadDto,
  SubmitWorkspaceSupportRequestDto,
  UpdateNotificationPreferenceDto,
} from './dto';
import { NotificationsService } from './notifications.service';

@Controller('t')
export class NotificationTrackingController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('c/:id')
  async click(@Param('id') id: string, @Res() res: Response) {
    const destination = await this.notifications.trackEmailClick(id);
    return res.redirect(destination);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  private readonly supportRequestBuckets = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly notifications: NotificationsService) {}

  private hashSegment(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
  }

  private supportBucketKey(req: Request, userId: string) {
    return `support:${this.hashSegment(String(req.ip || 'unknown'))}:${this.hashSegment(userId)}`;
  }

  private enforceSupportRateLimit(req: Request, userId: string, limit: number, windowMs: number) {
    const key = this.supportBucketKey(req, userId);
    const now = Date.now();
    const current = this.supportRequestBuckets.get(key);
    if (!current || current.resetAt <= now) {
      this.supportRequestBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    if (current.count >= limit) {
      throw new HttpException('Too many attempts. Please wait a moment and try again.', HttpStatus.TOO_MANY_REQUESTS);
    }
    current.count += 1;
    this.supportRequestBuckets.set(key, current);
  }

  @Get()
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  list(@CurrentUser() user: JwtPayload) {
    requireNotificationsV1Enabled();
    return this.notifications.listRecent(user.companyId, user.sub, 30);
  }

  @Get('entity')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  listByEntity(
    @CurrentUser() user: JwtPayload,
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
  ) {
    requireNotificationsV1Enabled();
    if (!entityType || !entityId) {
      throw new BadRequestException('entityType and entityId are required');
    }
    return this.notifications.listByEntity(user.companyId, entityType, entityId);
  }

  @Get('comms')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  listComms(
    @CurrentUser() user: JwtPayload,
    @Query('scope') scope?: string,
    @Query('since') since?: string,
    @Query('reasonKey') reasonKey?: string,
    @Query('reasonKeyPrefix') reasonKeyPrefix?: string,
    @Query('status') status?: string,
    @Query('aggregate') aggregate?: string,
    @Query('limit') limit?: string,
  ) {
    requireNotificationsV1Enabled();
    const scopeValue = String(scope || '').trim();
    if (scopeValue !== 'tenant') {
      throw new BadRequestException('scope=tenant is required');
    }

    const normalize = (value?: string) => String(value || '').trim();
    const isValidToken = (value: string) => /^[a-z0-9_.:-]+$/i.test(value);
    const maxLen = 64;
    const reasonKeyValue = normalize(reasonKey);
    const reasonKeyPrefixValue = normalize(reasonKeyPrefix);
    const statusValue = normalize(status);
    const aggregateValue = normalize(aggregate);

    if (reasonKeyValue && reasonKeyPrefixValue) {
      throw new BadRequestException('reasonKey and reasonKeyPrefix are mutually exclusive');
    }

    if (reasonKeyValue && (reasonKeyValue.length > maxLen || !isValidToken(reasonKeyValue))) {
      throw new BadRequestException('reasonKey is invalid');
    }

    if (reasonKeyPrefixValue && (reasonKeyPrefixValue.length > maxLen || !isValidToken(reasonKeyPrefixValue))) {
      throw new BadRequestException('reasonKeyPrefix is invalid');
    }

    if (statusValue && !['queued', 'sent', 'failed'].includes(statusValue)) {
      throw new BadRequestException('status must be queued, sent, or failed');
    }

    let sinceDate: Date;
    if (since) {
      const parsed = new Date(String(since));
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('since must be a valid ISO timestamp');
      }
      sinceDate = parsed;
    } else {
      sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }

    if (aggregateValue) {
      if (aggregateValue !== 'automations') {
        throw new BadRequestException('aggregate must be automations');
      }
      if (reasonKeyValue || reasonKeyPrefixValue || statusValue) {
        throw new BadRequestException('reasonKey, reasonKeyPrefix, and status are not supported with aggregate');
      }
      return this.notifications.listCommsAutomationsAggregate(user.companyId, { since: sinceDate });
    }

    return this.notifications.listCommsByTenant(user.companyId, {
      since: sinceDate,
      reasonKey: reasonKeyValue || undefined,
      reasonKeyPrefix: reasonKeyPrefixValue || undefined,
      status: statusValue || undefined,
      take: limit ? Number(limit) : 100,
    });
  }

  @Post('send')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  send(
    @CurrentUser() user: JwtPayload,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body()
    body: {
      entityType?: string;
      entityId?: string;
      templateKey?: string;
      channel?: string;
      note?: string;
      to?: string;
      context?: Record<string, any>;
    },
  ) {
    requireNotificationsV1Enabled();
    if (!body?.entityType || !body?.entityId || !body?.templateKey) {
      throw new BadRequestException('entityType, entityId, templateKey are required');
    }
    const keyValue = String(idempotencyKey || '').trim();
    if (keyValue) {
      const isValid = /^[a-z0-9_.:-]+$/i.test(keyValue);
      if (!isValid || keyValue.length < 6 || keyValue.length > 128) {
        throw new BadRequestException('Idempotency-Key is invalid');
      }
    }
    return this.notifications.sendEntityUpdate(user.companyId, user.sub, {
      entityType: body.entityType,
      entityId: body.entityId,
      templateKey: body.templateKey,
      channel: body.channel,
      note: body.note,
      to: body.to,
      context: body.context,
      idempotencyKey: keyValue || undefined,
    });
  }

  @Get('preferences')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  preferences(@CurrentUser() user: JwtPayload) {
    requireNotificationsV1Enabled();
    return this.notifications.getPreferences(user.companyId, user.sub);
  }

  @Patch('preferences')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  updatePreferences(@CurrentUser() user: JwtPayload, @Body() dto: UpdateNotificationPreferenceDto) {
    requireNotificationsV1Enabled();
    return this.notifications.updatePreferences(user.companyId, user.sub, dto);
  }

  @Get('summaries/readiness')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  summaryReadiness(@CurrentUser() user: JwtPayload) {
    return this.notifications.getSummaryEmailReadiness(user.companyId);
  }

  @Get('ops-alerts/status')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  opsAlertStatus(@CurrentUser() user: JwtPayload) {
    return this.notifications.getOperationalAlertStatus(user.companyId);
  }

  @Post('ops-alerts/smoke')
  @Roles('OWNER', 'ADMIN')
  opsAlertSmoke(@CurrentUser() user: JwtPayload) {
    return this.notifications.sendOperationalAlertSmokeTest(user.companyId);
  }

  @Post('summaries/dispatch')
  @Roles('OWNER', 'ADMIN')
  dispatchSummary(@CurrentUser() user: JwtPayload, @Body() dto: DispatchSummaryEmailsDto) {
    return this.notifications.dispatchWorkspaceSummary({
      companyId: user.companyId,
      actorUserId: user.sub,
      cadence: dto.cadence,
      dryRun: dto.dryRun === true,
      asOf: dto.asOf ? new Date(dto.asOf) : undefined,
    });
  }

  @Patch(':id/read')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  markRead(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: MarkNotificationReadDto) {
    requireNotificationsV1Enabled();
    return this.notifications.markRead(user.companyId, user.sub, id, dto.read ?? true);
  }

  @Patch('read-all')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  markAllRead(@CurrentUser() user: JwtPayload, @Body() dto: MarkAllNotificationsReadDto) {
    requireNotificationsV1Enabled();
    return this.notifications.markAllRead(user.companyId, user.sub, dto.read ?? true);
  }

  @Patch(':id/dismiss')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  dismiss(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    requireNotificationsV1Enabled();
    return this.notifications.dismiss(user.companyId, user.sub, id);
  }

  @Post('support-request')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  submitSupportRequest(
    @Req() req: Request,
    @CurrentUser() user: JwtPayload,
    @Body() dto: SubmitWorkspaceSupportRequestDto,
  ) {
    this.enforceSupportRateLimit(req, user.sub, 6, 15 * 60 * 1000);
    return this.notifications.submitSupportRequest({
      category: dto.category,
      subject: dto.subject,
      message: dto.message,
      requesterEmail: dto.callbackEmail || user.email,
      requesterName: user.email,
      companyId: user.companyId,
      userId: user.sub,
      route: 'workspace',
    });
  }
}
