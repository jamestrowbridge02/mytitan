import { Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { BillingService } from "../billing/billing.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenantService } from "../tenant/tenant.service";
import { TradePacksService } from "../trade-packs/trade-packs.service";

const DEFAULT_PRIMARY_COLOR = "#4fd1c5";
const DEFAULT_SECONDARY_COLOR = "#1a1f36";
const GUIDED_SETUP_STEPS = ["trade", "branding", "services", "charging", "payments", "ready"] as const;

const WHEELS_DEFAULT_SERVICES = [
  { key: "diamond_cut", name: "Diamond Cut", unitPrice: 140, vatEligible: true },
  { key: "painted", name: "Painted", unitPrice: 120, vatEligible: true },
  { key: "smart_repair", name: "Smart Repair", unitPrice: 95, vatEligible: true },
  { key: "powder_coat", name: "Powder Coat", unitPrice: 150, vatEligible: true },
  { key: "welding", name: "Welding", unitPrice: 110, vatEligible: true },
  { key: "straightening", name: "Straightening", unitPrice: 85, vatEligible: true },
  { key: "locking_nut_removal", name: "Locking Nut Removal", unitPrice: 45, vatEligible: true },
];

const slugKey = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const normalizeStepList = (value: unknown) =>
  Array.from(
    new Set((Array.isArray(value) ? value : []).map((entry) => String(entry || "").trim()).filter(Boolean)),
  );

@Injectable()
export class GuidedSetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly tenantService: TenantService,
    private readonly tradePacksService: TradePacksService,
    private readonly billingService: BillingService,
  ) {}

  async getStatus(tenantId: string) {
    const db = this.prisma as any;
    const settings = await this.tenantService.getSettings(tenantId);
    const services = await db.serviceCatalogItem.findMany({
      where: { tenantId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });

    const completedSteps = normalizeStepList(settings.guidedSetupCompletedSteps);
    const skippedSteps = normalizeStepList(settings.guidedSetupSkippedSteps);
    const maxStep = GUIDED_SETUP_STEPS.length - 1;
    const currentStepRaw = Number(settings.guidedSetupCurrentStep ?? 0);
    const currentStep = Number.isFinite(currentStepRaw) ? Math.max(0, Math.min(currentStepRaw, maxStep)) : 0;

    return {
      primaryTrade: settings.primaryTrade ?? null,
      currentStep,
      completedSteps,
      skippedSteps,
      completedAt: settings.guidedSetupCompletedAt ?? null,
      guidedSetupCompletedAt: settings.guidedSetupCompletedAt ?? null,
      branding: {
        companyName: settings.companyName ?? null,
        logoUrl: settings.logoUrl ?? null,
        brandPrimaryColor: settings.brandPrimaryColor ?? DEFAULT_PRIMARY_COLOR,
        brandSecondaryColor: settings.brandSecondaryColor ?? DEFAULT_SECONDARY_COLOR,
        brandAccentColor: settings.brandAccentColor ?? settings.brandPrimaryColor ?? DEFAULT_PRIMARY_COLOR,
      },
      supportEmail: settings.emailReplyTo ?? process.env.SUPPORT_EMAIL ?? null,
      supportPhone: settings.supportPhone ?? null,
      chargingDefaults: {
        pricePerWheel: settings.defaultWheelPricingMode === "PER_WHEEL",
        vatEnabled: Boolean(settings.vatEnabledDefault),
        vatRateBps: Number(settings.vatRateBpsDefault ?? 0),
        defaultTorqueSetting: settings.defaultTorqueSetting ?? null,
        defaultTyrePressure: settings.defaultTyrePressure ?? null,
      },
      services: services.map((service: any) => ({
        id: service.id,
        key: service.key,
        name: service.name,
        unitPrice: Number(service.unitPrice ?? 0),
        vatEligible: Boolean(service.vatEligible),
        enabled: Boolean(service.active),
      })),
      stripeConfigured: this.billingService.isStripeConfigured(),
    };
  }

  async reset(tenantId: string, userId: string) {
    const db = this.prisma as any;
    await db.tenantSetting.upsert({
      where: { tenantId },
      update: {
        guidedSetupCurrentStep: 0,
        guidedSetupCompletedSteps: [],
        guidedSetupSkippedSteps: [],
        guidedSetupCompletedAt: null,
      },
      create: {
        tenantId,
        guidedSetupCurrentStep: 0,
        guidedSetupCompletedSteps: [],
        guidedSetupSkippedSteps: [],
        guidedSetupCompletedAt: null,
      },
    });
    await this.audit.log(tenantId, "guided-setup.reset", "Guided setup reset", userId);
    return { ok: true };
  }

  private async ensureWheelsPack(tenantId: string, userId: string) {
    await this.tradePacksService.install(tenantId, userId, "WHEELS");
    const db = this.prisma as any;
    await db.tenantSetting.upsert({
      where: { tenantId },
      update: { primaryTrade: "WHEELS" },
      create: { tenantId, primaryTrade: "WHEELS" },
    });
  }

  private async seedDefaultServices(tenantId: string, userId: string) {
    const db = this.prisma as any;
    for (const service of WHEELS_DEFAULT_SERVICES) {
      const existing = await db.serviceCatalogItem.findFirst({
        where: {
          tenantId,
          OR: [{ key: service.key }, { name: service.name }],
        },
      });
      if (existing) {
        await db.serviceCatalogItem.update({
          where: { id: existing.id },
          data: {
            key: existing.key ?? service.key,
            name: service.name,
            unitPrice: service.unitPrice,
            active: true,
            vatEligible: service.vatEligible,
          },
        });
        continue;
      }
      await db.serviceCatalogItem.create({
        data: {
          tenantId,
          key: service.key,
          name: service.name,
          unitPrice: service.unitPrice,
          defaultQty: 1,
          durationMinutes: 60,
          capacity: 1,
          active: true,
          vatEligible: service.vatEligible,
        },
      });
      await this.audit.log(tenantId, "catalog.item.create", `Guided setup seeded service ${service.name}`, userId);
    }
  }

  private async upsertServices(tenantId: string, userId: string, services: any[]) {
    if (!Array.isArray(services)) return;
    const db = this.prisma as any;
    for (const entry of services) {
      const key = entry.key ? slugKey(entry.key) : slugKey(entry.name);
      const name = String(entry.name || "").trim();
      if (!name) continue;
      const unitPrice = Number(entry.unitPrice ?? 0);
      const vatEligible = Boolean(entry.vatEligible);
      const enabled = entry.enabled !== false;

      const existing = await db.serviceCatalogItem.findFirst({
        where: {
          tenantId,
          OR: [{ key }, { name }],
        },
      });
      if (existing) {
        await db.serviceCatalogItem.update({
          where: { id: existing.id },
          data: {
            key: existing.key ?? key,
            name,
            unitPrice,
            active: enabled,
            vatEligible,
          },
        });
        await this.audit.log(tenantId, "catalog.item.update", `Guided setup updated service ${name}`, userId);
        continue;
      }

      await db.serviceCatalogItem.create({
        data: {
          tenantId,
          key,
          name,
          unitPrice,
          defaultQty: 1,
          durationMinutes: 60,
          capacity: 1,
          active: enabled,
          vatEligible,
        },
      });
      await this.audit.log(tenantId, "catalog.item.create", `Guided setup created service ${name}`, userId);
    }
  }

  async applyStep(tenantId: string, userId: string, role: string, step: number, data: Record<string, any>, skipped: boolean) {
    const db = this.prisma as any;
    const stepKey = GUIDED_SETUP_STEPS[Math.max(0, Math.min(step, GUIDED_SETUP_STEPS.length - 1))] || `step_${step}`;

    if (step === 0) {
      await this.ensureWheelsPack(tenantId, userId);
    }

    if (step === 1) {
      await this.ensureWheelsPack(tenantId, userId);
      if (skipped) {
        const settings = await this.tenantService.getSettings(tenantId);
        await db.tenantSetting.upsert({
          where: { tenantId },
          update: {
            companyName: settings.companyName || "MyTitan",
            brandPrimaryColor: settings.brandPrimaryColor || DEFAULT_PRIMARY_COLOR,
            brandSecondaryColor: settings.brandSecondaryColor || DEFAULT_SECONDARY_COLOR,
            brandAccentColor: settings.brandAccentColor || settings.brandPrimaryColor || DEFAULT_PRIMARY_COLOR,
          },
          create: {
            tenantId,
            companyName: settings.companyName || "MyTitan",
            brandPrimaryColor: settings.brandPrimaryColor || DEFAULT_PRIMARY_COLOR,
            brandSecondaryColor: settings.brandSecondaryColor || DEFAULT_SECONDARY_COLOR,
            brandAccentColor: settings.brandAccentColor || settings.brandPrimaryColor || DEFAULT_PRIMARY_COLOR,
          },
        });
      } else {
        await this.tenantService.updateSettings(tenantId, userId, role, {
          companyName: data.companyName,
          logoUrl: data.logoUrl,
          brandPrimaryColor: data.brandPrimaryColor,
          brandSecondaryColor: data.brandSecondaryColor,
          brandAccentColor: data.brandAccentColor,
          emailSenderName: data.companyName,
          emailReplyTo: data.supportEmail,
          supportPhone: data.supportPhone,
        } as any);
      }
    }

    if (step === 2) {
      if (skipped || data.useDefaults) {
        await this.seedDefaultServices(tenantId, userId);
      } else {
        await this.upsertServices(tenantId, userId, data.services || []);
      }
    }

    if (step === 3) {
      const pricePerWheel = skipped ? true : Boolean(data.pricePerWheel);
      const vatEnabled = skipped ? false : Boolean(data.vatEnabled);
      const vatRateBps = skipped ? 2000 : Math.round(Number(data.vatRate ?? 20) * 100);
      const defaultTorqueSetting = skipped ? null : (data.defaultTorqueSetting ?? null);
      const defaultTyrePressure = skipped ? null : (data.defaultTyrePressure ?? null);

      await db.tenantSetting.upsert({
        where: { tenantId },
        update: {
          defaultWheelPricingMode: pricePerWheel ? "PER_WHEEL" : "SET",
          vatEnabledDefault: vatEnabled,
          vatRateBpsDefault: vatRateBps,
          defaultTorqueSetting,
          defaultTyrePressure,
        },
        create: {
          tenantId,
          defaultWheelPricingMode: pricePerWheel ? "PER_WHEEL" : "SET",
          vatEnabledDefault: vatEnabled,
          vatRateBpsDefault: vatRateBps,
          defaultTorqueSetting,
          defaultTyrePressure,
        },
      });
    }

    if (step === 4) {
      if (this.billingService.isStripeConfigured() && !skipped && data.enablePayments) {
        await this.tenantService.updateSettings(tenantId, userId, role, {
          paymentsEnabled: true,
          featurePayments: true,
        } as any);
      }
    }

    const settings = await this.tenantService.getSettings(tenantId);
    const completedSteps = normalizeStepList(settings.guidedSetupCompletedSteps);
    const skippedSteps = normalizeStepList(settings.guidedSetupSkippedSteps);
    const nextCompletedSteps = skipped ? completedSteps.filter((entry) => entry !== stepKey) : normalizeStepList([...completedSteps, stepKey]);
    const nextSkippedSteps = skipped ? normalizeStepList([...skippedSteps, stepKey]) : skippedSteps.filter((entry) => entry !== stepKey);
    const maxStep = GUIDED_SETUP_STEPS.length - 1;
    const nextStep = Math.max(
      Number(settings.guidedSetupCurrentStep ?? 0),
      Math.min(Math.max(step + 1, 0), maxStep),
    );

    await db.tenantSetting.upsert({
      where: { tenantId },
      update: {
        guidedSetupCurrentStep: nextStep,
        guidedSetupCompletedSteps: nextCompletedSteps,
        guidedSetupSkippedSteps: nextSkippedSteps,
      },
      create: {
        tenantId,
        guidedSetupCurrentStep: nextStep,
        guidedSetupCompletedSteps: nextCompletedSteps,
        guidedSetupSkippedSteps: nextSkippedSteps,
      },
    });

    await this.audit.log(tenantId, "guided-setup.step", `Guided setup step ${step} saved`, userId);
    return { ok: true };
  }

  async complete(tenantId: string, userId: string) {
    const db = this.prisma as any;
    const settings = await this.tenantService.getSettings(tenantId);
    const completedSteps = normalizeStepList([...normalizeStepList(settings.guidedSetupCompletedSteps), "ready"]);
    const skippedSteps = normalizeStepList(settings.guidedSetupSkippedSteps).filter((entry) => entry !== "ready");
    await db.tenantSetting.upsert({
      where: { tenantId },
      update: {
        guidedSetupCurrentStep: GUIDED_SETUP_STEPS.length - 1,
        guidedSetupCompletedSteps: completedSteps,
        guidedSetupSkippedSteps: skippedSteps,
        guidedSetupCompletedAt: new Date(),
      },
      create: {
        tenantId,
        guidedSetupCurrentStep: GUIDED_SETUP_STEPS.length - 1,
        guidedSetupCompletedSteps: completedSteps,
        guidedSetupSkippedSteps: skippedSteps,
        guidedSetupCompletedAt: new Date(),
      },
    });
    await this.audit.log(tenantId, "guided-setup.complete", "Guided setup completed", userId);
    return { nextUrl: "/dashboard" };
  }
}
