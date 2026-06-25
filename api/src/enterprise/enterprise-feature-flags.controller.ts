import { BadRequestException, Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/auth.guard';
import { JwtPayload } from '../auth/auth.types';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { EnterpriseFeatureFlagsService } from './enterprise-feature-flags.service';
import { ENTERPRISE_FEATURE_FLAGS, EnterpriseFeatureFlagKey, isEnterpriseFeatureFlagKey } from './enterprise-feature-flags';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('enterprise/feature-flags')
export class EnterpriseFeatureFlagsController {
  constructor(private readonly flags: EnterpriseFeatureFlagsService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'FINANCE', 'STAFF', 'READ_ONLY')
  async list(@CurrentUser() user: JwtPayload) {
    return this.flags.listForTenant(user.companyId, user.sub);
  }

  @Patch()
  @Roles('OWNER', 'ADMIN')
  async update(@CurrentUser() user: JwtPayload, @Body() dto: { key?: string; enabled?: boolean; reason?: string }) {
    if (!isEnterpriseFeatureFlagKey(dto?.key)) {
      throw new BadRequestException('Unknown enterprise feature flag');
    }
    const key = dto.key as EnterpriseFeatureFlagKey;
    if (!ENTERPRISE_FEATURE_FLAGS[key].safeForTenantOverride) {
      throw new BadRequestException('This feature flag is not tenant-configurable');
    }
    await this.flags.upsertOverride({
      tenantId: user.companyId,
      key,
      enabled: dto.enabled === true,
      rolloutPercentage: dto.enabled === true ? 100 : 0,
      reason: dto.reason || 'Workspace booking setting',
      actorUserId: user.sub,
    });
    return this.flags.listForTenant(user.companyId, user.sub);
  }
}
