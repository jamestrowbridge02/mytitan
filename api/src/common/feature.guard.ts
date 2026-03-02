import { CanActivate, ExecutionContext, ForbiddenException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { DEFAULT_PLAN_CODE, PLAN_DEFINITIONS } from '../billing/billing.constants';
import { isBillingEnforced } from './billing-mode';
import { FEATURE_KEY } from './feature.decorator';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const feature = this.reflector.get<string>(FEATURE_KEY, context.getHandler());
    if (!feature) return true;

    const req = context.switchToHttp().getRequest();
    const tenantId = req?.user?.companyId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant not found');
    }

    const settings = await this.tenantService.ensureTenantSettings(tenantId);

    const flagMap: Record<string, boolean | undefined> = {
      bookings_enabled: settings.bookingsEnabled,
      accounting_enabled: settings.accountingEnabled,
      payments_enabled: settings.paymentsEnabled,
      social_enabled: settings.socialEnabled,
      ai_enabled: settings.aiEnabled,
    };

    const featureFlag = flagMap[feature];
    if (featureFlag === false) {
      throw new ForbiddenException(`Feature '${feature}' is disabled for this tenant`);
    }

    const db = this.prisma as any;
    const subscription = await db.tenantSubscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });
    if (!isBillingEnforced()) {
      return true;
    }

    if (subscription && subscription.status && !['active', 'trialing'].includes(subscription.status)) {
      throw new HttpException(
        'Subscription is inactive. Please renew or upgrade to access this feature.',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    let planFeatures = subscription?.plan?.featuresJson;
    if (!planFeatures && settings.planId) {
      const plan = await db.plan.findUnique({ where: { id: settings.planId } });
      planFeatures = plan?.featuresJson;
    }
    const effectiveFeatures = (planFeatures ?? PLAN_DEFINITIONS[DEFAULT_PLAN_CODE].features) as Record<string, any>;
    const planAllows = effectiveFeatures?.[feature] !== undefined ? Boolean(effectiveFeatures[feature]) : false;

    if (!planAllows) {
      throw new HttpException(`Upgrade required to enable '${feature}'.`, HttpStatus.PAYMENT_REQUIRED);
    }

    return true;
  }
}
