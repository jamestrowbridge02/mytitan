import { Body, Controller, ForbiddenException, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.types';
import {
  isMarketplaceEnabled,
  isStartHereEnabled,
  isTradePacksEnabled,
  requireMarketplaceEnabled,
  requireStartHereEnabled,
} from '../common/feature-flags';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { IntegrationToggleDto, OnboardingStepDto, SelectTradeDto } from './onboarding.dto';
import { OnboardingService } from './onboarding.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('onboarding')
export class OnboardingController {
  constructor(
    private readonly tenantService: TenantService,
    private readonly onboardingService: OnboardingService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('status')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async status(@CurrentUser() user: JwtPayload) {
    const settings = await this.tenantService.getSettings(user.companyId);
    const checklist = await this.onboardingService.getChecklist(user.companyId);
    return {
      onboardingCompleted: Boolean(settings.onboardingCompleted),
      onboardingStep: Number(settings.onboardingStep ?? 0),
      checklist,
    };
  }

  @Get('trade')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  async trade(@CurrentUser() user: JwtPayload) {
    requireStartHereEnabled();
    return this.onboardingService.getTradeSelection(user.companyId);
  }

  @Post('select-trade')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async selectTrade(@CurrentUser() user: JwtPayload, @Body() dto: SelectTradeDto) {
    requireStartHereEnabled();
    return this.onboardingService.selectTrade(user.companyId, user.sub, dto.trade);
  }

  @Post('step')
  @Roles('OWNER', 'ADMIN', 'STAFF')
  async step(@CurrentUser() user: JwtPayload, @Body() dto: OnboardingStepDto) {
    const step = Number(dto.step);
    const data = dto.data || {};
    const startHereEnabled = isStartHereEnabled();

    if (startHereEnabled && step === 0 && data.trade) {
      await this.onboardingService.selectTrade(user.companyId, user.sub, String(data.trade).toUpperCase() as any);
      return { ok: true, onboardingStep: 1 };
    }

    if (startHereEnabled ? step === 1 : step === 0) {
      await this.tenantService.updateSettings(user.companyId, user.sub, user.role, {
        companyName: data.companyName,
        logoUrl: data.logoUrl,
        brandPrimaryColor: data.brandPrimaryColor,
        brandSecondaryColor: data.brandSecondaryColor,
        brandAccentColor: data.brandAccentColor,
      } as any);
    }

    if (startHereEnabled ? step === 2 : step === 1) {
      await this.tenantService.updateSettings(user.companyId, user.sub, user.role, {
        emailSenderName: data.emailSenderName,
        emailReplyTo: data.emailReplyTo,
      } as any);
    }

    if (!startHereEnabled && step === 2) {
      const packCode = String(data.packCode || '').trim().toUpperCase();
      if (packCode && isTradePacksEnabled()) {
        if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
          throw new ForbiddenException('Only OWNER or ADMIN can install trade packs.');
        }
        await this.onboardingService.selectTrade(user.companyId, user.sub, (packCode === 'MOBILE_TECH' ? 'MOBILE' : packCode) as any);
      }
    }

    if (step === 3) {
      const name = String(data.serviceName || '').trim();
      if (name) {
        const unitPrice = Number(data.unitPrice || 0);
        const defaultQty = Number(data.defaultQty || 1);
        const db = this.prisma as any;
        await db.serviceCatalogItem.create({
          data: {
            tenantId: user.companyId,
            name,
            unitPrice,
            defaultQty,
            active: true,
          },
        });
      }
    }

    if (step === 4) {
      const bookingPublicEnabled = Boolean(data.bookingPublicEnabled);
      await this.tenantService.updateSettings(user.companyId, user.sub, user.role, {
        bookingPublicEnabled,
      } as any);

      if (Array.isArray(data.businessHours)) {
        const db = this.prisma as any;
        await db.bookingBusinessHour.deleteMany({ where: { tenantId: user.companyId } });
        await db.bookingBusinessHour.createMany({
          data: data.businessHours.map((entry: any) => ({
            tenantId: user.companyId,
            dayOfWeek: Number(entry.dayOfWeek),
            startMinute: Number(entry.startMinute),
            endMinute: Number(entry.endMinute),
          })),
        });
      }
    }

    if (step === 5) {
      // Billing step placeholder for now.
    }

    if (step === 6 && Array.isArray(data.integrations)) {
      if (user.role !== 'OWNER' && user.role !== 'ADMIN') {
        throw new ForbiddenException('Only OWNER or ADMIN can enable integrations.');
      }
      for (const entry of data.integrations) {
        if (!entry || typeof entry.key !== 'string') continue;
        await this.onboardingService.toggleIntegration(
          user.companyId,
          user.sub,
          user.role,
          entry.key,
          Boolean(entry.enabled),
        );
      }
    }

    const progress = await this.onboardingService.advanceOnboardingStep(
      user.companyId,
      user.sub,
      user.role,
      step,
    );

    return { ok: true, ...progress };
  }

  @Post('complete')
  @Roles('OWNER', 'ADMIN')
  async complete(@CurrentUser() user: JwtPayload, @Body() _body: any) {
    return this.onboardingService.completeOnboarding(user.companyId, user.sub);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('setup')
export class SetupController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get('checklist')
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  checklist(@CurrentUser() user: JwtPayload) {
    if (!isMarketplaceEnabled()) {
      return { items: [], completedCount: 0, total: 0 };
    }
    return this.onboardingService.getChecklist(user.companyId);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get()
  @Roles('OWNER', 'ADMIN', 'STAFF', 'READ_ONLY')
  list(@CurrentUser() user: JwtPayload) {
    if (!isMarketplaceEnabled()) {
      return [];
    }
    return this.onboardingService.getIntegrations(user.companyId);
  }

  @Patch()
  @Roles('OWNER', 'ADMIN')
  toggle(@CurrentUser() user: JwtPayload, @Body() dto: IntegrationToggleDto) {
    requireMarketplaceEnabled();
    return this.onboardingService.toggleIntegration(
      user.companyId,
      user.sub,
      user.role,
      dto.key as any,
      Boolean(dto.enabled),
    );
  }
}
