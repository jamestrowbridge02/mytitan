import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DraftsController } from './drafts.controller';

@Module({
  imports: [PrismaModule],
  controllers: [DraftsController],
})
export class DraftsModule {}
