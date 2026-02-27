import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { requireCrmProV1Enabled } from '../common/feature-flags';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { AddCrmNoteDto, AddCrmTaskDto, CrmSearchQueryDto, PatchCrmAccountDto } from './dto';
import { TradeAccountsService } from './trade-accounts.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('crm/accounts')
export class CrmController {
  constructor(private readonly tradeAccountsService: TradeAccountsService) {}

  @Get('search')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  search(@CurrentUser() user: JwtPayload, @Query() query: CrmSearchQueryDto) {
    requireCrmProV1Enabled();
    return this.tradeAccountsService.crmSearch(user.companyId, query);
  }

  @Get(':id/full')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  full(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    requireCrmProV1Enabled();
    return this.tradeAccountsService.crmFull(user.companyId, id);
  }

  @Post(':id/note')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  addNote(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: AddCrmNoteDto) {
    requireCrmProV1Enabled();
    return this.tradeAccountsService.addCrmNote(user.companyId, user.sub, id, dto);
  }

  @Post(':id/task')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  addTask(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: AddCrmTaskDto) {
    requireCrmProV1Enabled();
    return this.tradeAccountsService.addCrmTask(user.companyId, user.sub, id, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  patch(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: PatchCrmAccountDto) {
    requireCrmProV1Enabled();
    return this.tradeAccountsService.patchCrmAccount(user.companyId, user.sub, id, dto);
  }
}
