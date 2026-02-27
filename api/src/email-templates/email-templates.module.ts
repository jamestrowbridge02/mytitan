import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EmailTemplatesController } from './email-templates.controller';
import { EmailTemplatesService } from './email-templates.service';

@Module({
  imports: [AuditModule],
  controllers: [EmailTemplatesController],
  providers: [EmailTemplatesService],
})
export class EmailTemplatesModule {}
