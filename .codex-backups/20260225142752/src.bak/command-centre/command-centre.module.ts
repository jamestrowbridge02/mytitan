import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BoardViewsController } from './board-views.controller';
import { CommandCentreController } from './command-centre.controller';

@Module({
  imports: [PrismaModule],
  controllers: [CommandCentreController, BoardViewsController],
})
export class CommandCentreModule {}
