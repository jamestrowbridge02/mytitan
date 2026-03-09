import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  controllers: [EventsController, ActivityController],
  providers: [EventsService, ActivityService],
  exports: [EventsService, ActivityService],
})
export class EventsModule {}
