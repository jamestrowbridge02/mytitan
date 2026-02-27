import { Body, Controller, Get, Param, Post, Query, Res, ServiceUnavailableException } from '@nestjs/common';
import type { Response } from 'express';
import { isMarketplaceEnabled } from '../common/feature-flags';
import { BookingsService } from '../bookings/bookings.service';
import { PublicBookingRequestDto } from '../bookings/dto';

@Controller('public')
export class PublicBookingController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get('booking/:token/config')
  async config(@Param('token') token: string) {
    if (!isMarketplaceEnabled()) {
      throw new ServiceUnavailableException('Feature is not enabled.');
    }
    return this.bookingsService.getPublicConfig(token);
  }

  @Get('booking/:token/slots')
  async slots(@Param('token') token: string, @Query('date') date?: string, @Query('serviceId') serviceId?: string) {
    if (!isMarketplaceEnabled()) {
      throw new ServiceUnavailableException('Feature is not enabled.');
    }
    if (!date || !serviceId) {
      return [];
    }
    return this.bookingsService.getAvailableSlots(token, date, serviceId);
  }

  @Post('booking/:token')
  async create(@Param('token') token: string, @Body() dto: PublicBookingRequestDto) {
    if (!isMarketplaceEnabled()) {
      throw new ServiceUnavailableException('Feature is not enabled.');
    }
    return this.bookingsService.createPublicBooking(token, dto);
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
