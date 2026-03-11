import { Body, Controller, HttpCode, HttpException, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { isLogoutV1Enabled } from '../common/feature-flags';
import { JwtPayload } from './auth.types';
import { JwtAuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { AuthService } from './auth.service';
import { ForgotPasswordDto, LoginDto, ResendVerificationDto, ResetPasswordDto, SignupDto, VerifyEmailDto } from './dto';

@Controller('auth')
export class AuthController {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  private readonly maxRequests = 10;
  private readonly windowMs = 60 * 1000;

  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  private bucketKey(req: Request, scope?: string) {
    return `${req.ip || 'unknown'}:${scope || '*'}`;
  }

  private assertRateLimit(req: Request, scope?: string) {
    if (process.env.MYTITAN_ENABLE_E2E_FIXTURES === '1') {
      return;
    }
    const key = this.bucketKey(req, scope);
    const now = Date.now();
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      this.buckets.delete(key);
      return;
    }
    if (current.count >= this.maxRequests) {
      throw new HttpException('Too many auth attempts. Try again shortly.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private recordRateLimitAttempt(req: Request, scope?: string) {
    if (process.env.MYTITAN_ENABLE_E2E_FIXTURES === '1') {
      return;
    }
    const key = this.bucketKey(req, scope);
    const now = Date.now();
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return;
    }
    current.count += 1;
    this.buckets.set(key, current);
  }

  private clearRateLimit(req: Request, scope?: string) {
    this.buckets.delete(this.bucketKey(req, scope));
  }

  private enforceRateLimit(req: Request, scope?: string) {
    this.assertRateLimit(req, scope);
    this.recordRateLimitAttempt(req, scope);
  }

  @Post('signup')
  signup(@Req() req: Request, @Body() dto: SignupDto) {
    this.enforceRateLimit(req, String(dto?.email || '').trim().toLowerCase());
    return this.auth.signup(dto);
  }

  @Post('login')
  async login(@Req() req: Request, @Body() dto: LoginDto) {
    const scope = String(dto?.email || '').trim().toLowerCase();
    this.assertRateLimit(req, scope);
    try {
      const result = await this.auth.login(dto);
      this.clearRateLimit(req, scope);
      return result;
    } catch (error) {
      this.recordRateLimitAttempt(req, scope);
      throw error;
    }
  }

  @Post('forgot-password')
  @HttpCode(202)
  forgotPassword(@Req() req: Request, @Body() dto: ForgotPasswordDto) {
    this.enforceRateLimit(req, String(dto?.email || '').trim().toLowerCase());
    return this.auth.forgotPassword(dto);
  }

  @Post('reset-password')
  resetPassword(@Req() req: Request, @Body() dto: ResetPasswordDto) {
    this.enforceRateLimit(req);
    return this.auth.resetPassword(dto);
  }

  @Post('verify-email')
  verifyEmail(@Req() req: Request, @Body() dto: VerifyEmailDto) {
    this.enforceRateLimit(req, String(dto?.token || '').slice(0, 24));
    return this.auth.verifyEmail(dto);
  }

  @Post('resend-verification')
  @UseGuards(JwtAuthGuard)
  @HttpCode(202)
  resendVerification(@Req() req: Request, @CurrentUser() user: JwtPayload, @Body() dto: ResendVerificationDto) {
    this.enforceRateLimit(req);
    return this.auth.resendVerificationForUser(user.companyId, user.sub, dto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async logout(@CurrentUser() user: JwtPayload) {
    if (isLogoutV1Enabled()) {
      await this.audit.log(user.companyId, 'auth.logout', 'User signed out', user.sub);
    }
    return { ok: true };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async logoutAll(@CurrentUser() user: JwtPayload) {
    if (isLogoutV1Enabled()) {
      await this.audit.log(user.companyId, 'auth.logout-all.requested', 'User requested sign out all sessions', user.sub);
    }
    return this.auth.signOutAll(user.companyId, user.sub);
  }
}
