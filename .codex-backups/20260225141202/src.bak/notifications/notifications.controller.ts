import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { requireNotificationsV1Enabled } from '../common/feature-flags';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { MarkNotificationReadDto, UpdateNotificationPreferenceDto } from './dto';
import { NotificationsService } from './notifications.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  list(@CurrentUser() user: JwtPayload) {
    requireNotificationsV1Enabled();
    return this.notifications.listRecent(user.companyId, user.sub, 30);
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

  @Patch(':id/read')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  markRead(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: MarkNotificationReadDto) {
    requireNotificationsV1Enabled();
    return this.notifications.markRead(user.companyId, user.sub, id, dto.read ?? true);
  }
}
