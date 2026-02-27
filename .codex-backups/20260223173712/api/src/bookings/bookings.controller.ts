import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { Feature } from '../common/feature.decorator';
import { FeatureGuard } from '../common/feature.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { requireMarketplaceEnabled } from '../common/feature-flags';
import { BookingsService } from './bookings.service';
import { CreateBookingDto, UpdateBookingSettingsDto } from './dto';

@UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @Roles('OWNER', 'ADMIN', 'STAFF')
  @Feature('bookings_enabled')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateBookingDto) {
    return this.bookingsService.create(user.companyId, user.sub, dto);
  }

  @Get()
  @Feature('bookings_enabled')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  list(@CurrentUser() user: JwtPayload, @Query('from') from?: string, @Query('to') to?: string) {
    return this.bookingsService.list(user.companyId, from, to);
  }

  @Get('settings')
  @Feature('bookings_enabled')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  settings(@CurrentUser() user: JwtPayload) {
    requireMarketplaceEnabled();
    return this.bookingsService.getSettings(user.companyId);
  }

  @Post('settings')
  @Feature('bookings_enabled')
  @Roles('OWNER', 'ADMIN')
  updateSettings(@CurrentUser() user: JwtPayload, @Body() dto: UpdateBookingSettingsDto) {
    requireMarketplaceEnabled();
    return this.bookingsService.updateSettings(user.companyId, user.sub, dto);
  }
}
