import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../auth/auth.types';
import { isAuthSecurityV1Enabled } from '../common/feature-flags';
import { assertPermission } from '../common/permissions';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AcceptInviteDto, InviteUserDto, UpdateUserRoleDto } from './users.dto';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async assertCanInvite(user: JwtPayload) {
    if (!isAuthSecurityV1Enabled()) return;
    if (user.demoUser || user.email === '@mytitan.co.uk') return;
    const db = this.prisma as any;
    const fullUser = await db.user.findFirst({ where: { id: user.sub, companyId: user.companyId } });
    if (!fullUser?.emailVerified) {
      throw new ForbiddenException('Please verify your email before inviting users.');
    }
  }

  @Get()
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  list(@CurrentUser() user: JwtPayload) {
    return this.users.list(user.companyId, user.role);
  }

  @Post('invite')
  @Roles('OWNER', 'ADMIN')
  async invite(
    @CurrentUser() user: JwtPayload,
    @Body() dto: InviteUserDto,
    @Req() req: { requestId?: string; headers?: Record<string, string | string[] | undefined> },
  ) {
    const requestId = String(req.requestId || req.headers?.['x-request-id'] || '').trim() || undefined;
    await assertPermission({
      user,
      permission: 'USER_INVITE',
      audit: this.audit,
      requestId,
      action: 'users.invite',
    });
    await this.assertCanInvite(user);
    return this.users.invite(user.companyId, user.sub, dto);
  }

  @Patch(':id/role')
  @Roles('OWNER')
  async updateRole(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @Req() req: { requestId?: string; headers?: Record<string, string | string[] | undefined> },
  ) {
    const requestId = String(req.requestId || req.headers?.['x-request-id'] || '').trim() || undefined;
    await assertPermission({
      user,
      permission: 'USER_ROLE_ASSIGN',
      audit: this.audit,
      requestId,
      action: 'users.updateRole',
    });
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
