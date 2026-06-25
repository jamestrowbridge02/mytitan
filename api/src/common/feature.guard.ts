import { CanActivate, ExecutionContext, ForbiddenException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { DEFAULT_PLAN_CODE, PLAN_DEFINITIONS } from '../billing/billing.constants';
import { isBillingEnforced } from './billing-mode';
import { isBillingAllowlisted } from './billing-allowlist';
import { FEATURE_KEY } from './feature.decorator';

const FEATURE_DISABLED_MESSAGES: Record<string, string> = {
  accounting_enabled: 'Accounting is not turned on for this workspace yet.',
  payments_enabled: 'Payments are not turned on for this workspace yet.',
  social_enabled: 'Social tools are not turned on for this workspace yet.',
  ai_enabled: 'AI help is not turned on for this workspace yet.',
};

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
    if (isBillingAllowlisted(req?.user)) {
      return true;
    }

    const settings = await this.tenantService.ensureTenantSettings(tenantId);

    const flagMap: Record<string, boolean | undefined> = {
      accounting_enabled: settings.featureAccounting ?? settings.accountingEnabled,
      payments_enabled: settings.featurePayments ?? settings.paymentsEnabled,
      social_enabled: settings.featureSocial ?? settings.socialEnabled,
      ai_enabled: settings.featureAI ?? settings.aiEnabled,
    };

    const featureFlag = flagMap[feature];
    if (featureFlag === false) {
      throw new ForbiddenException(FEATURE_DISABLED_MESSAGES[feature] || 'This area is not turned on for this workspace yet.');
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
