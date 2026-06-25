import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { AddTradeAccountNoteDto, TradeAccountsQueryDto, TradePortalInviteDto, UpdateNextActionDto, UpsertTradeAccountDto } from './dto';
import { TradeAccountsService } from './trade-accounts.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('trade-accounts')
export class TradeAccountsController {
  constructor(private readonly tradeAccountsService: TradeAccountsService) {}

  @Post()
  @Roles('OWNER', 'ADMIN', 'STAFF')
  upsert(@CurrentUser() user: JwtPayload, @Body() dto: UpsertTradeAccountDto) {
    return this.tradeAccountsService.upsert(user.companyId, user.sub, dto);
  }

  @Get()
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  list(@CurrentUser() user: JwtPayload, @Query() query: TradeAccountsQueryDto) {
    return this.tradeAccountsService.list(user.companyId, query);
  }

  @Get(':id')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  get(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tradeAccountsService.get(user.companyId, id);
  }

  @Get(':id/timeline')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  timeline(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.tradeAccountsService.timeline(user.companyId, id, Number(page || 1), Number(pageSize || 25));
  }

  @Post(':id/notes')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  addNote(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: AddTradeAccountNoteDto) {
    return this.tradeAccountsService.addNote(user.companyId, user.sub, id, dto);
  }

  @Patch(':id/next-action')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  updateNextAction(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateNextActionDto) {
    return this.tradeAccountsService.updateNextAction(user.companyId, user.sub, id, dto);
  }

  @Get(':id/portal-access')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  portalAccess(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tradeAccountsService.listPortalAccess(user.companyId, id);
  }

  @Post(':id/portal-invite')
  @Roles('OWNER', 'ADMIN')
  portalInvite(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: TradePortalInviteDto) {
    return this.tradeAccountsService.invitePortalContact(user.companyId, user.sub, id, dto);
  }

  @Post(':id/portal-access/:accessId/revoke')
  @Roles('OWNER', 'ADMIN')
  revokePortal(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Param('accessId') accessId: string) {
    return this.tradeAccountsService.revokePortalAccess(user.companyId, user.sub, id, accessId);
  }

}
