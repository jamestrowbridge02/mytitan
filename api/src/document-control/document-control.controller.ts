import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { assertPermission } from '../common/permissions';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { DocumentControlService } from './document-control.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tenant/document-numbering')
export class DocumentControlController {
  constructor(private readonly documents: DocumentControlService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  list(@CurrentUser() user: JwtPayload) {
    return this.documents.list(user.companyId);
  }

  @Patch()
  @Roles('OWNER', 'ADMIN')
  async update(@CurrentUser() user: JwtPayload, @Body() body: Record<string, any>) {
    await assertPermission({ user, permission: 'settings.manage', action: 'document_numbering.update' });
    return this.documents.update(user.companyId, user.sub, body as any);
  }
}
