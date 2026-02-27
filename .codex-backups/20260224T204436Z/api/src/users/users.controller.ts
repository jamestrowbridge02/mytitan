import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { AcceptInviteDto, InviteUserDto, UpdateUserRoleDto } from './users.dto';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  list(@CurrentUser() user: JwtPayload) {
    return this.users.list(user.companyId);
  }

  @Post('invite')
  @Roles('OWNER', 'ADMIN')
  invite(@CurrentUser() user: JwtPayload, @Body() dto: InviteUserDto) {
    return this.users.invite(user.companyId, user.sub, dto);
  }

  @Post('accept-invite')
  @Patch(':id/role')
  @Roles('OWNER')
  updateRole(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateUserRoleDto) {
    return this.users.updateRole(user.companyId, user.sub, id, dto);
  }
}

@Controller('users')
export class UsersPublicController {
  constructor(private readonly users: UsersService) {}

  @Post('accept-invite')
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.users.acceptInvite(dto);
  }
}
