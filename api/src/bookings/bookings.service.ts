import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { AuditService } from '../audit/audit.service';
import { AutomationsService } from '../automations/automations.service';
import { BillingService } from '../billing/billing.service';
import { buildPaymentCollectionOptions } from '../billing/payment-collection';
import { getInternalNotificationSettings, getPortalControlSettings } from '../common/business-config';
import { ComplianceService } from '../compliance/compliance.service';
import { EmailService } from '../email/email.service';
import { EnterpriseFeatureFlagsService } from '../enterprise/enterprise-feature-flags.service';
import {
  buildBookingInternalNotificationEmailTemplate,
  buildBookingCancelledEmailTemplate,
  buildBookingConfirmedEmailTemplate,
  buildBookingRequestReceivedEmailTemplate,
  buildBookingRescheduledEmailTemplate,
  buildBookingStatusInternalEmailTemplate,
} from '../email/email-templates';
import { BookingStatus } from '../common/constants';
import { isAutomationsV1Enabled, isBookingProV1Enabled, isLocationsAdvancedV1Enabled } from '../common/feature-flags';
import { ActivityService } from '../events/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { acquireTechnicianLock } from '../common/advisory-lock';
import { buildApiUrl, buildAppUrl } from '../common/public-url';
import { buildAddressText, buildMapLinks } from '../common/maps';
import { BookingConversionService } from './booking-conversion.service';
import {
  BookingAvailabilityQueryDto,
  CancelBookingDto,
  ConfirmBookingDto,
  CreateBookingDto,
  CreateBookingProDto,
  PublicBookingRequestDto,
  RescheduleBookingDto,
  UpdateBookingProSettingsDto,
  UpdateBookingSettingsDto,
  UpsertBookingServiceDto,
} from './dto';

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly automations: AutomationsService,
    private readonly activity: ActivityService,
    private readonly conversion: BookingConversionService,
    private readonly compliance: ComplianceService,
    private readonly email: EmailService,
    private readonly billing: BillingService,
    private readonly enterpriseFlags: EnterpriseFeatureFlagsService,
  ) {}
  private readonly logger = new Logger(BookingsService.name);

  private resolveBookingMode(workflow: { locationFirstScheduling?: boolean; technicianAssignmentRequired?: boolean }) {
    if (workflow.locationFirstScheduling === false && workflow.technicianAssignmentRequired === true) return 'EMPLOYEE';
    if (workflow.locationFirstScheduling !== false && workflow.technicianAssignmentRequired === true) return 'HYBRID';
    return 'LOCATION';
  }

  private normalizeFolderConfig(input: any, index = 0) {
    const key = String(input?.key || input?.displayName || '').trim();
    if (!key) return null;
    const visibility = ['PUBLIC', 'TRADE', 'INTERNAL', 'ARCHIVED'].includes(String(input?.visibility || '').toUpperCase())
      ? String(input.visibility).toUpperCase()
      : 'PUBLIC';
    return {
      key,
      displayName: String(input?.displayName || key).trim() || key,
      publicDescription: String(input?.publicDescription || '').trim() || null,
      internalNotes: String(input?.internalNotes || '').trim() || null,
      imageUrl: String(input?.imageUrl || '').trim() || null,
      visibility,
      sortOrder: Number.isFinite(Number(input?.sortOrder)) ? Math.max(0, Math.round(Number(input.sortOrder))) : index,
    };
  }

  private getFolderConfigs(settings?: { businessConfigJson?: unknown } | null, services: any[] = []) {
    const config = settings?.businessConfigJson && typeof settings.businessConfigJson === 'object' && !Array.isArray(settings.businessConfigJson)
      ? settings.businessConfigJson as any
      : {};
    const configured = Array.isArray(config.publicBookingFolders)
      ? config.publicBookingFolders.map((folder: any, index: number) => this.normalizeFolderConfig(folder, index)).filter(Boolean)
      : [];
    const byKey = new Map(configured.map((folder: any) => [folder.key, folder]));
    for (const service of services) {
      const key = String(service?.category || this.normalizeBookingServiceConfig(service.bookingConfigJson).category || 'Services');
      if (!byKey.has(key)) byKey.set(key, this.normalizeFolderConfig({ key, displayName: key, sortOrder: byKey.size }, byKey.size));
    }
    return Array.from(byKey.values()).sort((a: any, b: any) => a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName));
  }

  private normalizeQuestionMeta(question: any) {
    const raw = question?.optionsJson && typeof question.optionsJson === 'object' && !Array.isArray(question.optionsJson)
      ? question.optionsJson
      : {};
    return {
      placeholder: String(raw.placeholder || '').trim() || null,
      helpText: String(raw.helpText || '').trim() || null,
      visibility: ['PUBLIC', 'TRADE', 'INTERNAL'].includes(String(raw.visibility || '').toUpperCase())
        ? String(raw.visibility).toUpperCase()
        : 'PUBLIC',
      locationIds: Array.isArray(raw.locationIds) ? raw.locationIds.map(String).filter(Boolean) : question?.locationId ? [question.locationId] : [],
      folderKeys: Array.isArray(raw.folderKeys) ? raw.folderKeys.map(String).filter(Boolean) : [],
      serviceIds: Array.isArray(raw.serviceIds) ? raw.serviceIds.map(String).filter(Boolean) : [],
      templateIds: Array.isArray(raw.templateIds) ? raw.templateIds.map(String).filter(Boolean) : [],
      sortOrder: Number.isFinite(Number(raw.sortOrder)) ? Math.max(0, Math.round(Number(raw.sortOrder))) : 100,
      validationRule: String(raw.validationRule || '').trim() || null,
      defaultValue: raw.defaultValue ?? null,
      consentMode: raw.consentMode === true,
      options: Array.isArray(raw.options) ? raw.options.map((option: any) => String(option)).filter(Boolean) : [],
    };
  }

  private questionApplies(question: any, input: { locationId?: string | null; folderKey?: string | null; serviceId?: string | null; trade?: boolean }) {
    const meta = this.normalizeQuestionMeta(question);
    if (meta.visibility === 'INTERNAL') return false;
    if (meta.visibility === 'TRADE' && !input.trade) return false;
    if (meta.locationIds.length && (!input.locationId || !meta.locationIds.includes(input.locationId))) return false;
    if (meta.folderKeys.length && (!input.folderKey || !meta.folderKeys.includes(input.folderKey))) return false;
    if (meta.serviceIds.length && (!input.serviceId || !meta.serviceIds.includes(input.serviceId))) return false;
    return true;
  }

  private mergeApplicableQuestions(questions: any[], input: { locationId?: string | null; folderKey?: string | null; serviceId?: string | null; trade?: boolean }) {
    const merged = new Map<string, any>();
    for (const question of questions.filter((entry) => this.questionApplies(entry, input))) {
      const existing = merged.get(question.questionKey);
      if (!existing) {
        merged.set(question.questionKey, question);
        continue;
      }
      const currentMeta = this.normalizeQuestionMeta(existing);
      const nextMeta = this.normalizeQuestionMeta(question);
      merged.set(question.questionKey, {
        ...existing,
        ...question,
        id: existing.id,
        required: Boolean(existing.required || question.required),
        optionsJson: {
          ...currentMeta,
          ...nextMeta,
          sortOrder: Math.min(currentMeta.sortOrder, nextMeta.sortOrder),
        },
      });
    }
    return Array.from(merged.values()).sort((a, b) => {
      const left = this.normalizeQuestionMeta(a).sortOrder;
      const right = this.normalizeQuestionMeta(b).sortOrder;
      return left - right || a.label.localeCompare(b.label);
    });
  }

  private getBookingWorkflowSettings(settings?: { businessConfigJson?: unknown } | null) {
    const config = settings?.businessConfigJson && typeof settings.businessConfigJson === 'object' ? (settings.businessConfigJson as any) : {};
    const workflow = config.bookingWorkflow && typeof config.bookingWorkflow === 'object' ? config.bookingWorkflow : {};
    const normalized = {
      autoCreateJobFromBooking: workflow.autoCreateJobFromBooking === true,
      autoAssignWorkflow: workflow.autoAssignWorkflow === true,
      manualReviewMode: workflow.manualReviewMode !== false,
      locationFirstScheduling: workflow.locationFirstScheduling !== false,
      autoPopulateJobSheetFromBooking: workflow.autoPopulateJobSheetFromBooking !== false,
      autoCreateInvoiceDraftOnCompletion: workflow.autoCreateInvoiceDraftOnCompletion === true,
      autoSendInvoiceOnCompletion: workflow.autoSendInvoiceOnCompletion === true,
      technicianAssignmentRequired: workflow.technicianAssignmentRequired === true,
      locationRequiredForBooking: workflow.locationRequiredForBooking === true,
    };
    return {
      ...normalized,
      bookingMode: ['LOCATION', 'EMPLOYEE', 'HYBRID'].includes(String(workflow.bookingMode || '').toUpperCase())
        ? String(workflow.bookingMode).toUpperCase()
        : this.resolveBookingMode(normalized),
    };
  }

  private hasBookingWorkflowUpdate(dto: UpdateBookingSettingsDto | UpdateBookingProSettingsDto) {
    return (
      typeof dto.autoCreateJobFromBooking === 'boolean' ||
      typeof dto.autoAssignWorkflow === 'boolean' ||
      typeof dto.manualReviewMode === 'boolean' ||
      typeof dto.bookingMode === 'string' ||
      typeof dto.locationFirstScheduling === 'boolean' ||
      typeof dto.autoPopulateJobSheetFromBooking === 'boolean' ||
      typeof dto.autoCreateInvoiceDraftOnCompletion === 'boolean' ||
      typeof dto.autoSendInvoiceOnCompletion === 'boolean' ||
      typeof dto.technicianAssignmentRequired === 'boolean' ||
      typeof dto.locationRequiredForBooking === 'boolean'
    );
  }

  private async updateBookingWorkflowSettings(tenantId: string, dto: UpdateBookingSettingsDto | UpdateBookingProSettingsDto) {
    if (!this.hasBookingWorkflowUpdate(dto)) return;
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId }, select: { businessConfigJson: true } });
    const config = settings?.businessConfigJson && typeof settings.businessConfigJson === 'object' ? (settings.businessConfigJson as any) : {};
    const currentWorkflow = this.getBookingWorkflowSettings(settings);
    const mode = ['LOCATION', 'EMPLOYEE', 'HYBRID'].includes(String(dto.bookingMode || '').toUpperCase())
      ? String(dto.bookingMode).toUpperCase()
      : null;
    const modeWorkflow = mode === 'LOCATION'
      ? { bookingMode: mode, locationFirstScheduling: true, technicianAssignmentRequired: false }
      : mode === 'EMPLOYEE'
        ? { bookingMode: mode, locationFirstScheduling: false, technicianAssignmentRequired: true }
        : mode === 'HYBRID'
          ? { bookingMode: mode, locationFirstScheduling: true, technicianAssignmentRequired: true }
          : {};
    const bookingWorkflow = {
      ...currentWorkflow,
      ...modeWorkflow,
      ...(typeof dto.autoCreateJobFromBooking === 'boolean' ? { autoCreateJobFromBooking: dto.autoCreateJobFromBooking } : {}),
      ...(typeof dto.autoAssignWorkflow === 'boolean' ? { autoAssignWorkflow: dto.autoAssignWorkflow } : {}),
      ...(typeof dto.manualReviewMode === 'boolean' ? { manualReviewMode: dto.manualReviewMode } : {}),
      ...(typeof dto.locationFirstScheduling === 'boolean' ? { locationFirstScheduling: dto.locationFirstScheduling } : {}),
      ...(typeof dto.autoPopulateJobSheetFromBooking === 'boolean' ? { autoPopulateJobSheetFromBooking: dto.autoPopulateJobSheetFromBooking } : {}),
      ...(typeof dto.autoCreateInvoiceDraftOnCompletion === 'boolean' ? { autoCreateInvoiceDraftOnCompletion: dto.autoCreateInvoiceDraftOnCompletion } : {}),
      ...(typeof dto.autoSendInvoiceOnCompletion === 'boolean' ? { autoSendInvoiceOnCompletion: dto.autoSendInvoiceOnCompletion } : {}),
      ...(typeof dto.technicianAssignmentRequired === 'boolean' ? { technicianAssignmentRequired: dto.technicianAssignmentRequired } : {}),
      ...(typeof dto.locationRequiredForBooking === 'boolean' ? { locationRequiredForBooking: dto.locationRequiredForBooking } : {}),
    };
    bookingWorkflow.bookingMode = this.resolveBookingMode(bookingWorkflow);
    await db.tenantSetting.update({
      where: { tenantId },
      data: { businessConfigJson: { ...config, bookingWorkflow } },
    });
  }

  private normalizeBookingServiceConfig(input: any) {
    const raw = input && typeof input === 'object' ? input : {};
    const storedVisibility = ['PUBLIC', 'TRADE', 'INTERNAL'].includes(String(raw.visibility || '').toUpperCase())
      ? String(raw.visibility).toUpperCase()
      : 'PUBLIC';
    const publicVisible = typeof raw.publicVisible === 'boolean' ? raw.publicVisible : storedVisibility === 'PUBLIC';
    const tradeVisible = typeof raw.tradeVisible === 'boolean' ? raw.tradeVisible : storedVisibility === 'PUBLIC' || storedVisibility === 'TRADE';
    const privateVisible = typeof raw.privateVisible === 'boolean' ? raw.privateVisible : tradeVisible;
    const visibility = publicVisible ? 'PUBLIC' : tradeVisible || privateVisible ? 'TRADE' : 'INTERNAL';
    const discountPriceCents = Number(raw.discountPriceCents);
    const depositValue = Number(raw.depositValue);
    const depositType = ['NONE', 'FIXED', 'PERCENTAGE'].includes(String(raw.depositType || '').toUpperCase())
      ? String(raw.depositType || '').toUpperCase()
      : 'FIXED';
    const completionPaymentMode = ['ON_CONFIRMATION', 'ON_COMPLETION', 'MANUAL_FOLLOW_UP'].includes(String(raw.completionPaymentMode || '').toUpperCase())
      ? String(raw.completionPaymentMode || '').toUpperCase()
      : 'ON_COMPLETION';
    const paymentProvider = ['STRIPE', 'MANUAL', 'SUMUP', 'WORLDPAY'].includes(String(raw.paymentProvider || '').toUpperCase())
      ? String(raw.paymentProvider || '').toUpperCase()
      : 'MANUAL';
    const imageUrl = String(raw.imageUrl || '').trim() || null;
    const shortDescription = String(raw.shortDescription || '').trim() || null;
    const longDescription = String(raw.longDescription || '').trim() || null;
    const tradeAccountDepositWaived = raw.tradeAccountDepositWaived === true;
    const maxQuantity = Math.max(1, Math.min(10, Math.round(Number(raw.publicBundleMaxQuantity || 1))));
    const publicBundleIncompatibleServiceIds = Array.isArray(raw.publicBundleIncompatibleServiceIds)
      ? raw.publicBundleIncompatibleServiceIds.map((id: any) => String(id || '').trim()).filter(Boolean)
      : [];
    const customOptions = Array.isArray(raw.customOptions)
      ? raw.customOptions
          .map((option: any, index: number) => {
            const key = String(option?.key || `option_${index + 1}`).trim();
            const label = String(option?.label || '').trim();
            const description = String(option?.description || '').trim() || null;
            const priceCents = Number(option?.priceCents);
            return {
              key,
              label,
              description,
              priceCents: Number.isFinite(priceCents) && priceCents >= 0 ? Math.round(priceCents) : 0,
              defaultSelected: option?.defaultSelected === true,
            };
          })
          .filter((option: any) => option.key && option.label)
      : [];

    return {
      category: String(raw.category || 'Services').trim() || 'Services',
      visibility,
      publicVisible,
      tradeVisible,
      privateVisible,
      discountPriceCents: Number.isFinite(discountPriceCents) && discountPriceCents >= 0 ? discountPriceCents : null,
      depositType,
      depositValue: Number.isFinite(depositValue) && depositValue >= 0 ? depositValue : 0,
      completionPaymentMode,
      paymentProvider,
      assignedUserId: String(raw.assignedUserId || '').trim() || null,
      customerNotes: String(raw.customerNotes || '').trim() || null,
      imageUrl,
      shortDescription,
      longDescription,
      customOptions,
      tradeAccountDepositWaived,
      publicBundleEligible: raw.publicBundleEligible === true,
      publicBundleAddOn: raw.publicBundleAddOn === true,
      publicBundleMaxQuantity: Number.isFinite(maxQuantity) ? maxQuantity : 1,
      publicBundleIncompatibleServiceIds,
      requireCustomerPhone: raw.requireCustomerPhone === true,
      requireVehicleRegistration: raw.requireVehicleRegistration === true,
      requireLockingWheelNut: raw.requireLockingWheelNut === true,
    };
  }

  private buildBookingServiceConfig(dto: UpsertBookingServiceDto) {
    return this.normalizeBookingServiceConfig({
      category: dto.category,
      visibility: dto.visibility,
      publicVisible: dto.publicVisible,
      tradeVisible: dto.tradeVisible,
      privateVisible: dto.privateVisible,
      discountPriceCents: dto.discountPriceCents,
      depositType: dto.depositType,
      depositValue: dto.depositValue,
      completionPaymentMode: dto.completionPaymentMode,
      paymentProvider: dto.paymentProvider,
      assignedUserId: dto.assignedUserId,
      customerNotes: dto.customerNotes,
      imageUrl: dto.imageUrl,
      shortDescription: dto.shortDescription,
      longDescription: dto.longDescription,
      customOptions: dto.customOptions,
      tradeAccountDepositWaived: dto.tradeAccountDepositWaived,
      publicBundleEligible: dto.publicBundleEligible,
      publicBundleAddOn: dto.publicBundleAddOn,
      publicBundleMaxQuantity: dto.publicBundleMaxQuantity,
      publicBundleIncompatibleServiceIds: dto.publicBundleIncompatibleServiceIds,
      requireCustomerPhone: dto.requireCustomerPhone,
      requireVehicleRegistration: dto.requireVehicleRegistration,
      requireLockingWheelNut: dto.requireLockingWheelNut,
    });
  }

  private serviceVisibleForAudience(config: ReturnType<BookingsService['normalizeBookingServiceConfig']>, tradeMatched: boolean) {
    return tradeMatched ? config.tradeVisible || config.privateVisible : config.publicVisible;
  }

  private normalizeLocationVisibility(location: any) {
    const meta = location?.metadataJson && typeof location.metadataJson === 'object' && !Array.isArray(location.metadataJson)
      ? location.metadataJson
      : {};
    const publicVisible = meta.publicVisible !== false;
    const tradeVisible = meta.tradeVisible !== false;
    const privateVisible = meta.privateVisible !== false;
    return { publicVisible, tradeVisible, privateVisible };
  }

  private locationVisibleForAudience(location: any, tradeMatched: boolean) {
    const visibility = this.normalizeLocationVisibility(location);
    return tradeMatched ? visibility.tradeVisible || visibility.privateVisible : visibility.publicVisible;
  }

  private getServicePricingSnapshot(service: any, input?: {
    workspacePaymentCollection?: ReturnType<typeof buildPaymentCollectionOptions> | null;
    assignedUserId?: string | null;
    selectedOptions?: Array<{ key?: string; label?: string; quantity?: number }> | null;
    tradeAccountMatched?: boolean;
  }) {
    const config = this.normalizeBookingServiceConfig(service?.bookingConfigJson);
    const standardPriceCents = Math.max(0, Number(service?.priceCents || 0));
    const candidateDiscount = config.discountPriceCents;
    const discountPriceCents =
      typeof candidateDiscount === 'number' && candidateDiscount > 0 && candidateDiscount < standardPriceCents
        ? candidateDiscount
        : null;
    const selectedOptions = Array.isArray(input?.selectedOptions) ? input?.selectedOptions : [];
    const selectedOptionEntries = selectedOptions
      .map((option) => {
        const key = String(option?.key || '').trim();
        const quantity = Math.max(1, Math.round(Number(option?.quantity || 1)));
        return key ? ([key, quantity] as [string, number]) : null;
      })
      .filter(Boolean) as Array<[string, number]>;
    const selectedOptionMap = new Map<string, number>(selectedOptionEntries);
    const optionLines = config.customOptions
      .map((option: any) => {
        const quantity = selectedOptionMap.get(option.key) ?? (option.defaultSelected ? 1 : 0);
        return quantity > 0
          ? {
              key: option.key,
              label: option.label,
              description: option.description || null,
              quantity,
              unitPriceCents: option.priceCents,
              totalPriceCents: Math.max(0, Math.round(option.priceCents * quantity)),
            }
          : null;
      })
      .filter(Boolean) as Array<{
        key: string;
        label: string;
        description?: string | null;
        quantity: number;
        unitPriceCents: number;
        totalPriceCents: number;
      }>;
    const optionsTotalCents = optionLines.reduce((sum, option) => sum + Number(option.totalPriceCents || 0), 0);
    const effectivePriceCents = (discountPriceCents ?? standardPriceCents) + optionsTotalCents;
    const tradeAccountDepositWaived = Boolean(config.tradeAccountDepositWaived && input?.tradeAccountMatched);
    const depositDueCents =
      tradeAccountDepositWaived
        ? 0
        :
      config.depositType === 'PERCENTAGE'
        ? Math.max(0, Math.min(effectivePriceCents, Math.round((effectivePriceCents * config.depositValue) / 100)))
        : config.depositType === 'FIXED'
          ? Math.max(0, Math.min(effectivePriceCents, Math.round(config.depositValue)))
          : 0;
    const workspacePreferredProvider = input?.workspacePaymentCollection?.customerCollection?.preferredProvider || 'MANUAL';
    const paymentProvider = config.paymentProvider || workspacePreferredProvider;
    const providerState =
      input?.workspacePaymentCollection?.customerCollection?.providers?.find((provider) => provider.provider === paymentProvider) || null;
    const liveCollectionSupported = false;

    return {
      serviceName: String(service?.name || '').trim() || 'Service',
      description: config.shortDescription || String(service?.description || '').trim() || null,
      shortDescription: config.shortDescription || String(service?.description || '').trim() || null,
      longDescription: config.longDescription,
      imageUrl: config.imageUrl,
      durationMinutes: Math.max(5, Number(service?.durationMinutes || 60)),
      standardPriceCents,
      discountPriceCents,
      effectivePriceCents,
      selectedOptions: optionLines,
      availableOptions: config.customOptions,
      optionsTotalCents,
      depositType: config.depositType,
      depositValue: config.depositValue,
      depositDueCents,
      remainingBalanceCents: Math.max(0, effectivePriceCents - depositDueCents),
      completionPaymentMode: config.completionPaymentMode,
      paymentProvider,
      paymentProviderStatus: providerState?.status || 'connected',
      liveCollectionSupported,
      paymentStatusMessage:
        paymentProvider === 'MANUAL'
          ? 'Customer payments go through your chosen payment provider. If nothing is connected yet, collect manually and record payment after the visit.'
          : paymentProvider === 'STRIPE'
            ? 'Online card payments use the Stripe account configured by this business.'
            : providerState?.status === 'requested'
              ? `${providerState.label} has been requested for this workspace, but customer payment setup is not live yet.`
              : `${providerState?.label || paymentProvider} is not ready for live customer collection yet. Use manual collection or finish payment setup first.`,
      assignedUserId: input?.assignedUserId || config.assignedUserId || null,
      customerNotes: config.customerNotes,
      category: config.category,
      visibility: config.visibility,
      publicVisible: config.publicVisible,
      tradeVisible: config.tradeVisible,
      privateVisible: config.privateVisible,
      tradeAccountDepositWaived,
      publicBundleEligible: config.publicBundleEligible,
      publicBundleAddOn: config.publicBundleAddOn,
      publicBundleMaxQuantity: config.publicBundleMaxQuantity,
      publicBundleIncompatibleServiceIds: config.publicBundleIncompatibleServiceIds,
      requireCustomerPhone: config.requireCustomerPhone,
      requireVehicleRegistration: config.requireVehicleRegistration,
      requireLockingWheelNut: config.requireLockingWheelNut,
    };
  }

  private normalizeBookingServiceLineInputs(dto: Pick<CreateBookingDto, 'serviceId' | 'serviceLines'>) {
    const rows = Array.isArray(dto.serviceLines) ? dto.serviceLines : [];
    const seen = new Set<string>();
    const normalized: Array<{ serviceId: string; quantity: number; sortOrder: number }> = [];

    const add = (serviceId: string, quantity = 1, sortOrder?: number) => {
      const id = String(serviceId || '').trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      const qty = Math.max(1, Math.min(99, Math.round(Number(quantity || 1))));
      normalized.push({
        serviceId: id,
        quantity: qty,
        sortOrder: Number.isFinite(Number(sortOrder)) ? Math.max(0, Math.round(Number(sortOrder))) : normalized.length,
      });
    };

    add(String(dto.serviceId || ''), 1, 0);
    rows.forEach((row, index) => add(String(row?.proServiceId || row?.serviceId || ''), row?.quantity, row?.sortOrder ?? index + 1));
    return normalized.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private normalizePublicBookingServiceLineInputs(dto: Pick<PublicBookingRequestDto, 'serviceId' | 'serviceLines'>) {
    const rows = Array.isArray(dto.serviceLines) ? dto.serviceLines : [];
    const seen = new Set<string>();
    const normalized: Array<{ serviceId: string; quantity: number; sortOrder: number; selectedOptions?: Array<{ key?: string; quantity?: number }> }> = [];

    const add = (serviceId: string, quantity = 1, sortOrder?: number, selectedOptions?: Array<{ key?: string; quantity?: number }>) => {
      const id = String(serviceId || '').trim();
      if (!id || seen.has(id)) return;
      seen.add(id);
      const qty = Math.max(1, Math.min(10, Math.round(Number(quantity || 1))));
      normalized.push({
        serviceId: id,
        quantity: qty,
        sortOrder: Number.isFinite(Number(sortOrder)) ? Math.max(0, Math.round(Number(sortOrder))) : normalized.length,
        selectedOptions: Array.isArray(selectedOptions) ? selectedOptions : undefined,
      });
    };

    add(String(dto.serviceId || ''), 1, 0);
    rows.forEach((row, index) =>
      add(String(row?.proServiceId || row?.serviceId || ''), row?.quantity, index + 1, row?.selectedOptions),
    );
    return normalized.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private buildBundlePricingSnapshot(lines: Array<{ service: any; snapshot: any; quantity: number }>) {
    const bundleTotalCents = lines.reduce(
      (sum, line) => sum + Math.max(0, Math.round(Number(line.snapshot?.effectivePriceCents || 0))) * Math.max(1, Number(line.quantity || 1)),
      0,
    );
    const bundleDepositDueCents = lines.reduce(
      (sum, line) => sum + Math.max(0, Math.round(Number(line.snapshot?.depositDueCents || 0))) * Math.max(1, Number(line.quantity || 1)),
      0,
    );
    const bundleDurationMinutes = lines.reduce(
      (sum, line) => sum + Math.max(5, Math.round(Number(line.snapshot?.durationMinutes || line.service?.durationMinutes || 60))) * Math.max(1, Number(line.quantity || 1)),
      0,
    );
    const first = lines[0]?.snapshot || {};
    return {
      ...first,
      durationMinutes: bundleDurationMinutes || first.durationMinutes,
      effectivePriceCents: bundleTotalCents || first.effectivePriceCents,
      depositDueCents: bundleDepositDueCents,
      remainingBalanceCents: Math.max(0, bundleTotalCents - bundleDepositDueCents),
      serviceLines: lines.map((line) => ({
        proServiceId: line.service.id,
        serviceName: line.snapshot.serviceName,
        quantity: line.quantity,
        durationMinutes: line.snapshot.durationMinutes,
        effectivePriceCents: line.snapshot.effectivePriceCents,
        depositDueCents: line.snapshot.depositDueCents,
        lineTotalCents: Math.max(0, Math.round(Number(line.snapshot?.effectivePriceCents || 0))) * Math.max(1, Number(line.quantity || 1)),
      })),
      bundleTotalCents,
      bundleDepositDueCents,
      bundleDurationMinutes,
      publicBookingBundle: lines.length > 1,
    };
  }

  private buildBookingServiceLineData(companyId: string, bookingId: string, service: any, pricingSnapshot: any, quantity: number, sortOrder: number) {
    const qty = Math.max(1, Math.min(99, Math.round(Number(quantity || 1))));
    const unitTotalCents = Math.max(0, Math.round(Number(pricingSnapshot?.effectivePriceCents ?? service?.priceCents ?? 0)));
    return {
      companyId,
      bookingId,
      proServiceId: service?.id || null,
      serviceNameSnapshot: String(pricingSnapshot?.serviceName || service?.name || 'Service'),
      priceSnapshot: pricingSnapshot,
      durationSnapshot: Math.max(5, Math.round(Number(pricingSnapshot?.durationMinutes ?? service?.durationMinutes ?? 60))),
      quantity: qty,
      lineTotalCents: unitTotalCents * qty,
      sortOrder,
    };
  }

  private async findVerifiedTradeAccountMatch(tenantId: string, input: { email?: string | null; tradeAccountId?: string | null }) {
    const email = String(input.email || '').trim().toLowerCase();
    const requestedTradeAccountId = String(input.tradeAccountId || '').trim();
    if (!email) return null;
    const db = this.prisma as any;
    const matches = await db.tradeAccount.findMany({
      where: {
        companyId: tenantId,
        status: 'ACTIVE',
        ...(requestedTradeAccountId ? { id: requestedTradeAccountId } : {}),
        OR: [
          { contactEmail: { equals: email, mode: 'insensitive' } },
          {
            contacts: {
              some: {
                isActive: true,
                email: { equals: email, mode: 'insensitive' },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        contactEmail: true,
      },
      take: requestedTradeAccountId ? 1 : 2,
    });
    if (requestedTradeAccountId) {
      return matches[0] || null;
    }
    return matches.length === 1 ? matches[0] : null;
  }

  private async getWorkspacePaymentCollection(tenantId: string) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    const providerStatusRows = await db.integrationCredential.findMany({
      where: {
        tenantId,
        scope: 'WORKSPACE',
        provider: {
          in: ['STRIPE_CUSTOMER_PAYMENTS', 'SUMUP', 'WORLDPAY'],
        },
      },
      select: { provider: true, status: true },
    });
    const providerStatuses = providerStatusRows.reduce((acc: Record<string, string>, row: { provider: string; status: string }) => {
      if (row.provider === 'STRIPE_CUSTOMER_PAYMENTS') {
        acc.STRIPE = String(row.status || '').toLowerCase();
      } else {
        acc[String(row.provider || '').toUpperCase()] = String(row.status || '').toLowerCase();
      }
      return acc;
    }, {});
    return buildPaymentCollectionOptions({
      paymentsEnabled: Boolean(settings?.paymentsEnabled || settings?.featurePayments),
      stripeConfigured: this.billing.isStripeConfigured(),
      settings,
      providerStatuses,
    });
  }

  private async getWorkspaceNotificationRecipients(tenantId: string) {
    return this.notifications.getWorkspaceInternalEmailRecipients(tenantId, 'bookings');
  }

  private normalizeDeliverableEmail(value?: string | null) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
    if (normalized.endsWith('.local') || normalized.endsWith('.test') || normalized.endsWith('@localhost')) return null;
    const reserved = new Set(
      [
        process.env.SUPPORT_EMAIL,
        process.env.SYSTEM_EMAIL,
        process.env.SMTP_FROM_EMAIL,
        process.env.SMTP_FROM,
        process.env.EMAIL_FROM,
        'support@mytitan.co.uk',
      ]
        .map((entry) => String(entry || '').trim().toLowerCase())
        .filter(Boolean),
    );
    if (reserved.has(normalized)) return null;
    return normalized;
  }

  private resolveBookingCustomerRecipient(booking: any, purpose: 'general' | 'billing' = 'general') {
    const tradeAccount = booking?.tradeAccount || {};
    const orderedCandidates =
      purpose === 'billing'
        ? [tradeAccount.billingEmail, booking?.customerEmail, tradeAccount.contactEmail]
        : [booking?.customerEmail, tradeAccount.contactEmail, tradeAccount.billingEmail];
    for (const candidate of orderedCandidates) {
      const email = this.normalizeDeliverableEmail(candidate || '');
      if (email) return email;
    }
    return null;
  }

  private async ensurePublicStatusToken(input: { bookingId: string; currentToken?: string | null }) {
    const currentToken = String(input.currentToken || '').trim();
    if (currentToken) return currentToken;
    const db = this.prisma as any;
    const token = crypto.randomBytes(24).toString('base64url');
    const updated = await db.booking.update({
      where: { id: input.bookingId },
      data: { publicStatusToken: token },
      select: { publicStatusToken: true },
    });
    return String(updated?.publicStatusToken || token);
  }

  private buildPublicBookingStatusUrl(publicStatusToken?: string | null) {
    const token = String(publicStatusToken || '').trim();
    return token ? buildAppUrl(`/portal/booking/status/${token}`) : null;
  }

  private buildBookingCalendarLinks(booking: any, serviceName: string, locationAddress?: string | null) {
    const startsAt = new Date(booking.startsAt);
    const endsAt = new Date(booking.endsAt);
    const formatCalendarDate = (value: Date) => value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const dates = `${formatCalendarDate(startsAt)}/${formatCalendarDate(endsAt)}`;
    const title = `${serviceName} - booking`;
    const details = `Booking reference: ${booking.id}`;
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title,
      dates,
      details,
      location: locationAddress || '',
    });
    const outlook = new URLSearchParams({
      path: '/calendar/action/compose',
      rru: 'addevent',
      subject: title,
      startdt: startsAt.toISOString(),
      enddt: endsAt.toISOString(),
      body: details,
      location: locationAddress || '',
    });
    return {
      googleCalendarUrl: `https://calendar.google.com/calendar/render?${params.toString()}`,
      outlookCalendarUrl: `https://outlook.live.com/calendar/0/deeplink/compose?${outlook.toString()}`,
      icsUrl: booking.publicStatusToken ? buildApiUrl(`/public/booking-status/${booking.publicStatusToken}/calendar.ics`) : null,
    };
  }

  private async getBookingLocationPresentation(tenantId: string, locationId?: string | null) {
    if (!locationId) return null;
    const db = this.prisma as any;
    const location = await db.location.findFirst({
      where: { id: locationId, companyId: tenantId, isActive: true },
      include: { businessHours: { orderBy: { weekday: 'asc' } } },
    });
    if (!location) return null;
    const metadata = location.metadataJson && typeof location.metadataJson === 'object' ? location.metadataJson : {};
    const address = buildAddressText({
      line1: location.addressLine1,
      line2: location.addressLine2,
      city: location.city,
      state: location.state,
      postalCode: location.postalCode,
      country: location.country,
    });
    const maps = buildMapLinks(address);
    const weekday = new Date().getUTCDay();
    const openingHours = (location.businessHours || []).map((row: any) => {
      const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][Number(row.weekday)] || `Day ${row.weekday}`;
      if (row.isClosed) return `${day}: closed`;
      const formatMinute = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
      return `${day}: ${formatMinute(Number(row.startMinute || 0))}-${formatMinute(Number(row.endMinute || 0))}`;
    });
    return {
      name: location.name,
      address,
      phone: location.phone,
      email: location.email,
      arrivalInstructions: String((metadata as any).arrivalInstructions || '') || null,
      parkingInstructions: String((metadata as any).parkingInstructions || '') || null,
      openingHoursLabel: openingHours.length ? openingHours.join('; ') : null,
      googleMapsUrl: maps.googleMapsUrl,
      appleMapsUrl: maps.appleMapsUrl,
      wazeUrl: address ? `https://www.waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes` : null,
      todayIsClosed: Boolean((location.businessHours || []).find((row: any) => Number(row.weekday) === weekday)?.isClosed),
    };
  }

  private formatBookingMoney(value?: number | null) {
    return typeof value === 'number' ? `£${(value / 100).toFixed(2)}` : 'Not set';
  }

  private buildDepositStatus(input: {
    depositDueCents?: number | null;
    liveCollectionSupported?: boolean | null;
    paymentProvider?: string | null;
    paymentStatusMessage?: string | null;
  }) {
    const depositDueCents = Math.max(0, Number(input.depositDueCents || 0));
    if (depositDueCents <= 0) {
      return {
        collectionState: 'no_deposit_required',
        depositStatus: 'not_required',
        depositStatusLabel: 'No deposit required',
        note: 'No deposit is required for this booking.',
      };
    }
    if (input.liveCollectionSupported) {
      return {
        collectionState: 'ready_for_checkout',
        depositStatus: 'checkout_required',
        depositStatusLabel: 'Deposit checkout ready',
        note: input.paymentStatusMessage || 'A live deposit checkout is ready for this booking.',
      };
    }
    return {
      collectionState: input.paymentProvider === 'MANUAL' ? 'manual_follow_up' : 'setup_required',
      depositStatus: 'pending',
      depositStatusLabel: input.paymentProvider === 'MANUAL' ? 'Confirmed, collect deposit manually' : 'Payment setup still needed',
      note:
        input.paymentStatusMessage ||
        'This booking is confirmed. Customer payment still needs the business payment setup or a manual follow-up.',
    };
  }

  private normalizeBookingPaymentState(paymentStateJson: any) {
    return paymentStateJson && typeof paymentStateJson === 'object' ? { ...paymentStateJson } : {};
  }

  private async updateBookingPaymentState(bookingId: string, updater: (current: Record<string, any>) => Record<string, any>) {
    const db = this.prisma as any;
    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, paymentStateJson: true },
    });
    if (!booking) {
      throw new BadRequestException('Booking not found');
    }
    const current = this.normalizeBookingPaymentState(booking.paymentStateJson);
    const next = updater(current);
    await db.booking.update({
      where: { id: bookingId },
      data: { paymentStateJson: next },
    });
    return next;
  }

  private async createPublicBookingRecord(tx: any, input: {
    tenantId: string;
    locationId?: string | null;
    serviceId?: string | null;
    proServiceId?: string | null;
    tradeAccountId?: string | null;
    customerName?: string | null;
    customerEmail?: string | null;
    customerPhone?: string | null;
    assignedUserId?: string | null;
    startsAt: Date;
    endsAt: Date;
    pricingSnapshot: Record<string, any>;
    paymentState: Record<string, any>;
    status?: 'PENDING' | 'CONFIRMED';
    serviceLines?: Array<{ service: any; snapshot: any; quantity: number; sortOrder: number }>;
  }) {
    const assignedUserId = String(input.assignedUserId || '').trim() || null;
    if (assignedUserId) {
      await acquireTechnicianLock(tx, input.tenantId, assignedUserId);
      const conflicts = await tx.booking.findMany({
        where: {
          companyId: input.tenantId,
          assignedUserId,
          status: { not: 'CANCELLED' },
          startsAt: { lt: input.endsAt },
          endsAt: { gt: input.startsAt },
        },
        select: { id: true },
      });
      if (conflicts.length > 0) {
        throw new ConflictException({
          code: 'BOOKING_SLOT_UNAVAILABLE',
          message: 'That time was just taken. Please choose another available slot.',
        });
      }
    }

    const booking = await tx.booking.create({
      data: {
        companyId: input.tenantId,
        locationId: input.locationId || null,
        serviceId: input.serviceId || null,
        proServiceId: input.proServiceId || null,
        tradeAccountId: input.tradeAccountId || null,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone,
        assignedUserId,
        publicStatusToken: crypto.randomBytes(24).toString('base64url'),
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status: input.status === 'CONFIRMED' ? 'CONFIRMED' : 'PENDING',
        source: 'PUBLIC',
        pricingSnapshotJson: input.pricingSnapshot,
        paymentStateJson: input.paymentState,
      },
    });
    if (Array.isArray(input.serviceLines) && input.serviceLines.length > 0) {
      await tx.bookingServiceLine.createMany({
        data: input.serviceLines.map((line, index) =>
          this.buildBookingServiceLineData(input.tenantId, booking.id, line.service, line.snapshot, line.quantity, line.sortOrder ?? index),
        ),
      });
    }
    return booking;
  }

  private getCustomerFacingBookingState(booking: any) {
    const status = String(booking?.status || 'PLANNED').toUpperCase();
    const paymentState = booking?.paymentStateJson && typeof booking.paymentStateJson === 'object' ? booking.paymentStateJson : null;
    const depositStatus = String(paymentState?.depositStatus || '').toLowerCase();
    if (booking?.jobId) {
      return {
        code: 'converted_to_job',
        label: 'Confirmed and scheduled',
        nextStep: 'The booking is linked to live work. The team will handle the visit through the work schedule.',
        canReschedule: false,
        canCancel: false,
      };
    }
    if (status === 'CANCELLED') {
      return {
        code: 'cancelled',
        label: 'Cancelled',
        nextStep: 'This booking is closed. Contact the workspace if you need to arrange a new visit.',
        canReschedule: false,
        canCancel: false,
      };
    }
    if (status === 'CONFIRMED') {
      return {
        code: 'confirmed',
        label:
          depositStatus === 'paid'
            ? 'Confirmed, deposit paid'
            : depositStatus === 'pending'
              ? 'Confirmed, deposit pending'
              : 'Confirmed',
        nextStep:
          depositStatus === 'pending'
            ? 'Your time is confirmed. The deposit still needs the follow-up shown below.'
            : 'Your time is confirmed. Use this page if you need to review the latest details.',
        canReschedule: !booking?.jobId,
        canCancel: !booking?.jobId,
      };
    }
    if (['checkout_required', 'failed', 'expired'].includes(depositStatus)) {
      return {
        code: 'payment_required',
        label: depositStatus === 'failed' ? 'Payment unsuccessful' : 'Deposit payment required',
        nextStep:
          depositStatus === 'expired'
            ? 'The previous payment link expired. Start a new secure payment to continue.'
            : depositStatus === 'failed'
              ? 'The deposit was not paid. Try the secure payment again to confirm your booking.'
              : 'Pay the deposit securely to confirm your booking.',
        canReschedule: false,
        canCancel: true,
      };
    }
    return {
      code: 'requested',
      label: 'Waiting for confirmation',
      nextStep: 'The team still needs to confirm the booking. They may confirm it, move it, or contact you if anything changes.',
      canReschedule: !booking?.jobId,
      canCancel: !booking?.jobId,
    };
  }

  private async getBookingComms(tenantId: string, bookingId: string) {
    const db = this.prisma as any;
    const rows = await db.notification.findMany({
      where: { companyId: tenantId, entityType: 'booking', entityId: bookingId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return rows.map((row: any) => ({
      id: row.id,
      channel: row?.metaJson?.channel || 'in_app',
      status: row?.metaJson?.status || 'sent',
      reasonKey: row?.metaJson?.reasonKey || row.type,
      note: row?.metaJson?.note || null,
      title: row.title || null,
      createdAt: row.createdAt,
    }));
  }

  private formatBookingDateTime(value?: Date | string | null) {
    if (!value) return 'Unscheduled';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Unscheduled';
    return parsed.toLocaleString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    });
  }

  private async sendBookingRequestNotifications(input: {
    tenantId: string;
    booking: any;
    pricingSnapshot: any;
    emailConfigured: boolean;
  }) {
    const { tenantId, booking, pricingSnapshot, emailConfigured } = input;
    const actorId = await this.resolveAutomationActorId(tenantId, null);
    if (actorId) {
      await this.notifications.sendEntityUpdate(tenantId, actorId, {
        entityType: 'booking',
        entityId: booking.id,
        templateKey: 'booking.requested',
        channel: 'in_app',
        context: {
          customerName: booking.customerName || null,
          serviceName: pricingSnapshot.serviceName,
          startsAt: booking.startsAt ? new Date(booking.startsAt).toISOString() : null,
          source: booking.source,
        },
        note: 'Public booking request received',
      });
    }

    const customerRecipient = this.resolveBookingCustomerRecipient(booking, 'general');
    if (emailConfigured && customerRecipient) {
      const branding = await this.email.getBranding(tenantId, { ownership: 'workspace' });
      const template = buildBookingRequestReceivedEmailTemplate(branding, {
        serviceName: pricingSnapshot.serviceName,
        startsAtLabel: this.formatBookingDateTime(booking.startsAt),
        workspaceName: branding.workspaceName,
        depositLabel:
          pricingSnapshot.depositDueCents > 0
            ? `Deposit due after confirmation: £${(pricingSnapshot.depositDueCents / 100).toFixed(2)}`
            : 'No upfront deposit due right now',
        paymentStatusMessage: pricingSnapshot.paymentStatusMessage,
        statusUrl: this.buildPublicBookingStatusUrl(booking.publicStatusToken),
      });
      await this.email.sendOperationalEmail(
        tenantId,
        {
          to: customerRecipient,
          subject: template.subject,
          text: template.text,
          html: template.html,
          fromName: branding.senderName,
          replyToEmail: branding.replyToEmail,
        },
      );
    }

    if (emailConfigured) {
      const { recipients } = await this.getWorkspaceNotificationRecipients(tenantId);
      const assignedUserEmail = await this.notifications.getActiveAssignedUserEmail(tenantId, booking?.assignedUserId || null);
      const internalRecipients = Array.from(new Set([...(recipients || []), ...(assignedUserEmail ? [assignedUserEmail] : [])]));
      if (internalRecipients.length) {
        const branding = await this.email.getBranding(tenantId, { ownership: 'workspace' });
        const template = buildBookingInternalNotificationEmailTemplate(branding, {
          customerName: booking.customerName || 'Customer',
          customerEmail: booking.customerEmail || null,
          customerPhone: booking.customerPhone || null,
          serviceName: pricingSnapshot.serviceName,
          startsAtLabel: this.formatBookingDateTime(booking.startsAt),
          paymentSummary:
            pricingSnapshot.depositDueCents > 0
              ? `Deposit due £${(pricingSnapshot.depositDueCents / 100).toFixed(2)}, remaining balance £${(pricingSnapshot.remainingBalanceCents / 100).toFixed(2)}`
              : `No deposit required, total £${(pricingSnapshot.effectivePriceCents / 100).toFixed(2)}`,
        });
        for (const recipient of internalRecipients) {
          const to = String(recipient || '').trim().toLowerCase();
          if (!to) continue;
          await this.email.sendOperationalEmail(
            tenantId,
            {
              to,
              subject: template.subject,
              text: template.text,
              html: template.html,
              fromName: branding.senderName,
              replyToEmail: branding.replyToEmail,
            },
          );
        }
      }
    }
  }

  private async sendBookingLifecycleNotifications(input: {
    tenantId: string;
    booking: any;
    pricingSnapshot: any;
    type: 'confirmed' | 'rescheduled' | 'cancelled';
    emailConfigured: boolean;
    actorUserId: string | null;
    customerNote?: string | null;
    previousStartsAt?: Date | string | null;
  }) {
    const { tenantId, booking, pricingSnapshot, type, emailConfigured, actorUserId, customerNote, previousStartsAt } = input;
    const actorId = await this.resolveAutomationActorId(tenantId, actorUserId);
    if (actorId) {
      await this.notifications.sendEntityUpdate(tenantId, actorId, {
        entityType: 'booking',
        entityId: booking.id,
        templateKey: `booking.${type}`,
        channel: 'in_app',
        note:
          type === 'rescheduled' && previousStartsAt
            ? `Moved from ${this.formatBookingDateTime(previousStartsAt)} to ${this.formatBookingDateTime(booking.startsAt)}`
            : customerNote || undefined,
        context: {
          customerName: booking.customerName || null,
          serviceName: pricingSnapshot.serviceName,
          startsAt: booking.startsAt ? new Date(booking.startsAt).toISOString() : null,
          previousStartsAt: previousStartsAt ? new Date(previousStartsAt).toISOString() : null,
          bookingStatus: booking.status,
        },
      });
    }

    const branding = await this.email.getBranding(tenantId, { ownership: 'workspace' });
    const statusUrl = this.buildPublicBookingStatusUrl(booking.publicStatusToken);
    const startsAtLabel = this.formatBookingDateTime(booking.startsAt);
    const location = await this.getBookingLocationPresentation(tenantId, booking.locationId);
    const calendar = this.buildBookingCalendarLinks(booking, pricingSnapshot.serviceName, location?.address);
    const depositLabel =
      pricingSnapshot.depositDueCents > 0
        ? `Deposit due: ${this.formatBookingMoney(pricingSnapshot.depositDueCents)}`
        : 'No deposit due right now';
    const balanceLabel =
      pricingSnapshot.remainingBalanceCents > 0
        ? `Remaining balance: ${this.formatBookingMoney(pricingSnapshot.remainingBalanceCents)}`
        : 'No balance left after the deposit';

    const customerRecipient = this.resolveBookingCustomerRecipient(booking, 'general');
    if (emailConfigured && customerRecipient) {
      const template =
        type === 'confirmed'
          ? buildBookingConfirmedEmailTemplate(branding, {
              serviceName: pricingSnapshot.serviceName,
              startsAtLabel,
              bookingReference: booking.id,
              durationLabel:
                booking.startsAt && booking.endsAt
                  ? `${Math.max(1, Math.round((new Date(booking.endsAt).getTime() - new Date(booking.startsAt).getTime()) / 60000))} minutes`
                  : null,
              locationName: location?.name,
              locationAddress: location?.address,
              locationPhone: location?.phone,
              locationEmail: location?.email,
              arrivalInstructions: location?.arrivalInstructions,
              parkingInstructions: location?.parkingInstructions,
              openingHoursLabel: location?.openingHoursLabel,
              depositLabel,
              balanceLabel,
              statusUrl,
              googleMapsUrl: location?.googleMapsUrl,
              appleMapsUrl: location?.appleMapsUrl,
              wazeUrl: location?.wazeUrl,
              googleCalendarUrl: calendar.googleCalendarUrl,
              outlookCalendarUrl: calendar.outlookCalendarUrl,
              icsUrl: calendar.icsUrl,
            })
          : type === 'rescheduled'
            ? buildBookingRescheduledEmailTemplate(branding, {
                serviceName: pricingSnapshot.serviceName,
                startsAtLabel,
                previousStartsAtLabel: this.formatBookingDateTime(previousStartsAt),
                depositLabel,
                balanceLabel,
                customerNote: customerNote || null,
                statusUrl,
              })
            : buildBookingCancelledEmailTemplate(branding, {
                serviceName: pricingSnapshot.serviceName,
                startsAtLabel,
                customerNote: customerNote || null,
                statusUrl,
              });
      await this.email.sendOperationalEmail(
        tenantId,
        {
          to: customerRecipient,
          subject: template.subject,
          text: template.text,
          html: template.html,
          fromName: branding.senderName,
          replyToEmail: branding.replyToEmail,
        },
      );
    }

    if (emailConfigured) {
      const { recipients } = await this.getWorkspaceNotificationRecipients(tenantId);
      const assignedUserEmail = await this.notifications.getActiveAssignedUserEmail(tenantId, booking?.assignedUserId || null);
      const internalRecipients = Array.from(new Set([...(recipients || []), ...(assignedUserEmail ? [assignedUserEmail] : [])]));
      if (internalRecipients.length) {
        const template = buildBookingStatusInternalEmailTemplate(branding, {
          stateLabel: type === 'confirmed' ? 'Booking confirmed' : type === 'rescheduled' ? 'Booking moved' : 'Booking cancelled',
          customerName: booking.customerName || 'Customer',
          customerEmail: booking.customerEmail || null,
          serviceName: pricingSnapshot.serviceName,
          startsAtLabel,
          previousStartsAtLabel: previousStartsAt ? this.formatBookingDateTime(previousStartsAt) : null,
          note: customerNote || null,
          operatorUrl: buildAppUrl(`/dashboard/bookings/${booking.id}`),
        });
        for (const recipient of internalRecipients) {
          const to = String(recipient || '').trim().toLowerCase();
          if (!to) continue;
          await this.email.sendOperationalEmail(
            tenantId,
            {
              to,
              subject: template.subject,
              text: template.text,
              html: template.html,
              fromName: branding.senderName,
              replyToEmail: branding.replyToEmail,
            },
          );
        }
      }
    }
  }

  private async syncBookingSourceCustomField(companyId: string, bookingId: string, source?: string | null) {
    const db = this.prisma as any;
    const normalizedSource = String(source || '').trim().toLowerCase();
    if (!normalizedSource) return;
    const field = await db.customField.findFirst({
      where: {
        tenantId: companyId,
        entityType: 'BOOKING',
        key: 'booking_source',
      },
      select: { id: true },
    });
    if (!field?.id) return;
    await db.customFieldValue.upsert({
      where: {
        fieldId_entityId: {
          fieldId: field.id,
          entityId: bookingId,
        },
      },
      update: { valueJson: normalizedSource },
      create: {
        tenantId: companyId,
        fieldId: field.id,
        entityType: 'BOOKING',
        entityId: bookingId,
        valueJson: normalizedSource,
      },
    });
  }

  private async resolveAutomationActorId(companyId: string, userId: string | null) {
    if (userId) return userId;
    const db = this.prisma as any;
    const owner = await db.user.findFirst({ where: { companyId, role: 'OWNER' }, select: { id: true } });
    return owner?.id || null;
  }

  private async enqueueBookingReminder(companyId: string, userId: string | null, bookingId: string, reasonKey: string, scheduledFor: Date) {
    const db = this.prisma as any;
    const scheduledForIso = scheduledFor.toISOString();
    const recent = await db.notification.findFirst({
      where: {
        companyId,
        entityType: 'booking',
        entityId: bookingId,
        AND: [
          { metaJson: { path: ['reasonKey'], equals: reasonKey } },
          { metaJson: { path: ['context', 'scheduledFor'], equals: scheduledForIso } },
        ],
      },
    });
    if (recent) return;
    const actorId = await this.resolveAutomationActorId(companyId, userId);
    if (!actorId) return;
    await this.notifications.sendEntityUpdate(companyId, actorId, {
      entityType: 'booking',
      entityId: bookingId,
      templateKey: reasonKey,
      channel: 'in_app',
      context: { scheduledFor: scheduledForIso },
      note: 'Automation booking reminder',
    });
  }

  private async maybeQueueBookingReminders(companyId: string, userId: string | null, booking: any) {
    if (!isAutomationsV1Enabled()) return;
    const enabled = await this.automations.getSettings(companyId);
    if (!enabled.bookingRemindersEnabled) return;
    const startsAt = booking?.startsAt ? new Date(booking.startsAt) : null;
    if (!startsAt || Number.isNaN(startsAt.getTime())) return;
    const now = new Date();
    const diffMs = startsAt.getTime() - now.getTime();
    if (diffMs <= 0) return;
    const hours24 = 24 * 60 * 60 * 1000;
    const hours2 = 2 * 60 * 60 * 1000;
    if (diffMs <= hours24) {
      const scheduledFor = new Date(startsAt.getTime() - hours24);
      if (scheduledFor.getTime() <= now.getTime()) {
        await this.enqueueBookingReminder(companyId, userId, booking.id, 'booking_reminder_24h', scheduledFor);
      }
    }
    if (diffMs <= hours2) {
      const scheduledFor = new Date(startsAt.getTime() - hours2);
      if (scheduledFor.getTime() <= now.getTime()) {
        await this.enqueueBookingReminder(companyId, userId, booking.id, 'booking_reminder_2h', scheduledFor);
      }
    }
  }

  async create(companyId: string, userId: string, dto: CreateBookingDto) {
    const db = this.prisma as any;
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || startsAt >= endsAt) {
      throw new BadRequestException('Invalid booking time range');
    }

    const requestedServiceLines = this.normalizeBookingServiceLineInputs(dto);
    const requestedServiceId = requestedServiceLines[0]?.serviceId || String(dto.serviceId || '').trim();
    const proServices = requestedServiceLines.length
      ? await db.service.findMany({
          where: { id: { in: requestedServiceLines.map((line) => line.serviceId) }, companyId, isActive: true },
        })
      : [];
    const proServiceMap = new Map<string, any>(proServices.map((service: any) => [String(service.id), service]));
    const proService = requestedServiceId ? proServiceMap.get(requestedServiceId) : null;
    const missingProLine = requestedServiceLines.find((line) => !proServiceMap.has(line.serviceId));
    const legacyService = requestedServiceId && !proService && requestedServiceLines.length <= 1
      ? await db.serviceCatalogItem.findFirst({ where: { id: requestedServiceId, tenantId: companyId, active: true } })
      : null;
    if ((requestedServiceId && !proService && !legacyService) || (requestedServiceLines.length > 1 && missingProLine)) {
      throw new BadRequestException('Invalid service for this company');
    }

    if (dto.jobId) {
      const job = await db.job.findFirst({ where: { id: dto.jobId, companyId } });
      if (!job) {
        throw new BadRequestException('Invalid job for this company');
      }
    }

    if (dto.locationId && db.location) {
      const location = await db.location.findFirst({ where: { id: dto.locationId, companyId } });
      if (!location) {
        throw new BadRequestException('Invalid location for this company');
      }
    }

    if (dto.assignedUserId) {
      const assignee = await db.user.findFirst({ where: { id: dto.assignedUserId, companyId } });
      if (!assignee) {
        throw new BadRequestException('Invalid assigned user for this company');
      }
    }

    const paymentCollection = proServices.length ? await this.getWorkspacePaymentCollection(companyId) : null;
    const serviceLineSnapshots = requestedServiceLines
      .map((line, index) => {
        const service = proServiceMap.get(line.serviceId);
        if (!service) return null;
        const snapshot = this.getServicePricingSnapshot(service, {
          workspacePaymentCollection: paymentCollection,
          assignedUserId: dto.assignedUserId || null,
        });
        return {
          service,
          snapshot,
          quantity: line.quantity,
          sortOrder: line.sortOrder ?? index,
          lineTotalCents: Math.max(0, Math.round(Number(snapshot.effectivePriceCents || 0))) * Math.max(1, Math.round(Number(line.quantity || 1))),
          durationTotalMinutes: Math.max(5, Math.round(Number(snapshot.durationMinutes || service.durationMinutes || 60))) * Math.max(1, Math.round(Number(line.quantity || 1))),
        };
      })
      .filter(Boolean) as Array<{ service: any; snapshot: any; quantity: number; sortOrder: number; lineTotalCents: number; durationTotalMinutes: number }>;
    const pricingSnapshot = serviceLineSnapshots.length
      ? {
          ...(serviceLineSnapshots[0].snapshot || {}),
          serviceLines: serviceLineSnapshots.map((line) => ({
            proServiceId: line.service.id,
            serviceName: line.snapshot.serviceName,
            quantity: line.quantity,
            durationMinutes: line.snapshot.durationMinutes,
            effectivePriceCents: line.snapshot.effectivePriceCents,
            lineTotalCents: line.lineTotalCents,
          })),
          bundleTotalCents: serviceLineSnapshots.reduce((sum, line) => sum + line.lineTotalCents, 0),
          bundleDurationMinutes: serviceLineSnapshots.reduce((sum, line) => sum + line.durationTotalMinutes, 0),
        }
      : null;

    const settings = await db.tenantSetting.findUnique({ where: { tenantId: companyId }, select: { businessConfigJson: true } });
    const workflow = this.getBookingWorkflowSettings(settings);

    const booking = await db.$transaction(async (tx: any) => {
      const technicianId = workflow.autoAssignWorkflow
        ? dto.assignedUserId ?? pricingSnapshot?.assignedUserId ?? null
        : dto.assignedUserId ?? null;
      if (technicianId) {
        await acquireTechnicianLock(tx, companyId, technicianId);
        const conflicts = await tx.booking.findMany({
          where: {
            companyId,
            assignedUserId: technicianId,
            status: { not: 'CANCELLED' },
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
          },
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
          },
        });
        if (conflicts.length > 0) {
          this.logger.warn('Booking prevented due to technician overlap', {
            companyId,
            technicianId,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            conflictCount: conflicts.length,
          });
          throw new ConflictException({
            code: 'CALENDAR_CONFLICT',
            conflicts: conflicts.map((conflict: any) => conflict.id),
          });
        }
      }
      const created = await tx.booking.create({
        data: {
          companyId,
          locationId: dto.locationId,
          jobId: dto.jobId,
          serviceId: legacyService ? requestedServiceId : null,
          proServiceId: proService ? requestedServiceId : null,
          customerName: dto.customerName,
          customerEmail: dto.customerEmail,
          customerPhone: dto.customerPhone,
          assignedUserId: technicianId,
          startsAt,
          endsAt,
          status: dto.status ?? 'PLANNED',
          source: 'INTERNAL',
          pricingSnapshotJson: pricingSnapshot,
          paymentStateJson: pricingSnapshot
            ? {
                provider: pricingSnapshot.paymentProvider,
                providerStatus: pricingSnapshot.paymentProviderStatus,
                liveCollectionSupported: false,
                depositDueCents: pricingSnapshot.depositDueCents,
                remainingBalanceCents: pricingSnapshot.remainingBalanceCents,
                collectionState: pricingSnapshot.depositDueCents > 0 ? 'manual_follow_up' : 'no_deposit_required',
                depositStatus: 'not_collected',
                completionPaymentMode: pricingSnapshot.completionPaymentMode,
                note: pricingSnapshot.paymentStatusMessage,
              }
            : undefined,
        },
      });
      if (serviceLineSnapshots.length) {
        await tx.bookingServiceLine.createMany({
          data: serviceLineSnapshots.map((line, index) =>
            this.buildBookingServiceLineData(companyId, created.id, line.service, line.snapshot, line.quantity, line.sortOrder ?? index),
          ),
        });
      }
      return created;
    });

    await this.audit.log(companyId, 'booking.create', `Created booking ${booking.id}`, userId);
    await this.syncBookingSourceCustomField(companyId, booking.id, booking.source);
    await this.maybeQueueBookingReminders(companyId, userId, booking);
    await this.compliance.evaluateSlaTransition({
      tenantId: companyId,
      actorUserId: userId,
      entityType: "BOOKING",
      entityId: booking.id,
      currentStatus: booking.status || "PLANNED",
      locationId: booking.locationId || null,
      assignedUserId: booking.assignedUserId || null,
      customerName: booking.customerName || null,
      jobId: booking.jobId || null,
      label: booking.customerName || booking.id,
    });
    return booking;
  }

  async list(companyId: string, from?: string, to?: string, locationId?: string) {
    const db = this.prisma as any;
    const startsAt: Record<string, Date> = {};

    if (from) {
      const parsed = new Date(from);
      if (!Number.isNaN(parsed.getTime())) {
        startsAt.gte = parsed;
      }
    }

    if (to) {
      const parsed = new Date(to);
      if (!Number.isNaN(parsed.getTime())) {
        startsAt.lte = parsed;
      }
    }

    const bookings = await db.booking.findMany({
      where: {
        companyId,
        ...(locationId && locationId !== 'all'
          ? { OR: [{ locationId }, { locationId: null }] }
          : {}),
        ...(Object.keys(startsAt).length ? { startsAt } : {}),
      },
      include: {
        service: { select: { id: true, name: true, durationMinutes: true } },
        proService: { select: { id: true, name: true, durationMinutes: true } },
        serviceLines: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { startsAt: 'asc' },
    });
    return bookings.map((booking: any) => this.buildBookingSummaryResponse(booking));
  }

  async convertToJob(companyId: string, userId: string, bookingId: string) {
    return this.conversion.convert(companyId, userId, bookingId);
  }

  private defaultBusinessHours() {
    return [
      { dayOfWeek: 1, startMinute: 9 * 60, endMinute: 17 * 60 },
      { dayOfWeek: 2, startMinute: 9 * 60, endMinute: 17 * 60 },
      { dayOfWeek: 3, startMinute: 9 * 60, endMinute: 17 * 60 },
      { dayOfWeek: 4, startMinute: 9 * 60, endMinute: 17 * 60 },
      { dayOfWeek: 5, startMinute: 9 * 60, endMinute: 17 * 60 },
    ];
  }

  private normalizeLocationHours(hours: any[]) {
    return hours
      .filter((entry: any) => !entry.isClosed)
      .map((entry: any) => ({
        dayOfWeek: Number(entry.weekday),
        startMinute: Number(entry.startMinute ?? 9 * 60),
        endMinute: Number(entry.endMinute ?? 17 * 60),
      }))
      .filter((entry) => Number.isFinite(entry.dayOfWeek) && entry.endMinute > entry.startMinute);
  }

  private getExplicitBookingHoursMode(settings?: { businessConfigJson?: unknown } | null) {
    const config = settings?.businessConfigJson && typeof settings.businessConfigJson === 'object' && !Array.isArray(settings.businessConfigJson)
      ? settings.businessConfigJson as any
      : {};
    if (config.bookingHoursSource === 'BUSINESS') return 'BUSINESS';
    if (config.bookingHoursSource === 'CUSTOM') return 'CUSTOM';
    return null;
  }

  private hoursDiffer(left: any[], right: any[]) {
    const normalize = (hours: any[]) => hours
      .map((entry: any) => ({
        dayOfWeek: Number(entry.dayOfWeek),
        startMinute: Number(entry.startMinute),
        endMinute: Number(entry.endMinute),
      }))
      .filter((entry) => Number.isFinite(entry.dayOfWeek) && entry.endMinute > entry.startMinute)
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek);
    return JSON.stringify(normalize(left)) !== JSON.stringify(normalize(right));
  }

  private async updateBookingHoursMode(tenantId: string, mode: 'BUSINESS' | 'CUSTOM') {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId }, select: { businessConfigJson: true } });
    const config = settings?.businessConfigJson && typeof settings.businessConfigJson === 'object' && !Array.isArray(settings.businessConfigJson)
      ? settings.businessConfigJson as any
      : {};
    await db.tenantSetting.update({
      where: { tenantId },
      data: { businessConfigJson: { ...config, bookingHoursSource: mode } },
    });
  }

  private async findInheritedBusinessHours(tenantId: string, locationId?: string | null) {
    const db = this.prisma as any;
    if (locationId) {
      const locationHours = await db.locationBusinessHour.findMany({
        where: { companyId: tenantId, locationId },
        orderBy: { weekday: 'asc' },
      });
      const normalized = this.normalizeLocationHours(locationHours);
      if (normalized.length) {
        return { hours: normalized, source: 'LOCATION' as const };
      }
    }

    const tenantSettings = await db.tenantSetting.findUnique({
      where: { tenantId },
      select: { defaultLocationId: true },
    }).catch(() => null);
    const activeLocations = await db.location.findMany({
      where: { companyId: tenantId, isActive: true },
      select: {
        id: true,
        businessHours: {
          select: { weekday: true, startMinute: true, endMinute: true, isClosed: true },
          orderBy: { weekday: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    }).catch(() => []);

    const orderedLocations = [
      ...activeLocations.filter((location: any) => tenantSettings?.defaultLocationId && location.id === tenantSettings.defaultLocationId),
      ...activeLocations.filter((location: any) => !tenantSettings?.defaultLocationId || location.id !== tenantSettings.defaultLocationId),
    ];
    for (const location of orderedLocations) {
      const normalized = this.normalizeLocationHours(location.businessHours || []);
      if (normalized.length) {
        return { hours: normalized, source: location.id === locationId ? 'LOCATION' as const : 'BUSINESS' as const };
      }
    }

    return { hours: this.defaultBusinessHours(), source: 'BUSINESS' as const };
  }

  private async resolveBookingHours(tenantId: string, input: { locationId?: string | null } = {}) {
    const db = this.prisma as any;
    const [settings, customHours] = await Promise.all([
      db.tenantSetting.findUnique({ where: { tenantId }, select: { businessConfigJson: true } }),
      db.bookingBusinessHour.findMany({ where: { tenantId }, orderBy: { dayOfWeek: 'asc' } }),
    ]);
    const explicitMode = this.getExplicitBookingHoursMode(settings);
    const inherited = await this.findInheritedBusinessHours(tenantId, input.locationId);
    const customHoursDiffer = customHours.length > 0 && this.hoursDiffer(customHours, inherited.hours);
    if ((explicitMode === 'CUSTOM' || (!explicitMode && customHoursDiffer)) && customHours.length > 0) {
      return {
        mode: 'CUSTOM' as const,
        source: 'CUSTOM' as const,
        sourceLabel: 'Custom booking hours',
        hours: customHours,
      };
    }

    return {
      mode: 'BUSINESS' as const,
      source: inherited.source,
      sourceLabel: inherited.source === 'LOCATION' ? 'Location hours' : 'Business hours',
      hours: inherited.hours,
    };
  }

  private async ensureBusinessHours(tenantId: string) {
    return (await this.resolveBookingHours(tenantId)).hours;
  }

  private async ensureBookingTokens(tenantId: string) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findUnique({ where: { tenantId } });
    if (!settings) return null;
    const update: Record<string, string> = {};
    if (!settings.bookingPublicToken) {
      update.bookingPublicToken = crypto.randomBytes(24).toString('base64url');
    }
    if (!settings.bookingIcsToken) {
      update.bookingIcsToken = crypto.randomBytes(24).toString('base64url');
    }
    if (Object.keys(update).length) {
      return db.tenantSetting.update({ where: { tenantId }, data: update });
    }
    return settings;
  }

  private async listPublishedServiceIds(tenantId: string) {
    const db = this.prisma as any;
    if (isBookingProV1Enabled()) {
      const proServices = await db.service.findMany({
        where: { companyId: tenantId, isActive: true },
        select: { id: true, bookingConfigJson: true },
        orderBy: { name: 'asc' },
      });
      if (proServices.length > 0) {
        return proServices
          .filter((service: any) => this.serviceVisibleForAudience(this.normalizeBookingServiceConfig(service.bookingConfigJson), false))
          .map((service: any) => String(service.id));
      }
    }

    const services = await db.serviceCatalogItem.findMany({
      where: { tenantId, active: true },
      select: { id: true },
      orderBy: { name: 'asc' },
    });
    return services.map((service: any) => String(service.id));
  }

  private async getWorkspaceBookingState(settings: any) {
    const publishedServiceIds = await this.listPublishedServiceIds(settings?.tenantId);
    if (!settings?.bookingPublicEnabled || !settings?.bookingPublicToken) {
      return {
        publicState: 'setup_required' as const,
        publicMessage: 'Finish your booking settings to start taking bookings.',
        publishedServiceCount: publishedServiceIds.length,
        nextAvailableSlot: null,
      };
    }

    if (publishedServiceIds.length === 0) {
      return {
        publicState: 'setup_required' as const,
        publicMessage: 'Finish your booking settings to start taking bookings.',
        publishedServiceCount: 0,
        nextAvailableSlot: null,
      };
    }

    for (let offset = 0; offset < 14; offset += 1) {
      const target = new Date();
      target.setUTCDate(target.getUTCDate() + offset);
      const day = target.toISOString().slice(0, 10);
      for (const serviceId of publishedServiceIds.slice(0, 3)) {
        const slots = await this.getAvailableSlots(settings.bookingPublicToken, day, serviceId).catch(() => []);
        if (Array.isArray(slots) && slots[0]?.startsAt) {
          return {
            publicState: 'live' as const,
            publicMessage: 'Bookings are live and showing open appointment slots.',
            publishedServiceCount: publishedServiceIds.length,
            nextAvailableSlot: String(slots[0].startsAt),
          };
        }
      }
    }

    return {
      publicState: 'no_slots' as const,
      publicMessage: 'Bookings are live, but there are no open slots right now.',
      publishedServiceCount: publishedServiceIds.length,
      nextAvailableSlot: null,
    };
  }

  private formatDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private async findNextAvailablePublicSlot(
    token: string,
    input: {
      date: string;
      serviceId: string;
      locationId?: string;
      staffUserId?: string;
      tradeAccountId?: string;
      customerEmail?: string;
      daysAhead?: number;
    },
  ) {
    const targetDate = new Date(input.date);
    if (Number.isNaN(targetDate.getTime())) {
      return null;
    }

    const daysAhead = Math.max(1, Math.min(Number(input.daysAhead || 21), 45));
    for (let offset = 1; offset <= daysAhead; offset += 1) {
      const candidate = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate() + offset));
      const candidateDate = this.formatDateKey(candidate);
      const slots = await this.getAvailableSlots(token, candidateDate, input.serviceId, input.locationId, input.staffUserId, {
        tradeAccountId: input.tradeAccountId,
        customerEmail: input.customerEmail,
      });
      if (Array.isArray(slots) && slots[0]?.startsAt) {
        return {
          date: candidateDate,
          slot: slots[0],
        };
      }
    }

    return null;
  }

  private async resolvePublicTimezone(tenantId: string, locationId?: string) {
    const db = this.prisma as any;
    if (locationId) {
      const location = await db.location.findFirst({
        where: { id: locationId, companyId: tenantId, isActive: true },
        select: { timezone: true },
      });
      if (location?.timezone) {
        return String(location.timezone);
      }
    }

    const tenant = await db.tenantSetting.findUnique({
      where: { tenantId },
      select: { defaultTimezone: true },
    });
    return String(tenant?.defaultTimezone || 'UTC');
  }

  async getSettings(tenantId: string) {
    const db = this.prisma as any;
    const settings = await this.ensureBookingTokens(tenantId);
    const resolvedHours = await this.resolveBookingHours(tenantId);
    const blackouts = await db.bookingBlackoutDate.findMany({ where: { tenantId }, orderBy: { date: 'asc' } });
    const workspaceState = await this.getWorkspaceBookingState(settings);
    const activeLocationCount = await db.location.count({ where: { companyId: tenantId, isActive: true } }).catch(() => 0);
    const bookingWorkflow = this.getBookingWorkflowSettings(settings);

    return {
      publicEnabled: Boolean(settings?.bookingPublicEnabled),
      autoConfirmPublicBookings: Boolean(settings?.autoConfirmPublicBookings),
      bookingWorkflow: {
        ...bookingWorkflow,
        locationRequiredForBooking: bookingWorkflow.locationRequiredForBooking || activeLocationCount > 1,
      },
      publicUrl: settings?.bookingPublicToken ? buildAppUrl(`/portal/booking/${settings.bookingPublicToken}`) : null,
      icsUrl: settings?.bookingIcsToken ? buildApiUrl(`/public/ics/${settings.bookingIcsToken}`) : null,
      businessHours: resolvedHours.hours,
      bookingHoursSource: resolvedHours.mode,
      bookingHoursResolvedSource: resolvedHours.source,
      bookingHoursSourceLabel: resolvedHours.sourceLabel,
      blackoutDates: blackouts,
      slotMinutes: 30,
      ...workspaceState,
    };
  }

  async updateSettings(tenantId: string, userId: string, dto: UpdateBookingSettingsDto) {
    const db = this.prisma as any;
    if (typeof dto.publicEnabled === 'boolean' || typeof dto.autoConfirmPublicBookings === 'boolean') {
      await db.tenantSetting.update({
        where: { tenantId },
        data: {
          ...(typeof dto.publicEnabled === 'boolean' ? { bookingPublicEnabled: dto.publicEnabled } : {}),
          ...(typeof dto.autoConfirmPublicBookings === 'boolean' ? { autoConfirmPublicBookings: dto.autoConfirmPublicBookings } : {}),
        },
      });
      await this.ensureBookingTokens(tenantId);
    }

    await this.updateBookingWorkflowSettings(tenantId, dto);

    if (dto.resetBookingHoursToBusiness === true || dto.bookingHoursSource === 'BUSINESS') {
      await db.bookingBusinessHour.deleteMany({ where: { tenantId } });
      await this.updateBookingHoursMode(tenantId, 'BUSINESS');
    } else if (Array.isArray(dto.businessHours)) {
      await db.bookingBusinessHour.deleteMany({ where: { tenantId } });
      await db.bookingBusinessHour.createMany({
        data: dto.businessHours.map((entry) => ({
          tenantId,
          dayOfWeek: Number(entry.dayOfWeek),
          startMinute: Number(entry.startMinute),
          endMinute: Number(entry.endMinute),
        })),
      });
      await this.updateBookingHoursMode(tenantId, 'CUSTOM');
    }

    if (Array.isArray(dto.blackoutDates)) {
      await db.bookingBlackoutDate.deleteMany({ where: { tenantId } });
      await db.bookingBlackoutDate.createMany({
        data: dto.blackoutDates.map((entry) => ({
          tenantId,
          date: new Date(entry.date),
          reason: entry.reason ?? null,
        })),
      });
    }

    await this.audit.log(tenantId, 'booking.settings.update', 'Booking settings updated', userId);
    return this.getSettings(tenantId);
  }

  async getPublicConfig(token: string, input?: { tradeAccountId?: string; customerEmail?: string }) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findFirst({ where: { bookingPublicToken: token } });
    if (!settings || !settings.bookingPublicEnabled) {
      throw new BadRequestException('Booking portal not available');
    }
    const portalControls = getPortalControlSettings(settings);
    if (!portalControls.portalEnabled || !portalControls.customerBookingEnabled) {
      throw new BadRequestException({
        code: 'CUSTOMER_BOOKING_DISABLED',
        message: portalControls.customerContactMessage || 'Online booking is not available right now. Please contact the team directly.',
      });
    }

    const tenant = await db.company.findUnique({ where: { id: settings.tenantId } });
    const tradeAccountMatch = await this.findVerifiedTradeAccountMatch(settings.tenantId, {
      tradeAccountId: input?.tradeAccountId,
      email: input?.customerEmail,
    });
    const resolvedHours = await this.resolveBookingHours(settings.tenantId);
    const blackouts = await db.bookingBlackoutDate.findMany({ where: { tenantId: settings.tenantId } });
    const proEnabled = isBookingProV1Enabled();
    const proServices = proEnabled
      ? await db.service.findMany({
          where: { companyId: settings.tenantId, isActive: true },
          orderBy: { name: 'asc' },
        })
      : [];
    const visibleProServices = proServices.filter((service: any) => {
      const config = this.normalizeBookingServiceConfig(service.bookingConfigJson);
      return this.serviceVisibleForAudience(config, Boolean(tradeAccountMatch));
    });
    const services = proServices.length > 0
      ? visibleProServices.map((service: any) => ({
          id: service.id,
          name: service.name,
          description: service.description,
          priceCents: service.priceCents,
          durationMinutes: service.durationMinutes,
          bufferBefore: service.bufferBefore,
          bufferAfter: service.bufferAfter,
          depositCents: service.depositCents,
        }))
      : await db.serviceCatalogItem.findMany({
          where: { tenantId: settings.tenantId, active: true },
          orderBy: { name: 'asc' },
        });
    const allLocations = await db.location.findMany({
      where: { companyId: settings.tenantId, isActive: true },
      select: {
        id: true,
        name: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
        phone: true,
        email: true,
        timezone: true,
        metadataJson: true,
        bookingLeadTimeMins: true,
        defaultAssigneeId: true,
        businessHours: {
          select: { weekday: true, startMinute: true, endMinute: true, isClosed: true },
          orderBy: { weekday: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
    const locations = allLocations
      .filter((location: any) => this.locationVisibleForAudience(location, Boolean(tradeAccountMatch)))
      .map((location: any) => ({ ...location, ...this.normalizeLocationVisibility(location) }));
    const staff = proEnabled
      ? await db.user.findMany({
          where: { companyId: settings.tenantId, role: { in: ['OWNER', 'ADMIN', 'STAFF', 'TECHNICIAN'] } },
          select: { id: true, email: true },
          orderBy: { email: 'asc' },
        })
      : [];
    const allQuestions = proEnabled
      ? await db.bookingQuestion.findMany({
          where: { companyId: settings.tenantId, isActive: true },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    const paymentCollection = await this.getWorkspacePaymentCollection(settings.tenantId);
    const tenantCheckoutReady = await this.billing.isTenantBookingDepositCheckoutReady(settings.tenantId);
    const publicBundlesFlag = await this.enterpriseFlags.resolve({
      tenantId: settings.tenantId,
      key: 'public_booking_bundles_v1' as any,
    });
    const bookingWorkflow = this.getBookingWorkflowSettings(settings);

    const businessConfig = settings.businessConfigJson && typeof settings.businessConfigJson === 'object' && !Array.isArray(settings.businessConfigJson)
      ? settings.businessConfigJson
      : {};
    const folderImages = businessConfig.publicBookingFolderImages && typeof businessConfig.publicBookingFolderImages === 'object' && !Array.isArray(businessConfig.publicBookingFolderImages)
      ? businessConfig.publicBookingFolderImages
      : {};
    const folders = this.getFolderConfigs(settings, proServices);
    const visibleFolderKeys = new Set(
      folders
        .filter((folder: any) => folder.visibility === 'PUBLIC' || (folder.visibility === 'TRADE' && tradeAccountMatch))
        .map((folder: any) => folder.key),
    );
    const publicQuestions = allQuestions
      .filter((question: any) => {
        const visibility = this.normalizeQuestionMeta(question).visibility;
        return visibility === 'PUBLIC' || (visibility === 'TRADE' && Boolean(tradeAccountMatch));
      })
      .map((question: any) => ({ ...question, optionsJson: this.normalizeQuestionMeta(question) }));

    return {
      tenant: {
        name: settings.companyName || tenant?.name || 'Business',
        logoUrl: settings.logoUrl,
        timezone: settings.defaultTimezone,
        country: settings.tenantCountry,
        locale: settings.publicBookingLocale || settings.defaultLocale,
        currency: settings.defaultCurrency,
        phoneCountryCode: settings.phoneCountryCode,
        primaryColor: settings.brandPrimaryColor || '#2563eb',
        businessDetails: settings.businessDisplayJson?.booking === false
          ? null
          : {
              registeredBusinessName: settings.registeredBusinessName || null,
              tradingName: settings.tradingName || null,
              companyNumber: settings.companyNumber || null,
              taxRegistrationNumber: settings.taxRegistrationNumber || null,
              address: [
                settings.businessAddressLine1,
                settings.businessAddressLine2,
                settings.businessCity,
                settings.businessPostcode,
                settings.businessCountry,
              ].filter(Boolean).join(', ') || null,
              phone: settings.contactPhone || settings.supportPhone || null,
              email: settings.contactEmail || settings.emailReplyTo || null,
              website: settings.websiteUrl || null,
            },
      },
      tradeAccountMatch: tradeAccountMatch
        ? {
            id: tradeAccountMatch.id,
            name: tradeAccountMatch.name,
            matched: true,
          }
        : null,
      services: proServices.length > 0
        ? visibleProServices.filter((service: any) => visibleFolderKeys.has(this.normalizeBookingServiceConfig(service.bookingConfigJson).category)).map((service: any) => ({
            id: service.id,
            name: service.name,
            description: service.description,
            locationId: service.locationId || null,
            category: this.normalizeBookingServiceConfig(service.bookingConfigJson).category,
            visibility: this.normalizeBookingServiceConfig(service.bookingConfigJson).visibility,
            publicVisible: this.normalizeBookingServiceConfig(service.bookingConfigJson).publicVisible,
            tradeVisible: this.normalizeBookingServiceConfig(service.bookingConfigJson).tradeVisible,
            privateVisible: this.normalizeBookingServiceConfig(service.bookingConfigJson).privateVisible,
            requireCustomerPhone: this.normalizeBookingServiceConfig(service.bookingConfigJson).requireCustomerPhone,
            requireVehicleRegistration: this.normalizeBookingServiceConfig(service.bookingConfigJson).requireVehicleRegistration,
            requireLockingWheelNut: this.normalizeBookingServiceConfig(service.bookingConfigJson).requireLockingWheelNut,
            ...(() => {
              const snapshot = this.getServicePricingSnapshot(service, {
                workspacePaymentCollection: paymentCollection,
                tradeAccountMatched: Boolean(tradeAccountMatch?.id),
              });
              return (!portalControls.depositsRequired || portalControls.allowBookingWithoutDeposit)
                ? {
                    ...snapshot,
                    depositType: 'NONE',
                    depositValue: 0,
                    depositDueCents: 0,
                    remainingBalanceCents: Math.max(0, Number(snapshot.effectivePriceCents || 0)),
                    liveCollectionSupported: false,
                    paymentStatusMessage: 'No deposit is required by the workspace booking settings.',
                  }
                : {
                    ...snapshot,
                    liveCollectionSupported: Boolean(snapshot.depositDueCents > 0 && tenantCheckoutReady),
                    paymentStatusMessage:
                      snapshot.depositDueCents > 0 && !tenantCheckoutReady
                        ? 'Online payment is not available for this booking. Please contact the business.'
                        : snapshot.paymentStatusMessage,
                  };
            })(),
          }))
        : services,
      locations,
      folderImages,
      folders: folders.filter((folder: any) => visibleFolderKeys.has(folder.key)),
      staff,
      bookingWorkflow: {
        locationFirstScheduling: bookingWorkflow.locationFirstScheduling,
        locationRequiredForBooking: bookingWorkflow.locationRequiredForBooking,
        providerSelectionEnabled: bookingWorkflow.technicianAssignmentRequired,
        bookingMode: bookingWorkflow.bookingMode,
      },
      questions: publicQuestions,
      businessHours: resolvedHours.hours,
      bookingHoursSource: resolvedHours.mode,
      bookingHoursResolvedSource: resolvedHours.source,
      bookingHoursSourceLabel: resolvedHours.sourceLabel,
      blackoutDates: blackouts,
      slotMinutes: 30,
      paymentCollection,
      portalControls,
      autoConfirmPublicBookings: Boolean(settings.autoConfirmPublicBookings),
      publicBundles: {
        enabled: Boolean(publicBundlesFlag.enabled),
        minServices: 1,
        maxServices: 4,
      },
    };
  }

  async getAvailableSlots(
    token: string,
    date: string,
    serviceId: string,
    locationId?: string,
    staffUserId?: string,
    input?: { tradeAccountId?: string; customerEmail?: string },
  ) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findFirst({ where: { bookingPublicToken: token } });
    if (!settings || !settings.bookingPublicEnabled) {
      throw new BadRequestException('Booking portal not available');
    }
    const portalControls = getPortalControlSettings(settings);
    if (!portalControls.portalEnabled || !portalControls.customerBookingEnabled) {
      throw new BadRequestException({
        code: 'CUSTOMER_BOOKING_DISABLED',
        message: portalControls.customerContactMessage || 'Online booking is not available right now. Please contact the team directly.',
      });
    }

    const targetDate = new Date(date);
    if (Number.isNaN(targetDate.getTime())) {
      throw new BadRequestException('Invalid date');
    }

    const dayStart = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()));
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const blackout = await db.bookingBlackoutDate.findFirst({
      where: { tenantId: settings.tenantId, date: { gte: dayStart, lt: dayEnd } },
    });
    if (blackout) {
      return [];
    }
    const tradeAccountMatch = await this.findVerifiedTradeAccountMatch(settings.tenantId, {
      tradeAccountId: input?.tradeAccountId,
      email: input?.customerEmail,
    });

    if (isBookingProV1Enabled()) {
      const proService = await db.service.findFirst({
        where: { id: serviceId, companyId: settings.tenantId, isActive: true },
      });
      if (proService) {
        const config = this.normalizeBookingServiceConfig(proService.bookingConfigJson);
        if (!this.serviceVisibleForAudience(config, Boolean(tradeAccountMatch))) {
          return [];
        }
        if (locationId) {
          const location = await db.location.findFirst({
            where: { id: locationId, companyId: settings.tenantId, isActive: true },
            select: { id: true, metadataJson: true },
          });
          if (!location || !this.locationVisibleForAudience(location, Boolean(tradeAccountMatch))) {
            return [];
          }
        }
        return this.computeProSlots(settings.tenantId, {
          date,
          serviceId,
          locationId,
          staffUserId,
        });
      }
    }

    const service = await db.serviceCatalogItem.findFirst({
      where: { id: serviceId, tenantId: settings.tenantId, active: true },
    });
    if (!service) {
      throw new BadRequestException('Service not found');
    }

    const activeLocation = locationId
      ? await db.location.findFirst({ where: { id: locationId, companyId: settings.tenantId, isActive: true } })
      : null;
    const resolvedHours = await this.resolveBookingHours(settings.tenantId, { locationId: activeLocation?.id || locationId || null });
    const hours = resolvedHours.hours;
    const dayOfWeek = targetDate.getUTCDay();
    let dayHours = hours.find((entry) => entry.dayOfWeek === dayOfWeek);
    let leadTimeMins = 0;
    let staffCapacity = Number(service.capacity || 1);
    if (isLocationsAdvancedV1Enabled() && activeLocation) {
      leadTimeMins = Number(activeLocation.bookingLeadTimeMins || 0);
      const staffCount = await db.locationStaffAssignment.count({ where: { companyId: settings.tenantId, locationId: activeLocation.id } });
      if (staffCount > 0) {
        staffCapacity = Math.max(1, staffCount);
      }
    }
    if (!dayHours) {
      return [];
    }

    const slotMinutes = 30;
    const durationMinutes = Number(service.durationMinutes || 60);
    const capacity = Number(service.capacity || 1);
    const windowStart = new Date(dayStart.getTime() + dayHours.startMinute * 60000);
    const windowEnd = new Date(dayStart.getTime() + dayHours.endMinute * 60000);

    const bookings = await db.booking.findMany({
      where: {
        companyId: settings.tenantId,
        ...(activeLocation ? { locationId: activeLocation.id } : {}),
        startsAt: { lt: windowEnd },
        endsAt: { gt: windowStart },
      },
    });
    const minBookAt = new Date(Date.now() + leadTimeMins * 60_000);

    const slots = [];
    for (let minute = dayHours.startMinute; minute + durationMinutes <= dayHours.endMinute; minute += slotMinutes) {
      const slotStart = new Date(dayStart.getTime() + minute * 60000);
      if (slotStart < minBookAt) continue;
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000);
      const overlapping = bookings.filter(
        (booking) => booking.startsAt < slotEnd && booking.endsAt > slotStart,
      ).length;
      if (overlapping < Math.max(capacity, staffCapacity)) {
        slots.push({
          startsAt: slotStart.toISOString(),
          endsAt: slotEnd.toISOString(),
          locationId: activeLocation?.id || null,
        });
      }
    }

    return slots;
  }

  async getPublicAvailability(
    token: string,
    query: {
      date: string;
      serviceId: string;
      locationId?: string;
      staffUserId?: string;
      tradeAccountId?: string;
      customerEmail?: string;
    },
  ) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findFirst({ where: { bookingPublicToken: token } });
    if (!settings || !settings.bookingPublicEnabled) {
      throw new BadRequestException('Booking portal not available');
    }
    const portalControls = getPortalControlSettings(settings);
    if (!portalControls.portalEnabled || !portalControls.customerBookingEnabled) {
      throw new BadRequestException({
        code: 'CUSTOMER_BOOKING_DISABLED',
        message: portalControls.customerContactMessage || 'Online booking is not available right now. Please contact the team directly.',
      });
    }

    const slots = await this.getAvailableSlots(token, query.date, query.serviceId, query.locationId, query.staffUserId, {
      tradeAccountId: query.tradeAccountId,
      customerEmail: query.customerEmail,
    });
    const nextAvailable = slots.length
      ? null
      : await this.findNextAvailablePublicSlot(token, {
          date: query.date,
          serviceId: query.serviceId,
          locationId: query.locationId,
          staffUserId: query.staffUserId,
          tradeAccountId: query.tradeAccountId,
          customerEmail: query.customerEmail,
        });

    return {
      slots,
      nextAvailableSlot: nextAvailable?.slot?.startsAt || null,
      nextAvailableDate: nextAvailable?.date || null,
      timezone: await this.resolvePublicTimezone(settings.tenantId, query.locationId),
    };
  }

  async createPublicBooking(token: string, dto: PublicBookingRequestDto) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findFirst({ where: { bookingPublicToken: token } });
    if (!settings || !settings.bookingPublicEnabled) {
      throw new BadRequestException('Booking portal not available');
    }
    const portalControls = getPortalControlSettings(settings);
    if (!portalControls.portalEnabled || !portalControls.customerBookingEnabled) {
      throw new BadRequestException({
        code: 'CUSTOMER_BOOKING_DISABLED',
        message: portalControls.customerContactMessage || 'Online booking is not available right now. Please contact the team directly.',
      });
    }

    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new BadRequestException('Invalid booking time');
    const proEnabled = isBookingProV1Enabled();
    const publicBundlesFlag = await this.enterpriseFlags.resolve({
      tenantId: settings.tenantId,
      key: 'public_booking_bundles_v1' as any,
    });
    const publicBundlesEnabled = Boolean(publicBundlesFlag.enabled);
    const requestedPublicLines = this.normalizePublicBookingServiceLineInputs(dto);
    if (!publicBundlesEnabled && requestedPublicLines.length > 1) {
      throw new BadRequestException('Public service bundles are not enabled for this workspace');
    }
    if (publicBundlesEnabled && requestedPublicLines.length > 4) {
      throw new BadRequestException('Choose up to 4 services for one booking');
    }

    const proService = proEnabled
      ? await db.service.findFirst({ where: { id: dto.serviceId, companyId: settings.tenantId, isActive: true } })
      : null;
    const legacyService = proService
      ? null
      : await db.serviceCatalogItem.findFirst({
          where: { id: dto.serviceId, tenantId: settings.tenantId, active: true },
        });
    if (!proService && !legacyService) throw new BadRequestException('Service not found');
    const serviceConfig = proService ? this.normalizeBookingServiceConfig(proService.bookingConfigJson) : null;
    const workspacePaymentCollection = await this.getWorkspacePaymentCollection(settings.tenantId);
    const bookingWorkflow = this.getBookingWorkflowSettings(settings);
    if (bookingWorkflow.locationRequiredForBooking && !dto.locationId) {
      throw new BadRequestException('Choose a location before selecting a service and time');
    }
    const requestedStaffUserId = dto.staffUserId;
    const tradeAccountMatch = await this.findVerifiedTradeAccountMatch(settings.tenantId, {
      tradeAccountId: dto.tradeAccountId,
      email: dto.customerEmail,
    });
    if (serviceConfig && !this.serviceVisibleForAudience(serviceConfig, Boolean(tradeAccountMatch))) {
      throw new BadRequestException(tradeAccountMatch ? 'Service not found' : 'This service is not available for public booking');
    }
    if (dto.locationId) {
      const selectedLocation = await db.location.findFirst({
        where: { id: dto.locationId, companyId: settings.tenantId, isActive: true },
        select: { id: true, metadataJson: true },
      });
      if (!selectedLocation || !this.locationVisibleForAudience(selectedLocation, Boolean(tradeAccountMatch))) {
        throw new BadRequestException(tradeAccountMatch ? 'Location not found' : 'This location is not available for public booking');
      }
    }
    const configuredQuestions = await db.bookingQuestion.findMany({
      where: { companyId: settings.tenantId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    const applicableQuestions = this.mergeApplicableQuestions(configuredQuestions, {
      locationId: dto.locationId,
      folderKey: serviceConfig?.category || 'Services',
      serviceId: dto.serviceId,
      trade: Boolean(tradeAccountMatch),
    });
    const questionByKey = new Map(applicableQuestions.map((question: any) => [question.questionKey, question]));
    const answerByQuestionId = new Map(
      (Array.isArray(dto.answers) ? dto.answers : []).map((answer) => [String(answer.questionId || ''), answer]),
    );
    const requireCustomerPhone = questionByKey.get('phone')?.required === true || serviceConfig?.requireCustomerPhone === true;
    const requireVehicleRegistration = questionByKey.get('vehicle_registration')?.required === true || serviceConfig?.requireVehicleRegistration === true;
    const requireLockingWheelNut = questionByKey.get('locking_wheel_nut')?.required === true || serviceConfig?.requireLockingWheelNut === true;
    if (requireCustomerPhone && !String(dto.customerPhone || '').trim()) {
      throw new BadRequestException('Enter a phone number');
    }
    if (requireVehicleRegistration && !String(dto.vehicleRegistration || '').trim()) {
      throw new BadRequestException('Enter the vehicle registration');
    }
    if (requireLockingWheelNut && dto.lockingWheelNutAvailable !== true) {
      throw new BadRequestException('Confirm that the locking wheel nut is readily available');
    }
    for (const question of applicableQuestions) {
      if (!question.required || ['phone', 'vehicle_registration', 'locking_wheel_nut'].includes(question.questionKey)) continue;
      const answer = answerByQuestionId.get(question.id);
      const hasValue = Boolean(String(answer?.valueText || '').trim()) || answer?.valueJson === true || (
        answer?.valueJson && typeof answer.valueJson === 'object' && Object.keys(answer.valueJson).length > 0
      );
      if (!hasValue) throw new BadRequestException(`Complete ${question.label}`);
    }
    const publicServiceLineSnapshots: Array<{ service: any; snapshot: any; quantity: number; sortOrder: number }> = [];
    if (proService) {
      const candidateLines = publicBundlesEnabled ? requestedPublicLines : requestedPublicLines.slice(0, 1);
      const lineServiceIds = candidateLines.map((line) => line.serviceId);
      const lineServices = await db.service.findMany({
        where: { id: { in: lineServiceIds }, companyId: settings.tenantId, isActive: true },
      });
      const lineServiceMap = new Map<string, any>(lineServices.map((service: any) => [String(service.id), service]));
      for (const line of candidateLines) {
        const service = lineServiceMap.get(line.serviceId);
        if (!service) throw new BadRequestException('Service not found');
        const config = this.normalizeBookingServiceConfig(service.bookingConfigJson);
        if (!this.serviceVisibleForAudience(config, Boolean(tradeAccountMatch))) {
          throw new BadRequestException(`${service.name} is not available for this booking route`);
        }
        if (publicBundlesEnabled && !config.publicBundleEligible) {
          throw new BadRequestException(`${service.name} is not available for public service bundles`);
        }
        if (line.sortOrder === 0 && config.publicBundleAddOn) {
          throw new BadRequestException('Choose a primary service before adding optional services');
        }
        if (line.quantity > config.publicBundleMaxQuantity) {
          throw new BadRequestException(`${service.name} can be booked up to ${config.publicBundleMaxQuantity} time${config.publicBundleMaxQuantity === 1 ? '' : 's'}`);
        }
        const incompatible = new Set(config.publicBundleIncompatibleServiceIds);
        const blocked = candidateLines.find((candidate) => candidate.serviceId !== line.serviceId && incompatible.has(candidate.serviceId));
        if (blocked) {
          throw new BadRequestException(`${service.name} cannot be booked with one of the selected services`);
        }
        const selectedOptions = line.sortOrder === 0
          ? (Array.isArray(dto.selectedOptions) ? dto.selectedOptions : [])
          : (Array.isArray(line.selectedOptions) ? line.selectedOptions : []);
        publicServiceLineSnapshots.push({
          service,
          snapshot: this.getServicePricingSnapshot(service, {
            workspacePaymentCollection,
            assignedUserId: requestedStaffUserId || null,
            selectedOptions,
            tradeAccountMatched: Boolean(tradeAccountMatch?.id),
          }),
          quantity: line.quantity,
          sortOrder: line.sortOrder,
        });
      }
    }

    const durationMinutes = publicServiceLineSnapshots.length > 0
      ? publicServiceLineSnapshots.reduce(
          (sum, line) => sum + Math.max(5, Math.round(Number(line.snapshot?.durationMinutes || line.service?.durationMinutes || 60))) * Math.max(1, Number(line.quantity || 1)),
          0,
        )
      : Number(proService?.durationMinutes ?? legacyService?.durationMinutes ?? 60);
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60000);
    const daySlots = await this.getAvailableSlots(token, startsAt.toISOString().slice(0, 10), dto.serviceId, dto.locationId, requestedStaffUserId, {
      tradeAccountId: dto.tradeAccountId,
      customerEmail: dto.customerEmail,
    });
    if (!daySlots.some((slot) => slot.startsAt === startsAt.toISOString())) {
      const nextAvailable = await this.findNextAvailablePublicSlot(token, {
        date: startsAt.toISOString().slice(0, 10),
        serviceId: dto.serviceId,
        locationId: dto.locationId,
        staffUserId: requestedStaffUserId,
        tradeAccountId: dto.tradeAccountId,
        customerEmail: dto.customerEmail,
      });
      throw new BadRequestException({
        message: 'That time was just taken. Please choose another available slot.',
        code: 'BOOKING_SLOT_UNAVAILABLE',
        nextAvailableSlot: nextAvailable?.slot?.startsAt || null,
        nextAvailableDate: nextAvailable?.date || null,
      });
    }

    const location = dto.locationId
      ? await db.location.findFirst({ where: { id: dto.locationId, companyId: settings.tenantId, isActive: true }, select: { id: true, defaultAssigneeId: true } })
      : null;
    if (requestedStaffUserId) {
      const staffUser = await db.user.findFirst({ where: { id: requestedStaffUserId, companyId: settings.tenantId } });
      if (!staffUser) throw new BadRequestException('Selected team member is not available for this workspace');
    }
    const resolvedPublicAssigneeId = bookingWorkflow.autoAssignWorkflow
      ? requestedStaffUserId || location?.defaultAssigneeId || null
      : requestedStaffUserId || null;
    const pricingSnapshot = proService
      ? this.buildBundlePricingSnapshot(
          publicServiceLineSnapshots.length
            ? publicServiceLineSnapshots.map((line, index) => ({
                ...line,
                snapshot: {
                  ...line.snapshot,
                  assignedUserId: index === 0 ? resolvedPublicAssigneeId : bookingWorkflow.autoAssignWorkflow ? line.snapshot.assignedUserId : null,
                },
              }))
            : [{
                service: proService,
                snapshot: this.getServicePricingSnapshot(proService, {
                  workspacePaymentCollection,
                  assignedUserId: resolvedPublicAssigneeId,
                  selectedOptions: Array.isArray(dto.selectedOptions) ? dto.selectedOptions : [],
                  tradeAccountMatched: Boolean(tradeAccountMatch?.id),
                }),
                quantity: 1,
              }],
        )
      : {
          serviceName: legacyService?.name || 'Service',
          description: null,
          durationMinutes,
          standardPriceCents: Math.max(0, Math.round(Number(legacyService?.unitPrice || 0) * 100)),
          discountPriceCents: null,
          effectivePriceCents: Math.max(0, Math.round(Number(legacyService?.unitPrice || 0) * 100)),
          depositType: 'NONE',
          depositValue: 0,
          depositDueCents: 0,
          remainingBalanceCents: Math.max(0, Math.round(Number(legacyService?.unitPrice || 0) * 100)),
          completionPaymentMode: 'ON_COMPLETION',
          paymentProvider: workspacePaymentCollection.customerCollection.preferredProvider,
          paymentProviderStatus: 'connected',
          liveCollectionSupported: false,
          paymentStatusMessage: 'This workspace confirms the booking first and handles payment follow-up afterwards.',
          assignedUserId: resolvedPublicAssigneeId,
          customerNotes: null,
        };
    if (!portalControls.depositsRequired || portalControls.allowBookingWithoutDeposit) {
      pricingSnapshot.depositType = 'NONE';
      pricingSnapshot.depositValue = 0;
      pricingSnapshot.depositDueCents = 0;
      pricingSnapshot.remainingBalanceCents = Math.max(0, Number(pricingSnapshot.effectivePriceCents || pricingSnapshot.bundleTotalCents || 0));
      pricingSnapshot.liveCollectionSupported = false;
      pricingSnapshot.paymentStatusMessage = 'No deposit is required by the workspace booking settings.';
    }
    pricingSnapshot.customerBookingDetails = {
      vehicleRegistration: String(dto.vehicleRegistration || '').trim() || null,
      lockingWheelNutAvailable: dto.lockingWheelNutAvailable === true,
      serviceCategory: serviceConfig?.category || 'Services',
    };
    const depositState = this.buildDepositStatus({
      depositDueCents: pricingSnapshot.depositDueCents,
      liveCollectionSupported: pricingSnapshot.liveCollectionSupported,
      paymentProvider: pricingSnapshot.paymentProvider,
      paymentStatusMessage: pricingSnapshot.paymentStatusMessage,
    });
    const paymentState = {
      provider: pricingSnapshot.paymentProvider,
      providerStatus: pricingSnapshot.paymentProviderStatus,
      liveCollectionSupported: Boolean(pricingSnapshot.liveCollectionSupported),
      depositDueCents: pricingSnapshot.depositDueCents,
      remainingBalanceCents: pricingSnapshot.remainingBalanceCents,
      collectionState: depositState.collectionState,
      depositStatus: depositState.depositStatus,
      depositStatusLabel: depositState.depositStatusLabel,
      completionPaymentMode: pricingSnapshot.completionPaymentMode,
      note: depositState.note,
    };
    const depositRequired = Math.max(0, Number(pricingSnapshot.depositDueCents || 0)) > 0;
    if (depositRequired) {
      const checkoutReady = await this.billing.isTenantBookingDepositCheckoutReady(settings.tenantId);
      pricingSnapshot.liveCollectionSupported = checkoutReady;
      paymentState.liveCollectionSupported = checkoutReady;
      if (!checkoutReady) {
        throw new BadRequestException({
          code: 'ONLINE_PAYMENT_UNAVAILABLE',
          message: 'Online payment is not available for this booking. Please contact the business.',
        });
      }
    }
    const autoConfirmPublicBookings = settings.autoConfirmPublicBookings === true && !depositRequired;
    let booking: any;
    try {
      booking = await db.$transaction(async (tx: any) =>
        this.createPublicBookingRecord(tx, {
          tenantId: settings.tenantId,
          locationId: location?.id || null,
          serviceId: legacyService?.id || null,
          proServiceId: proService?.id || null,
          tradeAccountId: tradeAccountMatch?.id || null,
          customerName: dto.customerName,
          customerEmail: dto.customerEmail,
          customerPhone: dto.customerPhone,
          assignedUserId: resolvedPublicAssigneeId,
          startsAt,
          endsAt,
          pricingSnapshot,
          paymentState,
          status: autoConfirmPublicBookings ? 'CONFIRMED' : 'PENDING',
          serviceLines: publicServiceLineSnapshots,
        }),
      );
    } catch (error) {
      if (error instanceof ConflictException) {
        const nextAvailable = await this.findNextAvailablePublicSlot(token, {
          date: startsAt.toISOString().slice(0, 10),
          serviceId: dto.serviceId,
          locationId: dto.locationId,
          staffUserId: dto.staffUserId,
          tradeAccountId: dto.tradeAccountId,
          customerEmail: dto.customerEmail,
        });
        throw new BadRequestException({
          message: 'That time was just taken. Please choose another available slot.',
          code: 'BOOKING_SLOT_UNAVAILABLE',
          nextAvailableSlot: nextAvailable?.slot?.startsAt || null,
          nextAvailableDate: nextAvailable?.date || null,
        });
      }
      throw error;
    }

    const resolvedAnswers = applicableQuestions.map((question: any) => {
      const submitted = answerByQuestionId.get(question.id);
      const valueText = question.questionKey === 'phone'
        ? String(dto.customerPhone || '').trim()
        : question.questionKey === 'vehicle_registration'
          ? String(dto.vehicleRegistration || '').trim()
          : question.questionKey === 'locking_wheel_nut'
            ? (dto.lockingWheelNutAvailable ? 'Yes' : '')
            : String(submitted?.valueText || '').trim();
      const rawValue = question.questionKey === 'locking_wheel_nut'
        ? dto.lockingWheelNutAvailable === true
        : submitted?.valueJson ?? valueText;
      if (!valueText && rawValue !== true && rawValue !== false) return null;
      return {
        companyId: settings.tenantId,
        bookingId: booking.id,
        questionId: question.id,
        valueText: valueText || null,
        valueJson: {
          value: rawValue,
          snapshot: {
            key: question.questionKey,
            label: question.label,
            type: question.type,
            required: Boolean(question.required),
            visibility: this.normalizeQuestionMeta(question).visibility,
            capturedAt: new Date().toISOString(),
          },
        },
      };
    }).filter(Boolean);
    if (resolvedAnswers.length > 0) {
      await db.bookingAnswer.createMany({
        data: resolvedAnswers,
      });
    }

    await this.audit.log(settings.tenantId, 'booking.public.create', `Public booking ${booking.id} created`, null);
    if (autoConfirmPublicBookings) {
      await this.audit.log(settings.tenantId, 'booking.public.auto_confirm', `Public booking ${booking.id} auto-confirmed`, null);
    } else {
      await this.audit.log(settings.tenantId, 'booking.public.pending', `Public booking ${booking.id} awaits confirmation`, null);
    }
    await this.syncBookingSourceCustomField(settings.tenantId, booking.id, booking.source);
    await this.maybeQueueBookingReminders(settings.tenantId, null, booking);

    const readiness = await this.email.getOperationalReadiness(settings.tenantId);
    const emailConfigured = readiness.effective.canSend;
    if (!emailConfigured) {
      await this.audit.log(settings.tenantId, 'booking.email.missing', 'Outbound email not configured for booking emails', null);
    }
    if (autoConfirmPublicBookings) {
      await this.sendBookingLifecycleNotifications({
        tenantId: settings.tenantId,
        booking,
        pricingSnapshot,
        type: 'confirmed',
        emailConfigured,
        actorUserId: null,
      });
    }

    let depositCheckoutUrl: string | null = null;
    if (depositRequired && pricingSnapshot.liveCollectionSupported) {
      const checkout = await this.billing.createBookingDepositCheckoutSession(settings.tenantId, booking.id);
      depositCheckoutUrl = checkout.actionUrl || null;
    }

    return {
      booking: {
        ...booking,
        pricingSnapshotJson: this.sanitizePublicPricingSnapshot(booking.pricingSnapshotJson),
        paymentStateJson: this.sanitizePublicPaymentState(booking.paymentStateJson),
      },
      emailConfigured,
      statusUrl: this.buildPublicBookingStatusUrl(booking.publicStatusToken),
      depositCheckoutUrl,
      autoConfirmed: autoConfirmPublicBookings,
    };
  }

  private async loadBookingDetailRecord(companyId: string, bookingId: string) {
    const db = this.prisma as any;
    return db.booking.findFirst({
      where: { id: bookingId, companyId },
      include: {
        assignedUser: { select: { id: true, email: true } },
        tradeAccount: { select: { id: true, contactEmail: true, billingEmail: true } },
        location: { select: { id: true, name: true, timezone: true, bookingLeadTimeMins: true } },
        service: { select: { id: true, name: true, durationMinutes: true, unitPrice: true } },
        proService: { select: { id: true, name: true, durationMinutes: true, locationId: true, bookingConfigJson: true, priceCents: true } },
        serviceLines: { orderBy: { sortOrder: 'asc' } },
        job: { select: { id: true, jobRef: true, status: true } },
      },
    });
  }

  private async computeLegacyTenantSlots(
    tenantId: string,
    input: { date: string; serviceId: string; locationId?: string },
  ) {
    const db = this.prisma as any;
    const targetDate = new Date(input.date);
    if (Number.isNaN(targetDate.getTime())) {
      throw new BadRequestException('Invalid date');
    }

    const service = await db.serviceCatalogItem.findFirst({
      where: { id: input.serviceId, tenantId, active: true },
    });
    if (!service) throw new BadRequestException('Service not found');

    const dayStart = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()));
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const blackout = await db.bookingBlackoutDate.findFirst({
      where: { tenantId, date: { gte: dayStart, lt: dayEnd } },
    });
    if (blackout) return [];

    const activeLocation = input.locationId
      ? await db.location.findFirst({ where: { id: input.locationId, companyId: tenantId, isActive: true } })
      : null;
    const resolvedHours = await this.resolveBookingHours(tenantId, { locationId: activeLocation?.id || input.locationId || null });
    const hours = resolvedHours.hours;
    const dayOfWeek = targetDate.getUTCDay();
    let dayHours = hours.find((entry: any) => entry.dayOfWeek === dayOfWeek);
    let leadTimeMins = 0;
    let staffCapacity = Number(service.capacity || 1);
    if (isLocationsAdvancedV1Enabled() && activeLocation) {
      leadTimeMins = Number(activeLocation.bookingLeadTimeMins || 0);
      const staffCount = await db.locationStaffAssignment.count({ where: { companyId: tenantId, locationId: activeLocation.id } });
      if (staffCount > 0) {
        staffCapacity = Math.max(1, staffCount);
      }
    }
    if (!dayHours) return [];

    const slotMinutes = 30;
    const durationMinutes = Number(service.durationMinutes || 60);
    const capacity = Number(service.capacity || 1);
    const windowStart = new Date(dayStart.getTime() + dayHours.startMinute * 60000);
    const windowEnd = new Date(dayStart.getTime() + dayHours.endMinute * 60000);
    const minBookAt = new Date(Date.now() + leadTimeMins * 60_000);
    const bookings = await db.booking.findMany({
      where: {
        companyId: tenantId,
        ...(activeLocation ? { locationId: activeLocation.id } : {}),
        startsAt: { lt: windowEnd },
        endsAt: { gt: windowStart },
      },
    });

    const slots = [];
    for (let minute = dayHours.startMinute; minute + durationMinutes <= dayHours.endMinute; minute += slotMinutes) {
      const slotStart = new Date(dayStart.getTime() + minute * 60000);
      if (slotStart < minBookAt) continue;
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000);
      const overlapping = bookings.filter((booking: any) => booking.startsAt < slotEnd && booking.endsAt > slotStart).length;
      if (overlapping < Math.max(capacity, staffCapacity)) {
        slots.push({
          startsAt: slotStart.toISOString(),
          endsAt: slotEnd.toISOString(),
          locationId: activeLocation?.id || null,
        });
      }
    }
    return slots;
  }

  private async getAvailabilityForBooking(
    companyId: string,
    booking: any,
    input: { date: string; locationId?: string; staffUserId?: string },
  ) {
    const locationId = input.locationId || booking.locationId || booking.proService?.locationId || null;
    const staffUserId = input.staffUserId || booking.assignedUserId || null;
    if (booking.proServiceId) {
      const slots = await this.computeProSlots(companyId, {
        date: input.date,
        serviceId: booking.proServiceId,
        locationId: locationId || undefined,
        staffUserId: staffUserId || undefined,
      });
      const nextAvailable = slots.length
        ? null
        : await (async () => {
            for (let offset = 1; offset <= 21; offset += 1) {
              const candidate = new Date(Date.UTC(new Date(input.date).getUTCFullYear(), new Date(input.date).getUTCMonth(), new Date(input.date).getUTCDate() + offset));
              const candidateDate = this.formatDateKey(candidate);
              const nextSlots = await this.computeProSlots(companyId, {
                date: candidateDate,
                serviceId: booking.proServiceId,
                locationId: locationId || undefined,
                staffUserId: staffUserId || undefined,
              });
              if (nextSlots[0]?.startsAt) return { slot: nextSlots[0], date: candidateDate };
            }
            return null;
          })();
      return {
        slots,
        nextAvailableSlot: nextAvailable?.slot?.startsAt || null,
        nextAvailableDate: nextAvailable?.date || null,
        timezone: booking.location?.timezone || 'UTC',
      };
    }

    if (!booking.serviceId) {
      return { slots: [], nextAvailableSlot: null, nextAvailableDate: null, timezone: booking.location?.timezone || 'UTC' };
    }

    const slots = await this.computeLegacyTenantSlots(companyId, {
      date: input.date,
      serviceId: booking.serviceId,
      locationId: locationId || undefined,
    });
    const nextAvailable = slots.length
      ? null
      : await (async () => {
          for (let offset = 1; offset <= 21; offset += 1) {
            const candidate = new Date(Date.UTC(new Date(input.date).getUTCFullYear(), new Date(input.date).getUTCMonth(), new Date(input.date).getUTCDate() + offset));
            const candidateDate = this.formatDateKey(candidate);
            const nextSlots = await this.computeLegacyTenantSlots(companyId, {
              date: candidateDate,
              serviceId: booking.serviceId,
              locationId: locationId || undefined,
            });
            if (nextSlots[0]?.startsAt) return { slot: nextSlots[0], date: candidateDate };
          }
          return null;
        })();
    return {
      slots,
      nextAvailableSlot: nextAvailable?.slot?.startsAt || null,
      nextAvailableDate: nextAvailable?.date || null,
      timezone: booking.location?.timezone || 'UTC',
    };
  }

  private buildBookingSummaryResponse(booking: any, comms: any[] = []) {
    const pricingSnapshot = booking?.pricingSnapshotJson && typeof booking.pricingSnapshotJson === 'object' ? booking.pricingSnapshotJson : null;
    const paymentState = booking?.paymentStateJson && typeof booking.paymentStateJson === 'object' ? booking.paymentStateJson : null;
    const customerState = this.getCustomerFacingBookingState(booking);
    return {
      ...booking,
      serviceName: String(pricingSnapshot?.serviceName || booking?.proService?.name || booking?.service?.name || booking?.serviceId || booking?.proServiceId || 'Service'),
      serviceLines: Array.isArray(booking?.serviceLines) ? booking.serviceLines : [],
      publicStatusUrl: this.buildPublicBookingStatusUrl(booking?.publicStatusToken),
      customerState,
      customerComms: comms.filter((entry) => ['email', 'sms'].includes(String(entry.channel || '').toLowerCase()) || String(entry.reasonKey || '').startsWith('booking.')),
      pricingSnapshotJson: pricingSnapshot,
      paymentStateJson: paymentState,
    };
  }

  private sanitizePublicPaymentState(paymentStateInput: any) {
    const paymentState = paymentStateInput && typeof paymentStateInput === 'object' ? paymentStateInput : {};
    const depositStatus = String(paymentState.depositStatus || '').toLowerCase();
    const note =
      depositStatus === 'paid'
        ? 'Deposit paid.'
        : depositStatus === 'failed'
          ? 'The deposit was not paid. Try again to confirm your booking.'
          : depositStatus === 'expired'
            ? 'The previous payment link expired. Start a new secure payment to continue.'
            : depositStatus === 'checkout_required'
              ? 'Pay the deposit securely to confirm your booking.'
              : Number(paymentState.depositDueCents || 0) > 0
                ? 'Your booking is confirmed after payment.'
                : 'No payment is needed online today.';
    return {
      depositDueCents: Math.max(0, Number(paymentState.depositDueCents || 0)),
      remainingBalanceCents: Math.max(0, Number(paymentState.remainingBalanceCents || 0)),
      depositPaidCents: Math.max(0, Number(paymentState.depositPaidCents || 0)),
      depositStatus: paymentState.depositStatus || null,
      depositStatusLabel: paymentState.depositStatusLabel || null,
      depositPaidAt: paymentState.depositPaidAt || null,
      depositRefundStatus: paymentState.depositRefundStatus || null,
      depositRefundStatusLabel: paymentState.depositRefundStatusLabel || null,
      refundedAmountCents: Math.max(0, Number(paymentState.refundedAmountCents || 0)),
      currency: paymentState.currency || null,
      note,
    };
  }

  private sanitizePublicPricingSnapshot(pricingInput: any) {
    const pricing = pricingInput && typeof pricingInput === 'object' ? pricingInput : {};
    const {
      paymentProvider,
      paymentProviderStatus,
      paymentStatusMessage,
      assignedUserId,
      ...customerPricing
    } = pricing;
    return customerPricing;
  }

  private buildPublicBookingSummaryResponse(booking: any, comms: any[] = []) {
    const summary = this.buildBookingSummaryResponse(booking, comms);
    return {
      ...summary,
      pricingSnapshotJson: this.sanitizePublicPricingSnapshot(summary.pricingSnapshotJson),
      paymentStateJson: this.sanitizePublicPaymentState(summary.paymentStateJson),
    };
  }

  async getDetail(companyId: string, bookingId: string) {
    const booking = await this.loadBookingDetailRecord(companyId, bookingId);
    if (!booking) throw new BadRequestException('Booking not found');
    const publicStatusToken = await this.ensurePublicStatusToken({ bookingId: booking.id, currentToken: booking.publicStatusToken });
    const comms = await this.getBookingComms(companyId, booking.id);
    return this.buildBookingSummaryResponse({ ...booking, publicStatusToken }, comms);
  }

  async getBookingAvailability(companyId: string, bookingId: string, date?: string) {
    if (!date) {
      return { slots: [], nextAvailableSlot: null, nextAvailableDate: null, timezone: 'UTC' };
    }
    const booking = await this.loadBookingDetailRecord(companyId, bookingId);
    if (!booking) throw new BadRequestException('Booking not found');
    return this.getAvailabilityForBooking(companyId, booking, { date });
  }

  async confirmBooking(companyId: string, userId: string | null, bookingId: string, dto: ConfirmBookingDto) {
    const db = this.prisma as any;
    const current = await this.loadBookingDetailRecord(companyId, bookingId);
    if (!current) throw new BadRequestException('Booking not found');
    if (String(current.status) === 'CANCELLED') throw new BadRequestException('Cancelled bookings cannot be confirmed');
    const publicStatusToken = await this.ensurePublicStatusToken({ bookingId: current.id, currentToken: current.publicStatusToken });
    const booking = await db.booking.update({
      where: { id: bookingId },
      data: { status: 'CONFIRMED' as BookingStatus, publicStatusToken },
      include: {
        assignedUser: { select: { id: true, email: true } },
        tradeAccount: { select: { id: true, contactEmail: true, billingEmail: true } },
        location: { select: { id: true, name: true, timezone: true, bookingLeadTimeMins: true } },
        service: { select: { id: true, name: true, durationMinutes: true, unitPrice: true } },
        proService: { select: { id: true, name: true, durationMinutes: true, locationId: true, bookingConfigJson: true, priceCents: true } },
        serviceLines: { orderBy: { sortOrder: 'asc' } },
        job: { select: { id: true, jobRef: true, status: true } },
      },
    });
    await this.audit.log(companyId, 'booking.confirm', `Confirmed booking ${booking.id}`, userId);
    const readiness = await this.email.getOperationalReadiness(companyId);
    await this.sendBookingLifecycleNotifications({
      tenantId: companyId,
      booking,
      pricingSnapshot: booking.pricingSnapshotJson || {},
      type: 'confirmed',
      emailConfigured: readiness.effective.canSend,
      actorUserId: userId,
      customerNote: dto.customerNote || null,
    });
    return this.getDetail(companyId, booking.id);
  }

  async rescheduleBooking(companyId: string, userId: string | null, bookingId: string, dto: RescheduleBookingDto) {
    const db = this.prisma as any;
    const current = await this.loadBookingDetailRecord(companyId, bookingId);
    if (!current) throw new BadRequestException('Booking not found');
    if (current.jobId) throw new BadRequestException('Move the linked job instead of moving the booking');
    if (String(current.status) === 'CANCELLED') throw new BadRequestException('Cancelled bookings cannot be moved');
    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new BadRequestException('Invalid booking time');
    const availability = await this.getAvailabilityForBooking(companyId, current, {
      date: startsAt.toISOString().slice(0, 10),
      locationId: dto.locationId || current.locationId || undefined,
      staffUserId: dto.staffUserId || current.assignedUserId || undefined,
    });
    const matchingSlot = (availability.slots || []).find((slot: any) => slot.startsAt === startsAt.toISOString());
    if (!matchingSlot) {
      throw new BadRequestException({
        message: 'That time is no longer available. Please choose another open slot.',
        code: 'BOOKING_SLOT_UNAVAILABLE',
        nextAvailableSlot: availability.nextAvailableSlot || null,
        nextAvailableDate: availability.nextAvailableDate || null,
      });
    }
    const publicStatusToken = await this.ensurePublicStatusToken({ bookingId: current.id, currentToken: current.publicStatusToken });
    await db.booking.update({
      where: { id: bookingId },
      data: {
        startsAt: new Date(matchingSlot.startsAt),
        endsAt: new Date(matchingSlot.endsAt),
        locationId: dto.locationId || current.locationId || null,
        assignedUserId: dto.staffUserId || current.assignedUserId || null,
        publicStatusToken,
      },
    });
    const updated = await this.loadBookingDetailRecord(companyId, bookingId);
    await this.audit.log(companyId, 'booking.reschedule', `Moved booking ${bookingId}`, userId);
    const readiness = await this.email.getOperationalReadiness(companyId);
    await this.sendBookingLifecycleNotifications({
      tenantId: companyId,
      booking: { ...updated, publicStatusToken },
      pricingSnapshot: updated?.pricingSnapshotJson || {},
      type: 'rescheduled',
      emailConfigured: readiness.effective.canSend,
      actorUserId: userId,
      customerNote: dto.customerNote || null,
      previousStartsAt: current.startsAt,
    });
    return this.getDetail(companyId, bookingId);
  }

  async cancelBooking(companyId: string, userId: string | null, bookingId: string, dto: CancelBookingDto) {
    const db = this.prisma as any;
    const current = await this.loadBookingDetailRecord(companyId, bookingId);
    if (!current) throw new BadRequestException('Booking not found');
    if (current.jobId) throw new BadRequestException('Cancel the linked job instead of cancelling the booking');
    const publicStatusToken = await this.ensurePublicStatusToken({ bookingId: current.id, currentToken: current.publicStatusToken });
    await db.booking.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED' as BookingStatus, publicStatusToken },
    });
    const updated = await this.loadBookingDetailRecord(companyId, bookingId);
    await this.audit.log(companyId, 'booking.cancel', `Cancelled booking ${bookingId}`, userId);
    const readiness = await this.email.getOperationalReadiness(companyId);
    await this.sendBookingLifecycleNotifications({
      tenantId: companyId,
      booking: { ...updated, publicStatusToken },
      pricingSnapshot: updated?.pricingSnapshotJson || {},
      type: 'cancelled',
      emailConfigured: readiness.effective.canSend,
      actorUserId: userId,
      customerNote: dto.customerNote || null,
    });
    return this.getDetail(companyId, bookingId);
  }

  async getPublicBookingStatus(token: string) {
    const db = this.prisma as any;
    const booking = await db.booking.findFirst({
      where: { publicStatusToken: token },
      include: {
        assignedUser: { select: { id: true, email: true } },
        tradeAccount: { select: { id: true, contactEmail: true, billingEmail: true } },
        location: { select: { id: true, name: true, timezone: true, bookingLeadTimeMins: true } },
        service: { select: { id: true, name: true, durationMinutes: true, unitPrice: true } },
        proService: { select: { id: true, name: true, durationMinutes: true, locationId: true, bookingConfigJson: true, priceCents: true } },
        serviceLines: { orderBy: { sortOrder: 'asc' } },
        job: { select: { id: true, jobRef: true, status: true } },
      },
    });
    if (!booking) throw new BadRequestException('Booking status not available');
    const comms = await this.getBookingComms(booking.companyId, booking.id);
    return this.buildPublicBookingSummaryResponse(booking, comms);
  }

  async getPublicBookingStatusAvailability(token: string, date: string) {
    const db = this.prisma as any;
    const booking = await db.booking.findFirst({
      where: { publicStatusToken: token },
      include: {
        location: { select: { id: true, name: true, timezone: true, bookingLeadTimeMins: true } },
        proService: { select: { id: true, name: true, durationMinutes: true, locationId: true } },
      },
    });
    if (!booking) throw new BadRequestException('Booking status not available');
    const customerState = this.getCustomerFacingBookingState(booking);
    if (!customerState.canReschedule) {
      return { slots: [], nextAvailableSlot: null, nextAvailableDate: null, timezone: booking.location?.timezone || 'UTC' };
    }
    return this.getAvailabilityForBooking(booking.companyId, booking, { date });
  }

  async publicRescheduleBooking(token: string, dto: RescheduleBookingDto) {
    const db = this.prisma as any;
    const booking = await db.booking.findFirst({ where: { publicStatusToken: token } });
    if (!booking) throw new BadRequestException('Booking status not available');
    return this.rescheduleBooking(booking.companyId, null, booking.id, {
      startsAt: dto.startsAt,
      locationId: dto.locationId,
      staffUserId: dto.staffUserId,
      customerNote: dto.customerNote,
    });
  }

  async publicCancelBooking(token: string, dto: CancelBookingDto) {
    const db = this.prisma as any;
    const booking = await db.booking.findFirst({ where: { publicStatusToken: token } });
    if (!booking) throw new BadRequestException('Booking status not available');
    return this.cancelBooking(booking.companyId, null, booking.id, dto);
  }

  async restartPublicBookingDepositCheckout(token: string) {
    const db = this.prisma as any;
    const booking = await db.booking.findFirst({ where: { publicStatusToken: token } });
    if (!booking) throw new BadRequestException('Booking status not available');
    return this.billing.createBookingDepositCheckoutSession(booking.companyId, booking.id);
  }

  async getPublicBookingIcs(token: string) {
    const db = this.prisma as any;
    const booking = await db.booking.findFirst({
      where: { publicStatusToken: token },
      include: { location: true, proService: true },
    });
    if (!booking) throw new BadRequestException('Booking status not available');
    const serviceName = String(booking.proService?.name || (booking.pricingSnapshotJson as any)?.serviceName || 'Service booking');
    const address = booking.location
      ? buildAddressText({
          line1: booking.location.addressLine1,
          line2: booking.location.addressLine2,
          city: booking.location.city,
          state: booking.location.state,
          postalCode: booking.location.postalCode,
          country: booking.location.country,
        })
      : null;
    const escapeIcs = (value: unknown) => String(value || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    const formatDate = (value: Date | string) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//MyTitan//Customer Booking//EN',
      'BEGIN:VEVENT',
      `UID:${escapeIcs(booking.id)}@mytitan`,
      `DTSTAMP:${formatDate(new Date())}`,
      `DTSTART:${formatDate(booking.startsAt)}`,
      `DTEND:${formatDate(booking.endsAt)}`,
      `SUMMARY:${escapeIcs(serviceName)}`,
      `DESCRIPTION:${escapeIcs(`Booking reference: ${booking.id}`)}`,
      ...(address ? [`LOCATION:${escapeIcs(address)}`] : []),
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
  }

  async getIcsFeed(token: string) {
    const db = this.prisma as any;
    const settings = await db.tenantSetting.findFirst({ where: { bookingIcsToken: token } });
    if (!settings) {
      throw new BadRequestException('Invalid ICS token');
    }

    const bookings = await db.booking.findMany({
      where: { companyId: settings.tenantId, status: { not: 'CANCELLED' } },
      orderBy: { startsAt: 'asc' },
    });

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//MyTitan//Booking Feed//EN',
    ];
    for (const booking of bookings) {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${booking.id}@mytitan`);
      lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\\.\\d{3}Z$/, 'Z')}`);
      lines.push(`DTSTART:${new Date(booking.startsAt).toISOString().replace(/[-:]/g, '').replace(/\\.\\d{3}Z$/, 'Z')}`);
      lines.push(`DTEND:${new Date(booking.endsAt).toISOString().replace(/[-:]/g, '').replace(/\\.\\d{3}Z$/, 'Z')}`);
      lines.push(`SUMMARY:Booking ${booking.status}`);
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\\r\\n');
  }

  async listProServices(companyId: string, locationId?: string) {
    const db = this.prisma as any;
    const paymentCollection = await this.getWorkspacePaymentCollection(companyId);
    const services = await db.service.findMany({
      where: {
        companyId,
        ...(locationId ? { OR: [{ locationId }, { locationId: null }] } : {}),
      },
      orderBy: { name: 'asc' },
    });
    return services.map((service: any) => ({
      ...service,
      ...this.getServicePricingSnapshot(service, { workspacePaymentCollection: paymentCollection }),
    }));
  }

  async createProService(companyId: string, userId: string, dto: UpsertBookingServiceDto) {
    const db = this.prisma as any;
    if (dto.assignedUserId) {
      const assignee = await db.user.findFirst({ where: { id: dto.assignedUserId, companyId } });
      if (!assignee) throw new BadRequestException('Assigned provider was not found');
    }
    const service = await db.service.create({
      data: {
        companyId,
        locationId: dto.locationId || null,
        name: dto.name.trim(),
        description: dto.description || null,
        durationMinutes: Math.max(5, Number(dto.durationMinutes || 60)),
        priceCents: Math.max(0, Number(dto.priceCents || 0)),
        bufferBefore: Math.max(0, Number(dto.bufferBefore || 0)),
        bufferAfter: Math.max(0, Number(dto.bufferAfter || 0)),
        depositCents: Math.max(0, Number(dto.depositCents || 0)),
        bookingConfigJson: this.buildBookingServiceConfig(dto),
        isActive: dto.isActive ?? true,
        color: dto.color?.toUpperCase() || null,
      },
    });
    await this.audit.log(companyId, 'booking.pro.service.create', `Created service ${service.name}`, userId);
    const paymentCollection = await this.getWorkspacePaymentCollection(companyId);
    return {
      ...service,
      ...this.getServicePricingSnapshot(service, { workspacePaymentCollection: paymentCollection }),
    };
  }

  async updateProService(companyId: string, userId: string, serviceId: string, dto: UpsertBookingServiceDto) {
    const db = this.prisma as any;
    const existing = await db.service.findFirst({ where: { id: serviceId, companyId } });
    if (!existing) throw new BadRequestException('Service not found');
    if (dto.assignedUserId) {
      const assignee = await db.user.findFirst({ where: { id: dto.assignedUserId, companyId } });
      if (!assignee) throw new BadRequestException('Assigned provider was not found');
    }
    const service = await db.service.update({
      where: { id: serviceId },
      data: {
        locationId: dto.locationId || null,
        name: dto.name.trim(),
        description: dto.description || null,
        durationMinutes: Math.max(5, Number(dto.durationMinutes || 60)),
        priceCents: Math.max(0, Number(dto.priceCents || 0)),
        bufferBefore: Math.max(0, Number(dto.bufferBefore || 0)),
        bufferAfter: Math.max(0, Number(dto.bufferAfter || 0)),
        depositCents: Math.max(0, Number(dto.depositCents || 0)),
        bookingConfigJson: this.buildBookingServiceConfig(dto),
        isActive: dto.isActive ?? true,
        color: dto.color !== undefined ? dto.color?.toUpperCase() || null : undefined,
      },
    });
    await this.audit.log(companyId, 'booking.pro.service.update', `Updated service ${service.name}`, userId);
    const paymentCollection = await this.getWorkspacePaymentCollection(companyId);
    return {
      ...service,
      ...this.getServicePricingSnapshot(service, { workspacePaymentCollection: paymentCollection }),
    };
  }

  private async computeProSlots(companyId: string, query: BookingAvailabilityQueryDto) {
    const db = this.prisma as any;
    const service = await db.service.findFirst({
      where: { id: query.serviceId, companyId, isActive: true },
    });
    if (!service) throw new BadRequestException('Service not found');

    const targetDate = new Date(query.date);
    if (Number.isNaN(targetDate.getTime())) throw new BadRequestException('Invalid date');
    const dayStart = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate()));
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const weekday = dayStart.getUTCDay();

    const blackout = await db.blackoutDate.findFirst({
      where: { companyId, locationId: query.locationId || null, date: { gte: dayStart, lt: dayEnd } },
    });
    if (blackout) return [];

    let leadTimeMins = 0;
    const location = query.locationId
      ? await db.location.findFirst({ where: { id: query.locationId, companyId, isActive: true } })
      : null;
    if (location) leadTimeMins = Number(location.bookingLeadTimeMins || 0);

    const resolvedHours = await this.resolveBookingHours(companyId, { locationId: location?.id || query.locationId || null });
    const dayHours = resolvedHours.hours.find((entry: any) => Number(entry.dayOfWeek) === weekday);
    if (!dayHours) return [];
    let startMinute = Number(dayHours.startMinute);
    let endMinute = Number(dayHours.endMinute);

    if (query.staffUserId) {
      const staff = await db.staffAvailability.findFirst({
        where: { companyId, locationId: query.locationId || undefined, userId: query.staffUserId, weekday },
      });
      if (staff?.isClosed) return [];
      if (staff && staff.startMinute != null && staff.endMinute != null) {
        startMinute = Math.max(startMinute, Number(staff.startMinute));
        endMinute = Math.min(endMinute, Number(staff.endMinute));
      }
    }

    const duration = Number(service.durationMinutes || 60);
    const bufferBefore = Number(service.bufferBefore || 0);
    const bufferAfter = Number(service.bufferAfter || 0);
    const slotMinutes = 15;
    const windowStart = new Date(dayStart.getTime() + startMinute * 60000);
    const windowEnd = new Date(dayStart.getTime() + endMinute * 60000);
    const minBookAt = new Date(Date.now() + leadTimeMins * 60000);

    const existing = await db.booking.findMany({
      where: {
        companyId,
        ...(query.locationId ? { locationId: query.locationId } : {}),
        ...(query.staffUserId ? { assignedUserId: query.staffUserId } : {}),
        startsAt: { lt: windowEnd },
        endsAt: { gt: windowStart },
      },
      orderBy: { startsAt: 'asc' },
    });

    const slots: Array<{ startsAt: string; endsAt: string; serviceId: string; staffUserId?: string | null }> = [];
    for (let minute = startMinute; minute + duration <= endMinute; minute += slotMinutes) {
      const startsAt = new Date(dayStart.getTime() + minute * 60000);
      if (startsAt < minBookAt) continue;
      const endsAt = new Date(startsAt.getTime() + duration * 60000);
      const blocked = existing.some((b: any) => {
        const bStart = new Date(new Date(b.startsAt).getTime() - bufferBefore * 60000);
        const bEnd = new Date(new Date(b.endsAt).getTime() + bufferAfter * 60000);
        return bStart < endsAt && bEnd > startsAt;
      });
      if (!blocked) {
        slots.push({
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          serviceId: service.id,
          staffUserId: query.staffUserId || null,
        });
      }
    }
    return slots;
  }

  async getProAvailability(companyId: string, query: BookingAvailabilityQueryDto) {
    return this.computeProSlots(companyId, query);
  }

  async createProBooking(companyId: string, userId: string, dto: CreateBookingProDto) {
    const db = this.prisma as any;
    const service = await db.service.findFirst({ where: { id: dto.serviceId, companyId, isActive: true } });
    if (!service) throw new BadRequestException('Service not found');

    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new BadRequestException('Invalid start time');
    const endsAt = new Date(startsAt.getTime() + Number(service.durationMinutes || 60) * 60000);

    const daySlots = await this.computeProSlots(companyId, {
      date: startsAt.toISOString().slice(0, 10),
      serviceId: service.id,
      locationId: dto.locationId,
      staffUserId: dto.staffUserId,
    });
    if (!daySlots.some((slot) => slot.startsAt === startsAt.toISOString())) {
      throw new BadRequestException('Selected slot is no longer available');
    }
    const paymentCollection = await this.getWorkspacePaymentCollection(companyId);
    const pricingSnapshot = this.getServicePricingSnapshot(service, {
      workspacePaymentCollection: paymentCollection,
      assignedUserId: dto.staffUserId || null,
    });

    const booking = await db.booking.create({
      data: {
        companyId,
        locationId: dto.locationId || null,
        proServiceId: service.id,
        customerName: dto.customerName,
        customerEmail: dto.customerEmail,
        customerPhone: dto.customerPhone || null,
        assignedUserId: dto.staffUserId || null,
        startsAt,
        endsAt,
        status: 'PLANNED',
        source: 'INTERNAL',
        pricingSnapshotJson: pricingSnapshot,
        paymentStateJson: {
          provider: pricingSnapshot.paymentProvider,
          providerStatus: pricingSnapshot.paymentProviderStatus,
          liveCollectionSupported: false,
          depositDueCents: pricingSnapshot.depositDueCents,
          remainingBalanceCents: pricingSnapshot.remainingBalanceCents,
          collectionState: pricingSnapshot.depositDueCents > 0 ? 'manual_follow_up' : 'no_deposit_required',
          depositStatus: 'not_collected',
          completionPaymentMode: pricingSnapshot.completionPaymentMode,
          note: pricingSnapshot.paymentStatusMessage,
        },
      },
    });
    await db.bookingServiceLine.create({
      data: this.buildBookingServiceLineData(companyId, booking.id, service, pricingSnapshot, 1, 0),
    });

    if (Array.isArray(dto.answers) && dto.answers.length > 0) {
      await db.bookingAnswer.createMany({
        data: dto.answers
          .filter((ans) => ans?.questionId)
          .map((ans) => ({
            companyId,
            bookingId: booking.id,
            questionId: ans.questionId,
            valueText: ans.valueText || null,
            valueJson: ans.valueJson ?? null,
          })),
      });
    }

    await this.audit.log(companyId, 'booking.pro.create', `Created Booking Pro booking ${booking.id}`, userId);
    await this.syncBookingSourceCustomField(companyId, booking.id, booking.source);
    await this.maybeQueueBookingReminders(companyId, userId, booking);
    return booking;
  }

  async getProSettings(companyId: string) {
    const db = this.prisma as any;
    const [settings, staffAvailability, blackoutDates, questions, locations, staff, services, bookingSettings] = await Promise.all([
      db.tenantSetting.findUnique({ where: { tenantId: companyId } }),
      db.staffAvailability.findMany({ where: { companyId }, orderBy: [{ locationId: 'asc' }, { userId: 'asc' }, { weekday: 'asc' }] }),
      db.blackoutDate.findMany({ where: { companyId }, orderBy: { date: 'asc' } }),
      db.bookingQuestion.findMany({ where: { companyId, isActive: true }, orderBy: { createdAt: 'asc' } }),
      db.location.findMany({
        where: { companyId, isActive: true },
        select: { id: true, name: true, timezone: true },
        orderBy: { name: 'asc' },
      }),
      db.user.findMany({
        where: { companyId, role: { in: ['OWNER', 'ADMIN', 'STAFF', 'TECHNICIAN'] } },
        select: { id: true, email: true },
        orderBy: { email: 'asc' },
      }),
      this.listProServices(companyId),
      this.getSettings(companyId),
    ]);
    const paymentCollection = await this.getWorkspacePaymentCollection(companyId);
    const emailReadiness = await this.email.getOperationalReadiness(companyId);
    const businessConfig = settings?.businessConfigJson && typeof settings.businessConfigJson === 'object' && !Array.isArray(settings.businessConfigJson)
      ? settings.businessConfigJson
      : {};
    const folderImages = businessConfig.publicBookingFolderImages && typeof businessConfig.publicBookingFolderImages === 'object' && !Array.isArray(businessConfig.publicBookingFolderImages)
      ? businessConfig.publicBookingFolderImages
      : {};
    const folders = this.getFolderConfigs(settings, services);
    return {
      publicEnabled: Boolean(settings?.bookingPublicEnabled),
      autoConfirmPublicBookings: Boolean(settings?.autoConfirmPublicBookings),
      bookingWorkflow: this.getBookingWorkflowSettings(settings),
      publicUrl: bookingSettings.publicUrl,
      publicState: bookingSettings.publicState,
      publicMessage: bookingSettings.publicMessage,
      publishedServiceCount: bookingSettings.publishedServiceCount,
      nextAvailableSlot: bookingSettings.nextAvailableSlot,
      staffAvailability,
      blackoutDates,
      questions,
      businessHours: bookingSettings.businessHours,
      locations,
      staff,
      services,
      folderImages,
      folders,
      paymentCollection,
      emailReadiness,
      notificationRecipients: getInternalNotificationSettings(settings).internalRecipients,
      emailSenderName: settings?.emailSenderName || null,
      emailReplyTo: settings?.emailReplyTo || null,
    };
  }

  async savePublicFolderImage(companyId: string, userId: string, categoryInput: string, fileName: string) {
    const db = this.prisma as any;
    const category = categoryInput.trim();
    if (!category) throw new BadRequestException('Service folder is required');
    const services = await db.service.findMany({
      where: { companyId, isActive: true },
      select: { bookingConfigJson: true },
    });
    const settings = await db.tenantSetting.findUnique({ where: { tenantId: companyId } });
    const folderConfigs = this.getFolderConfigs(settings, services);
    const categoryExists = folderConfigs.some((folder: any) => folder.key === category);
    if (!categoryExists) throw new NotFoundException('Service folder not found');
    const businessConfig = settings?.businessConfigJson && typeof settings.businessConfigJson === 'object' && !Array.isArray(settings.businessConfigJson)
      ? settings.businessConfigJson
      : {};
    const currentImages = businessConfig.publicBookingFolderImages && typeof businessConfig.publicBookingFolderImages === 'object' && !Array.isArray(businessConfig.publicBookingFolderImages)
      ? businessConfig.publicBookingFolderImages
      : {};
    const imageUrl = buildApiUrl(`/tenant/public-booking-media/${companyId}/${encodeURIComponent(fileName)}`);
    const folderImages = { ...currentImages, [category]: imageUrl };
    const publicBookingFolders = folderConfigs.map((folder: any) =>
      folder.key === category ? { ...folder, imageUrl } : folder,
    );
    await db.tenantSetting.upsert({
      where: { tenantId: companyId },
      update: { businessConfigJson: { ...businessConfig, publicBookingFolderImages: folderImages, publicBookingFolders } },
      create: { tenantId: companyId, businessConfigJson: { publicBookingFolderImages: folderImages, publicBookingFolders } },
    });
    await this.audit.log(companyId, 'booking.folder.image.upload', `Updated public image for service folder ${category}`, userId);
    return { category, imageUrl, folderImages };
  }

  async updateProSettings(companyId: string, userId: string, dto: UpdateBookingProSettingsDto) {
    const db = this.prisma as any;
    if (typeof dto.publicEnabled === 'boolean' || typeof dto.autoConfirmPublicBookings === 'boolean') {
      await db.tenantSetting.update({
        where: { tenantId: companyId },
        data: {
          ...(typeof dto.publicEnabled === 'boolean' ? { bookingPublicEnabled: dto.publicEnabled } : {}),
          ...(typeof dto.autoConfirmPublicBookings === 'boolean' ? { autoConfirmPublicBookings: dto.autoConfirmPublicBookings } : {}),
        },
      });
    }

    await this.updateBookingWorkflowSettings(companyId, dto);

    if (Array.isArray(dto.staffAvailability)) {
      await db.staffAvailability.deleteMany({ where: { companyId } });
      if (dto.staffAvailability.length > 0) {
        await db.staffAvailability.createMany({
          data: dto.staffAvailability.map((entry) => ({
            companyId,
            locationId: entry.locationId,
            userId: entry.userId,
            weekday: Number(entry.weekday),
            startMinute: entry.startMinute ?? null,
            endMinute: entry.endMinute ?? null,
            isClosed: Boolean(entry.isClosed),
          })),
        });
      }
    }

    if (Array.isArray(dto.blackoutDates)) {
      await db.blackoutDate.deleteMany({ where: { companyId } });
      if (dto.blackoutDates.length > 0) {
        await db.blackoutDate.createMany({
          data: dto.blackoutDates.map((entry) => ({
            companyId,
            locationId: entry.locationId || null,
            date: new Date(entry.date),
            reason: entry.reason || null,
          })),
        });
      }
    }

    if (Array.isArray(dto.questions)) {
      await db.bookingQuestion.updateMany({ where: { companyId }, data: { isActive: false } });
      for (const question of dto.questions) {
        if (!question?.label || !question?.questionKey) continue;
        if (question.id) {
          await db.bookingQuestion.update({
            where: { id: question.id },
            data: {
              locationId: question.locationId || null,
              label: question.label,
              questionKey: question.questionKey,
              type: question.type || 'text',
              required: Boolean(question.required),
              optionsJson: question.optionsJson ?? null,
              isActive: true,
            },
          });
          continue;
        }
        await db.bookingQuestion.create({
          data: {
            companyId,
            locationId: question.locationId || null,
            label: question.label,
            questionKey: question.questionKey,
            type: question.type || 'text',
            required: Boolean(question.required),
            optionsJson: question.optionsJson ?? null,
            isActive: true,
          },
        });
      }
    }

    if (Array.isArray(dto.folders)) {
      const settings = await db.tenantSetting.findUnique({ where: { tenantId: companyId } });
      const businessConfig = settings?.businessConfigJson && typeof settings.businessConfigJson === 'object' && !Array.isArray(settings.businessConfigJson)
        ? settings.businessConfigJson
        : {};
      const folders = dto.folders.map((folder, index) => this.normalizeFolderConfig(folder, index)).filter(Boolean);
      await db.tenantSetting.update({
        where: { tenantId: companyId },
        data: { businessConfigJson: { ...businessConfig, publicBookingFolders: folders } },
      });
      await this.audit.log(companyId, 'booking.folders.update', `Updated ${folders.length} booking service folders`, userId);
    }

    await this.audit.log(companyId, 'booking.pro.settings.update', 'Booking Pro settings updated', userId);
    return this.getProSettings(companyId);
  }
}
