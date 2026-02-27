import { Body, Controller, HttpCode, HttpException, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { ForgotPasswordDto, LoginDto, ResendVerificationDto, ResetPasswordDto, SignupDto, VerifyEmailDto } from './dto';

@Controller('auth')
export class AuthController {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  private readonly maxRequests = 10;
  private readonly windowMs = 60 * 1000;

  constructor(private readonly auth: AuthService) {}

  private enforceRateLimit(req: Request) {
    const key = `${req.ip || 'unknown'}`;
    const now = Date.now();
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return;
    }
    if (current.count >= this.maxRequests) {
      throw new HttpException('Too many auth attempts. Try again shortly.', HttpStatus.TOO_MANY_REQUESTS);
    }
    current.count += 1;
    this.buckets.set(key, current);
  }

  @Post('signup')
  signup(@Req() req: Request, @Body() dto: SignupDto) {
    this.enforceRateLimit(req);
    return this.auth.signup(dto);
  }

  @Post('login')
  login(@Req() req: Request, @Body() dto: LoginDto) {
    this.enforceRateLimit(req);
    return this.auth.login(dto);
  }

  @Post('forgot-password')
  @HttpCode(202)
  forgotPassword(@Req() req: Request, @Body() dto: ForgotPasswordDto) {
    this.enforceRateLimit(req);
    return this.auth.forgotPassword(dto);
  }

  @Post('reset-password')
  resetPassword(@Req() req: Request, @Body() dto: ResetPasswordDto) {
    this.enforceRateLimit(req);
    return this.auth.resetPassword(dto);
  }

  @Post('verify-email')
  verifyEmail(@Req() req: Request, @Body() dto: VerifyEmailDto) {
    this.enforceRateLimit(req);
    return this.auth.verifyEmail(dto);
  }

  @Post('resend-verification')
  @HttpCode(202)
  resendVerification(@Req() req: Request, @Body() dto: ResendVerificationDto) {
    this.enforceRateLimit(req);
    return this.auth.resendVerification(dto);
  }
}
