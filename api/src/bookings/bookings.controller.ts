import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { Feature } from '../common/feature.decorator';
import { FeatureGuard } from '../common/feature.guard';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { requireMarketplaceEnabled } from '../common/feature-flags';
import { BookingsService } from './bookings.service';
import { CancelBookingDto, ConfirmBookingDto, CreateBookingDto, RescheduleBookingDto, UpdateBookingSettingsDto } from './dto';

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
  list(
    @CurrentUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.bookingsService.list(user.companyId, from, to, locationId);
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

  @Get(':id')
  @Feature('bookings_enabled')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  detail(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.bookingsService.getDetail(user.companyId, id);
  }

  @Post(':id/convert')
  @Feature('bookings_enabled')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  convert(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.bookingsService.convertToJob(user.companyId, user.sub, id);
  }

  @Get(':id/availability')
  @Feature('bookings_enabled')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  availability(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Query('date') date?: string) {
    return this.bookingsService.getBookingAvailability(user.companyId, id, date);
  }

  @Post(':id/confirm')
  @Feature('bookings_enabled')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  confirm(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: ConfirmBookingDto) {
    return this.bookingsService.confirmBooking(user.companyId, user.sub, id, dto);
  }

  @Post(':id/reschedule')
  @Feature('bookings_enabled')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  reschedule(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: RescheduleBookingDto) {
    return this.bookingsService.rescheduleBooking(user.companyId, user.sub, id, dto);
  }

  @Post(':id/cancel')
  @Feature('bookings_enabled')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  cancel(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: CancelBookingDto) {
    return this.bookingsService.cancelBooking(user.companyId, user.sub, id, dto);
  }

}
