import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_PLAN_CODE } from '../billing/billing.constants';
import { isBillingEnforced } from '../common/billing-mode';
import { isTenantOwnerAllowlisted } from '../common/billing-entitlement';
import { isBillingAllowlisted } from '../common/billing-allowlist';
import { PrismaService } from '../prisma/prisma.service';
import { TRADE_PACKS, TradePackCode, type TradePackDefinition } from './trade-packs.data';

const PACK_LIMITS: Record<string, number> = {
  SOLE_TRADER: 1,
  BUSINESS: 2,
  ENTERPRISE: Number.MAX_SAFE_INTEGER,
};

const PACK_CODE_SET = new Set(TRADE_PACKS.map((pack) => pack.code));

@Injectable()
export class TradePacksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async ensurePackDefinitions() {
    const db = this.prisma as any;
    for (const pack of TRADE_PACKS) {
      await db.tradePack.upsert({
        where: { code: pack.code },
        create: {
          code: pack.code,
          name: pack.name,
          description: pack.description,
          tags: pack.tags,
          version: 1,
          isActive: true,
        },
        update: {
          name: pack.name,
          description: pack.description,
          tags: pack.tags,
          isActive: true,
        },
      });
    }
  }

  private getPackOrThrow(packCode: string): TradePackDefinition {
    const code = String(packCode || '').toUpperCase() as TradePackCode;
    const pack = TRADE_PACKS.find((entry) => entry.code === code);
    if (!pack || !PACK_CODE_SET.has(code)) {
      throw new BadRequestException('Unknown trade pack code.');
    }
    return pack;
  }

  private async getPlanCode(tenantId: string): Promise<string> {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    if (settings?.planId) {
      const plan = await db.plan.findUnique({ where: { id: settings.planId } });
      return plan?.code ?? DEFAULT_PLAN_CODE;
    }

    const subscription = await db.tenantSubscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });
    return subscription?.plan?.code ?? DEFAULT_PLAN_CODE;
  }

  async listAvailable(tenantId: string) {
    await this.ensurePackDefinitions();
    const installed = await this.getInstalled(tenantId);
    const installedMap = new Map(installed.items.map((item: any) => [item.packCode, item]));
    const planCode = await this.getPlanCode(tenantId);
    const limit = PACK_LIMITS[planCode] ?? PACK_LIMITS[DEFAULT_PLAN_CODE];

    return TRADE_PACKS.map((pack) => ({
      code: pack.code,
      name: pack.name,
      description: pack.description,
      tags: pack.tags,
      includes: pack.includes,
      installed: installedMap.has(pack.code),
      planCode,
      planLimit: Number.isFinite(limit) ? limit : null,
    }));
  }

  async getInstalled(tenantId: string) {
    const db = this.prisma as any;
    const installs = await db.tradePackInstall.findMany({
      where: {
        tenantId,
        OR: [{ configJson: null }, { configJson: { path: ['active'], equals: true } }],
      },
      orderBy: { installedAt: 'desc' },
    });

    return {
      items: installs.map((install: any) => ({
        packCode: install.packCode,
        installedAt: install.installedAt,
        installedByUserId: install.installedByUserId,
        configJson: install.configJson,
      })),
      count: installs.length,
    };
  }

  private async assertPlanLimit(tenantId: string, nextPackCode?: string) {
    if (!isBillingEnforced() || await isTenantOwnerAllowlisted(this.prisma, tenantId)) {
      const installed = await this.getInstalled(tenantId);
      return { planCode: 'FREE_ACCESS', limit: Number.MAX_SAFE_INTEGER, installedCount: installed.count };
    }

    const planCode = await this.getPlanCode(tenantId);
    const limit = PACK_LIMITS[planCode] ?? PACK_LIMITS[DEFAULT_PLAN_CODE];
    const installed = await this.getInstalled(tenantId);

    if (nextPackCode && installed.items.some((item: any) => item.packCode === nextPackCode)) {
      return { planCode, limit, installedCount: installed.count };
    }

    if (installed.count >= limit) {
      throw new ForbiddenException(`Your plan supports up to ${limit} trade pack${limit === 1 ? '' : 's'}.`);
    }
    return { planCode, limit, installedCount: installed.count };
  }

  private async seedCatalog(tenantId: string, userId: string, pack: TradePackDefinition) {
    const db = this.prisma as any;
    for (const item of pack.catalogItems) {
      const key = item.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const existing = await db.serviceCatalogItem.findFirst({
        where: {
          tenantId,
          OR: [{ key }, { name: item.name }],
        },
      });
      if (existing) {
        continue;
      }
      await db.serviceCatalogItem.create({
        data: {
          tenantId,
          key,
          name: item.name,
          description: item.description,
          unitPrice: item.unitPrice,
          defaultQty: item.defaultQty,
          durationMinutes: item.durationMinutes,
          capacity: item.capacity,
          active: true,
          vatEligible: false,
        },
      });
      await this.audit.log(tenantId, 'catalog.item.create', `Trade pack seeded catalog item ${item.name}`, userId);
    }
  }

  private async seedTemplatePresets(tenantId: string, pack: TradePackDefinition) {
    const db = this.prisma as any;
    const createPreset = async (type: string, key: string, name: string, dataJson: Record<string, any>) => {
      await db.templatePreset.upsert({
        where: { tenantId_packCode_type_key: { tenantId, packCode: pack.code, type, key } },
        create: {
          tenantId,
          packCode: pack.code,
          type,
          key,
          name,
          dataJson,
          isActive: true,
        },
        update: {
          dataJson,
          name,
          isActive: true,
        },
      });
    };

    for (const entry of pack.catalogItems) {
      await createPreset('CATALOG_ITEM', entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'), entry.name, entry as any);
    }
    for (const entry of pack.pricingPresets) {
      await createPreset('PRICING_PRESET', entry.key, entry.label, entry as any);
    }
    for (const entry of pack.checklist) {
      await createPreset('CHECKLIST', entry.key, entry.title, entry as any);
    }
    for (const entry of pack.emailTemplates) {
      await createPreset('EMAIL_TEMPLATE', entry.key, entry.subject, entry as any);
    }
    for (const entry of pack.pdfTemplates) {
      await createPreset('PDF_TEMPLATE', entry.key, entry.title, entry as any);
    }
    await createPreset('BOOKING_DEFAULTS', `${pack.code.toLowerCase()}_booking`, `${pack.name} booking defaults`, pack.bookingDefaults as any);
    await createPreset('PORTAL_COPY', `${pack.code.toLowerCase()}_portal`, `${pack.name} portal copy`, pack.portalCopy as any);
  }

  private async seedEmailTemplates(tenantId: string, userId: string, pack: TradePackDefinition) {
    const db = this.prisma as any;
    const defaults = [
      {
        type: 'JOB_NOTIFICATION',
        subject: `${pack.name}: Job update`,
        bodyText: pack.portalCopy.intro,
      },
      {
        type: 'INVOICE',
        subject: `${pack.name}: Invoice available`,
        bodyText: pack.portalCopy.paymentNote,
      },
      {
        type: 'BOOKING_CONFIRMATION',
        subject: pack.emailTemplates[0]?.subject ?? `${pack.name} booking confirmed`,
        bodyText: pack.emailTemplates[0]?.bodyText ?? 'Your booking is confirmed.',
      },
    ];

    for (const tpl of defaults) {
      const existing = await db.emailTemplate.findFirst({ where: { tenantId, type: tpl.type } });
      if (existing) continue;
      await db.emailTemplate.create({
        data: {
          tenantId,
          type: tpl.type,
          subject: tpl.subject,
          bodyText: tpl.bodyText,
        },
      });
      await this.audit.log(tenantId, 'email-template.create', `Trade pack seeded template ${tpl.type}`, userId);
    }
  }

  private async seedBookingDefaults(tenantId: string, userId: string, pack: TradePackDefinition) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    const bookingsEnabled = Boolean(settings?.featureBookings ?? settings?.bookingsEnabled);
    if (!bookingsEnabled) {
      return;
    }

    const existingHours = await db.bookingBusinessHour.count({ where: { tenantId } });
    if (existingHours === 0) {
      const startMinute = 9 * 60;
      const endMinute = 17 * 60;
      await db.bookingBusinessHour.createMany({
        data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ tenantId, dayOfWeek, startMinute, endMinute })),
      });
      await this.audit.log(tenantId, 'booking.settings.update', `Trade pack seeded booking defaults (${pack.code})`, userId);
    }
  }

  private async updateTenantDefaults(tenantId: string, pack: TradePackDefinition) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    const existingPresets = Array.isArray(settings?.defaultServiceNamePresets) ? settings.defaultServiceNamePresets : [];
    const merged = Array.from(new Set([...existingPresets, ...pack.catalogItems.map((item) => item.name)]));

    await db.tenantSetting.upsert({
      where: { tenantId },
      create: {
        tenantId,
        defaultServiceNamePresets: merged,
      },
      update: {
        defaultServiceNamePresets: merged,
        onboardingStep: Math.max(Number(settings?.onboardingStep ?? 0), 3),
      },
    });
  }

  async install(tenantId: string, userId: string, packCode: string) {
    const pack = this.getPackOrThrow(packCode);
    await this.ensurePackDefinitions();
    const planMeta = await this.assertPlanLimit(tenantId, pack.code);

    const db = this.prisma as any;
    await db.tradePackInstall.upsert({
      where: { tenantId_packCode: { tenantId, packCode: pack.code } },
      create: {
        tenantId,
        packCode: pack.code,
        installedByUserId: userId,
        configJson: { active: true, version: 1 },
      },
      update: {
        installedByUserId: userId,
        configJson: { active: true, version: 1 },
      },
    });

    await this.seedCatalog(tenantId, userId, pack);
    await this.seedTemplatePresets(tenantId, pack);
    await this.seedEmailTemplates(tenantId, userId, pack);
    await this.seedBookingDefaults(tenantId, userId, pack);
    await this.updateTenantDefaults(tenantId, pack);

    await this.audit.log(tenantId, 'trade-pack.install', `Installed trade pack ${pack.code}`, userId);

    return {
      ok: true,
      packCode: pack.code,
      planCode: planMeta.planCode,
      installedCount: planMeta.installedCount + 1,
      limit: Number.isFinite(planMeta.limit) ? planMeta.limit : null,
    };
  }

  async uninstall(tenantId: string, userId: string, packCode: string) {
    const pack = this.getPackOrThrow(packCode);
    const db = this.prisma as any;

    const existing = await db.tradePackInstall.findUnique({
      where: { tenantId_packCode: { tenantId, packCode: pack.code } },
    });
    if (!existing) {
      return { ok: true, packCode: pack.code, wasInstalled: false };
    }

    await db.tradePackInstall.update({
      where: { tenantId_packCode: { tenantId, packCode: pack.code } },
      data: { configJson: { active: false, version: 1, uninstalledAt: new Date().toISOString() } },
    });

    await db.templatePreset.updateMany({
      where: { tenantId, packCode: pack.code },
      data: { isActive: false },
    });

    await this.audit.log(tenantId, 'trade-pack.uninstall', `Uninstalled trade pack ${pack.code}`, userId);

    return { ok: true, packCode: pack.code, wasInstalled: true };
  }
}
