import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { UpsertEmailTemplateDto } from './email-templates.dto';
import { EmailTemplatesService } from './email-templates.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tenant/email-templates')
export class EmailTemplatesController {
  constructor(private readonly emailTemplatesService: EmailTemplatesService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  list(@CurrentUser() user: JwtPayload) {
    return this.emailTemplatesService.list(user.companyId);
  }

  @Get(':id')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  getById(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.emailTemplatesService.getById(user.companyId, id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'STAFF')
  create(@CurrentUser() user: JwtPayload, @Body() dto: UpsertEmailTemplateDto) {
    return this.emailTemplatesService.create(user.companyId, user.sub, dto);
  }

  @Put(':id')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpsertEmailTemplateDto) {
    return this.emailTemplatesService.update(user.companyId, user.sub, id, dto);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.emailTemplatesService.remove(user.companyId, user.sub, id);
  }
}
