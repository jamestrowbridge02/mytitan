import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersController, UsersPublicController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuditModule, EmailModule, NotificationsModule],
  controllers: [UsersController, UsersPublicController],
  providers: [UsersService],
})
export class UsersModule {}
