import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { UsersController, UsersPublicController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuditModule],
  controllers: [UsersController, UsersPublicController],
  providers: [UsersService],
})
export class UsersModule {}
