import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CheckoutSessionDto } from './billing.dto';
import { BillingService } from './billing.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post('checkout-session')
  @Roles('OWNER')
  createCheckout(@CurrentUser() user: JwtPayload, @Body() dto: CheckoutSessionDto) {
    return this.billing.createCheckoutSession(user.companyId, user.sub, dto.planCode, dto.interval);
  }

  @Get('portal')
  @Roles('OWNER')
  createPortal(@CurrentUser() user: JwtPayload) {
    return this.billing.createBillingPortal(user.companyId, user.sub);
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.billing.getBillingInfo(user.companyId);
  }
}

@Controller()
export class StripeWebhookController {
  constructor(private readonly billing: BillingService) {}

  @Post(['stripe/webhook', 'billing/webhook'])
  async webhook(@Req() req: Request & { rawBody?: Buffer; body?: unknown }) {
    return this.billing.handleStripeWebhook(req);
  }
}
