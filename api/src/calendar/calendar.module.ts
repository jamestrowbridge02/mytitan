import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { CalendarController } from './calendar.controller';
import { SchedulingController } from './scheduling.controller';
import { CalendarService } from './calendar.service';

@Module({
  imports: [NotificationsModule],
  controllers: [CalendarController, SchedulingController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
