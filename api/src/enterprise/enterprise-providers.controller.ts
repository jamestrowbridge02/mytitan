import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/auth.guard';
import { JwtPayload } from '../auth/auth.types';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { EnterpriseProvidersService } from './enterprise-providers.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('enterprise/providers')
export class EnterpriseProvidersController {
  constructor(private readonly providers: EnterpriseProvidersService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'FINANCE')
  async list(@CurrentUser() _user: JwtPayload) {
    return this.providers.listSafeDiagnostics();
  }
}
