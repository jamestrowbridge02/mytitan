import { createHash, randomBytes } from 'crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CRM_TASK_STATUSES } from '../common/constants';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildAppUrl } from '../common/public-url';
import {
  AddCrmNoteDto,
  AddCrmTaskDto,
  AddTradeAccountNoteDto,
  CrmSearchQueryDto,
  PatchCrmAccountDto,
  TradeAccountsQueryDto,
  UpdateNextActionDto,
  UpsertTradeAccountDto,
  ReviewTradeApplicationDto,
  SubmitTradeApplicationDto,
  TradeApplicationSettingsDto,
  TradePortalInviteDto,
} from './dto';

const TRADE_ACCOUNT_CRM_INCLUDE = {
  locations: {
    orderBy: [{ isPrimary: 'desc' }, { isBilling: 'desc' }, { createdAt: 'asc' }],
  },
  contacts: {
    orderBy: [{ isPrimary: 'desc' }, { isBilling: 'desc' }, { createdAt: 'asc' }],
    include: {
      preferences: {
        orderBy: [{ event: 'asc' }, { channel: 'asc' }],
      },
    },
  },
} as const;

function normalizeCrmTaskStatus(value?: string) {
  if (!value) return CRM_TASK_STATUSES[0];
  const normalized = String(value).trim().toUpperCase();
  if (normalized === 'INPROGRESS') return 'IN_PROGRESS';
  if (normalized === 'DONE') return 'COMPLETED';
  if (normalized === 'CLOSED' || normalized === 'CANCELED') return 'CANCELLED';
  if (CRM_TASK_STATUSES.includes(normalized as (typeof CRM_TASK_STATUSES)[number])) {
    return normalized as (typeof CRM_TASK_STATUSES)[number];
  }
  return CRM_TASK_STATUSES[0];
}

function optionalText(value?: string | null) {
  if (value === undefined) return undefined;
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

function stableText(value?: string | null) {
  const normalized = optionalText(value);
  return normalized === undefined ? null : normalized;
}

function makeId(prefix: string) {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

function sanitizeBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function hasAnyValue(values: Array<string | null | undefined>) {
  return values.some((value) => Boolean(optionalText(value)));
}

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = optionalText(value);
    if (normalized) return normalized;
  }
  return null;
}

function normalizeLocationKind(value?: string | null) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'BILLING') return 'BILLING';
  if (normalized === 'SERVICE') return 'SERVICE';
  if (normalized === 'OTHER') return 'OTHER';
  return 'BUSINESS';
}

function normalizePreferenceEvent(value?: string | null) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'INVOICE') return 'INVOICE';
  if (normalized === 'UPDATE_CALL') return 'UPDATE_CALL';
  if (normalized === 'GENERAL_NOTIFICATION') return 'GENERAL_NOTIFICATION';
  return 'JOB_COMPLETION';
}

function normalizePreferenceChannel(value?: string | null) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'WHATSAPP') return 'WHATSAPP';
  if (normalized === 'PHONE') return 'PHONE';
  return 'EMAIL';
}

function inferPreferenceDefaults(contact: any) {
  const preferences: Array<{ event: string; channel: string; enabled: boolean }> = [];
  const hasEmail = Boolean(optionalText(contact.email));
  const hasPhone = Boolean(optionalText(contact.phone) || optionalText(contact.mobile));
  if (contact.isPrimary && hasEmail) {
    preferences.push({ event: 'JOB_COMPLETION', channel: 'EMAIL', enabled: true });
  }
  if (contact.isPrimary && hasPhone) {
    preferences.push({ event: 'GENERAL_NOTIFICATION', channel: 'WHATSAPP', enabled: true });
    preferences.push({ event: 'UPDATE_CALL', channel: 'PHONE', enabled: true });
  }
  if (contact.isBilling && hasEmail) {
    preferences.push({ event: 'INVOICE', channel: 'EMAIL', enabled: true });
  }
  return preferences;
}

function buildLegacyLocationDrafts(accountName: string | null, source: Record<string, any>) {
  const drafts: any[] = [];
  const businessFields = [
    source.businessAddressLine1,
    source.businessAddressLine2,
    source.businessCity,
    source.businessPostcode,
    source.businessCountry,
  ];
  if (accountName || hasAnyValue(businessFields)) {
    drafts.push({
      legacyAliasKey: 'PRIMARY_BUSINESS',
      name: firstNonEmpty(accountName, 'Business location'),
      kind: 'BUSINESS',
      addressLine1: stableText(source.businessAddressLine1),
      addressLine2: stableText(source.businessAddressLine2),
      city: stableText(source.businessCity),
      postcode: stableText(source.businessPostcode),
      country: stableText(source.businessCountry),
      isPrimary: true,
      isBilling: false,
      isActive: true,
    });
  }
  const billingFields = [
    source.billingAddressLine1,
    source.billingAddressLine2,
    source.billingCity,
    source.billingPostcode,
    source.billingCountry,
  ];
  if (hasAnyValue(billingFields)) {
    drafts.push({
      legacyAliasKey: 'BILLING_LOCATION',
      name: firstNonEmpty(source.billingContactName, `${accountName || 'Billing'} accounts`, 'Billing location'),
      kind: 'BILLING',
      addressLine1: stableText(source.billingAddressLine1),
      addressLine2: stableText(source.billingAddressLine2),
      city: stableText(source.billingCity),
      postcode: stableText(source.billingPostcode),
      country: stableText(source.billingCountry),
      isPrimary: false,
      isBilling: true,
      isActive: true,
    });
  }
  return drafts;
}

function buildLegacyContactDrafts(source: Record<string, any>, locationIds: { businessLocationId: string | null; billingLocationId: string | null }) {
  const drafts: any[] = [];
  if (hasAnyValue([source.contactName, source.contactEmail, source.contactPhone, source.contactMobile])) {
    drafts.push({
      legacyAliasKey: 'PRIMARY_CONTACT',
      name: firstNonEmpty(source.contactName, 'Primary contact'),
      email: stableText(source.contactEmail),
      phone: stableText(source.contactPhone),
      mobile: stableText(source.contactMobile),
      roleLabel: 'Primary contact',
      isPrimary: true,
      isBilling: false,
      isActive: true,
      tradeAccountLocationId: locationIds.businessLocationId,
    });
  }
  if (hasAnyValue([source.secondaryContactName, source.secondaryContactEmail, source.secondaryContactPhone, source.secondaryContactMobile])) {
    drafts.push({
      legacyAliasKey: 'SECONDARY_CONTACT',
      name: firstNonEmpty(source.secondaryContactName, 'Secondary contact'),
      email: stableText(source.secondaryContactEmail),
      phone: stableText(source.secondaryContactPhone),
      mobile: stableText(source.secondaryContactMobile),
      roleLabel: 'Secondary contact',
      isPrimary: false,
      isBilling: false,
      isActive: true,
      tradeAccountLocationId: locationIds.businessLocationId,
    });
  }
  if (hasAnyValue([source.billingContactName, source.billingEmail, source.billingPhone, source.billingMobile])) {
    drafts.push({
      legacyAliasKey: 'BILLING_CONTACT',
      name: firstNonEmpty(source.billingContactName, 'Billing contact'),
      email: stableText(source.billingEmail),
      phone: stableText(source.billingPhone),
      mobile: stableText(source.billingMobile),
      roleLabel: 'Billing contact',
      isPrimary: false,
      isBilling: true,
      isActive: true,
      tradeAccountLocationId: locationIds.billingLocationId || locationIds.businessLocationId,
    });
  }
  return drafts;
}

function pickSnapshotLocation(locations: any[], kind: 'business' | 'billing') {
  if (kind === 'billing') {
    return (
      locations.find((location) => location.legacyAliasKey === 'BILLING_LOCATION') ||
      locations.find((location) => location.isBilling) ||
      locations.find((location) => location.kind === 'BILLING') ||
      locations.find((location) => location.isPrimary) ||
      locations[0] ||
      null
    );
  }
  return (
    locations.find((location) => location.legacyAliasKey === 'PRIMARY_BUSINESS') ||
    locations.find((location) => location.isPrimary) ||
    locations.find((location) => location.kind === 'BUSINESS') ||
    locations.find((location) => location.kind === 'SERVICE') ||
    locations[0] ||
    null
  );
}

function contactHasPreference(contact: any, event: string, channel: string) {
  return Array.isArray(contact?.preferences)
    ? contact.preferences.some(
        (preference: any) =>
          preference &&
          preference.enabled !== false &&
          String(preference.event || '').toUpperCase() === event &&
          String(preference.channel || '').toUpperCase() === channel,
      )
    : false;
}

function pickSnapshotContact(contacts: any[], kind: 'primary' | 'secondary' | 'billing') {
  if (kind === 'billing') {
    return (
      contacts.find((contact) => contact.legacyAliasKey === 'BILLING_CONTACT') ||
      contacts.find((contact) => contactHasPreference(contact, 'INVOICE', 'EMAIL')) ||
      contacts.find((contact) => contact.isBilling) ||
      contacts.find((contact) => optionalText(contact.email)) ||
      contacts[0] ||
      null
    );
  }
  if (kind === 'secondary') {
    return (
      contacts.find((contact) => contact.legacyAliasKey === 'SECONDARY_CONTACT') ||
      contacts.find((contact) => !contact.isPrimary && !contact.isBilling) ||
      null
    );
  }
  return (
    contacts.find((contact) => contact.legacyAliasKey === 'PRIMARY_CONTACT') ||
    contacts.find((contact) => contactHasPreference(contact, 'JOB_COMPLETION', 'EMAIL')) ||
    contacts.find((contact) => contact.isPrimary) ||
    contacts[0] ||
    null
  );
}

function buildLegacySnapshotFromNormalized(account: any) {
  const locations = Array.isArray(account?.locations) ? account.locations.filter((location: any) => location?.isActive !== false) : [];
  const contacts = Array.isArray(account?.contacts) ? account.contacts.filter((contact: any) => contact?.isActive !== false) : [];
  const businessLocation = pickSnapshotLocation(locations, 'business');
  const billingLocation = pickSnapshotLocation(locations, 'billing') || businessLocation;
  const primaryContact = pickSnapshotContact(contacts, 'primary');
  const secondaryContact = pickSnapshotContact(
    contacts.filter((contact: any) => String(contact?.id || '') !== String(primaryContact?.id || '')),
    'secondary',
  );
  const billingContact =
    pickSnapshotContact(
      contacts.filter((contact: any) => String(contact?.id || '') !== String(primaryContact?.id || '')),
      'billing',
    ) || primaryContact;

  return {
    contactName: optionalText(primaryContact?.name) ?? null,
    contactEmail: optionalText(primaryContact?.email) ?? null,
    contactPhone: optionalText(primaryContact?.phone) ?? null,
    contactMobile: optionalText(primaryContact?.mobile) ?? null,
    secondaryContactName: optionalText(secondaryContact?.name) ?? null,
    secondaryContactEmail: optionalText(secondaryContact?.email) ?? null,
    secondaryContactPhone: optionalText(secondaryContact?.phone) ?? null,
    secondaryContactMobile: optionalText(secondaryContact?.mobile) ?? null,
    businessAddressLine1: optionalText(businessLocation?.addressLine1) ?? null,
    businessAddressLine2: optionalText(businessLocation?.addressLine2) ?? null,
    businessCity: optionalText(businessLocation?.city) ?? null,
    businessPostcode: optionalText(businessLocation?.postcode) ?? null,
    businessCountry: optionalText(businessLocation?.country) ?? null,
    billingContactName: optionalText(billingContact?.name) ?? null,
    billingEmail: optionalText(billingContact?.email) ?? null,
    billingPhone: optionalText(billingContact?.phone) ?? null,
    billingMobile: optionalText(billingContact?.mobile) ?? null,
    billingAddressLine1: optionalText(billingLocation?.addressLine1) ?? null,
    billingAddressLine2: optionalText(billingLocation?.addressLine2) ?? null,
    billingCity: optionalText(billingLocation?.city) ?? null,
    billingPostcode: optionalText(billingLocation?.postcode) ?? null,
    billingCountry: optionalText(billingLocation?.country) ?? null,
  };
}

@Injectable()
export class TradeAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private hashPublicToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  async invitePortalContact(companyId: string, userId: string, accountId: string, dto: TradePortalInviteDto) {
    const db = this.prisma as any;
    const account = await db.tradeAccount.findFirst({ where: { id: accountId, companyId } });
    if (!account) throw new NotFoundException('Trade account not found');
    const token = randomBytes(32).toString('base64url');
    const email = String(dto.email || '').trim().toLowerCase();
    const access = await db.tradePortalAccess.upsert({
      where: { tenantId_tradeAccountId_email: { tenantId: companyId, tradeAccountId: account.id, email } },
      create: {
        tenantId: companyId,
        tradeAccountId: account.id,
        contactId: dto.contactId || null,
        email,
        status: 'INVITED',
        inviteTokenHash: this.hashPublicToken(token),
        inviteTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        invitedAt: new Date(),
        createdByUserId: userId,
      },
      update: {
        contactId: dto.contactId || null,
        status: 'INVITED',
        inviteTokenHash: this.hashPublicToken(token),
        inviteTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        invitedAt: new Date(),
        revokedAt: null,
      },
    });
    await db.tradeAccount.update({ where: { id: account.id }, data: { portalEnabled: true } });
    const inviteUrl = buildAppUrl(`/trade/portal/${token}`);
    const delivery = await this.notifications.sendTradePortalInvite({
      companyId,
      actorUserId: userId,
      to: email,
      accountName: account.name,
      inviteUrl,
    });
    await this.audit.log(companyId, 'trade.portal.invite', `Trade portal invite created for ${account.name}`, userId);
    return {
      id: access.id,
      email,
      status: access.status,
      inviteUrl,
      expiresAt: access.inviteTokenExpiresAt,
      deliveryStatus: delivery.status,
    };
  }

  async revokePortalAccess(companyId: string, userId: string, accountId: string, accessId: string) {
    const db = this.prisma as any;
    const access = await db.tradePortalAccess.findFirst({ where: { id: accessId, tenantId: companyId, tradeAccountId: accountId } });
    if (!access) throw new NotFoundException('Trade portal access not found');
    const updated = await db.tradePortalAccess.update({
      where: { id: access.id },
      data: { status: 'REVOKED', revokedAt: new Date(), inviteTokenHash: null, inviteTokenExpiresAt: null },
    });
    await this.audit.log(companyId, 'trade.portal.revoke', `Trade portal access revoked for ${access.email}`, userId);
    return updated;
  }

  async listPortalAccess(companyId: string, accountId: string) {
    const db = this.prisma as any;
    return db.tradePortalAccess.findMany({
      where: { tenantId: companyId, tradeAccountId: accountId },
      select: { id: true, email: true, status: true, invitedAt: true, activatedAt: true, revokedAt: true, lastAccessedAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPublicTradePortal(token: string) {
    const db = this.prisma as any;
    const access = await db.tradePortalAccess.findFirst({
      where: {
        inviteTokenHash: this.hashPublicToken(token),
        status: { in: ['INVITED', 'ACTIVE'] },
        revokedAt: null,
        OR: [{ inviteTokenExpiresAt: null }, { inviteTokenExpiresAt: { gt: new Date() } }],
      },
      include: {
        tenant: { include: { tenantSetting: true } },
        tradeAccount: { include: { locations: true } },
      },
    });
    if (!access) throw new NotFoundException('Trade portal link is invalid or expired');
    await db.tradePortalAccess.update({
      where: { id: access.id },
      data: { status: 'ACTIVE', activatedAt: access.activatedAt || new Date(), lastAccessedAt: new Date() },
    });
    const services = await db.service.findMany({
      where: { companyId: access.tenantId, isActive: true },
      orderBy: { name: 'asc' },
    });
    const allowedServiceIds = Array.isArray(access.tradeAccount.allowedServiceIdsJson)
      ? access.tradeAccount.allowedServiceIdsJson.map(String)
      : [];
    const visibleServices = services.filter((service: any) => {
      const config = service.bookingConfigJson && typeof service.bookingConfigJson === 'object' ? service.bookingConfigJson : {};
      return String(config.visibility || 'PUBLIC').toUpperCase() === 'TRADE'
        && (!allowedServiceIds.length || allowedServiceIds.includes(service.id));
    }).map((service: any) => ({ id: service.id, name: service.name, description: service.description, durationMinutes: service.durationMinutes, priceCents: service.priceCents }));
    const jobs = await db.job.findMany({
      where: { companyId: access.tenantId, tradeAccountId: access.tradeAccountId },
      select: { id: true, jobRef: true, serviceName: true, status: true, scheduledAt: true, invoiceNumber: true, invoiceDueAt: true, invoicePaidAt: true, totalCents: true, currency: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const statements = await db.accountStatement.findMany({
      where: { tenantId: access.tenantId, tradeAccountId: access.tradeAccountId },
      select: { id: true, reference: true, fromDate: true, toDate: true, currency: true, openBalanceCents: true, status: true, sentAt: true },
      orderBy: { createdAt: 'desc' },
    });
    const branding = access.tenant.tenantSetting;
    return {
      tenant: {
        name: branding?.tradingName || branding?.companyName || access.tenant.name,
        logoUrl: branding?.logoUrl || null,
        primaryColor: branding?.brandPrimaryColor || '#2563eb',
      },
      account: {
        id: access.tradeAccount.id,
        name: access.tradeAccount.name,
        paymentTermsDays: access.tradeAccount.paymentTermsDays,
        locations: access.tradeAccount.locations.filter((location: any) => {
          const allowedLocationIds = Array.isArray(access.tradeAccount.allowedLocationIdsJson)
            ? access.tradeAccount.allowedLocationIdsJson.map(String)
            : [];
          return location.isActive
            && (!allowedLocationIds.length || allowedLocationIds.includes(location.id) || allowedLocationIds.includes(String(location.linkedLocationId || '')));
        }),
      },
      services: visibleServices,
      jobs,
      statements,
    };
  }

  async getApplicationSettings(companyId: string) {
    const db = this.prisma as any;
    const settings = await db.tradeAccountApplicationSetting.upsert({
      where: { tenantId: companyId },
      update: {},
      create: { tenantId: companyId, enabled: false, publicToken: randomBytes(24).toString('base64url'), fieldsJson: [] },
    });
    return { ...settings, publicUrl: `/trade/apply/${settings.publicToken}` };
  }

  async updateApplicationSettings(companyId: string, userId: string, dto: TradeApplicationSettingsDto) {
    const db = this.prisma as any;
    const existing = await this.getApplicationSettings(companyId);
    const updated = await db.tradeAccountApplicationSetting.update({
      where: { id: existing.id },
      data: { enabled: dto.enabled, fieldsJson: Array.isArray(dto.fields) ? dto.fields : [], updatedByUserId: userId },
    });
    await this.audit.log(companyId, 'trade.application.settings', 'Trade account application settings updated', userId);
    return { ...updated, publicUrl: `/trade/apply/${updated.publicToken}` };
  }

  async getPublicApplicationConfig(publicToken: string) {
    const db = this.prisma as any;
    const settings = await db.tradeAccountApplicationSetting.findFirst({
      where: { publicToken, enabled: true },
      include: { tenant: { include: { tenantSetting: true } } },
    });
    if (!settings) throw new NotFoundException('Trade account applications are not open');
    return {
      businessName: settings.tenant.tenantSetting?.tradingName || settings.tenant.tenantSetting?.companyName || settings.tenant.name,
      logoUrl: settings.tenant.tenantSetting?.logoUrl || null,
      primaryColor: settings.tenant.tenantSetting?.brandPrimaryColor || '#2563eb',
      fields: Array.isArray(settings.fieldsJson) ? settings.fieldsJson : [],
    };
  }

  async submitPublicApplication(publicToken: string, dto: SubmitTradeApplicationDto) {
    const db = this.prisma as any;
    const settings = await db.tradeAccountApplicationSetting.findFirst({ where: { publicToken, enabled: true } });
    if (!settings) throw new NotFoundException('Trade account applications are not open');
    const application = await db.tradeAccountApplication.create({
      data: {
        tenantId: settings.tenantId,
        publicStatusToken: randomBytes(24).toString('base64url'),
        businessName: dto.businessName.trim(),
        contactName: dto.contactName.trim(),
        contactEmail: dto.contactEmail.trim().toLowerCase(),
        contactPhone: optionalText(dto.contactPhone),
        companyNumber: optionalText(dto.companyNumber),
        taxRegistrationNumber: optionalText(dto.taxRegistrationNumber),
        answersJson: dto.answers || {},
      },
    });
    await this.audit.log(settings.tenantId, 'trade.application.submit', `Trade account application submitted for ${application.businessName}`, null);
    return { status: 'PENDING', statusUrl: `/trade/application/status/${application.publicStatusToken}` };
  }

  async publicApplicationStatus(statusToken: string) {
    const db = this.prisma as any;
    const application = await db.tradeAccountApplication.findFirst({
      where: { publicStatusToken: statusToken },
      select: { businessName: true, status: true, reviewNote: true, submittedAt: true, reviewedAt: true },
    });
    if (!application) throw new NotFoundException('Application not found');
    return application;
  }

  async listApplications(companyId: string) {
    const db = this.prisma as any;
    return db.tradeAccountApplication.findMany({ where: { tenantId: companyId }, orderBy: { submittedAt: 'desc' } });
  }

  async reviewApplication(companyId: string, userId: string, applicationId: string, dto: ReviewTradeApplicationDto) {
    const db = this.prisma as any;
    const application = await db.tradeAccountApplication.findFirst({ where: { id: applicationId, tenantId: companyId } });
    if (!application) throw new NotFoundException('Application not found');
    let tradeAccountId = application.convertedTradeAccountId;
    let invite: any = null;
    if (dto.status === 'APPROVED' && !tradeAccountId) {
      const account = await this.upsert(companyId, userId, {
        name: application.businessName,
        contactName: application.contactName,
        contactEmail: application.contactEmail,
        contactPhone: application.contactPhone || undefined,
        companyNumber: application.companyNumber || undefined,
        vatNumber: application.taxRegistrationNumber || undefined,
        creditLimit: 0,
        portalEnabled: Boolean(dto.sendPortalInvite),
      });
      tradeAccountId = account.id;
      if (dto.sendPortalInvite) {
        invite = await this.invitePortalContact(companyId, userId, account.id, { email: application.contactEmail });
      }
    }
    const updated = await db.tradeAccountApplication.update({
      where: { id: application.id },
      data: {
        status: dto.status,
        reviewNote: optionalText(dto.reviewNote),
        reviewedByUserId: userId,
        reviewedAt: new Date(),
        convertedTradeAccountId: tradeAccountId,
      },
    });
    await this.audit.log(companyId, `trade.application.${dto.status.toLowerCase()}`, `Trade application ${dto.status.toLowerCase()} for ${application.businessName}`, userId);
    return { application: updated, tradeAccountId, invite };
  }

  private buildTradeAccountPayload(dto: UpsertTradeAccountDto | PatchCrmAccountDto) {
    const rawCreditLimit = 'creditLimit' in dto ? (dto as any).creditLimit : undefined;
    const normalizedCreditLimit =
      rawCreditLimit === undefined || rawCreditLimit === null || String(rawCreditLimit).trim() === ''
        ? new Prisma.Decimal(0)
        : new Prisma.Decimal(rawCreditLimit);
    const rawOutstandingBalance = 'outstandingBalance' in dto ? (dto as any).outstandingBalance : undefined;
    const normalizedOutstandingBalance =
      rawOutstandingBalance === undefined || rawOutstandingBalance === null || String(rawOutstandingBalance).trim() === ''
        ? undefined
        : new Prisma.Decimal(rawOutstandingBalance);

    return {
      name: dto.name ?? undefined,
      contactName: optionalText(dto.contactName),
      contactEmail: optionalText(dto.contactEmail),
      contactPhone: optionalText(dto.contactPhone),
      contactMobile: optionalText(dto.contactMobile),
      secondaryContactName: optionalText(dto.secondaryContactName),
      secondaryContactEmail: optionalText(dto.secondaryContactEmail),
      secondaryContactPhone: optionalText(dto.secondaryContactPhone),
      secondaryContactMobile: optionalText(dto.secondaryContactMobile),
      vatNumber: optionalText(dto.vatNumber),
      companyNumber: optionalText(dto.companyNumber),
      paymentTermsDays: 'paymentTermsDays' in dto && dto.paymentTermsDays != null
        ? Math.max(0, Math.min(365, Number(dto.paymentTermsDays)))
        : undefined,
      portalEnabled: 'portalEnabled' in dto ? Boolean(dto.portalEnabled) : undefined,
      allowedServiceIdsJson: 'allowedServiceIds' in dto && Array.isArray(dto.allowedServiceIds)
        ? Array.from(new Set(dto.allowedServiceIds.map((value) => String(value).trim()).filter(Boolean)))
        : undefined,
      allowedLocationIdsJson: 'allowedLocationIds' in dto && Array.isArray(dto.allowedLocationIds)
        ? Array.from(new Set(dto.allowedLocationIds.map((value) => String(value).trim()).filter(Boolean)))
        : undefined,
      businessAddressLine1: optionalText(dto.businessAddressLine1),
      businessAddressLine2: optionalText(dto.businessAddressLine2),
      businessCity: optionalText(dto.businessCity),
      businessPostcode: optionalText(dto.businessPostcode),
      businessCountry: optionalText(dto.businessCountry),
      billingContactName: optionalText(dto.billingContactName),
      billingEmail: optionalText(dto.billingEmail),
      billingPhone: optionalText(dto.billingPhone),
      billingMobile: optionalText(dto.billingMobile),
      billingAddressLine1: optionalText(dto.billingAddressLine1),
      billingAddressLine2: optionalText(dto.billingAddressLine2),
      billingCity: optionalText(dto.billingCity),
      billingPostcode: optionalText(dto.billingPostcode),
      billingCountry: optionalText(dto.billingCountry),
      status: dto.status ?? undefined,
      nextActionType: 'nextActionType' in dto ? dto.nextActionType ?? undefined : undefined,
      nextActionDueAt: 'nextActionDueAt' in dto ? (dto.nextActionDueAt ? new Date(dto.nextActionDueAt) : null) : undefined,
      nextActionUserId: 'nextActionUserId' in dto ? dto.nextActionUserId ?? undefined : undefined,
      lastContactedAt: 'lastContactedAt' in dto ? (dto.lastContactedAt ? new Date(dto.lastContactedAt) : undefined) : undefined,
      creditLimit: normalizedCreditLimit,
      ...(normalizedOutstandingBalance !== undefined ? { outstandingBalance: normalizedOutstandingBalance } : {}),
    };
  }

  private async getAccountWithCrm(tx: any, companyId: string, accountId: string) {
    return tx.tradeAccount.findFirst({
      where: { companyId, id: accountId },
      include: TRADE_ACCOUNT_CRM_INCLUDE,
    });
  }

  private async syncLocations(tx: any, companyId: string, account: any, dto: UpsertTradeAccountDto | PatchCrmAccountDto) {
    const existingLocations = await tx.tradeAccountLocation.findMany({
      where: { companyId, tradeAccountId: account.id },
      orderBy: { createdAt: 'asc' },
    });
    const existingById = new Map(existingLocations.map((location: any) => [location.id, location]));
    const aliasLocations = buildLegacyLocationDrafts(account.name, { ...account, ...dto });

    if (!Array.isArray(dto.locations)) {
      const aliasIdMap = new Map<string, string>();
      for (const draft of aliasLocations) {
        const existing = existingLocations.find((location: any) => location.legacyAliasKey === draft.legacyAliasKey);
        const locationId = existing?.id || makeId('taloc');
        aliasIdMap.set(draft.legacyAliasKey, locationId);
        await tx.tradeAccountLocation.upsert({
          where: { id: locationId },
          update: {
            name: draft.name,
            kind: draft.kind,
            legacyAliasKey: draft.legacyAliasKey,
            addressLine1: draft.addressLine1,
            addressLine2: draft.addressLine2,
            city: draft.city,
            postcode: draft.postcode,
            country: draft.country,
            isPrimary: draft.isPrimary,
            isBilling: draft.isBilling,
            isActive: draft.isActive,
          },
          create: {
            id: locationId,
            companyId,
            tradeAccountId: account.id,
            ...draft,
          },
        });
      }
      return {
        businessLocationId: aliasIdMap.get('PRIMARY_BUSINESS') || existingLocations.find((location: any) => location.isPrimary)?.id || null,
        billingLocationId:
          aliasIdMap.get('BILLING_LOCATION') ||
          existingLocations.find((location: any) => location.isBilling)?.id ||
          aliasIdMap.get('PRIMARY_BUSINESS') ||
          null,
      };
    }

    const drafts = dto.locations
      .map((input: any, index: number) => {
        const existing: any = input.id ? existingById.get(input.id) : null;
        return {
          inputKey: input.id || `new-location-${index}`,
          id: existing?.id || makeId('taloc'),
          name: firstNonEmpty(input.name, index === 0 ? account.name : null, `Location ${index + 1}`),
          linkedLocationId: stableText(input.linkedLocationId),
          kind: normalizeLocationKind(input.kind),
          addressLine1: stableText(input.addressLine1),
          addressLine2: stableText(input.addressLine2),
          city: stableText(input.city),
          postcode: stableText(input.postcode),
          country: stableText(input.country),
          isPrimary: sanitizeBoolean(input.isPrimary, false),
          isBilling: sanitizeBoolean(input.isBilling, false),
          isActive: input.isActive === false ? false : true,
          legacyAliasKey: existing?.legacyAliasKey || null,
        };
      })
      .filter((draft: any) => draft.name || hasAnyValue([draft.addressLine1, draft.addressLine2, draft.city, draft.postcode, draft.country]));

    const businessDraft = drafts.find((draft: any) => draft.isPrimary) || drafts[0] || null;
    if (businessDraft) {
      businessDraft.name = firstNonEmpty(businessDraft.name, account.name, 'Business location');
      businessDraft.addressLine1 = stableText(dto.businessAddressLine1) ?? businessDraft.addressLine1;
      businessDraft.addressLine2 = stableText(dto.businessAddressLine2) ?? businessDraft.addressLine2;
      businessDraft.city = stableText(dto.businessCity) ?? businessDraft.city;
      businessDraft.postcode = stableText(dto.businessPostcode) ?? businessDraft.postcode;
      businessDraft.country = stableText(dto.businessCountry) ?? businessDraft.country;
    }

    if (drafts.length > 0 && !drafts.some((draft: any) => draft.isPrimary)) {
      drafts[0].isPrimary = true;
    }
    const billingDraft =
      drafts.find((draft: any) => draft.isBilling) ||
      drafts.find((draft: any) => draft.kind === 'BILLING') ||
      drafts[0] ||
      null;
    if (billingDraft) {
      billingDraft.isBilling = true;
      billingDraft.name = firstNonEmpty(dto.billingContactName, billingDraft.name, `${account.name || 'Billing'} accounts`);
      billingDraft.addressLine1 = stableText(dto.billingAddressLine1) ?? billingDraft.addressLine1;
      billingDraft.addressLine2 = stableText(dto.billingAddressLine2) ?? billingDraft.addressLine2;
      billingDraft.city = stableText(dto.billingCity) ?? billingDraft.city;
      billingDraft.postcode = stableText(dto.billingPostcode) ?? billingDraft.postcode;
      billingDraft.country = stableText(dto.billingCountry) ?? billingDraft.country;
    }

    for (const draft of drafts) {
      await tx.tradeAccountLocation.upsert({
        where: { id: draft.id },
        update: {
          name: draft.name,
          linkedLocationId: draft.linkedLocationId,
          kind: draft.kind,
          addressLine1: draft.addressLine1,
          addressLine2: draft.addressLine2,
          city: draft.city,
          postcode: draft.postcode,
          country: draft.country,
          isPrimary: draft.isPrimary,
          isBilling: draft.isBilling,
          isActive: draft.isActive,
        },
        create: {
          id: draft.id,
          companyId,
          tradeAccountId: account.id,
          name: draft.name,
          linkedLocationId: draft.linkedLocationId,
          kind: draft.kind,
          addressLine1: draft.addressLine1,
          addressLine2: draft.addressLine2,
          city: draft.city,
          postcode: draft.postcode,
          country: draft.country,
          isPrimary: draft.isPrimary,
          isBilling: draft.isBilling,
          isActive: draft.isActive,
        },
      });
    }

    const keepIds = drafts.map((draft: any) => draft.id);
    const removeIds = existingLocations.map((location: any) => location.id).filter((id: string) => !keepIds.includes(id));
    if (removeIds.length > 0) {
      await tx.tradeAccountContact.updateMany({
        where: { companyId, tradeAccountId: account.id, tradeAccountLocationId: { in: removeIds } },
        data: { tradeAccountLocationId: null },
      });
      await tx.tradeAccountLocation.deleteMany({
        where: { companyId, tradeAccountId: account.id, id: { in: removeIds } },
      });
    }

    return {
      businessLocationId: drafts.find((draft: any) => draft.isPrimary)?.id || drafts[0]?.id || null,
      billingLocationId: billingDraft?.id || drafts.find((draft: any) => draft.isPrimary)?.id || null,
      locationIdByInputKey: new Map(drafts.map((draft: any) => [draft.inputKey, draft.id])),
    };
  }

  private async syncContacts(
    tx: any,
    companyId: string,
    account: any,
    dto: UpsertTradeAccountDto | PatchCrmAccountDto,
    locationRefs: { businessLocationId: string | null; billingLocationId: string | null; locationIdByInputKey?: Map<string, string> },
  ) {
    const existingContacts = await tx.tradeAccountContact.findMany({
      where: { companyId, tradeAccountId: account.id },
      include: { preferences: true },
      orderBy: { createdAt: 'asc' },
    });
    const existingById = new Map(existingContacts.map((contact: any) => [contact.id, contact]));
    const aliasContacts = buildLegacyContactDrafts({ ...account, ...dto }, locationRefs);

    if (!Array.isArray(dto.contacts)) {
      for (const draft of aliasContacts) {
        const existing = existingContacts.find((contact: any) => contact.legacyAliasKey === draft.legacyAliasKey);
        const contactId = existing?.id || makeId('tacont');
        await tx.tradeAccountContact.upsert({
          where: { id: contactId },
          update: {
            name: draft.name,
            email: draft.email,
            phone: draft.phone,
            mobile: draft.mobile,
            roleLabel: draft.roleLabel,
            isPrimary: draft.isPrimary,
            isBilling: draft.isBilling,
            isActive: draft.isActive,
            tradeAccountLocationId: draft.tradeAccountLocationId,
          },
          create: {
            id: contactId,
            companyId,
            tradeAccountId: account.id,
            legacyAliasKey: draft.legacyAliasKey,
            name: draft.name,
            email: draft.email,
            phone: draft.phone,
            mobile: draft.mobile,
            roleLabel: draft.roleLabel,
            isPrimary: draft.isPrimary,
            isBilling: draft.isBilling,
            isActive: draft.isActive,
            tradeAccountLocationId: draft.tradeAccountLocationId,
          },
        });

        const preferences = inferPreferenceDefaults(draft);
        const keepPreferenceKeys = preferences.map((preference) => `${preference.event}:${preference.channel}`);
        if (keepPreferenceKeys.length > 0) {
          for (const preference of preferences) {
            await tx.tradeAccountContactPreference.upsert({
              where: {
                contactId_event_channel: {
                  contactId,
                  event: preference.event,
                  channel: preference.channel,
                },
              },
              update: { enabled: preference.enabled },
              create: {
                id: makeId('tacpref'),
                companyId,
                contactId,
                event: preference.event,
                channel: preference.channel,
                enabled: preference.enabled,
              },
            });
          }
        }
      }
      return;
    }

    const drafts = dto.contacts
      .map((input: any, index: number) => {
        const existing: any = input.id ? existingById.get(input.id) : null;
        const rawLocationId = stableText(input.tradeAccountLocationId);
        return {
          id: existing?.id || makeId('tacont'),
          name: firstNonEmpty(input.name, `Contact ${index + 1}`),
          email: stableText(input.email),
          phone: stableText(input.phone),
          mobile: stableText(input.mobile),
          roleLabel: stableText(input.roleLabel),
          isPrimary: sanitizeBoolean(input.isPrimary, false),
          isBilling: sanitizeBoolean(input.isBilling, false),
          isActive: input.isActive === false ? false : true,
          tradeAccountLocationId:
            (rawLocationId && (locationRefs.locationIdByInputKey?.get(rawLocationId) || rawLocationId)) ||
            null,
          preferences: Array.isArray(input.preferences)
            ? input.preferences.map((preference: any) => ({
                event: normalizePreferenceEvent(preference.event),
                channel: normalizePreferenceChannel(preference.channel),
                enabled: preference.enabled !== false,
              }))
            : [],
        };
      })
      .filter((draft: any) => draft.name || hasAnyValue([draft.email, draft.phone, draft.mobile]));

    const primaryDraft = drafts.find((draft: any) => draft.isPrimary) || drafts[0] || null;
    if (primaryDraft) {
      primaryDraft.name = firstNonEmpty(dto.contactName, primaryDraft.name, 'Primary contact');
      primaryDraft.email = stableText(dto.contactEmail) ?? primaryDraft.email;
      primaryDraft.phone = stableText(dto.contactPhone) ?? primaryDraft.phone;
      primaryDraft.mobile = stableText(dto.contactMobile) ?? primaryDraft.mobile;
      primaryDraft.roleLabel = firstNonEmpty(primaryDraft.roleLabel, 'Primary contact');
    }

    if (drafts.length > 0 && !drafts.some((draft: any) => draft.isPrimary)) {
      drafts[0].isPrimary = true;
    }
    const secondaryDraft =
      drafts.find((draft: any) => draft !== primaryDraft && !draft.isBilling) ||
      drafts.find((draft: any) => draft !== primaryDraft) ||
      null;
    if (secondaryDraft) {
      secondaryDraft.name = firstNonEmpty(dto.secondaryContactName, secondaryDraft.name, 'Secondary contact');
      secondaryDraft.email = stableText(dto.secondaryContactEmail) ?? secondaryDraft.email;
      secondaryDraft.phone = stableText(dto.secondaryContactPhone) ?? secondaryDraft.phone;
      secondaryDraft.mobile = stableText(dto.secondaryContactMobile) ?? secondaryDraft.mobile;
      secondaryDraft.roleLabel = firstNonEmpty(secondaryDraft.roleLabel, 'Secondary contact');
    }
    const billingDraft =
      drafts.find((draft: any) => draft.isBilling) ||
      drafts.find((draft: any) => draft.preferences.some((preference: any) => preference.event === 'INVOICE' && preference.channel === 'EMAIL')) ||
      drafts.find((draft: any) => draft.email) ||
      drafts[0] ||
      null;
    if (billingDraft) {
      billingDraft.isBilling = true;
      billingDraft.name = firstNonEmpty(dto.billingContactName, billingDraft.name, 'Billing contact');
      billingDraft.email = stableText(dto.billingEmail) ?? billingDraft.email;
      billingDraft.phone = stableText(dto.billingPhone) ?? billingDraft.phone;
      billingDraft.mobile = stableText(dto.billingMobile) ?? billingDraft.mobile;
      billingDraft.roleLabel = firstNonEmpty(billingDraft.roleLabel, 'Billing contact');
    }

    for (const draft of drafts) {
      await tx.tradeAccountContact.upsert({
        where: { id: draft.id },
        update: {
          name: draft.name,
          email: draft.email,
          phone: draft.phone,
          mobile: draft.mobile,
          roleLabel: draft.roleLabel,
          isPrimary: draft.isPrimary,
          isBilling: draft.isBilling,
          isActive: draft.isActive,
          tradeAccountLocationId: draft.tradeAccountLocationId,
        },
        create: {
          id: draft.id,
          companyId,
          tradeAccountId: account.id,
          name: draft.name,
          email: draft.email,
          phone: draft.phone,
          mobile: draft.mobile,
          roleLabel: draft.roleLabel,
          isPrimary: draft.isPrimary,
          isBilling: draft.isBilling,
          isActive: draft.isActive,
          tradeAccountLocationId: draft.tradeAccountLocationId,
        },
      });

      const keepPreferenceKeys = draft.preferences.map((preference: any) => `${preference.event}:${preference.channel}`);
      for (const preference of draft.preferences) {
        await tx.tradeAccountContactPreference.upsert({
          where: {
            contactId_event_channel: {
              contactId: draft.id,
              event: preference.event,
              channel: preference.channel,
            },
          },
          update: { enabled: preference.enabled },
          create: {
            id: makeId('tacpref'),
            companyId,
            contactId: draft.id,
            event: preference.event,
            channel: preference.channel,
            enabled: preference.enabled,
          },
        });
      }
      await tx.tradeAccountContactPreference.deleteMany({
        where: keepPreferenceKeys.length > 0
          ? {
              companyId,
              contactId: draft.id,
              NOT: keepPreferenceKeys.map((value: string) => {
                const [event, channel] = value.split(':');
                return { event, channel };
              }),
            }
          : { companyId, contactId: draft.id },
      });
    }

    const keepIds = drafts.map((draft: any) => draft.id);
    const removeIds = existingContacts.map((contact: any) => contact.id).filter((id: string) => !keepIds.includes(id));
    if (removeIds.length > 0) {
      await tx.tradeAccountContactPreference.deleteMany({
        where: { companyId, contactId: { in: removeIds } },
      });
      await tx.tradeAccountContact.deleteMany({
        where: { companyId, tradeAccountId: account.id, id: { in: removeIds } },
      });
    }
  }

  private async syncNormalizedCrm(tx: any, companyId: string, account: any, dto: UpsertTradeAccountDto | PatchCrmAccountDto) {
    const locationRefs = await this.syncLocations(tx, companyId, account, dto);
    await this.syncContacts(tx, companyId, account, dto, locationRefs);
    const normalized = await this.getAccountWithCrm(tx, companyId, account.id);
    const snapshot = buildLegacySnapshotFromNormalized(normalized);
    await tx.tradeAccount.update({
      where: { id: account.id },
      data: snapshot,
    });
    return this.getAccountWithCrm(tx, companyId, account.id);
  }

  async upsert(companyId: string, userId: string, dto: UpsertTradeAccountDto) {
    const db = this.prisma as any;
    const payload = this.buildTradeAccountPayload(dto);

    const account = await db.$transaction(async (tx: any) => {
      if (dto.id) {
        const existing = await tx.tradeAccount.findFirst({ where: { id: dto.id, companyId } });
        if (!existing) {
          throw new NotFoundException('Trade account not found');
        }
        await tx.tradeAccount.update({
          where: { id: existing.id },
          data: payload,
        });
        return this.syncNormalizedCrm(tx, companyId, { ...existing, ...payload }, dto);
      }

      const created = await tx.tradeAccount.create({
        data: {
          companyId,
          ...payload,
        },
      });
      return this.syncNormalizedCrm(tx, companyId, created, dto);
    });

    await this.audit.log(
      companyId,
      'trade.upsert',
      `${dto.id ? 'Updated' : 'Created'} trade account ${account.name}`,
      userId,
    );
    if (dto.id) {
      const recipients = await db.user.findMany({
        where: {
          companyId,
          role: { in: ['OWNER', 'ADMIN'] },
          id: { not: userId },
        },
        select: { id: true },
      });
      if (recipients.length > 0) {
        await this.notifications.createForUsers(
          companyId,
          recipients.map((user: { id: string }) => user.id),
          {
            type: 'customer.updated',
            title: `Customer updated: ${account.name}`,
            body: 'Business profile or billing contact details changed.',
            entityType: 'trade_account',
            entityId: account.id,
            metaJson: {
              reasonKey: 'customer_update_attention',
              priority: 'info',
              actionUrl: `/dashboard/trade-accounts/${account.id}`,
              actionLabel: 'Open customer',
            },
          },
        );
      }
    }
    return account;
  }

  async list(companyId: string, query?: TradeAccountsQueryDto) {
    const db = this.prisma as any;
    const page = Math.max(1, Number(query?.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query?.pageSize || 30)));
    const where: any = { companyId };
    if (query?.status) where.status = query.status;
    if (query?.q) {
      const q = query.q.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { contactName: { contains: q, mode: 'insensitive' } },
        { contactEmail: { contains: q, mode: 'insensitive' } },
        { contactPhone: { contains: q, mode: 'insensitive' } },
        { contactMobile: { contains: q, mode: 'insensitive' } },
        { secondaryContactName: { contains: q, mode: 'insensitive' } },
        { secondaryContactEmail: { contains: q, mode: 'insensitive' } },
        { secondaryContactPhone: { contains: q, mode: 'insensitive' } },
        { secondaryContactMobile: { contains: q, mode: 'insensitive' } },
        { vatNumber: { contains: q, mode: 'insensitive' } },
        { companyNumber: { contains: q, mode: 'insensitive' } },
      ];
    }

    const accounts = await db.tradeAccount.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: TRADE_ACCOUNT_CRM_INCLUDE,
    });

    const withBalance = await Promise.all(
      accounts.map(async (account: any) => {
        const unpaid = await db.job.findMany({
          where: {
            companyId,
            OR: [{ tradeAccountId: account.id }, { customerEmail: account.contactEmail || undefined }],
            invoiceIssuedAt: { not: null },
            invoicePaidAt: null,
          },
          select: { totalCents: true },
        });
        const computedOutstandingCents = unpaid.reduce((sum: number, row: any) => sum + Number(row.totalCents || 0), 0);
        return { ...account, computedOutstandingCents };
      }),
    );
    return withBalance;
  }

  async get(companyId: string, id: string) {
    const db = this.prisma as any;
    const account = await this.getAccountWithCrm(db, companyId, id);
    if (!account) throw new NotFoundException('Trade account not found');
    const recentJobs = await db.job.findMany({
      where: { companyId, tradeAccountId: id },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });
    const recentBookings = await db.booking.findMany({
      where: { companyId, tradeAccountId: id },
      orderBy: { startsAt: 'desc' },
      take: 8,
    });
    const notes = await db.tradeAccountNote.findMany({
      where: { companyId, tradeAccountId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const [unpaidSummary, paidSummary] = await Promise.all([
      db.job.aggregate({
        _sum: { totalCents: true },
        _count: { _all: true },
        where: {
          companyId,
          OR: [{ tradeAccountId: id }, { customerEmail: account.contactEmail || undefined }],
          invoiceIssuedAt: { not: null },
          invoicePaidAt: null,
        },
      }),
      db.job.aggregate({
        _sum: { totalCents: true },
        where: {
          companyId,
          OR: [{ tradeAccountId: id }, { customerEmail: account.contactEmail || undefined }],
          invoicePaidAt: { not: null },
        },
      }),
    ]);

    return {
      account,
      recentJobs,
      recentBookings,
      notes,
      summary: {
        unpaidCount: Number(unpaidSummary?._count?._all || 0),
        unpaidTotalCents: Number(unpaidSummary?._sum?.totalCents || 0),
        paidTotalCents: Number(paidSummary?._sum?.totalCents || 0),
      },
    };
  }

  async addNote(companyId: string, userId: string, accountId: string, dto: AddTradeAccountNoteDto) {
    const db = this.prisma as any;
    const account = await db.tradeAccount.findFirst({ where: { companyId, id: accountId } });
    if (!account) throw new NotFoundException('Trade account not found');
    const mentionHandles = Array.from(new Set((dto.body.match(/@[a-zA-Z0-9_.-]+/g) || []).map((m) => m.slice(1))));
    const note = await db.tradeAccountNote.create({
      data: {
        companyId,
        tradeAccountId: accountId,
        authorUserId: userId,
        body: dto.body,
        mentionHandles,
        attachmentsJson: dto.attachmentsMeta || null,
      },
    });
    await this.audit.log(companyId, 'trade.note.add', `Added note for ${account.name}`, userId);
    return note;
  }

  async updateNextAction(companyId: string, userId: string, accountId: string, dto: UpdateNextActionDto) {
    const db = this.prisma as any;
    const account = await db.tradeAccount.findFirst({ where: { companyId, id: accountId } });
    if (!account) throw new NotFoundException('Trade account not found');
    const updated = await db.tradeAccount.update({
      where: { id: accountId },
      data: {
        nextActionType: dto.type ?? null,
        nextActionDueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        nextActionUserId: dto.assignedUserId ?? null,
      },
    });
    await this.audit.log(companyId, 'trade.next-action.update', `Updated next action for ${account.name}`, userId);
    return updated;
  }

  async timeline(companyId: string, accountId: string, page = 1, pageSize = 25) {
    const db = this.prisma as any;
    const account = await db.tradeAccount.findFirst({ where: { companyId, id: accountId } });
    if (!account) throw new NotFoundException('Trade account not found');
    const normalizedPage = Math.max(1, Number(page || 1));
    const normalizedPageSize = Math.min(100, Math.max(1, Number(pageSize || 25)));
    const [jobs, bookings, notes, payments, audits] = await Promise.all([
      db.job.findMany({
        where: { companyId, tradeAccountId: accountId },
        orderBy: { createdAt: 'desc' },
        take: normalizedPageSize * 2,
      }),
      db.booking.findMany({
        where: { companyId, tradeAccountId: accountId },
        orderBy: { createdAt: 'desc' },
        take: normalizedPageSize * 2,
      }),
      db.tradeAccountNote.findMany({
        where: { companyId, tradeAccountId: accountId },
        orderBy: { createdAt: 'desc' },
        take: normalizedPageSize * 2,
      }),
      db.job.findMany({
        where: { companyId, tradeAccountId: accountId, invoicePaidAt: { not: null } },
        orderBy: { invoicePaidAt: 'desc' },
        take: normalizedPageSize * 2,
        select: { id: true, jobRef: true, invoicePaidAt: true, totalCents: true, paymentMethod: true },
      }),
      db.auditLog.findMany({
        where: { companyId, event: { startsWith: 'trade.' } },
        orderBy: { createdAt: 'desc' },
        take: normalizedPageSize * 2,
      }),
    ]);
    const timeline = [
      ...jobs.map((j: any) => ({ type: 'job', createdAt: j.createdAt, data: j })),
      ...bookings.map((b: any) => ({ type: 'booking', createdAt: b.createdAt, data: b })),
      ...notes.map((n: any) => ({ type: 'note', createdAt: n.createdAt, data: n })),
      ...payments.map((p: any) => ({ type: 'payment', createdAt: p.invoicePaidAt, data: p })),
      ...audits.map((a: any) => ({ type: 'system', createdAt: a.createdAt, data: a })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice((normalizedPage - 1) * normalizedPageSize, normalizedPage * normalizedPageSize);
    return { account, timeline, page: normalizedPage, pageSize: normalizedPageSize };
  }

  async crmSearch(companyId: string, query: CrmSearchQueryDto) {
    const db = this.prisma as any;
    const where: any = { companyId };
    if (query?.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { contactName: { contains: q, mode: 'insensitive' } },
        { contactEmail: { contains: q, mode: 'insensitive' } },
        { contactMobile: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (query?.tag) {
      where.customerTags = { some: { label: query.tag } };
    }
    const accounts = await db.tradeAccount.findMany({
      where,
      orderBy: [{ lastContactedAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        customerTags: true,
        ...TRADE_ACCOUNT_CRM_INCLUDE,
      },
      take: 100,
    });
    if (!query?.segmentId) return accounts;
    const segment = await db.customerSegment.findFirst({ where: { id: query.segmentId, companyId } });
    if (!segment?.rulesJson || typeof segment.rulesJson !== 'object') return accounts;
    const statusIn = Array.isArray((segment.rulesJson as any).statusIn) ? (segment.rulesJson as any).statusIn : null;
    if (!statusIn) return accounts;
    return accounts.filter((acc: any) => statusIn.includes(acc.status));
  }

  async crmFull(companyId: string, accountId: string) {
    const db = this.prisma as any;
    const account = await db.tradeAccount.findFirst({
      where: { companyId, id: accountId },
      include: { customerTags: true, ...TRADE_ACCOUNT_CRM_INCLUDE },
    });
    if (!account) throw new NotFoundException('Trade account not found');
    const [jobs, bookings, notes, tasks] = await Promise.all([
      db.job.findMany({ where: { companyId, tradeAccountId: accountId }, orderBy: { createdAt: 'desc' }, take: 20 }),
      db.booking.findMany({ where: { companyId, tradeAccountId: accountId }, orderBy: { startsAt: 'desc' }, take: 20 }),
      db.cRMNote.findMany({ where: { companyId, tradeAccountId: accountId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      db.cRMTask.findMany({ where: { companyId, tradeAccountId: accountId }, orderBy: [{ status: 'asc' }, { dueAt: 'asc' }] }),
    ]);
    const [unpaidSummary, paidSummary] = await Promise.all([
      db.job.aggregate({
        _sum: { totalCents: true },
        _count: { _all: true },
        where: { companyId, tradeAccountId: accountId, invoiceIssuedAt: { not: null }, invoicePaidAt: null },
      }),
      db.job.aggregate({
        _sum: { totalCents: true },
        where: { companyId, tradeAccountId: accountId, invoicePaidAt: { not: null } },
      }),
    ]);
    return {
      account,
      financialSummary: {
        unpaidCount: Number(unpaidSummary?._count?._all || 0),
        unpaidTotalCents: Number(unpaidSummary?._sum?.totalCents || 0),
        paidTotalCents: Number(paidSummary?._sum?.totalCents || 0),
      },
      timeline: [
        ...jobs.map((j: any) => ({ type: 'job', createdAt: j.createdAt, data: j })),
        ...bookings.map((b: any) => ({ type: 'booking', createdAt: b.createdAt, data: b })),
        ...notes.map((n: any) => ({ type: 'note', createdAt: n.createdAt, data: n })),
        ...tasks.map((t: any) => ({ type: 'task', createdAt: t.createdAt, data: t })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      notes,
      tasks,
      attachments: notes
        .map((note: any) => note.attachmentsJson)
        .filter(Boolean),
      tags: account.customerTags,
    };
  }

  async addCrmNote(companyId: string, userId: string, accountId: string, dto: AddCrmNoteDto) {
    const db = this.prisma as any;
    const account = await db.tradeAccount.findFirst({ where: { companyId, id: accountId } });
    if (!account) throw new NotFoundException('Trade account not found');
    const note = await db.cRMNote.create({
      data: {
        companyId,
        tradeAccountId: accountId,
        authorUserId: userId,
        bodyJson: dto.bodyJson || { text: '' },
        attachmentsJson: dto.attachmentsJson || null,
      },
    });
    await db.tradeAccount.update({
      where: { id: accountId },
      data: { lastContactedAt: new Date() },
    });
    await this.audit.log(companyId, 'crm.note.add', `Added CRM note for ${account.name}`, userId);
    return note;
  }

  async addCrmTask(companyId: string, userId: string, accountId: string, dto: AddCrmTaskDto) {
    const db = this.prisma as any;
    const account = await db.tradeAccount.findFirst({ where: { companyId, id: accountId } });
    if (!account) throw new NotFoundException('Trade account not found');
    const task = await db.cRMTask.create({
      data: {
        companyId,
        tradeAccountId: accountId,
        title: dto.title,
        details: dto.details || null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        assigneeUserId: dto.assigneeUserId || userId,
        status: normalizeCrmTaskStatus(dto.status),
      },
    });
    await this.audit.log(companyId, 'crm.task.add', `Added CRM task for ${account.name}`, userId);
    return task;
  }

  async patchCrmAccount(companyId: string, userId: string, accountId: string, dto: PatchCrmAccountDto) {
    const db = this.prisma as any;
    const existing = await db.tradeAccount.findFirst({ where: { companyId, id: accountId } });
    if (!existing) throw new NotFoundException('Trade account not found');

    const updated = await db.$transaction(async (tx: any) => {
      await tx.tradeAccount.update({
        where: { id: accountId },
        data: this.buildTradeAccountPayload(dto),
      });
      return this.syncNormalizedCrm(tx, companyId, { ...existing, ...dto }, dto);
    });

    await this.audit.log(companyId, 'crm.account.patch', `Updated CRM account ${updated.name}`, userId);
    return updated;
  }
}
