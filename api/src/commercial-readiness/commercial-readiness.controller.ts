import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import * as crypto from 'crypto';
import type { Request } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/auth.guard';
import type { JwtPayload } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { assertPlatformAdminAccess } from '../common/platform-admin';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import {
  ModerateMarketingReviewDto,
  SubmitBespokeEnquiryDto,
  SubmitMarketingReviewDto,
  UpdateBespokeEnquiryDto,
} from './commercial-readiness.dto';
import { CommercialReadinessService } from './commercial-readiness.service';

@Controller('public')
export class CommercialReadinessPublicController {
  private readonly enquiryBuckets = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly service: CommercialReadinessService) {}

  private fingerprint(req: Request, email: string) {
    return crypto
      .createHash('sha256')
      .update(`${String(req.ip || 'unknown')}|${String(email || '').trim().toLowerCase()}`)
      .digest('hex');
  }

  private enforceRateLimit(fingerprint: string) {
    const now = Date.now();
    const current = this.enquiryBuckets.get(fingerprint);
    if (!current || current.resetAt <= now) {
      this.enquiryBuckets.set(fingerprint, { count: 1, resetAt: now + 60 * 60 * 1000 });
      return;
    }
    if (current.count >= 3) {
      throw new HttpException('Too many enquiries. Please wait before trying again.', HttpStatus.TOO_MANY_REQUESTS);
    }
    current.count += 1;
    this.enquiryBuckets.set(fingerprint, current);
  }

  @Post('bespoke-account-enquiries')
  @HttpCode(HttpStatus.CREATED)
  createEnquiry(@Req() req: Request, @Body() dto: SubmitBespokeEnquiryDto) {
    const fingerprint = this.fingerprint(req, dto.email);
    this.enforceRateLimit(fingerprint);
    return this.service.createBespokeEnquiry(dto, fingerprint);
  }

  @Get('marketing-reviews')
  listApprovedReviews() {
    return this.service.listApprovedReviews();
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('marketing-reviews')
export class MarketingReviewsController {
  constructor(private readonly service: CommercialReadinessService) {}

  @Post()
  @Roles('OWNER', 'ADMIN')
  submit(@CurrentUser() user: JwtPayload, @Body() dto: SubmitMarketingReviewDto) {
    return this.service.submitReview(user.companyId, user.sub, dto);
  }

  @Get()
  @Roles('OWNER', 'ADMIN')
  list(@CurrentUser() user: JwtPayload) {
    return this.service.listTenantReviews(user.companyId);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('admin/platform/commercial')
export class CommercialReadinessPlatformController {
  constructor(
    private readonly service: CommercialReadinessService,
    private readonly audit: AuditService,
  ) {}

  private assertAccess(user: JwtPayload, req: Request, action: string) {
    return assertPlatformAdminAccess({
      user,
      audit: this.audit,
      requestId: String((req as any).requestId || req.headers['x-request-id'] || '').trim() || undefined,
      action,
    });
  }

  @Get('reviews')
  async listReviews(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Query('status') status?: string,
  ) {
    await this.assertAccess(user, req, 'platform.marketing_reviews.list');
    return this.service.listPlatformReviews(status);
  }

  @Patch('reviews/:id')
  async moderateReview(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: ModerateMarketingReviewDto,
  ) {
    await this.assertAccess(user, req, 'platform.marketing_reviews.moderate');
    return this.service.moderateReview(id, user.sub, dto);
  }

  @Get('enquiries')
  async listEnquiries(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Query('status') status?: string,
  ) {
    await this.assertAccess(user, req, 'platform.bespoke_enquiries.list');
    return this.service.listBespokeEnquiries(status);
  }

  @Patch('enquiries/:id')
  async updateEnquiry(
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateBespokeEnquiryDto,
  ) {
    await this.assertAccess(user, req, 'platform.bespoke_enquiries.update');
    return this.service.updateBespokeEnquiry(id, user.sub, dto);
  }
}
