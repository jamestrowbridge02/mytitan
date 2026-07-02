import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, Query, Req, Res, ServiceUnavailableException } from '@nestjs/common';
import * as crypto from 'crypto';
import type { Request, Response } from 'express';
import { isMarketplaceEnabled } from '../common/feature-flags';
import { BookingsService } from '../bookings/bookings.service';
import { CancelBookingDto, PublicBookingRequestDto, RescheduleBookingDto } from '../bookings/dto';
import { getPublicBookingRateLimit, PUBLIC_BOOKING_RATE_LIMIT_MESSAGE } from './public-booking-rate-limit';

@Controller('public')
export class PublicBookingController {
  private readonly bookingBuckets = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly bookingsService: BookingsService) {}

  private hashSegment(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
  }

  private publicBucketKey(req: Request, token: string, action: string) {
    const ipSegment = this.hashSegment(String(req.ip || 'unknown'));
    const tokenSegment = this.hashSegment(String(token || '').slice(0, 48));
    return `${action}:${ipSegment}:${tokenSegment}`;
  }

  private enforcePublicRateLimit(req: Request, token: string, action: Parameters<typeof getPublicBookingRateLimit>[0]) {
    if (process.env.MYTITAN_ENABLE_E2E_FIXTURES !== '1' && process.env.NODE_ENV === 'test') {
      return;
    }
    const { limit, windowMs } = getPublicBookingRateLimit(action);
    const key = this.publicBucketKey(req, token, action);
    const now = Date.now();
    const current = this.bookingBuckets.get(key);
    if (!current || current.resetAt <= now) {
      this.bookingBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    if (current.count >= limit) {
      throw new HttpException(PUBLIC_BOOKING_RATE_LIMIT_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
    }
    current.count += 1;
    this.bookingBuckets.set(key, current);
  }

  @Get('booking/:token/config')
  async config(
    @Param('token') token: string,
    @Query('tradeAccountId') tradeAccountId?: string,
    @Query('customerEmail') customerEmail?: string,
  ) {
    if (!isMarketplaceEnabled()) {
      throw new ServiceUnavailableException('Feature is not enabled.');
    }
    return this.bookingsService.getPublicConfig(token, { tradeAccountId, customerEmail });
  }

  @Get('booking/:token/slots')
  async slots(
    @Req() req: Request,
    @Param('token') token: string,
    @Query('date') date?: string,
    @Query('serviceId') serviceId?: string,
    @Query('locationId') locationId?: string,
    @Query('staffUserId') staffUserId?: string,
    @Query('tradeAccountId') tradeAccountId?: string,
    @Query('customerEmail') customerEmail?: string,
  ) {
    if (!isMarketplaceEnabled()) {
      throw new ServiceUnavailableException('Feature is not enabled.');
    }
    if (!date || !serviceId) {
      return { slots: [], nextAvailableSlot: null, nextAvailableDate: null, timezone: 'UTC' };
    }
    this.enforcePublicRateLimit(req, token, 'booking-slots');
    return this.bookingsService.getPublicAvailability(token, {
      date,
      serviceId,
      locationId,
      staffUserId,
      tradeAccountId,
      customerEmail,
    });
  }

  @Post('booking/:token')
  async create(@Req() req: Request, @Param('token') token: string, @Body() dto: PublicBookingRequestDto) {
    if (!isMarketplaceEnabled()) {
      throw new ServiceUnavailableException('Feature is not enabled.');
    }
    this.enforcePublicRateLimit(req, token, 'booking-create');
    return this.bookingsService.createPublicBooking(token, dto);
  }

  @Get('booking-status/:token')
  async bookingStatus(@Req() req: Request, @Param('token') token: string) {
    if (!isMarketplaceEnabled()) {
      throw new ServiceUnavailableException('Feature is not enabled.');
    }
    this.enforcePublicRateLimit(req, token, 'booking-status');
    return this.bookingsService.getPublicBookingStatus(token);
  }

  @Get('booking-status/:token/slots')
  async bookingStatusSlots(@Req() req: Request, @Param('token') token: string, @Query('date') date?: string) {
    if (!isMarketplaceEnabled()) {
      throw new ServiceUnavailableException('Feature is not enabled.');
    }
    if (!date) {
      return { slots: [], nextAvailableSlot: null, nextAvailableDate: null, timezone: 'UTC' };
    }
    this.enforcePublicRateLimit(req, token, 'booking-status-slots');
    return this.bookingsService.getPublicBookingStatusAvailability(token, date);
  }

  @Post('booking-status/:token/reschedule')
  async rescheduleBookingStatus(@Req() req: Request, @Param('token') token: string, @Body() dto: RescheduleBookingDto) {
    if (!isMarketplaceEnabled()) {
      throw new ServiceUnavailableException('Feature is not enabled.');
    }
    this.enforcePublicRateLimit(req, token, 'booking-status-reschedule');
    return this.bookingsService.publicRescheduleBooking(token, dto);
  }

  @Post('booking-status/:token/cancel')
  async cancelBookingStatus(@Req() req: Request, @Param('token') token: string, @Body() dto: CancelBookingDto) {
    if (!isMarketplaceEnabled()) {
      throw new ServiceUnavailableException('Feature is not enabled.');
    }
    this.enforcePublicRateLimit(req, token, 'booking-status-cancel');
    return this.bookingsService.publicCancelBooking(token, dto);
  }

  @Post('booking-status/:token/deposit-checkout')
  async depositCheckout(@Req() req: Request, @Param('token') token: string) {
    if (!isMarketplaceEnabled()) {
      throw new ServiceUnavailableException('Feature is not enabled.');
    }
    this.enforcePublicRateLimit(req, token, 'booking-status-deposit');
    return this.bookingsService.restartPublicBookingDepositCheckout(token);
  }

  @Get('booking-status/:token/calendar.ics')
  async bookingIcs(@Param('token') token: string, @Res() res: Response) {
    if (!isMarketplaceEnabled()) {
      throw new ServiceUnavailableException('Feature is not enabled.');
    }
    const ics = await this.bookingsService.getPublicBookingIcs(token);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="booking.ics"');
    res.send(ics);
  }

  @Get('ics/:token')
  async ics(@Param('token') token: string, @Res() res: Response) {
    if (!isMarketplaceEnabled()) {
      throw new ServiceUnavailableException('Feature is not enabled.');
    }
    const ics = await this.bookingsService.getIcsFeed(token);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.send(ics);
  }
}
