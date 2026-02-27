import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { UsageService } from './usage.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('usage')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get('me')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  me(@CurrentUser() user: JwtPayload) {
    return this.usage.getUsage(user.companyId);
  }
}
