import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DocumentControlController } from './document-control.controller';
import { DocumentControlService } from './document-control.service';

@Module({
  imports: [AuditModule],
  controllers: [DocumentControlController],
  providers: [DocumentControlService],
  exports: [DocumentControlService],
})
export class DocumentControlModule {}
