import { isSettingsPrimaryTradeV1Enabled } from '../common/feature-flags';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import crypto from 'crypto';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_PLAN_CODE, PLAN_DEFINITIONS } from '../billing/billing.constants';
import { Role } from '../common/constants';
import { assertPermission } from '../common/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTenantSettingsDto } from './tenant.dto';

@Injectable()
export class TenantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private normalizeRecipients(recipients?: string[]) {
    if (!recipients) {
      return undefined;
    }
    return recipients.map((value) => value.trim().toLowerCase()).filter(Boolean);
  }

  async ensureTenantSettings(tenantId: string) {
    const db = this.prisma as any;
    const company = await db.company.findUnique({ where: { id: tenantId } });
    if (!company) {
      throw new NotFoundException('Tenant not found');
    }

    const defaultPlan = await db.plan.findFirst({ where: { code: DEFAULT_PLAN_CODE } });

    return db.tenantSetting.upsert({
      where: { tenantId },
      update: {},
      create: {
        tenantId,
        planId: defaultPlan?.id ?? null,
        companyName: company.name,
        defaultCurrency: company.currency ?? 'USD',
        defaultTimezone: company.timezone ?? 'UTC',
      },
    });
  }

  getSettings(tenantId: string) {
    return this.ensureTenantSettings(tenantId);
  }

  async updateSettings(tenantId: string, userId: string, role: Role, dto: UpdateTenantSettingsDto) {
    const db = this.prisma as any;
    const user = { companyId: tenantId, sub: userId, role, email: '' } as const;

    const settings = await this.ensureTenantSettings(tenantId);
    let plan = null;
    if (settings.planId) {
      plan = await db.plan.findUnique({ where: { id: settings.planId } });
    } else {
      plan = await db.plan.findFirst({ where: { code: DEFAULT_PLAN_CODE } });
    }

    const planLimit = plan?.aiRequestsLimitMonthly ?? PLAN_DEFINITIONS[DEFAULT_PLAN_CODE].aiRequestsLimitMonthly;
    const isEnterprise = plan?.code === 'ENTERPRISE';

    if (dto.defaultCurrency) {
      dto.defaultCurrency = dto.defaultCurrency.toUpperCase().trim();
    }

    if (typeof dto.aiRequestsLimit === 'number') {
      if (!isEnterprise && dto.aiRequestsLimit > planLimit) {
        throw new BadRequestException('AI request limit cannot exceed your plan cap.');
      }
      if (isEnterprise && role !== 'OWNER') {
        throw new BadRequestException('Only OWNER can change Enterprise AI limits.');
      }
    }

    const nextBusinessConfig = dto.businessConfigJson;
    if (
      nextBusinessConfig &&
      typeof nextBusinessConfig === 'object' &&
      'workflowStages' in nextBusinessConfig
    ) {
      await assertPermission({
        user,
        permission: 'workflow.manage',
        audit: this.audit,
        action: 'tenant.settings.workflow',
      });
    }

    const payload: Record<string, any> = {
      ...dto,
      emailNotificationRecipients: this.normalizeRecipients(dto.emailNotificationRecipients),
      defaultItems: dto.defaultItems ?? undefined,
      defaultServiceNamePresets: dto.defaultServiceNamePresets ?? undefined,
    };

    if (dto.bookingPublicEnabled && !settings.bookingPublicToken) {
      payload.bookingPublicToken = crypto.randomBytes(24).toString('base64url');
    }
    if (dto.bookingPublicEnabled && !settings.bookingIcsToken) {
      payload.bookingIcsToken = crypto.randomBytes(24).toString('base64url');
    }

    const updated = await db.tenantSetting.upsert({
      where: { tenantId },
      update: payload,
      create: {
        tenantId,
        ...payload,
      },
    });

    await this.audit.log(tenantId, 'tenant.settings.update', 'Tenant settings updated', userId);
    return updated;
  }

  async saveUploadedLogo(tenantId: string, userId: string, fileName: string) {
    const db = this.prisma as any;
    if (!fileName) {
      throw new BadRequestException('File name is required');
    }

    const logoPath = `/tenant/public-logo/${tenantId}/${encodeURIComponent(fileName)}`;
    const apiBase = (process.env.API_PUBLIC_URL || '').replace(/\/$/, '');
    const logoUrl = apiBase ? `${apiBase}${logoPath}` : logoPath;
    const updated = await db.tenantSetting.upsert({
      where: { tenantId },
      update: { logoUrl },
      create: { tenantId, logoUrl },
    });

    await this.audit.log(tenantId, 'tenant.logo.upload', `Uploaded tenant logo ${fileName}`, userId);

    return { logoUrl: updated.logoUrl };
  }

  async setLogoUrl(tenantId: string, userId: string, logoUrl: string) {
    const db = this.prisma as any;
    const updated = await db.tenantSetting.upsert({
      where: { tenantId },
      update: { logoUrl },
      create: { tenantId, logoUrl },
    });

    await this.audit.log(tenantId, 'tenant.logo.set', 'Tenant logo URL updated', userId);

    return { logoUrl: updated.logoUrl };
  }
}
