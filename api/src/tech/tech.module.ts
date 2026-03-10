import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { JobsModule } from '../jobs/jobs.module';
import { TechController } from './tech.controller';
import { TechService } from './tech.service';

@Module({
  imports: [JobsModule, EventsModule],
  controllers: [TechController],
  providers: [TechService],
})
export class TechModule {}
