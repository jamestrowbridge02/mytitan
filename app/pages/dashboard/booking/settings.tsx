import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { OperatorNotice } from "../../../components/feedback/OperatorNotice";
import { useOperatorNotice } from "../../../components/feedback/useOperatorNotice";
import { apiFetch } from "../../../lib/api";
import { isBookingProV1Enabled } from "../../../lib/feature-flags";
import { UPLOAD_LIMITS, validateUploadFile } from "../../../lib/upload-policy";

type BookingSettingsPayload = {
  publicEnabled: boolean;
  autoConfirmPublicBookings?: boolean;
  bookingWorkflow?: {
    autoCreateJobFromBooking?: boolean;
    autoAssignWorkflow?: boolean;
    manualReviewMode?: boolean;
    bookingMode?: "LOCATION" | "EMPLOYEE" | "HYBRID";
    locationFirstScheduling?: boolean;
    autoPopulateJobSheetFromBooking?: boolean;
    autoCreateInvoiceDraftOnCompletion?: boolean;
    autoSendInvoiceOnCompletion?: boolean;
    technicianAssignmentRequired?: boolean;
    locationRequiredForBooking?: boolean;
  };
  publicUrl?: string | null;
  publicState?: "live" | "setup_required" | "no_slots";
  publicMessage?: string | null;
  publishedServiceCount?: number;
  nextAvailableSlot?: string | null;
  businessHours: Array<{ dayOfWeek: number; startMinute: number; endMinute: number }>;
  bookingHoursSource?: "BUSINESS" | "CUSTOM";
  bookingHoursResolvedSource?: "BUSINESS" | "LOCATION" | "CUSTOM";
  bookingHoursSourceLabel?: string;
  blackoutDates: Array<{ date: string; reason?: string | null }>;
  services: BookingService[];
  folderImages?: Record<string, string>;
  folders?: BookingFolder[];
  questions?: BookingField[];
  locations: Array<{ id: string; name: string }>;
  staff: Array<{ id: string; email: string }>;
  paymentCollection?: {
    customerCollection?: {
      preferredProvider?: string;
      requestedProviders?: string[];
      providers?: Array<{
        provider: string;
        label: string;
        usage: string;
        live: boolean;
        status: string;
        summary: string;
        selectable: boolean;
        selected: boolean;
      }>;
    };
  } | null;
  emailReadiness?: {
    status: string;
    guidance: string;
    replyToEmail?: string | null;
    notice?: string | null;
    workspace?: {
      status?: string;
      guidance?: string;
      replyToEmail?: string | null;
      fromEmail?: string | null;
    } | null;
    fallback?: {
      status?: string;
      guidance?: string;
    } | null;
    effective?: {
      canSend?: boolean;
      guidance?: string;
      notice?: string | null;
      usingFallback?: boolean;
      effectiveSenderLabel?: string | null;
      deliveryReady?: boolean;
      replyTo?: string | null;
    } | null;
  } | null;
  notificationRecipients?: Array<{
    email: string;
    label?: string | null;
    enabled?: boolean;
    categories?: string[];
  }>;
  emailSenderName?: string | null;
  emailReplyTo?: string | null;
};

type BookingFolder = {
  key: string;
  displayName: string;
  publicDescription?: string | null;
  internalNotes?: string | null;
  imageUrl?: string | null;
  visibility: "PUBLIC" | "TRADE" | "INTERNAL" | "ARCHIVED";
  sortOrder: number;
};

type BookingField = {
  id?: string;
  locationId?: string | null;
  label: string;
  questionKey: string;
  type: string;
  required: boolean;
  optionsJson?: {
    placeholder?: string | null;
    helpText?: string | null;
    visibility?: "PUBLIC" | "TRADE" | "INTERNAL";
    locationIds?: string[];
    folderKeys?: string[];
    serviceIds?: string[];
    templateIds?: string[];
    sortOrder?: number;
    validationRule?: string | null;
    defaultValue?: string | boolean | null;
    consentMode?: boolean;
    options?: string[];
  } | null;
};

const EMPTY_FOLDER: BookingFolder = {
  key: "",
  displayName: "",
  publicDescription: "",
  internalNotes: "",
  imageUrl: "",
  visibility: "PUBLIC",
  sortOrder: 0,
};

const EMPTY_FIELD: BookingField = {
  label: "",
  questionKey: "",
  type: "text",
  required: false,
  optionsJson: {
    placeholder: "",
    helpText: "",
    visibility: "PUBLIC",
    locationIds: [],
    folderKeys: [],
    serviceIds: [],
    templateIds: [],
    sortOrder: 100,
    validationRule: "",
    defaultValue: "",
    consentMode: false,
    options: [],
  },
};

type SetupStep = {
  key: string;
  title: string;
  detail: string;
  done: boolean;
  href?: string;
};

type BookingService = {
  id: string;
  name: string;
  description?: string | null;
  shortDescription?: string | null;
  longDescription?: string | null;
  imageUrl?: string | null;
  locationId?: string | null;
  category?: string | null;
  visibility?: "PUBLIC" | "TRADE" | "INTERNAL";
  publicVisible?: boolean;
  tradeVisible?: boolean;
  privateVisible?: boolean;
  durationMinutes?: number | null;
  standardPriceCents?: number | null;
  priceCents?: number | null;
  discountPriceCents?: number | null;
  effectivePriceCents?: number | null;
  depositType?: "NONE" | "FIXED" | "PERCENTAGE";
  depositValue?: number | null;
  depositDueCents?: number | null;
  remainingBalanceCents?: number | null;
  completionPaymentMode?: "ON_CONFIRMATION" | "ON_COMPLETION" | "MANUAL_FOLLOW_UP";
  paymentProvider?: string | null;
  paymentProviderStatus?: string | null;
  customerNotes?: string | null;
  availableOptions?: Array<{ key: string; label: string; description?: string | null; priceCents: number; defaultSelected?: boolean }>;
  tradeAccountDepositWaived?: boolean;
  publicBundleEligible?: boolean;
  publicBundleAddOn?: boolean;
  publicBundleMaxQuantity?: number | null;
  publicBundleIncompatibleServiceIds?: string[];
  assignedUserId?: string | null;
  isActive?: boolean;
  color?: string | null;
  requireCustomerPhone?: boolean;
  requireVehicleRegistration?: boolean;
  requireLockingWheelNut?: boolean;
};

type ServiceDraft = {
  id?: string | null;
  name: string;
  description: string;
  shortDescription: string;
  longDescription: string;
  imageUrl: string;
  locationId: string;
  category: string;
  visibility: "PUBLIC" | "TRADE" | "INTERNAL";
  publicVisible: boolean;
  tradeVisible: boolean;
  privateVisible: boolean;
  durationMinutes: string;
  price: string;
  discountPrice: string;
  depositType: "NONE" | "FIXED" | "PERCENTAGE";
  depositValue: string;
  completionPaymentMode: "ON_CONFIRMATION" | "ON_COMPLETION" | "MANUAL_FOLLOW_UP";
  paymentProvider: string;
  assignedUserId: string;
  customerNotes: string;
  customOptionsText: string;
  tradeAccountDepositWaived: boolean;
  publicBundleEligible: boolean;
  publicBundleAddOn: boolean;
  publicBundleMaxQuantity: string;
  publicBundleIncompatibleServiceIds: string[];
  isActive: boolean;
  color: string;
  requireCustomerPhone: boolean;
  requireVehicleRegistration: boolean;
  requireLockingWheelNut: boolean;
};

const EMPTY_SERVICE_DRAFT: ServiceDraft = {
  id: null,
  name: "",
  description: "",
  shortDescription: "",
  longDescription: "",
  imageUrl: "",
  locationId: "",
  category: "Services",
  visibility: "PUBLIC",
  publicVisible: true,
  tradeVisible: true,
  privateVisible: true,
  durationMinutes: "60",
  price: "",
  discountPrice: "",
  depositType: "NONE",
  depositValue: "",
  completionPaymentMode: "ON_COMPLETION",
  paymentProvider: "MANUAL",
  assignedUserId: "",
  customerNotes: "",
  customOptionsText: "",
  tradeAccountDepositWaived: false,
  publicBundleEligible: false,
  publicBundleAddOn: false,
  publicBundleMaxQuantity: "1",
  publicBundleIncompatibleServiceIds: [],
  isActive: true,
  color: "#2563EB",
  requireCustomerPhone: false,
  requireVehicleRegistration: false,
  requireLockingWheelNut: false,
};

function serializeCustomOptions(options?: BookingService["availableOptions"]) {
  return Array.isArray(options)
    ? options
        .map((option) => `${option.label}|${typeof option.priceCents === "number" ? (option.priceCents / 100).toFixed(2) : "0.00"}|${option.description || ""}|${option.defaultSelected ? "default" : ""}`)
        .join("\n")
    : "";
}

function parseCustomOptions(value: string) {
  return value
    .split("\n")
    .map((line, index) => {
      const [label, price = "", description = "", defaultFlag = ""] = line.split("|").map((item) => item.trim());
      if (!label) return null;
      const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `option_${index + 1}`;
      const priceCents = Number.isFinite(Number(price)) ? Math.max(0, Math.round(Number(price) * 100)) : 0;
      return {
        key,
        label,
        description: description || undefined,
        priceCents: String(priceCents),
        defaultSelected: defaultFlag.toLowerCase() === "default",
      };
    })
    .filter(Boolean);
}

function formatMinutes(minuteValue?: number | null, fallback = "09:00") {
  const totalMinutes = Number(minuteValue);
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return fallback;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function moneyToCents(value: string) {
  const normalized = value.trim();
  if (!normalized) return "";
  const amount = Number(normalized);
  return Number.isFinite(amount) ? String(Math.round(amount * 100)) : "";
}

function centsToMoney(value?: number | null) {
  if (typeof value !== "number") return "";
  return (value / 100).toFixed(2);
}

function formatMoney(value?: number | null) {
  if (typeof value !== "number") return "Not set";
  return `£${(value / 100).toFixed(2)}`;
}

function VisibilityEyeIcon({ hidden = false }: { hidden?: boolean }) {
  return (
    <svg aria-hidden="true" className="visibility-eye-icon" viewBox="0 0 24 24" focusable="false">
      <path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
      {hidden ? <path className="visibility-eye-icon__slash" d="M4 4l16 16" /> : null}
    </svg>
  );
}

function VisibilityIconButton({
  pressed,
  visibleLabel,
  hiddenLabel,
  shortLabel,
  testId,
  onClick,
}: {
  pressed: boolean;
  visibleLabel: string;
  hiddenLabel: string;
  shortLabel: string;
  testId: string;
  onClick: () => void;
}) {
  const label = pressed ? visibleLabel : hiddenLabel;
  return (
    <button
      className={`visibility-icon-button ${pressed ? "is-visible" : "is-hidden"}`}
      type="button"
      data-testid={testId}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      <VisibilityEyeIcon hidden={!pressed} />
      <span>{shortLabel}</span>
      <span className="visually-hidden">{label}</span>
    </button>
  );
}

function buildServiceDraft(service: BookingService): ServiceDraft {
  const publicVisible = typeof service.publicVisible === "boolean" ? service.publicVisible : (service.visibility || "PUBLIC") === "PUBLIC";
  const tradeVisible = typeof service.tradeVisible === "boolean" ? service.tradeVisible : ["PUBLIC", "TRADE"].includes(service.visibility || "PUBLIC");
  const privateVisible = typeof service.privateVisible === "boolean" ? service.privateVisible : tradeVisible;
  return {
    id: service.id,
    name: service.name || "",
    description: service.description || "",
    shortDescription: service.shortDescription || "",
    longDescription: service.longDescription || "",
    imageUrl: service.imageUrl || "",
    locationId: service.locationId || "",
    category: service.category || "Services",
    visibility: service.visibility || "PUBLIC",
    publicVisible,
    tradeVisible,
    privateVisible,
    durationMinutes: String(service.durationMinutes || 60),
    price: centsToMoney(service.standardPriceCents ?? service.priceCents ?? 0),
    discountPrice: centsToMoney(service.discountPriceCents),
    depositType: service.depositType || "NONE",
    depositValue:
      typeof service.depositValue === "number" && service.depositValue > 0
        ? service.depositType === "FIXED"
          ? centsToMoney(service.depositValue)
          : String(service.depositValue)
        : "",
    completionPaymentMode: service.completionPaymentMode || "ON_COMPLETION",
    paymentProvider: service.paymentProvider || "MANUAL",
    assignedUserId: service.assignedUserId || "",
    customerNotes: service.customerNotes || "",
    customOptionsText: serializeCustomOptions(service.availableOptions),
    tradeAccountDepositWaived: service.tradeAccountDepositWaived === true,
    publicBundleEligible: service.publicBundleEligible === true,
    publicBundleAddOn: service.publicBundleAddOn === true,
    publicBundleMaxQuantity: String(service.publicBundleMaxQuantity || 1),
    publicBundleIncompatibleServiceIds: Array.isArray(service.publicBundleIncompatibleServiceIds) ? service.publicBundleIncompatibleServiceIds : [],
    isActive: service.isActive !== false,
    color: service.color || "#2563EB",
    requireCustomerPhone: service.requireCustomerPhone === true,
    requireVehicleRegistration: service.requireVehicleRegistration === true,
    requireLockingWheelNut: service.requireLockingWheelNut === true,
  };
}

export default function BookingProSettingsPage() {
  const enabled = isBookingProV1Enabled();
  const [settings, setSettings] = useState<BookingSettingsPayload | null>(null);
  const [tradeSettings, setTradeSettings] = useState<{ enabled?: boolean; publicUrl?: string | null } | null>(null);
  const [publicEnabled, setPublicEnabled] = useState(false);
  const [autoConfirmPublicBookings, setAutoConfirmPublicBookings] = useState(false);
  const [autoCreateJobFromBooking, setAutoCreateJobFromBooking] = useState(false);
  const [autoAssignWorkflow, setAutoAssignWorkflow] = useState(false);
  const [manualReviewMode, setManualReviewMode] = useState(true);
  const [locationFirstScheduling, setLocationFirstScheduling] = useState(true);
  const [autoPopulateJobSheetFromBooking, setAutoPopulateJobSheetFromBooking] = useState(true);
  const [autoCreateInvoiceDraftOnCompletion, setAutoCreateInvoiceDraftOnCompletion] = useState(false);
  const [autoSendInvoiceOnCompletion, setAutoSendInvoiceOnCompletion] = useState(false);
  const [technicianAssignmentRequired, setTechnicianAssignmentRequired] = useState(false);
  const [publicBundlesEnabled, setPublicBundlesEnabled] = useState(false);
  const [startHour, setStartHour] = useState("09:00");
  const [endHour, setEndHour] = useState("17:00");
  const [bookingHoursSource, setBookingHoursSource] = useState<"BUSINESS" | "CUSTOM">("BUSINESS");
  const [blackoutDates, setBlackoutDates] = useState<Array<{ date: string; reason?: string | null }>>([]);
  const [newBlackoutDate, setNewBlackoutDate] = useState("");
  const [newBlackoutReason, setNewBlackoutReason] = useState("");
  const [serviceDraft, setServiceDraft] = useState<ServiceDraft>(EMPTY_SERVICE_DRAFT);
  const [serviceImageSelection, setServiceImageSelection] = useState<{ name: string; size: number } | null>(null);
  const [folderImageFiles, setFolderImageFiles] = useState<Record<string, File>>({});
  const [folderImagePreviews, setFolderImagePreviews] = useState<Record<string, string>>({});
  const [folders, setFolders] = useState<BookingFolder[]>([]);
  const [folderDraft, setFolderDraft] = useState<BookingFolder>(EMPTY_FOLDER);
  const [fields, setFields] = useState<BookingField[]>([]);
  const [fieldDraft, setFieldDraft] = useState<BookingField>(EMPTY_FIELD);
  const [preferredProvider, setPreferredProvider] = useState("MANUAL");
  const [requestedProviders, setRequestedProviders] = useState<string[]>([]);
  const [savingArea, setSavingArea] = useState("");
  const { notice, showError, showSuccess, clearNotice } = useOperatorNotice();

  const bookingMode = useMemo(() => {
    if (!locationFirstScheduling && technicianAssignmentRequired) return "EMPLOYEE";
    if (locationFirstScheduling && technicianAssignmentRequired) return "HYBRID";
    return "LOCATION";
  }, [locationFirstScheduling, technicianAssignmentRequired]);

  function setBookingMode(mode: "LOCATION" | "EMPLOYEE" | "HYBRID") {
    if (mode === "LOCATION") {
      setLocationFirstScheduling(true);
      setTechnicianAssignmentRequired(false);
      return;
    }
    if (mode === "EMPLOYEE") {
      setLocationFirstScheduling(false);
      setTechnicianAssignmentRequired(true);
      return;
    }
    setLocationFirstScheduling(true);
    setTechnicianAssignmentRequired(true);
  }

  function setServiceAudienceVisibility(key: "publicVisible" | "tradeVisible", visible: boolean) {
    setServiceDraft((current) => {
      const next = {
        ...current,
        [key]: visible,
      };
      if (key === "publicVisible" && visible) {
        next.tradeVisible = true;
        next.privateVisible = true;
      }
      if (key === "tradeVisible") {
        next.privateVisible = visible;
      }
      const visibility = next.publicVisible ? "PUBLIC" : next.tradeVisible || next.privateVisible ? "TRADE" : "INTERNAL";
      return { ...next, visibility };
    });
  }

  async function load() {
    if (!enabled) return;
    try {
      const [data, featureData, tradeData] = (await Promise.all([
        apiFetch("/booking/settings"),
        apiFetch("/enterprise/feature-flags"),
        apiFetch("/trade-account-applications/settings").catch(() => null),
      ])) as [BookingSettingsPayload, any, any];
      setSettings(data);
      setTradeSettings(tradeData);
      setFolders(Array.isArray(data?.folders) ? data.folders : []);
      setFields(Array.isArray(data?.questions) ? data.questions : []);
      const publicBundlesFlag = Array.isArray(featureData?.flags)
        ? featureData.flags.find((flag: any) => flag?.key === "public_booking_bundles_v1")
        : null;
      setPublicBundlesEnabled(Boolean(publicBundlesFlag?.enabled));
      setPublicEnabled(Boolean(data?.publicEnabled));
      setAutoConfirmPublicBookings(Boolean(data?.autoConfirmPublicBookings));
      setAutoCreateJobFromBooking(Boolean(data?.bookingWorkflow?.autoCreateJobFromBooking));
      setAutoAssignWorkflow(Boolean(data?.bookingWorkflow?.autoAssignWorkflow));
      setManualReviewMode(data?.bookingWorkflow?.manualReviewMode !== false);
      setLocationFirstScheduling(data?.bookingWorkflow?.locationFirstScheduling !== false);
      setAutoPopulateJobSheetFromBooking(data?.bookingWorkflow?.autoPopulateJobSheetFromBooking !== false);
      setAutoCreateInvoiceDraftOnCompletion(Boolean(data?.bookingWorkflow?.autoCreateInvoiceDraftOnCompletion));
      setAutoSendInvoiceOnCompletion(Boolean(data?.bookingWorkflow?.autoSendInvoiceOnCompletion));
      setTechnicianAssignmentRequired(Boolean(data?.bookingWorkflow?.technicianAssignmentRequired));
      setBlackoutDates(Array.isArray(data?.blackoutDates) ? data.blackoutDates : []);
      const hours = Array.isArray(data?.businessHours) ? data.businessHours : [];
      setBookingHoursSource(data?.bookingHoursSource === "CUSTOM" ? "CUSTOM" : "BUSINESS");
      const weekdayHours = hours.filter((entry) => Number(entry.dayOfWeek) >= 1 && Number(entry.dayOfWeek) <= 5);
      const source = weekdayHours[0] || hours[0] || null;
      setStartHour(formatMinutes(source?.startMinute, "09:00"));
      setEndHour(formatMinutes(source?.endMinute, "17:00"));
      setPreferredProvider(String(data?.paymentCollection?.customerCollection?.preferredProvider || "MANUAL"));
      setRequestedProviders(Array.isArray(data?.paymentCollection?.customerCollection?.requestedProviders) ? data.paymentCollection!.customerCollection!.requestedProviders! : []);
    } catch (err: any) {
      showError(err?.message || "Failed to load Bookings");
    }
  }

  useEffect(() => {
    void load();
  }, [enabled]);

  const providerOptions = settings?.paymentCollection?.customerCollection?.providers || [];
  const activeServices = (settings?.services || []).filter((service) => service.isActive !== false);
  const weekdayHoursReady =
    Array.isArray(settings?.businessHours) &&
    settings.businessHours.some((entry) => Number(entry.dayOfWeek) >= 1 && Number(entry.dayOfWeek) <= 5 && Number(entry.endMinute) > Number(entry.startMinute));
  const confirmationsReady = Boolean(settings?.emailReadiness?.effective?.canSend);
  const providerReady = Boolean((settings?.staff || []).length);
  const paymentReady = preferredProvider === "MANUAL";
  const preferredProviderSummary =
    providerOptions.find((provider) => provider.provider === preferredProvider)?.summary ||
    "Choose how customer payments are collected after booking.";
  const setupSteps: SetupStep[] = useMemo(
    () => [
      {
        key: 'link',
        title: 'Booking link',
        detail: publicEnabled && settings?.publicUrl ? 'Live link is ready to share' : 'Turn on your public link',
        done: Boolean(publicEnabled && settings?.publicUrl),
      },
      {
        key: 'services',
        title: 'Services',
        detail: activeServices.length ? `${activeServices.length} live service${activeServices.length === 1 ? '' : 's'}` : 'Add at least one service',
        done: activeServices.length > 0,
      },
      {
        key: 'hours',
        title: 'Working hours',
        detail: weekdayHoursReady ? `${startHour} to ${endHour} on weekdays` : 'Set the hours customers can book',
        done: Boolean(weekdayHoursReady),
      },
      {
        key: 'team',
        title: 'Team',
        detail: providerReady ? `${(settings?.staff || []).length} team member${(settings?.staff || []).length === 1 ? '' : 's'} available` : 'Add or schedule your team',
        done: providerReady,
        href: '/dashboard/settings/schedules',
      },
      {
        key: 'payments',
        title: 'Customer payments',
        detail: paymentReady ? 'Manual collection is set as the current path' : preferredProviderSummary,
        done: paymentReady,
      },
      {
        key: 'confirmations',
        title: 'Confirmations',
        detail: confirmationsReady ? 'Booking emails and alerts are ready' : 'Finish sender or alert setup',
        done: confirmationsReady,
        href: '/dashboard/settings?tab=messages',
      },
      {
        key: 'test',
        title: 'Test page',
        detail: settings?.publicUrl ? 'Open the public page and try a booking' : 'Get the link ready first',
        done: Boolean(settings?.publicUrl && activeServices.length > 0),
        href: settings?.publicUrl || undefined,
      },
    ],
    [activeServices.length, confirmationsReady, paymentReady, preferredProviderSummary, providerReady, publicEnabled, settings?.publicUrl, settings?.staff, settings?.services, startHour, endHour, weekdayHoursReady],
  );
  const completedStepCount = setupSteps.filter((step) => step.done).length;
  const nextSetupStep = setupSteps.find((step) => !step.done) || setupSteps[setupSteps.length - 1];

  const bookingReadinessLabel = useMemo(() => {
    if (!settings?.publicState || settings.publicState === "setup_required") return "Setup needed";
    if (settings.publicState === "no_slots") return "Live with no slots";
    return "Live";
  }, [settings?.publicState]);

  async function saveShellSettings() {
    setSavingArea("shell");
    try {
      const [startH, startM] = startHour.split(":").map(Number);
      const [endH, endM] = endHour.split(":").map(Number);
      const businessHours = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
        dayOfWeek,
        startMinute: startH * 60 + startM,
        endMinute: endH * 60 + endM,
      }));
      await apiFetch("/bookings/settings", {
        method: "POST",
        body: JSON.stringify({
          publicEnabled,
          autoConfirmPublicBookings,
          autoCreateJobFromBooking,
          autoAssignWorkflow,
          manualReviewMode,
          bookingMode,
          locationFirstScheduling,
          autoPopulateJobSheetFromBooking,
          autoCreateInvoiceDraftOnCompletion,
          autoSendInvoiceOnCompletion,
          technicianAssignmentRequired,
          bookingHoursSource,
          ...(bookingHoursSource === "CUSTOM" ? { businessHours } : { resetBookingHoursToBusiness: true }),
          blackoutDates,
        }),
      });
      await load();
      showSuccess("Booking link settings saved. Next: test the public page with a real service and working hours.");
    } catch (err: any) {
      showError(err?.message || "Failed to save booking link settings");
    } finally {
      setSavingArea("");
    }
  }

  async function savePaymentSettings() {
    setSavingArea("payments");
    try {
      await apiFetch("/billing/payment-collection", {
        method: "PATCH",
        body: JSON.stringify({
          preferredProvider,
          requestedProviders,
        }),
      });
      await load();
      showSuccess("Payment setup saved. Next: make sure the first booking shows the right collection guidance.");
    } catch (err: any) {
      showError(err?.message || "Failed to save payment settings");
    } finally {
      setSavingArea("");
    }
  }

  async function savePublicBundleFlag(enabledValue: boolean) {
    setSavingArea("public-bundles");
    try {
      await apiFetch("/enterprise/feature-flags", {
        method: "PATCH",
        body: JSON.stringify({
          key: "public_booking_bundles_v1",
          enabled: enabledValue,
          reason: "Booking settings public bundle rollout",
        }),
      });
      setPublicBundlesEnabled(enabledValue);
      await load();
      showSuccess(enabledValue ? "Public service bundles enabled. Mark eligible services before sharing." : "Public service bundles disabled. The public page is back to one service.");
    } catch (err: any) {
      showError(err?.message || "Failed to update public bundle setting");
    } finally {
      setSavingArea("");
    }
  }

  async function saveService() {
    if (!serviceDraft.name.trim()) {
      showError("Add a service name before saving.");
      return;
    }
    setSavingArea("service");
    try {
      const payload = {
        name: serviceDraft.name.trim(),
        description: serviceDraft.description.trim() || undefined,
        shortDescription: serviceDraft.shortDescription.trim() || undefined,
        longDescription: serviceDraft.longDescription.trim() || undefined,
        imageUrl: serviceDraft.imageUrl.trim() || undefined,
        locationId: serviceDraft.locationId || undefined,
        category: serviceDraft.category.trim() || "Services",
        visibility: serviceDraft.visibility,
        publicVisible: serviceDraft.publicVisible,
        tradeVisible: serviceDraft.tradeVisible,
        privateVisible: serviceDraft.privateVisible,
        durationMinutes: serviceDraft.durationMinutes || "60",
        priceCents: moneyToCents(serviceDraft.price) || "0",
        discountPriceCents: moneyToCents(serviceDraft.discountPrice) || undefined,
        depositType: serviceDraft.depositType,
        depositValue:
          serviceDraft.depositType === "FIXED"
            ? moneyToCents(serviceDraft.depositValue) || undefined
            : serviceDraft.depositValue || undefined,
        depositCents: serviceDraft.depositType === "FIXED" ? String(Number(moneyToCents(serviceDraft.depositValue) || "0")) : "0",
        completionPaymentMode: serviceDraft.completionPaymentMode,
        paymentProvider: serviceDraft.paymentProvider,
        assignedUserId: serviceDraft.assignedUserId || undefined,
        customerNotes: serviceDraft.customerNotes.trim() || undefined,
        customOptions: parseCustomOptions(serviceDraft.customOptionsText),
        tradeAccountDepositWaived: serviceDraft.tradeAccountDepositWaived,
        publicBundleEligible: serviceDraft.publicBundleEligible,
        publicBundleAddOn: serviceDraft.publicBundleAddOn,
        publicBundleMaxQuantity: serviceDraft.publicBundleMaxQuantity || "1",
        publicBundleIncompatibleServiceIds: serviceDraft.publicBundleIncompatibleServiceIds,
        isActive: serviceDraft.isActive,
        color: serviceDraft.color || "#2563EB",
        requireCustomerPhone: serviceDraft.requireCustomerPhone,
        requireVehicleRegistration: serviceDraft.requireVehicleRegistration,
        requireLockingWheelNut: serviceDraft.requireLockingWheelNut,
      };
      if (serviceDraft.id) {
        await apiFetch(`/booking/services/${serviceDraft.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        showSuccess("Booking service updated.");
      } else {
        await apiFetch("/booking/services", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showSuccess("Booking service created. Next: open the public page and place the first booking request.");
      }
      setServiceDraft(EMPTY_SERVICE_DRAFT);
      await load();
    } catch (err: any) {
      showError(err?.message || "Failed to save booking service");
    } finally {
      setSavingArea("");
    }
  }

  async function uploadFolderImage(category: string) {
    const file = folderImageFiles[category];
    if (!file) return;
    setSavingArea(`folder:${category}`);
    clearNotice();
    try {
      const body = new FormData();
      body.append("category", category);
      body.append("file", file);
      await apiFetch("/booking/folders/image", { method: "POST", body });
      const previewUrl = folderImagePreviews[category];
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFolderImageFiles((current) => {
        const next = { ...current };
        delete next[category];
        return next;
      });
      setFolderImagePreviews((current) => {
        const next = { ...current };
        delete next[category];
        return next;
      });
      await load();
      showSuccess(`${category} image updated.`);
    } catch (err: any) {
      showError(err?.message || "Failed to upload the service folder image");
    } finally {
      setSavingArea("");
    }
  }

  async function saveFolders(nextFolders = folders) {
    setSavingArea("folders");
    clearNotice();
    try {
      await apiFetch("/booking/settings", {
        method: "POST",
        body: JSON.stringify({
          folders: nextFolders.map((folder, index) => ({ ...folder, sortOrder: index })),
        }),
      });
      await load();
      setFolderDraft(EMPTY_FOLDER);
      showSuccess("Service folders saved.");
    } catch (err: any) {
      showError(err?.message || "Failed to save service folders");
    } finally {
      setSavingArea("");
    }
  }

  function addOrUpdateFolder() {
    const displayName = folderDraft.displayName.trim();
    const key = (folderDraft.key || displayName).trim();
    if (!displayName || !key) {
      showError("Add a folder name before saving.");
      return;
    }
    const normalized = { ...folderDraft, key, displayName };
    const existingIndex = folders.findIndex((folder) => folder.key === key);
    const next = existingIndex >= 0
      ? folders.map((folder, index) => index === existingIndex ? normalized : folder)
      : [...folders, { ...normalized, sortOrder: folders.length }];
    setFolders(next);
    void saveFolders(next);
  }

  async function saveFields(nextFields = fields) {
    setSavingArea("fields");
    clearNotice();
    try {
      await apiFetch("/booking/settings", {
        method: "POST",
        body: JSON.stringify({
          questions: nextFields.map((field, index) => ({
            ...field,
            locationId: field.optionsJson?.locationIds?.[0] || undefined,
            optionsJson: { ...field.optionsJson, sortOrder: index },
          })),
        }),
      });
      await load();
      setFieldDraft(EMPTY_FIELD);
      showSuccess("Customer fields saved.");
    } catch (err: any) {
      showError(err?.message || "Failed to save customer fields");
    } finally {
      setSavingArea("");
    }
  }

  function addOrUpdateField() {
    const label = fieldDraft.label.trim();
    const questionKey = (fieldDraft.questionKey || label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")).trim();
    if (!label || !questionKey) {
      showError("Add a field label before saving.");
      return;
    }
    const normalized = { ...fieldDraft, label, questionKey };
    const existingIndex = fields.findIndex((field) => field.questionKey === questionKey);
    const next = existingIndex >= 0
      ? fields.map((field, index) => index === existingIndex ? normalized : field)
      : [...fields, normalized];
    setFields(next);
    void saveFields(next);
  }

  function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return items;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  }

  async function copyLink() {
    const value = settings?.publicUrl || "";
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      showSuccess("Saved. Booking link copied.");
    } catch {
      showError("Could not copy the booking link.");
    }
  }

  function absoluteAppLink(value?: string | null) {
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    if (typeof window === "undefined") return value;
    return new URL(value, window.location.origin).toString();
  }

  async function copyTradeLink() {
    const value = absoluteAppLink(tradeSettings?.publicUrl);
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      showSuccess("Saved. Trade portal link copied.");
    } catch {
      showError("Could not copy the trade portal link.");
    }
  }

  if (!enabled) {
    return (
      <DashboardShell>
        <div className="card">
          <h1>Bookings</h1>
          <p className="muted" style={{ marginBottom: 0 }}>Bookings are not enabled for this workspace.</p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="operator-stack">
        <section className="card operator-page booking-setup-hero" data-testid="booking-setup-progress">
          <div className="operator-page__hero">
            <div className="operator-page__copy">
              <div className="operator-page__eyebrow">Bookings</div>
              <h1 className="operator-page__title">Bookings</h1>
              <p className="muted operator-page__subtitle">
                Publish the customer booking journey, choose how availability is calculated, and control what public and trade visitors can book.
              </p>
            </div>
            <div className="booking-setup-hero__next">
              {nextSetupStep?.href ? (
                <Link
                  href={nextSetupStep.href}
                  target={nextSetupStep.href.startsWith('http') ? '_blank' : undefined}
                  rel={nextSetupStep.href.startsWith('http') ? 'noreferrer' : undefined}
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  <strong>{nextSetupStep?.title || 'Bookings'}</strong>
                </Link>
              ) : (
                <strong>{nextSetupStep?.title || 'Bookings'}</strong>
              )}
              <p className="muted">{nextSetupStep?.detail || 'Review your public booking page.'}</p>
              {nextSetupStep?.href ? (
                <Link className="button secondary" href={nextSetupStep.href} target={nextSetupStep.href.startsWith('http') ? '_blank' : undefined} rel={nextSetupStep.href.startsWith('http') ? 'noreferrer' : undefined}>
                  Open next step
                </Link>
              ) : null}
            </div>
          </div>
          <div className="operator-page__stats">
            <div className="operator-page__stat">
              <div className="operator-page__statLabel">Progress</div>
              <div className="operator-page__statValue">
                {completedStepCount}/{setupSteps.length}
              </div>
              <div className="operator-page__statHint">Complete the steps that make the public journey feel ready.</div>
            </div>
            <div className="operator-page__stat">
              <div className="operator-page__statLabel">Public state</div>
              <div className="operator-page__statValue">{bookingReadinessLabel}</div>
              <div className="operator-page__statHint">{settings?.publicMessage || 'Bookings are not ready yet.'}</div>
            </div>
            <div className="operator-page__stat">
              <div className="operator-page__statLabel">Next open time</div>
              <div className="operator-page__statValue">
                {settings?.nextAvailableSlot ? new Date(settings.nextAvailableSlot).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'None yet'}
              </div>
              <div className="operator-page__statHint">Shown when the selected day is full.</div>
            </div>
          </div>
          <div className="booking-setup-progressGrid">
            {setupSteps.map((step, index) => (
              <article key={step.key} className={`booking-setup-progressCard ${step.done ? 'is-done' : 'is-pending'}`}>
                <div className="booking-setup-progressCard__top">
                  <span className="booking-setup-progressCard__number">{index + 1}</span>
                  <span className={`booking-setup-progressCard__status ${step.done ? 'is-done' : 'is-pending'}`}>{step.done ? 'Ready' : 'Next'}</span>
              </div>
              <strong>{step.title}</strong>
              <p className="muted">{step.detail}</p>
                {step.href ? (
                  <Link className="button secondary" href={step.href} target={step.href.startsWith('http') ? '_blank' : undefined} rel={step.href.startsWith('http') ? 'noreferrer' : undefined}>
                    Open
                  </Link>
                ) : null}
              </article>
            ))}
          </div>
          <OperatorNotice notice={notice} onDismiss={clearNotice} />
        </section>

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">First live run</h2>
              <p className="operator-section__subtitle">Keep the first customer journey simple: booking, completion, handoff, and payment follow-up.</p>
            </div>
            <span className="badge">First workflow</span>
          </div>
          <div className="booking-setup-progressGrid">
            <article className="booking-setup-progressCard is-done">
              <div className="booking-setup-progressCard__top">
                <span className="booking-setup-progressCard__number">1</span>
                <span className="booking-setup-progressCard__status is-done">Setup</span>
              </div>
              <strong>Share the booking page</strong>
              <p className="muted">Add the public link to your site, messages, or social profile.</p>
            </article>
            <article className="booking-setup-progressCard is-pending">
              <div className="booking-setup-progressCard__top">
                <span className="booking-setup-progressCard__number">2</span>
                <span className="booking-setup-progressCard__status is-pending">Next</span>
              </div>
              <strong>Receive the first booking</strong>
              <p className="muted">Confirm the request and turn it into scheduled work.</p>
            </article>
            <article className="booking-setup-progressCard is-pending">
              <div className="booking-setup-progressCard__top">
                <span className="booking-setup-progressCard__number">3</span>
                <span className="booking-setup-progressCard__status is-pending">Then</span>
              </div>
              <strong>Complete and follow up</strong>
              <p className="muted">Finish the job, send the result, and use the customer payment setup your business really has live.</p>
            </article>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link className="button secondary" href="/dashboard/bookings">Open bookings</Link>
            <Link className="button secondary" href="/dashboard/work">Open work queue</Link>
          </div>
        </section>

        <section className="card operator-section" data-testid="booking-link-card" id="workflow">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Booking link</h2>
              <p className="operator-section__subtitle">A customer-safe page for service choice, live times, and booking requests.</p>
            </div>
            <span className="badge">{bookingReadinessLabel}</span>
          </div>
          <div className="operator-stack">
            <div>
              <div className="operator-kicker">Your booking link</div>
              <div className="operator-row__subtitle" style={{ marginTop: 6 }} data-testid="booking-public-link">
                {settings?.publicUrl ? "Public booking link is ready. Use the buttons below to preview, open, or copy it." : "Enable public bookings to generate your live link."}
              </div>
              <p className="operator-note" style={{ marginTop: 8 }}>
                Add this link to your website booking button. Customers choose a location, service, and real open time before sending a booking request.
              </p>
              {settings?.publicUrl ? (
                <div className="operator-inline-actions" style={{ marginTop: 12 }} data-testid="booking-public-preview">
                  <Link className="button" href={settings.publicUrl} target="_blank" rel="noreferrer" data-testid="open-public-booking-page">
                    Open public link
                  </Link>
                  <button className="button secondary" type="button" onClick={() => void copyLink()} data-testid="copy-public-booking-link">
                    Copy public booking link
                  </button>
                  <Link className="button secondary" href={settings.publicUrl} target="_blank" rel="noreferrer" data-testid="preview-public-booking-page">
                    Customer preview
                  </Link>
                </div>
              ) : null}
            </div>
            <label className="toggle-row">
              <input type="checkbox" checked={publicEnabled} onChange={(event) => setPublicEnabled(event.target.checked)} />
              Enable public booking requests
            </label>
            <label className="toggle-row">
              <input type="checkbox" checked={autoConfirmPublicBookings} onChange={(event) => setAutoConfirmPublicBookings(event.target.checked)} />
              Auto-confirm public bookings when a real slot is available
            </label>
            <div className="operator-guidance" data-testid="booking-workflow-controls">
              <strong>Workflow after a booking</strong>
              <p>Choose how bookings move into work. Location is first; technician assignment stays optional unless you deliberately require it.</p>
              <div className="operator-inline-actions" style={{ marginTop: 10 }} data-testid="booking-mode-controls" aria-label="Booking basis">
                {([
                  ["LOCATION", "Location-based"],
                  ["EMPLOYEE", "Employee-based"],
                  ["HYBRID", "Hybrid"],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    className={`button ${bookingMode === mode ? "" : "secondary"}`}
                    data-testid={`booking-mode-${mode.toLowerCase()}`}
                    onClick={() => setBookingMode(mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="operator-formGrid" style={{ marginTop: 10 }}>
                <label className="toggle-row">
                  <input type="checkbox" checked={autoCreateJobFromBooking} onChange={(event) => setAutoCreateJobFromBooking(event.target.checked)} />
                  Create the job automatically after confirmation
                </label>
                <label className="toggle-row">
                  <input type="checkbox" checked={autoAssignWorkflow} onChange={(event) => setAutoAssignWorkflow(event.target.checked)} />
                  Auto-assign using location and service rules only when ready
                </label>
                <label className="toggle-row">
                  <input type="checkbox" checked={manualReviewMode} onChange={(event) => setManualReviewMode(event.target.checked)} />
                  Keep manual review available for exceptions
                </label>
                <div className="operator-note">Current booking basis: {bookingMode === "LOCATION" ? "location-based" : bookingMode === "EMPLOYEE" ? "employee/technician-based" : "hybrid"}.</div>
                <label className="toggle-row">
                  <input type="checkbox" checked={autoPopulateJobSheetFromBooking} onChange={(event) => setAutoPopulateJobSheetFromBooking(event.target.checked)} />
                  Create job sheet automatically from booking data
                </label>
                <label className="toggle-row">
                  <input type="checkbox" checked={autoCreateInvoiceDraftOnCompletion} onChange={(event) => setAutoCreateInvoiceDraftOnCompletion(event.target.checked)} />
                  Draft invoice when work is complete
                </label>
                <label className="toggle-row">
                  <input type="checkbox" checked={autoSendInvoiceOnCompletion} onChange={(event) => setAutoSendInvoiceOnCompletion(event.target.checked)} />
                  Send invoice automatically only if payment setup is ready
                </label>
                <label className="toggle-row">
                  <input type="checkbox" checked={technicianAssignmentRequired} onChange={(event) => setTechnicianAssignmentRequired(event.target.checked)} />
                  Require technician before booking can be scheduled
                </label>
              </div>
            </div>
            <div className="operator-row" data-testid="booking-hours-source">
              <div className="operator-row__main">
                <div className="operator-row__title">Booking hours source</div>
                <div className="operator-row__subtitle">
                  Current source: {bookingHoursSource === "CUSTOM" ? "Custom booking hours" : settings?.bookingHoursSourceLabel || "Business hours"}
                </div>
              </div>
              <div className="operator-row__actions">
                <label className="toggle-row">
                  <input
                    type="radio"
                    name="booking-hours-source"
                    checked={bookingHoursSource === "BUSINESS"}
                    onChange={() => setBookingHoursSource("BUSINESS")}
                  />
                  Use business hours
                </label>
                <label className="toggle-row">
                  <input
                    type="radio"
                    name="booking-hours-source"
                    checked={bookingHoursSource === "CUSTOM"}
                    onChange={() => setBookingHoursSource("CUSTOM")}
                  />
                  Custom booking hours
                </label>
                <button className="button secondary operator-compact-button" type="button" onClick={() => setBookingHoursSource("BUSINESS")}>
                  Reset to business hours
                </button>
              </div>
            </div>
            <div className="operator-formGrid">
              <div>
                <label>Weekday start</label>
                <input className="input" type="time" value={startHour} disabled={bookingHoursSource !== "CUSTOM"} onChange={(event) => setStartHour(event.target.value)} />
              </div>
              <div>
                <label>Weekday end</label>
                <input className="input" type="time" value={endHour} disabled={bookingHoursSource !== "CUSTOM"} onChange={(event) => setEndHour(event.target.value)} />
              </div>
            </div>
            <div>
              <div className="operator-kicker">Blackout dates</div>
              <div className="operator-formGrid" style={{ marginTop: 10 }}>
                <input className="input" type="date" value={newBlackoutDate} onChange={(event) => setNewBlackoutDate(event.target.value)} />
                <input className="input" placeholder="Reason (optional)" value={newBlackoutReason} onChange={(event) => setNewBlackoutReason(event.target.value)} />
              </div>
              <div className="operator-inline-actions" style={{ marginTop: 10 }}>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    if (!newBlackoutDate) return;
                    setBlackoutDates((current) => [...current, { date: newBlackoutDate, reason: newBlackoutReason || null }]);
                    setNewBlackoutDate("");
                    setNewBlackoutReason("");
                  }}
                >
                  Add blackout date
                </button>
                {settings?.publicUrl ? (
                  <>
                    <button className="button secondary" type="button" onClick={() => void copyLink()}>
                      Copy link
                    </button>
                    <Link className="button secondary" href={settings.publicUrl} target="_blank" rel="noreferrer">
                      Open public page
                    </Link>
                  </>
                ) : null}
              </div>
            </div>
            {blackoutDates.length ? (
              <div className="operator-list">
                {blackoutDates.map((item) => (
                  <article key={`${item.date}-${item.reason || ""}`} className="operator-row">
                    <div className="operator-row__main">
                      <div className="operator-row__title">{item.date}</div>
                      <div className="operator-row__subtitle">{item.reason || "No reason added"}</div>
                    </div>
                    <div className="operator-row__actions">
                      <button
                        className="button secondary operator-compact-button"
                        type="button"
                        onClick={() => setBlackoutDates((current) => current.filter((entry) => entry !== item))}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
            <div className="operator-inline-actions">
              <button className="button" type="button" onClick={() => void saveShellSettings()} disabled={savingArea === "shell"}>
                {savingArea === "shell" ? "Saving..." : "Save booking link"}
              </button>
              {settings?.publicMessage ? <span className="operator-note">{settings.publicMessage}</span> : null}
            </div>
          </div>
        </section>

        <section className="card operator-section" data-testid="trade-booking-links">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Trade booking and portal</h2>
              <p className="operator-section__subtitle">Give approved trade customers a tenant-branded route while keeping trade-only services out of the public booking page.</p>
            </div>
            <span className="badge">{tradeSettings?.enabled ? "Live" : "Setup required"}</span>
          </div>
          <div className="operator-inline-actions">
            {tradeSettings?.publicUrl ? (
              <>
                <Link className="button" href={tradeSettings.publicUrl} target="_blank" rel="noreferrer" data-testid="open-trade-booking-portal">
                  Open trade booking portal
                </Link>
                <button className="button secondary" type="button" onClick={() => void copyTradeLink()} data-testid="copy-trade-portal-link">
                  Copy trade portal link
                </button>
                <Link className="button secondary" href={tradeSettings.publicUrl} target="_blank" rel="noreferrer">
                  Preview trade customer view
                </Link>
              </>
            ) : null}
            <Link className="button secondary" href="/dashboard/trade-accounts">
              Manage trade portal access
            </Link>
            <Link className="button secondary" href="/dashboard/trade-applications">
              Configure trade applications
            </Link>
          </div>
        </section>

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Working hours and team</h2>
              <p className="operator-section__subtitle">Keep the customer view simple while still controlling who can be booked and when.</p>
            </div>
          </div>
          <div className="booking-setup-supportGrid">
            <article className="booking-setup-supportCard">
              <div className="booking-setup-supportCard__eyebrow">Working hours</div>
              <strong>{startHour} to {endHour}</strong>
              <p className="muted">These hours set the outer limit for public slots. Longer services only show when they fit before the end of the day.</p>
            </article>
            <article className="booking-setup-supportCard">
              <div className="booking-setup-supportCard__eyebrow">Team</div>
              <strong>{(settings?.staff || []).length} team member{(settings?.staff || []).length === 1 ? '' : 's'}</strong>
              <p className="muted">Assign a team member inside a service when one person should take that job, or leave it open for any available team member.</p>
              <Link className="button secondary" href="/dashboard/settings/schedules">
                Open schedules
              </Link>
            </article>
            <article className="booking-setup-supportCard">
              <div className="booking-setup-supportCard__eyebrow">Test the page</div>
              <strong>Try the customer flow</strong>
              <p className="muted">Open your public page to check service cards, next available times, and the confirmation message.</p>
              {settings?.publicUrl ? (
                <Link className="button secondary" href={settings.publicUrl} target="_blank" rel="noreferrer">
                  Open public page
                </Link>
              ) : null}
            </article>
          </div>
        </section>

        <section className="card operator-section" data-testid="booking-service-folders-card">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Service Folders</h2>
              <p className="operator-section__subtitle">Group services into clear customer choices and control where each folder appears.</p>
            </div>
            {settings?.publicUrl ? <Link className="button secondary" href={settings.publicUrl} target="_blank" rel="noreferrer">Preview</Link> : null}
          </div>
          <div className="operator-stack">
            <div className="operator-formGrid">
              <div>
                <label>Display name</label>
                <input
                  className="input"
                  data-testid="booking-folder-name"
                  value={folderDraft.displayName}
                  onChange={(event) => setFolderDraft((current) => ({
                    ...current,
                    displayName: event.target.value,
                    key: current.key || event.target.value,
                  }))}
                />
              </div>
              <div>
                <label>Visibility</label>
                <select className="input" value={folderDraft.visibility} onChange={(event) => setFolderDraft((current) => ({ ...current, visibility: event.target.value as BookingFolder["visibility"] }))}>
                  <option value="PUBLIC">Public booking</option>
                  <option value="TRADE">Trade portal</option>
                  <option value="INTERNAL">Internal only</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
            </div>
            <div>
              <label>Public description</label>
              <input className="input" value={folderDraft.publicDescription || ""} onChange={(event) => setFolderDraft((current) => ({ ...current, publicDescription: event.target.value }))} />
            </div>
            <div>
              <label>Internal notes</label>
              <textarea className="input" rows={2} value={folderDraft.internalNotes || ""} onChange={(event) => setFolderDraft((current) => ({ ...current, internalNotes: event.target.value }))} />
            </div>
            <div className="operator-inline-actions">
              <button className="button" type="button" data-testid="booking-folder-save" disabled={savingArea === "folders"} onClick={addOrUpdateFolder}>
                {savingArea === "folders" ? "Saving..." : "Save folder"}
              </button>
              <button className="button secondary" type="button" onClick={() => setFolderDraft(EMPTY_FOLDER)}>Clear</button>
            </div>
            <div className="operator-list">
              {folders.map((folder, index) => (
                <article className="operator-row" key={folder.key} data-testid={`booking-folder-row-${folder.key}`}>
                  <div className="operator-row__main">
                    <div className="operator-row__title">{folder.displayName}</div>
                    <div className="operator-row__subtitle">{folder.visibility === "PUBLIC" ? "Public booking" : folder.visibility === "TRADE" ? "Trade portal" : folder.visibility === "INTERNAL" ? "Internal only" : "Archived"}</div>
                    {folderImagePreviews[folder.key] || folder.imageUrl || settings?.folderImages?.[folder.key] ? (
                      <img
                        src={folderImagePreviews[folder.key] || folder.imageUrl || settings?.folderImages?.[folder.key]}
                        alt=""
                        data-testid={`booking-folder-image-preview-${folder.key}`}
                        style={{ width: 120, height: 72, objectFit: "cover", borderRadius: 12, marginTop: 8 }}
                      />
                    ) : null}
                  </div>
                  <div className="operator-row__actions">
                    <input
                      id={`booking-folder-image-${folder.key}`}
                      className="visually-hidden"
                      aria-label={`Upload image for ${folder.displayName}`}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={savingArea === `folder:${folder.key}`}
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        const validationError = file
                          ? validateUploadFile(file, { category: "image", maxBytes: UPLOAD_LIMITS.image })
                          : null;
                        if (validationError) {
                          showError(validationError);
                          event.currentTarget.value = "";
                          return;
                        }
                        const currentPreview = folderImagePreviews[folder.key];
                        if (currentPreview) URL.revokeObjectURL(currentPreview);
                        setFolderImageFiles((current) => ({ ...current, [folder.key]: file as File }));
                        setFolderImagePreviews((current) => ({ ...current, [folder.key]: URL.createObjectURL(file as File) }));
                      }}
                    />
                    <label className="button secondary operator-compact-button" htmlFor={`booking-folder-image-${folder.key}`}>
                      Choose image
                    </label>
                    <span data-testid={`booking-folder-image-file-name-${folder.key}`}>
                      {folderImageFiles[folder.key]?.name || "No image selected"}
                    </span>
                    {folderImageFiles[folder.key] ? (
                      <div data-testid={`booking-folder-image-selection-${folder.key}`}>
                        <strong>{folderImageFiles[folder.key].name}</strong>
                        <span className="muted" style={{ display: "block" }}>{(folderImageFiles[folder.key].size / 1024).toFixed(1)} KB selected</span>
                      </div>
                    ) : null}
                    <button
                      className="button secondary operator-compact-button"
                      type="button"
                      disabled={!folderImageFiles[folder.key] || savingArea === `folder:${folder.key}`}
                      onClick={() => void uploadFolderImage(folder.key)}
                    >
                      {savingArea === `folder:${folder.key}` ? "Uploading..." : "Upload image"}
                    </button>
                    {folderImageFiles[folder.key] ? (
                      <button className="button secondary operator-compact-button" type="button" onClick={() => {
                        const previewUrl = folderImagePreviews[folder.key];
                        if (previewUrl) URL.revokeObjectURL(previewUrl);
                        setFolderImageFiles((current) => {
                          const next = { ...current };
                          delete next[folder.key];
                          return next;
                        });
                        setFolderImagePreviews((current) => {
                          const next = { ...current };
                          delete next[folder.key];
                          return next;
                        });
                      }}>Clear</button>
                    ) : null}
                    <button className="button secondary operator-compact-button" type="button" onClick={() => setFolderDraft(folder)}>Edit</button>
                    <button className="button secondary operator-compact-button" type="button" disabled={index === 0} onClick={() => {
                      const next = moveItem(folders, index, -1);
                      setFolders(next);
                      void saveFolders(next);
                    }}>Up</button>
                    <button className="button secondary operator-compact-button" type="button" disabled={index === folders.length - 1} onClick={() => {
                      const next = moveItem(folders, index, 1);
                      setFolders(next);
                      void saveFolders(next);
                    }}>Down</button>
                    <button className="button secondary operator-compact-button" type="button" onClick={() => {
                      const next = folders.map((entry) => entry.key === folder.key ? { ...entry, visibility: "ARCHIVED" as const } : entry);
                      setFolders(next);
                      void saveFolders(next);
                    }}>Archive</button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="card operator-section" data-testid="booking-customer-fields-card">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Customer Fields</h2>
              <p className="operator-section__subtitle">Ask only for information relevant to the selected location, folder, or service.</p>
            </div>
            {settings?.publicUrl ? <Link className="button secondary" href={settings.publicUrl} target="_blank" rel="noreferrer">Preview</Link> : null}
          </div>
          <div className="operator-stack">
            <div className="operator-formGrid">
              <div>
                <label>Field label</label>
                <input className="input" data-testid="booking-field-label" value={fieldDraft.label} onChange={(event) => setFieldDraft((current) => ({ ...current, label: event.target.value }))} />
              </div>
              <div>
                <label>Field type</label>
                <select className="input" data-testid="booking-field-type" value={fieldDraft.type} onChange={(event) => setFieldDraft((current) => ({ ...current, type: event.target.value }))}>
                  {["text", "email", "phone", "number", "checkbox", "dropdown", "radio", "date", "vehicle_registration", "postcode", "address", "textarea"].map((type) => <option key={type} value={type}>{type.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div>
                <label>Shown in</label>
                <select className="input" value={fieldDraft.optionsJson?.visibility || "PUBLIC"} onChange={(event) => setFieldDraft((current) => ({ ...current, optionsJson: { ...current.optionsJson, visibility: event.target.value as "PUBLIC" | "TRADE" | "INTERNAL" } }))}>
                  <option value="PUBLIC">Public booking</option>
                  <option value="TRADE">Trade portal</option>
                  <option value="INTERNAL">Internal only</option>
                </select>
              </div>
              <label className="toggle-row">
                <input type="checkbox" checked={fieldDraft.required} onChange={(event) => setFieldDraft((current) => ({ ...current, required: event.target.checked }))} />
                Required
              </label>
            </div>
            <div className="operator-formGrid">
              <div>
                <label>Placeholder</label>
                <input className="input" value={fieldDraft.optionsJson?.placeholder || ""} onChange={(event) => setFieldDraft((current) => ({ ...current, optionsJson: { ...current.optionsJson, placeholder: event.target.value } }))} />
              </div>
              <div>
                <label>Help text</label>
                <input className="input" value={fieldDraft.optionsJson?.helpText || ""} onChange={(event) => setFieldDraft((current) => ({ ...current, optionsJson: { ...current.optionsJson, helpText: event.target.value } }))} />
              </div>
              <div>
                <label>Options</label>
                <input className="input" placeholder="One, Two, Three" value={(fieldDraft.optionsJson?.options || []).join(", ")} onChange={(event) => setFieldDraft((current) => ({ ...current, optionsJson: { ...current.optionsJson, options: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) } }))} />
              </div>
            </div>
            <div className="operator-formGrid">
              <div>
                <label>Location</label>
                <select className="input" value={fieldDraft.optionsJson?.locationIds?.[0] || ""} onChange={(event) => setFieldDraft((current) => ({ ...current, optionsJson: { ...current.optionsJson, locationIds: event.target.value ? [event.target.value] : [] } }))}>
                  <option value="">All locations</option>
                  {(settings?.locations || []).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
              </div>
              <div>
                <label>Service folder</label>
                <select className="input" value={fieldDraft.optionsJson?.folderKeys?.[0] || ""} onChange={(event) => setFieldDraft((current) => ({ ...current, optionsJson: { ...current.optionsJson, folderKeys: event.target.value ? [event.target.value] : [] } }))}>
                  <option value="">All folders</option>
                  {folders.filter((folder) => folder.visibility !== "ARCHIVED").map((folder) => <option key={folder.key} value={folder.key}>{folder.displayName}</option>)}
                </select>
              </div>
              <div>
                <label>Service</label>
                <select className="input" value={fieldDraft.optionsJson?.serviceIds?.[0] || ""} onChange={(event) => setFieldDraft((current) => ({ ...current, optionsJson: { ...current.optionsJson, serviceIds: event.target.value ? [event.target.value] : [] } }))}>
                  <option value="">All services</option>
                  {(settings?.services || []).filter((service) => service.isActive !== false).map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                </select>
              </div>
            </div>
            <div className="operator-inline-actions">
              <button className="button" type="button" data-testid="booking-field-save" disabled={savingArea === "fields"} onClick={addOrUpdateField}>
                {savingArea === "fields" ? "Saving..." : "Save field"}
              </button>
              <button className="button secondary" type="button" onClick={() => setFieldDraft(EMPTY_FIELD)}>Clear</button>
            </div>
            <div className="operator-list">
              {fields.map((field, index) => (
                <article className="operator-row" key={field.questionKey} data-testid={`booking-field-row-${field.questionKey}`}>
                  <div className="operator-row__main">
                    <div className="operator-row__title">{field.label}{field.required ? " *" : ""}</div>
                    <div className="operator-row__subtitle">{field.type.replace(/_/g, " ")} · {(field.optionsJson?.visibility || "PUBLIC").toLowerCase()}</div>
                  </div>
                  <div className="operator-row__actions">
                    <button className="button secondary operator-compact-button" type="button" onClick={() => setFieldDraft(field)}>Edit</button>
                    <button className="button secondary operator-compact-button" type="button" disabled={index === 0} onClick={() => {
                      const next = moveItem(fields, index, -1);
                      setFields(next);
                      void saveFields(next);
                    }}>Up</button>
                    <button className="button secondary operator-compact-button" type="button" disabled={index === fields.length - 1} onClick={() => {
                      const next = moveItem(fields, index, 1);
                      setFields(next);
                      void saveFields(next);
                    }}>Down</button>
                    <button className="button secondary operator-compact-button" type="button" onClick={() => {
                      const next = fields.filter((entry) => entry.questionKey !== field.questionKey);
                      setFields(next);
                      void saveFields(next);
                    }}>Remove</button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="card operator-section" data-testid="booking-services-card">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Services</h2>
              <p className="operator-section__subtitle">Set name, timing, price, deposit, payment guidance, and customer notes for each bookable service.</p>
            </div>
          </div>
          <div className="operator-stack">
            <div className="operator-row" data-testid="booking-public-bundles-settings">
              <div className="operator-row__main">
                <div className="operator-row__title">Public service bundles</div>
                <div className="operator-row__subtitle">
                  Let customers add eligible services to one booking. Off keeps each public booking focused on one selected service.
                </div>
              </div>
              <div className="operator-row__actions">
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    data-testid="booking-public-bundles-toggle"
                    checked={publicBundlesEnabled}
                    disabled={savingArea === "public-bundles"}
                    onChange={(event) => void savePublicBundleFlag(event.target.checked)}
                  />
                  Enabled
                </label>
              </div>
            </div>
            <div className="operator-formGrid">
              <div>
                <label>Service name</label>
                <input className="input" data-testid="booking-service-name" value={serviceDraft.name} onChange={(event) => setServiceDraft((current) => ({ ...current, name: event.target.value }))} />
              </div>
              <div>
                <label>Service folder</label>
                <select
                  className="input"
                  data-testid="booking-service-category"
                  value={serviceDraft.category}
                  onChange={(event) => setServiceDraft((current) => ({ ...current, category: event.target.value }))}
                >
                  {folders.filter((folder) => folder.visibility !== "ARCHIVED").map((folder) => (
                    <option key={folder.key} value={folder.key}>{folder.displayName}</option>
                  ))}
                  {!folders.some((folder) => folder.key === serviceDraft.category) ? <option value={serviceDraft.category}>{serviceDraft.category}</option> : null}
                </select>
              </div>
              <div data-testid="booking-service-visibility-controls">
                <label>Booking visibility</label>
                <div className="operator-inline-actions" style={{ marginTop: 8 }}>
                  <VisibilityIconButton
                    pressed={serviceDraft.publicVisible}
                    visibleLabel="Visible publicly"
                    hiddenLabel="Hidden from public"
                    shortLabel="Public"
                    testId="booking-service-public-visible"
                    onClick={() => setServiceAudienceVisibility("publicVisible", !serviceDraft.publicVisible)}
                  />
                  <VisibilityIconButton
                    pressed={serviceDraft.tradeVisible}
                    visibleLabel="Trade-visible"
                    hiddenLabel="Hidden from trade/private"
                    shortLabel="Trade"
                    testId="booking-service-trade-visible"
                    onClick={() => setServiceAudienceVisibility("tradeVisible", !serviceDraft.tradeVisible)}
                  />
                </div>
                <p className="operator-note" style={{ marginTop: 8 }}>
                  Public customers only see public-visible services. Trade/private routes can still use trade-visible services.
                </p>
              </div>
              <div>
                <label>Location</label>
                <select className="input" value={serviceDraft.locationId} onChange={(event) => setServiceDraft((current) => ({ ...current, locationId: event.target.value }))}>
                  <option value="">Any location</option>
                  {(settings?.locations || []).map((location) => (
                    <option key={location.id} value={location.id}>{location.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="operator-formGrid" data-testid="booking-service-customer-fields">
              <label className="toggle-row">
                <input type="checkbox" checked={serviceDraft.requireCustomerPhone} onChange={(event) => setServiceDraft((current) => ({ ...current, requireCustomerPhone: event.target.checked }))} />
                Require customer phone
              </label>
              <label className="toggle-row">
                <input type="checkbox" checked={serviceDraft.requireVehicleRegistration} onChange={(event) => setServiceDraft((current) => ({ ...current, requireVehicleRegistration: event.target.checked }))} />
                Require vehicle registration
              </label>
              <label className="toggle-row">
                <input type="checkbox" checked={serviceDraft.requireLockingWheelNut} onChange={(event) => setServiceDraft((current) => ({ ...current, requireLockingWheelNut: event.target.checked }))} />
                Require locking wheel nut confirmation
              </label>
            </div>
            <div>
              <label>Description</label>
              <textarea className="input" rows={3} value={serviceDraft.description} onChange={(event) => setServiceDraft((current) => ({ ...current, description: event.target.value }))} />
            </div>
            <div className="operator-formGrid">
              <div>
                <label>Short customer summary</label>
                <input className="input" value={serviceDraft.shortDescription} onChange={(event) => setServiceDraft((current) => ({ ...current, shortDescription: event.target.value }))} />
              </div>
              <div>
                <label>Image URL</label>
                <input className="input" value={serviceDraft.imageUrl} onChange={(event) => setServiceDraft((current) => ({ ...current, imageUrl: event.target.value }))} />
              </div>
              <div>
                <label>Upload image</label>
                <input
                  id="booking-service-image-file"
                  className="visually-hidden"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const validationError = validateUploadFile(file, { category: "image", maxBytes: UPLOAD_LIMITS.image });
                    if (validationError) {
                      showError(validationError);
                      event.currentTarget.value = "";
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      setServiceDraft((current) => ({ ...current, imageUrl: String(reader.result || "") }));
                      setServiceImageSelection({ name: file.name, size: file.size });
                    };
                    reader.readAsDataURL(file);
                  }}
                />
                <label className="button secondary" htmlFor="booking-service-image-file">Choose image</label>
                <span data-testid="booking-service-image-file-name" style={{ display: "block", marginTop: 8 }}>
                  {serviceImageSelection?.name || "No image selected"}
                </span>
                {serviceImageSelection ? (
                  <div data-testid="booking-service-image-selection" style={{ marginTop: 8 }}>
                    <strong>{serviceImageSelection.name}</strong>
                    <span className="muted" style={{ display: "block" }}>{(serviceImageSelection.size / 1024).toFixed(1)} KB selected</span>
                    {serviceDraft.imageUrl ? <img src={serviceDraft.imageUrl} alt="Selected service preview" style={{ width: 140, height: 84, objectFit: "cover", borderRadius: 12, marginTop: 8 }} /> : null}
                  </div>
                ) : null}
              </div>
            </div>
            <div>
              <label>Longer details</label>
              <textarea className="input" rows={4} value={serviceDraft.longDescription} onChange={(event) => setServiceDraft((current) => ({ ...current, longDescription: event.target.value }))} />
            </div>
            <div className="operator-formGrid">
              <div>
                <label>Service colour</label>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="color"
                    value={serviceDraft.color || "#2563EB"}
                    aria-label="Service colour"
                    onChange={(event) => setServiceDraft((current) => ({ ...current, color: event.target.value }))}
                  />
                  <span className="operator-tag" style={{ borderLeft: `8px solid ${serviceDraft.color || "#2563EB"}` }}>Service preview</span>
                  <button className="button secondary operator-compact-button" type="button" onClick={() => setServiceDraft((current) => ({ ...current, color: "#2563EB" }))}>Reset</button>
                </div>
              </div>
              <div>
                <label>Duration minutes</label>
                <input className="input" type="number" min="5" value={serviceDraft.durationMinutes} onChange={(event) => setServiceDraft((current) => ({ ...current, durationMinutes: event.target.value }))} />
              </div>
              <div>
                <label>Standard price</label>
                <input className="input" type="number" min="0" step="0.01" data-testid="booking-service-price" value={serviceDraft.price} onChange={(event) => setServiceDraft((current) => ({ ...current, price: event.target.value }))} />
              </div>
              <div>
                <label>Discount price</label>
                <input className="input" data-testid="booking-service-discount-price" type="number" min="0" step="0.01" value={serviceDraft.discountPrice} onChange={(event) => setServiceDraft((current) => ({ ...current, discountPrice: event.target.value }))} />
              </div>
            </div>
            <div className="operator-formGrid">
              <div>
                <label>Deposit type</label>
                <select className="input" value={serviceDraft.depositType} onChange={(event) => setServiceDraft((current) => ({ ...current, depositType: event.target.value as ServiceDraft["depositType"] }))}>
                  <option value="NONE">No deposit</option>
                  <option value="FIXED">Fixed amount</option>
                  <option value="PERCENTAGE">Percentage</option>
                </select>
              </div>
              <div>
                <label>{serviceDraft.depositType === "PERCENTAGE" ? "Deposit percentage" : "Deposit amount"}</label>
                <input className="input" data-testid="booking-service-deposit-value" type="number" min="0" step={serviceDraft.depositType === "PERCENTAGE" ? "1" : "0.01"} value={serviceDraft.depositValue} onChange={(event) => setServiceDraft((current) => ({ ...current, depositValue: event.target.value }))} />
              </div>
              <div>
                <label>Balance collection</label>
                <select className="input" value={serviceDraft.completionPaymentMode} onChange={(event) => setServiceDraft((current) => ({ ...current, completionPaymentMode: event.target.value as ServiceDraft["completionPaymentMode"] }))}>
                  <option value="ON_CONFIRMATION">Collect after confirmation</option>
                  <option value="ON_COMPLETION">Collect on completion</option>
                  <option value="MANUAL_FOLLOW_UP">Manual follow-up</option>
                </select>
              </div>
            </div>
            <div className="operator-formGrid">
              <div>
                <label>Customer payment route</label>
                <select className="input" value={serviceDraft.paymentProvider} onChange={(event) => setServiceDraft((current) => ({ ...current, paymentProvider: event.target.value }))}>
                  {providerOptions.map((provider) => (
                    <option key={provider.provider} value={provider.provider}>
                      {provider.label} ({provider.status.replace(/_/g, " ")})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Assigned team member</label>
                <select className="input" value={serviceDraft.assignedUserId} onChange={(event) => setServiceDraft((current) => ({ ...current, assignedUserId: event.target.value }))}>
                  <option value="">Any available team member</option>
                  {(settings?.staff || []).map((member) => (
                    <option key={member.id} value={member.id}>{member.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="toggle-row" style={{ marginTop: 28 }}>
                  <input type="checkbox" checked={serviceDraft.isActive} onChange={(event) => setServiceDraft((current) => ({ ...current, isActive: event.target.checked }))} />
                  Service is active
                </label>
                <label className="toggle-row" style={{ marginTop: 12 }}>
                  <input
                    type="checkbox"
                    checked={serviceDraft.tradeAccountDepositWaived}
                    onChange={(event) => setServiceDraft((current) => ({ ...current, tradeAccountDepositWaived: event.target.checked }))}
                  />
                  Verified trade accounts can book without deposit
                </label>
              </div>
            </div>
            <div>
              <label>Notes shown to customer</label>
              <textarea className="input" rows={3} value={serviceDraft.customerNotes} onChange={(event) => setServiceDraft((current) => ({ ...current, customerNotes: event.target.value }))} />
            </div>
            <div className="operator-formGrid">
              <label className="toggle-row">
                <input
                  type="checkbox"
                  data-testid="booking-service-bundle-eligible"
                  checked={serviceDraft.publicBundleEligible}
                  onChange={(event) => setServiceDraft((current) => ({ ...current, publicBundleEligible: event.target.checked }))}
                />
                Available in public bundles
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  data-testid="booking-service-bundle-addon"
                  checked={serviceDraft.publicBundleAddOn}
                  onChange={(event) => setServiceDraft((current) => ({ ...current, publicBundleAddOn: event.target.checked }))}
                />
                Add-on only
              </label>
              <div>
                <label>Customer quantity limit</label>
                <input
                  className="input"
                  data-testid="booking-service-bundle-max-quantity"
                  type="number"
                  min="1"
                  max="10"
                  value={serviceDraft.publicBundleMaxQuantity}
                  onChange={(event) => setServiceDraft((current) => ({ ...current, publicBundleMaxQuantity: event.target.value }))}
                />
              </div>
            </div>
            <div>
              <label>Cannot be booked with</label>
              <select
                className="input"
                multiple
                value={serviceDraft.publicBundleIncompatibleServiceIds}
                onChange={(event) =>
                  setServiceDraft((current) => ({
                    ...current,
                    publicBundleIncompatibleServiceIds: Array.from(event.target.selectedOptions).map((option) => option.value),
                  }))
                }
              >
                {(settings?.services || [])
                  .filter((service) => service.id !== serviceDraft.id)
                  .map((service) => (
                    <option key={service.id} value={service.id}>{service.name}</option>
                  ))}
              </select>
              <p className="operator-note" style={{ marginTop: 8 }}>
                Leave blank unless two services should never be chosen together.
              </p>
            </div>
            <div>
              <label>Optional add-ons</label>
              <textarea
                className="input"
                rows={4}
                placeholder={"Alignment check|25.00|Add a wheel alignment check|default\nValve replacement|8.50|Replace worn valve stems|"}
                value={serviceDraft.customOptionsText}
                onChange={(event) => setServiceDraft((current) => ({ ...current, customOptionsText: event.target.value }))}
              />
              <p className="operator-note" style={{ marginTop: 8 }}>
                One option per line: label | price | description | default
              </p>
            </div>
            <div className="operator-inline-actions">
              <button className="button" type="button" onClick={() => void saveService()} disabled={savingArea === "service"}>
                {savingArea === "service" ? "Saving..." : serviceDraft.id ? "Update service" : "Create service"}
              </button>
              {serviceDraft.id ? (
                <button className="button secondary" type="button" onClick={() => setServiceDraft(EMPTY_SERVICE_DRAFT)}>
                  New service
                </button>
              ) : null}
            </div>
            {(settings?.services || []).length ? (
              <div className="operator-list" data-testid="booking-services-list">
                {settings!.services.map((service) => (
                  <article key={service.id} className="operator-row">
                    <div className="operator-row__main">
                      <div className="operator-row__title">
                        {service.name} {service.isActive === false ? <span className="badge">Inactive</span> : null}
                      </div>
                      <div className="operator-row__subtitle">
                        {service.durationMinutes || 0} mins • {formatMoney(service.effectivePriceCents ?? service.standardPriceCents ?? service.priceCents)}
                        {typeof service.discountPriceCents === "number" ? ` • Standard ${formatMoney(service.standardPriceCents ?? service.priceCents)}` : ""}
                      </div>
                      <div className="operator-note" style={{ marginTop: 6 }}>
                        Deposit: {service.depositType === "PERCENTAGE" ? `${service.depositValue || 0}%` : formatMoney(service.depositDueCents)} •
                        Payment setup: {service.paymentProvider || "MANUAL"} •
                        Balance: {formatMoney(service.remainingBalanceCents)}
                      </div>
                      {service.shortDescription ? <div className="operator-note" style={{ marginTop: 6 }}>{service.shortDescription}</div> : null}
                      {service.tradeAccountDepositWaived ? <div className="operator-note" style={{ marginTop: 6 }}>Trade accounts can book without deposit.</div> : null}
                      {service.publicBundleEligible ? (
                        <div className="operator-note" style={{ marginTop: 6 }}>
                          Public bundle: {service.publicBundleAddOn ? "add-on only" : "primary or add-on"} • max {service.publicBundleMaxQuantity || 1}
                        </div>
                      ) : null}
                    </div>
                    <div className="operator-row__actions">
                      <button className="button secondary operator-compact-button" type="button" onClick={() => setServiceDraft(buildServiceDraft(service))}>
                        Edit
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>No public booking services yet.</p>
            )}
          </div>
        </section>

        <section className="card operator-section" data-testid="booking-payments-card">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Payments</h2>
              <p className="operator-section__subtitle">Choose the workspace-level setup shown on booking and follow-up pages when customers need to pay.</p>
            </div>
          </div>
          <div className="operator-stack">
            {(providerOptions || []).map((provider) => (
              <label key={provider.provider} className="operator-row" data-testid={`booking-payment-provider-${provider.provider.toLowerCase()}`}>
                <div className="operator-row__main">
                  <div className="operator-row__title">{provider.label}</div>
                  <div className="operator-row__subtitle">{provider.summary}</div>
                </div>
                <div className="operator-row__meta">
                  <div className="operator-row__metaLine">{provider.status.replace(/_/g, " ")}</div>
                </div>
                <div className="operator-row__actions">
                  {provider.selectable ? (
                    <input type="radio" checked={preferredProvider === provider.provider} onChange={() => setPreferredProvider(provider.provider)} />
                  ) : (
                    <input
                      type="checkbox"
                      checked={requestedProviders.includes(provider.provider)}
                      onChange={(event) =>
                        setRequestedProviders((current) =>
                          event.target.checked ? [...current, provider.provider] : current.filter((item) => item !== provider.provider),
                        )
                      }
                    />
                  )}
                </div>
              </label>
            ))}
            <div className="operator-inline-actions">
              <button className="button" type="button" onClick={() => void savePaymentSettings()} disabled={savingArea === "payments"}>
                {savingArea === "payments" ? "Saving..." : "Save customer payment setup"}
              </button>
              <Link className="button secondary" href="/dashboard/billing">
                Open Billing
              </Link>
            </div>
            <p className="operator-note" style={{ margin: 0 }}>
              MyTitan Stripe is only for MyTitan subscriptions and job packs. Customer deposits and service payments must use your business payment setup or manual collection.
            </p>
          </div>
        </section>

        <section className="card operator-section" data-testid="booking-confirmations-card">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Confirmations</h2>
              <p className="operator-section__subtitle">Customer confirmations use your business name through the MyTitan email service. Internal alerts are managed in Settings.</p>
            </div>
          </div>
          <div className="operator-stack">
            <div className="operator-formGrid">
              <div>
                <div className="operator-kicker">Sender</div>
                <div className="operator-row__subtitle" style={{ marginTop: 6 }}>{settings?.emailSenderName || settings?.emailReadiness?.effective?.effectiveSenderLabel || "Business name via MyTitan"}</div>
              </div>
              <div>
                <div className="operator-kicker">Reply-to</div>
                <div className="operator-row__subtitle" style={{ marginTop: 6 }}>{settings?.emailReplyTo || settings?.emailReadiness?.workspace?.replyToEmail || settings?.emailReadiness?.replyToEmail || "Not configured"}</div>
              </div>
              <div>
                <div className="operator-kicker">Email readiness</div>
                <div className="operator-row__subtitle" style={{ marginTop: 6 }}>
                  {settings?.emailReadiness?.effective?.canSend
                    ? "Ready"
                    : "Unavailable"}
                </div>
              </div>
            </div>
            <p className="operator-note" style={{ margin: 0 }}>{settings?.emailReadiness?.effective?.guidance || settings?.emailReadiness?.guidance || "Customer email status is managed in Email & Notifications settings."}</p>
            {settings?.emailReadiness?.effective?.notice ? (
              <p className="operator-note" style={{ margin: 0 }}>{settings.emailReadiness.effective.notice}</p>
            ) : null}
            <div>
              <div className="operator-kicker">Internal alerts</div>
              <div className="operator-row__subtitle" style={{ marginTop: 6 }}>
                {Array.isArray(settings?.notificationRecipients) && settings.notificationRecipients.some((recipient) => recipient.enabled !== false)
                  ? `${settings.notificationRecipients.filter((recipient) => recipient.enabled !== false).length} active recipient${settings.notificationRecipients.filter((recipient) => recipient.enabled !== false).length === 1 ? '' : 's'} managed in Settings`
                  : 'Workspace owners and admins are the fallback for internal alerts'}
              </div>
              <p className="operator-note" style={{ marginTop: 8 }}>
                Internal updates are managed in Email & Notifications settings so Bookings can stay focused on the public booking flow.
              </p>
            </div>
            <div className="operator-inline-actions">
              <Link className="button secondary" href="/dashboard/settings?tab=messages">
                Open Email settings
              </Link>
            </div>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
