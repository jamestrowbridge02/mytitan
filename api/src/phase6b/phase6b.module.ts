import { Module } from '@nestjs/common';
import { Phase6BController } from './phase6b.controller';
import { Phase6BService } from './phase6b.service';

@Module({
  controllers: [Phase6BController],
  providers: [Phase6BService],
})
export class Phase6BModule {}
