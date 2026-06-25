import { Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { requireBookingProV1Enabled } from '../common/feature-flags';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { BookingsService } from './bookings.service';
import { BookingAvailabilityQueryDto, CreateBookingProDto, UpdateBookingProSettingsDto, UpsertBookingServiceDto } from './dto';
import { bookingMediaUploadOptions, validateBookingMediaFile } from '../common/tenant-booking-media';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('booking')
export class BookingProController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get('services')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  services(@CurrentUser() user: JwtPayload, @Query('locationId') locationId?: string) {
    requireBookingProV1Enabled();
    return this.bookingsService.listProServices(user.companyId, locationId);
  }

  @Post('services')
  @Roles('OWNER', 'ADMIN')
  createService(@CurrentUser() user: JwtPayload, @Body() dto: UpsertBookingServiceDto) {
    requireBookingProV1Enabled();
    return this.bookingsService.createProService(user.companyId, user.sub, dto);
  }

  @Patch('services/:id')
  @Roles('OWNER', 'ADMIN')
  updateService(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpsertBookingServiceDto) {
    requireBookingProV1Enabled();
    return this.bookingsService.updateProService(user.companyId, user.sub, id, dto);
  }

  @Post('folders/image')
  @Roles('OWNER', 'ADMIN')
  @UseInterceptors(FileInterceptor('file', bookingMediaUploadOptions('folder')))
  async uploadFolderImage(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: any,
    @Body('category') category?: string,
  ) {
    requireBookingProV1Enabled();
    await validateBookingMediaFile(file);
    return this.bookingsService.savePublicFolderImage(user.companyId, user.sub, String(category || ''), file.filename);
  }

  @Get('availability')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  availability(@CurrentUser() user: JwtPayload, @Query() query: BookingAvailabilityQueryDto) {
    requireBookingProV1Enabled();
    return this.bookingsService.getProAvailability(user.companyId, query);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'STAFF')
  createBooking(@CurrentUser() user: JwtPayload, @Body() dto: CreateBookingProDto) {
    requireBookingProV1Enabled();
    return this.bookingsService.createProBooking(user.companyId, user.sub, dto);
  }

  @Get('settings')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  settings(@CurrentUser() user: JwtPayload) {
    requireBookingProV1Enabled();
    return this.bookingsService.getProSettings(user.companyId);
  }

  @Post('settings')
  @Roles('OWNER', 'ADMIN')
  updateSettings(@CurrentUser() user: JwtPayload, @Body() dto: UpdateBookingProSettingsDto) {
    requireBookingProV1Enabled();
    return this.bookingsService.updateProSettings(user.companyId, user.sub, dto);
  }
}
