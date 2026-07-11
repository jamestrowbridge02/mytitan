import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/router";
import { getApiBase } from "../../../lib/api";
import { isBookingProV1Enabled, isMarketplaceEnabled } from "../../../lib/feature-flags";

const API_BASE = getApiBase();
const JOURNEY_STAGES = ["location", "category", "service", "availability", "details", "confirmation"] as const;

type JourneyStage = (typeof JOURNEY_STAGES)[number];

type Service = {
  id: string;
  name: string;
  description?: string | null;
  shortDescription?: string | null;
  longDescription?: string | null;
  imageUrl?: string | null;
  locationId?: string | null;
  category?: string | null;
  visibility?: "PUBLIC" | "TRADE" | "INTERNAL";
  requireCustomerPhone?: boolean;
  requireVehicleRegistration?: boolean;
  requireLockingWheelNut?: boolean;
  durationMinutes?: number | null;
  standardPriceCents?: number | null;
  discountPriceCents?: number | null;
  effectivePriceCents?: number | null;
  depositType?: "NONE" | "FIXED" | "PERCENTAGE";
  depositValue?: number | null;
  depositDueCents?: number | null;
  remainingBalanceCents?: number | null;
  completionPaymentMode?: "ON_CONFIRMATION" | "ON_COMPLETION" | "MANUAL_FOLLOW_UP";
  paymentProvider?: string | null;
  paymentProviderStatus?: string | null;
  paymentStatusMessage?: string | null;
  liveCollectionSupported?: boolean;
  assignedUserId?: string | null;
  customerNotes?: string | null;
  selectedOptions?: Array<{ key: string; label: string; description?: string | null; quantity: number; unitPriceCents: number; totalPriceCents: number }>;
  availableOptions?: Array<{ key: string; label: string; description?: string | null; priceCents: number; defaultSelected?: boolean }>;
  optionsTotalCents?: number | null;
  tradeAccountDepositWaived?: boolean;
  publicBundleEligible?: boolean;
  publicBundleAddOn?: boolean;
  publicBundleMaxQuantity?: number | null;
  publicBundleIncompatibleServiceIds?: string[];
  priceCents?: number | null;
  depositCents?: number | null;
};

type Slot = { startsAt: string; endsAt: string };

type AvailabilityResponse = {
  slots: Slot[];
  nextAvailableSlot?: string | null;
  nextAvailableDate?: string | null;
  timezone?: string | null;
};

type BookingSubmitResponse = {
  autoConfirmed?: boolean;
  emailConfigured?: boolean;
  statusUrl?: string | null;
  depositCheckoutUrl?: string | null;
};

type TradeAccountMatch = {
  id: string;
  name: string;
  matched: boolean;
};

type PublicBundleConfig = {
  enabled?: boolean;
  minServices?: number;
  maxServices?: number;
};

type BundleLine = {
  serviceId: string;
  quantity: number;
};

type PublicLocation = {
  id: string;
  name: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone?: string | null;
  metadataJson?: {
    tradingName?: string | null;
    imageUrl?: string | null;
    arrivalInstructions?: string | null;
    parkingInstructions?: string | null;
  } | null;
};

type BookingFolder = {
  key: string;
  displayName: string;
  publicDescription?: string | null;
  imageUrl?: string | null;
  visibility?: "PUBLIC" | "TRADE";
  sortOrder?: number;
};

type BookingQuestion = {
  id: string;
  label: string;
  questionKey: string;
  type: string;
  required?: boolean;
  optionsJson?: {
    placeholder?: string | null;
    helpText?: string | null;
    visibility?: "PUBLIC" | "TRADE";
    locationIds?: string[];
    folderKeys?: string[];
    serviceIds?: string[];
    sortOrder?: number;
    defaultValue?: unknown;
    consentMode?: boolean;
    options?: string[];
  } | null;
};

function resolvePublicAssetUrl(value?: string | null) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (/^(?:https?:|data:|blob:)/i.test(url)) return url;
  return `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
}

function formatMoney(cents?: number | null) {
  if (typeof cents !== "number") return null;
  return `£${(cents / 100).toFixed(2)}`;
}

function computeSelectedOptionsTotal(service: Service | null, selectedOptions: Record<string, number>) {
  if (!service || !Array.isArray(service.availableOptions)) return 0;
  return service.availableOptions.reduce((sum, option) => {
    const quantity = Number(selectedOptions[option.key] || 0);
    return sum + (quantity > 0 ? quantity * Number(option.priceCents || 0) : 0);
  }, 0);
}

function computeDisplayedDeposit(service: Service | null, selectedOptions: Record<string, number>) {
  if (!service) return 0;
  if (service.tradeAccountDepositWaived) return 0;
  const baseTotal = Number(service.effectivePriceCents ?? service.priceCents ?? 0);
  const optionsTotal = computeSelectedOptionsTotal(service, selectedOptions);
  const total = baseTotal + optionsTotal;
  if (service.depositType === "PERCENTAGE") {
    return Math.max(0, Math.min(total, Math.round((total * Number(service.depositValue || 0)) / 100)));
  }
  if (service.depositType === "FIXED") {
    return Math.max(0, Math.min(total, Number(service.depositDueCents || 0)));
  }
  return 0;
}

function clampBundleQuantity(service: Service | null, quantity: number) {
  const max = Math.max(1, Math.min(10, Number(service?.publicBundleMaxQuantity || 1)));
  return Math.max(1, Math.min(max, Math.round(Number(quantity || 1))));
}

function formatDateLabel(value?: string | null, timeZone = "UTC") {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "short",
    timeZone,
  });
}

function formatTimeLabel(value?: string | null, timeZone = "UTC") {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

function getTodayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function getWeekStart(value = getTodayDateKey()) {
  const date = new Date(`${value}T12:00:00.000Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
  return date.toISOString().slice(0, 10);
}

function getWeekDates(weekStart: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${weekStart}T12:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidPhoneLike(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (!/^[+()\-.\s\d]{7,20}$/.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

function normalizeJourneyStage(value: string | undefined, hasPrefilledService: boolean): JourneyStage {
  if (value === "time") return "availability";
  if (value === "payment") return "confirmation";
  if (JOURNEY_STAGES.includes(value as JourneyStage)) return value as JourneyStage;
  return hasPrefilledService ? "service" : "location";
}

type PublicStaffMember = {
  id: string;
  email: string;
  displayName?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  seniority?: string | null;
};

type WorkforceTerminology = {
  singular: string;
  plural: string;
  defaultFieldWorker: string;
  publicBooking: string;
};

function formatTeamMemberLabel(member?: PublicStaffMember | null, fallbackLabel = "team member") {
  if (!member) return `Any available ${fallbackLabel}`;
  const direct = String(member.displayName || member.jobTitle || "").trim();
  if (direct) return direct;
  const localPart = member.email?.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  if (!localPart) return `Any available ${fallbackLabel}`;
  return localPart.replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatLocationAddress(location?: PublicLocation | null) {
  if (!location) return "";
  return [
    location.addressLine1,
    location.addressLine2,
    location.city,
    location.state,
    location.postalCode,
    location.country,
  ].filter(Boolean).join(", ");
}

function googleMapsHref(location: PublicLocation) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formatLocationAddress(location))}`;
}

function getStepState(active: boolean, complete: boolean) {
  if (complete) return "done";
  if (active) return "active";
  return "idle";
}

export default function PublicBookingJourneyPage() {
  const router = useRouter();
  const bookingParam = router.query.booking;
  const bookingParts = useMemo(
    () => (Array.isArray(bookingParam) ? bookingParam.filter((entry): entry is string => typeof entry === "string") : []),
    [bookingParam],
  );
  const tokenValue = bookingParts[0] || "";
  const queryServiceId = typeof router.query.serviceId === "string" ? router.query.serviceId : "";
  const routeStage = normalizeJourneyStage(bookingParts[1], Boolean(queryServiceId));
  const queryDateValue = typeof router.query.date === "string" ? router.query.date : "";
  const queryTradeAccountIdValue = typeof router.query.tradeAccountId === "string" ? router.query.tradeAccountId : "";
  const queryCustomerName = typeof router.query.customerName === "string" ? router.query.customerName : "";
  const queryCustomerEmail = typeof router.query.customerEmail === "string" ? router.query.customerEmail : "";
  const queryCustomerPhone = typeof router.query.customerPhone === "string" ? router.query.customerPhone : "";

  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<PublicStaffMember[]>([]);
  const [workforceTerminology, setWorkforceTerminology] = useState<WorkforceTerminology>({
    singular: "Team member",
    plural: "Team",
    defaultFieldWorker: "Team member",
    publicBooking: "team member",
  });
  const [locations, setLocations] = useState<PublicLocation[]>([]);
  const [folderImages, setFolderImages] = useState<Record<string, string>>({});
  const [folders, setFolders] = useState<BookingFolder[]>([]);
  const [bookingWorkflow, setBookingWorkflow] = useState({
    locationFirstScheduling: true,
    locationRequiredForBooking: false,
    providerSelectionEnabled: false,
  });
  const [autoConfirmPublicBookings, setAutoConfirmPublicBookings] = useState(false);
  const [questions, setQuestions] = useState<BookingQuestion[]>([]);
  const [tenant, setTenant] = useState<any>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const [tradeAccountMatch, setTradeAccountMatch] = useState<TradeAccountMatch | null>(null);
  const [publicBundles, setPublicBundles] = useState<PublicBundleConfig>({ enabled: false, minServices: 1, maxServices: 4 });
  const [selectedService, setSelectedService] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedBundleLines, setSelectedBundleLines] = useState<BundleLine[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, number>>({});
  const [selectedStaff, setSelectedStaff] = useState("");
  const [locationId, setLocationId] = useState("");
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [nextAvailableSlot, setNextAvailableSlot] = useState<string | null>(null);
  const [nextAvailableDate, setNextAvailableDate] = useState<string | null>(null);
  const [availabilityTimezone, setAvailabilityTimezone] = useState("UTC");
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [vehicleRegistration, setVehicleRegistration] = useState("");
  const [lockingWheelNutAvailable, setLockingWheelNutAvailable] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [statusUrl, setStatusUrl] = useState<string | null>(null);
  const [depositCheckoutUrl, setDepositCheckoutUrl] = useState<string | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const marketplaceEnabled = isMarketplaceEnabled();
  const bookingProEnabled = isBookingProV1Enabled();

  const selectedServiceDetails = useMemo(
    () => services.find((service) => service.id === selectedService) || null,
    [services, selectedService],
  );
  const publicBundlesEnabled = Boolean(publicBundles.enabled);
  const selectedBundleDetails = useMemo(
    () =>
      selectedBundleLines
        .map((line) => {
          const service = services.find((candidate) => candidate.id === line.serviceId) || null;
          return service ? { service, quantity: clampBundleQuantity(service, line.quantity) } : null;
        })
        .filter(Boolean) as Array<{ service: Service; quantity: number }>,
    [selectedBundleLines, services],
  );
  const primaryBundleService = selectedBundleDetails[0]?.service || selectedServiceDetails;
  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === locationId) || null,
    [locations, locationId],
  );
  const availableServices = useMemo(
    () => services.filter((service) => !locationId || !service.locationId || service.locationId === locationId),
    [locationId, services],
  );
  const categories = useMemo(() => {
    const available = new Set(availableServices.map((service) => String(service.category || "Services")));
    const ordered = folders.filter((folder) => available.has(folder.key)).map((folder) => folder.key);
    return [...ordered, ...Array.from(available).filter((key) => !ordered.includes(key))];
  }, [availableServices, folders]);
  const visibleServices = useMemo(
    () => availableServices.filter((service) => !selectedCategory || String(service.category || "Services") === selectedCategory),
    [availableServices, selectedCategory],
  );
  const locationStepRequired = bookingWorkflow.locationRequiredForBooking || bookingWorkflow.locationFirstScheduling !== false;
  const locationReady = !locationStepRequired || locations.length === 0 || Boolean(locationId);
  const displayTimezone = selectedLocation?.timezone || availabilityTimezone || tenant?.timezone || "UTC";
  const selectedOptionsTotalCents = computeSelectedOptionsTotal(selectedServiceDetails, selectedOptions);
  const bundleBaseTotalCents = selectedBundleDetails.reduce(
    (sum, line, index) =>
      sum + (Number(line.service.effectivePriceCents ?? line.service.priceCents ?? 0) + (index === 0 ? selectedOptionsTotalCents : 0)) * line.quantity,
    0,
  );
  const bundleDepositCents = selectedBundleDetails.reduce(
    (sum, line, index) => sum + computeDisplayedDeposit(line.service, index === 0 ? selectedOptions : {}) * line.quantity,
    0,
  );
  const displayedEffectivePriceCents = publicBundlesEnabled && selectedBundleDetails.length
    ? bundleBaseTotalCents
    : Number(selectedServiceDetails?.effectivePriceCents ?? selectedServiceDetails?.priceCents ?? 0) + selectedOptionsTotalCents;
  const displayedDepositCents = publicBundlesEnabled && selectedBundleDetails.length
    ? bundleDepositCents
    : computeDisplayedDeposit(selectedServiceDetails, selectedOptions);
  const displayedRemainingBalanceCents = Math.max(0, displayedEffectivePriceCents - displayedDepositCents);
  const checkoutRequired = displayedDepositCents > 0;
  const onlineCheckoutAvailable = checkoutRequired && primaryBundleService?.liveCollectionSupported === true;
  const bookingSubmissionAvailable = !checkoutRequired || onlineCheckoutAvailable;
  const displayedDurationMinutes = publicBundlesEnabled && selectedBundleDetails.length
    ? selectedBundleDetails.reduce((sum, line) => sum + Number(line.service.durationMinutes || 60) * line.quantity, 0)
    : Number(selectedServiceDetails?.durationMinutes || 0);
  const selectionReady = locationReady && (publicBundlesEnabled ? selectedBundleDetails.length > 0 : Boolean(selectedServiceDetails));
  const slotReady = Boolean(selectedSlot);
  const relevantQuestions = useMemo(
    () => questions
      .filter((question) => {
        const meta = question.optionsJson || {};
        if (meta.locationIds?.length && !meta.locationIds.includes(locationId)) return false;
        if (meta.folderKeys?.length && !meta.folderKeys.includes(selectedCategory)) return false;
        if (meta.serviceIds?.length && !meta.serviceIds.includes(selectedService)) return false;
        return true;
      })
      .sort((left, right) => Number(left.optionsJson?.sortOrder || 100) - Number(right.optionsJson?.sortOrder || 100)),
    [locationId, questions, selectedCategory, selectedService],
  );
  const questionByKey = useMemo(
    () => new Map(relevantQuestions.map((question) => [question.questionKey, question])),
    [relevantQuestions],
  );
  const requireCustomerPhone = questionByKey.get("phone")?.required === true || selectedServiceDetails?.requireCustomerPhone === true;
  const requireVehicleRegistration = questionByKey.get("vehicle_registration")?.required === true || selectedServiceDetails?.requireVehicleRegistration === true;
  const requireLockingWheelNut = questionByKey.get("locking_wheel_nut")?.required === true || selectedServiceDetails?.requireLockingWheelNut === true;
  const additionalQuestions = relevantQuestions.filter(
    (question) => !["phone", "vehicle_registration", "locking_wheel_nut"].includes(question.questionKey),
  );
  const requiredCustomAnswersReady = additionalQuestions.every((question) => {
    if (!question.required) return true;
    const value = answers[question.id];
    return value === true || String(value || "").trim().length > 0;
  });
  const detailsReady = Boolean(
    customerName.trim() &&
    customerEmail.trim() &&
    (!requireCustomerPhone || customerPhone.trim()) &&
    (!requireVehicleRegistration || vehicleRegistration.trim()) &&
    (!requireLockingWheelNut || lockingWheelNutAvailable) &&
    requiredCustomAnswersReady,
  );
  const emailValid = customerEmail.trim().length > 0 && isValidEmail(customerEmail);
  const phoneValid = isValidPhoneLike(customerPhone);
  const detailsComplete = detailsReady && emailValid && phoneValid;
  const stageCards = [
    { title: "Location", state: getStepState(routeStage === "location", locationReady) },
    { title: "Service", state: getStepState(routeStage === "category" || routeStage === "service", selectionReady) },
    { title: "Availability", state: getStepState(routeStage === "availability", slotReady) },
    { title: "Your details", state: getStepState(routeStage === "details", detailsComplete) },
    {
      title: checkoutRequired ? "Checkout" : "Confirm",
      state: getStepState(routeStage === "confirmation", Boolean(statusUrl || depositCheckoutUrl || status)),
    },
  ];

  function stageHref(stage: JourneyStage) {
    const query: Record<string, any> = {};
    if (queryServiceId) query.serviceId = queryServiceId;
    if (queryTradeAccountIdValue) query.tradeAccountId = queryTradeAccountIdValue;
    if (queryCustomerName) query.customerName = queryCustomerName;
    if (queryCustomerEmail) query.customerEmail = queryCustomerEmail;
    if (queryCustomerPhone) query.customerPhone = queryCustomerPhone;
    if (queryDateValue) query.date = queryDateValue;
    return {
      pathname: "/portal/booking/[...booking]",
      query: {
        ...query,
        booking: [tokenValue, stage],
      },
    };
  }

  function navigateToStage(stage: JourneyStage) {
    if (!tokenValue) return;
    void router.push(stageHref(stage), undefined, { shallow: true });
  }

  function requireDetailsForNextStage() {
    if (!customerName.trim()) return "Enter your name before you continue.";
    if (!customerEmail.trim()) return "Enter your email before you continue.";
    if (!isValidEmail(customerEmail)) return "Enter a valid email address.";
    if (requireCustomerPhone && !customerPhone.trim()) return "Enter your phone number.";
    if (!isValidPhoneLike(customerPhone)) return "Enter a phone number that looks real.";
    if (requireVehicleRegistration && !vehicleRegistration.trim()) return "Enter the vehicle registration.";
    if (requireLockingWheelNut && !lockingWheelNutAvailable) return "Confirm that the locking wheel nut is readily available.";
    const missingQuestion = additionalQuestions.find((question) => {
      if (!question.required) return false;
      const value = answers[question.id];
      return value !== true && !String(value || "").trim();
    });
    if (missingQuestion) return `Complete ${missingQuestion.label}.`;
    return "";
  }

  useEffect(() => {
    setCustomerName(queryCustomerName);
    setCustomerEmail(queryCustomerEmail);
    setCustomerPhone(queryCustomerPhone);
    setDate(getWeekStart(queryDateValue || getTodayDateKey()));
  }, [queryCustomerEmail, queryCustomerName, queryCustomerPhone, queryDateValue]);

  useEffect(() => {
    if (!tokenValue || !marketplaceEnabled) return;
    setLoadingConfig(true);
    const params = new URLSearchParams();
    if (queryTradeAccountIdValue) params.set("tradeAccountId", queryTradeAccountIdValue);
    if (queryCustomerEmail.trim()) params.set("customerEmail", queryCustomerEmail.trim());
    fetch(`${API_BASE}/public/booking/${tokenValue}/config${params.toString() ? `?${params.toString()}` : ""}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message || "Booking page not available.");
        setServices(Array.isArray(data.services) ? data.services : []);
        setTenant(data.tenant || null);
        setTradeAccountMatch(data.tradeAccountMatch || null);
        setPublicBundles(data.publicBundles || { enabled: false, minServices: 1, maxServices: 4 });
        setStaff(Array.isArray(data.staff) ? data.staff : []);
        setWorkforceTerminology({
          singular: data?.workforceTerminology?.singular || "Team member",
          plural: data?.workforceTerminology?.plural || "Team",
          defaultFieldWorker: data?.workforceTerminology?.defaultFieldWorker || "Team member",
          publicBooking: data?.workforceTerminology?.publicBooking || "team member",
        });
        setLocations(Array.isArray(data.locations) ? data.locations : []);
        setFolderImages(data.folderImages && typeof data.folderImages === "object" ? data.folderImages : {});
        setFolders(Array.isArray(data.folders) ? data.folders : []);
        setBookingWorkflow({
          locationFirstScheduling: data?.bookingWorkflow?.locationFirstScheduling !== false,
          locationRequiredForBooking: data?.bookingWorkflow?.locationRequiredForBooking === true,
          providerSelectionEnabled: data?.bookingWorkflow?.providerSelectionEnabled === true,
        });
        setAutoConfirmPublicBookings(data.autoConfirmPublicBookings === true);
        setQuestions(Array.isArray(data.questions) ? data.questions : []);
      })
      .catch((err: any) => setError(err?.message || "Booking page not available."))
      .finally(() => setLoadingConfig(false));
  }, [marketplaceEnabled, queryCustomerEmail, queryTradeAccountIdValue, tokenValue]);

  useEffect(() => {
    if (!services.length) return;
    if (!selectedService && queryServiceId && services.some((service) => service.id === queryServiceId)) {
      setSelectedService(queryServiceId);
      const queryService = services.find((service) => service.id === queryServiceId);
      setSelectedCategory(String(queryService?.category || "Services"));
    }
  }, [queryServiceId, selectedService, services]);

  useEffect(() => {
    if (!categories.length || !selectedCategory) {
      if (!categories.length) setSelectedCategory("");
      return;
    }
    if (!categories.includes(selectedCategory)) {
      setSelectedCategory("");
    }
  }, [categories, selectedCategory]);

  useEffect(() => {
    if (!publicBundlesEnabled || !selectedService) {
      if (!publicBundlesEnabled) setSelectedBundleLines([]);
      return;
    }
    setSelectedBundleLines((current) => {
      const existing = current.filter((line) => services.some((service) => service.id === line.serviceId));
      if (existing.length) return existing;
      const selected = services.find((service) => service.id === selectedService) || null;
      return selected?.publicBundleEligible && !selected.publicBundleAddOn ? [{ serviceId: selectedService, quantity: 1 }] : [];
    });
  }, [publicBundlesEnabled, selectedService, services]);

  useEffect(() => {
    const nextService = services.find((service) => service.id === selectedService);
    if (!nextService) return;
    const defaults = Array.isArray(nextService.availableOptions)
      ? nextService.availableOptions.reduce<Record<string, number>>((acc, option) => {
          if (option.defaultSelected) acc[option.key] = 1;
          return acc;
        }, {})
      : {};
    setSelectedOptions(defaults);
    setSelectedSlot(null);
    setNextAvailableSlot(null);
    setNextAvailableDate(null);
    if (nextService.locationId && !locationId) {
      setLocationId(nextService.locationId);
    } else if (!locations.some((location) => location.id === locationId)) {
      setLocationId("");
    }
    setSelectedStaff("");
  }, [locationId, locations, selectedService, services]);

  useEffect(() => {
    if (!selectedService) return;
    if (availableServices.some((service) => service.id === selectedService)) return;
    setSelectedService(availableServices[0]?.id || "");
  }, [availableServices, selectedService]);

  useEffect(() => {
    const availabilityServiceId = publicBundlesEnabled ? primaryBundleService?.id || selectedService : selectedService;
    if (!tokenValue || !availabilityServiceId || !date || routeStage !== "availability") {
      setSlots([]);
      setNextAvailableSlot(null);
      setNextAvailableDate(null);
      return;
    }
    setLoadingSlots(true);
    setError("");
    Promise.all(getWeekDates(date).map(async (weekDate) => {
      const params = new URLSearchParams({ date: weekDate, serviceId: availabilityServiceId });
      if (locationId) params.set("locationId", locationId);
      if (bookingWorkflow.providerSelectionEnabled && selectedStaff) params.set("staffUserId", selectedStaff);
      if (queryTradeAccountIdValue) params.set("tradeAccountId", queryTradeAccountIdValue);
      if (queryCustomerEmail.trim()) params.set("customerEmail", queryCustomerEmail.trim());
      const res = await fetch(`${API_BASE}/public/booking/${tokenValue}/slots?${params.toString()}`);
      const data = await res.json().catch(() => ({ slots: [] }));
      if (!res.ok) throw new Error("We could not check live availability right now.");
      return Array.isArray(data)
        ? { slots: data, nextAvailableSlot: null, nextAvailableDate: null, timezone: null }
        : (data as AvailabilityResponse);
    }))
      .then((days) => {
        setSlots(days.flatMap((day) => Array.isArray(day.slots) ? day.slots : []));
        setNextAvailableSlot(days.find((day) => day.nextAvailableSlot)?.nextAvailableSlot || null);
        setNextAvailableDate(days.find((day) => day.nextAvailableDate)?.nextAvailableDate || null);
        setAvailabilityTimezone(days.find((day) => day.timezone)?.timezone || "UTC");
      })
      .catch(() => {
        setSlots([]);
        setNextAvailableSlot(null);
        setNextAvailableDate(null);
        setError("We could not check live availability right now. Try again in a moment.");
      })
      .finally(() => setLoadingSlots(false));
  }, [bookingWorkflow.providerSelectionEnabled, date, locationId, primaryBundleService?.id, publicBundlesEnabled, queryCustomerEmail, queryTradeAccountIdValue, routeStage, selectedService, selectedStaff, tokenValue]);

  useEffect(() => {
    if (loadingConfig || !tokenValue) return;
    if (routeStage === "location" && !locationStepRequired) {
      navigateToStage("category");
      return;
    }
    if (routeStage !== "location" && !locationReady) {
      navigateToStage("location");
      return;
    }
    if (["service", "availability", "details", "confirmation"].includes(routeStage) && !selectedCategory) {
      navigateToStage("category");
      return;
    }
    if (["availability", "details", "confirmation"].includes(routeStage) && !selectionReady) {
      navigateToStage("service");
      return;
    }
    if (["details", "confirmation"].includes(routeStage) && !slotReady) {
      navigateToStage("availability");
      return;
    }
  }, [loadingConfig, locationReady, locationStepRequired, routeStage, selectedCategory, selectionReady, slotReady, tokenValue]);

  function toggleOption(key: string, checked: boolean) {
    setSelectedOptions((current) => {
      const next = { ...current };
      if (checked) {
        next[key] = Math.max(1, next[key] || 1);
      } else {
        delete next[key];
      }
      return next;
    });
  }

  function addSelectedBundleService() {
    if (!selectedServiceDetails) return;
    setSelectedBundleLines((current) => {
      if (current.some((line) => line.serviceId === selectedServiceDetails.id)) return current;
      const maxServices = Math.max(1, Number(publicBundles.maxServices || 4));
      if (current.length >= maxServices) return current;
      return [...current, { serviceId: selectedServiceDetails.id, quantity: 1 }];
    });
  }

  function removeBundleService(serviceId: string) {
    setSelectedBundleLines((current) => {
      const next = current.filter((line) => line.serviceId !== serviceId);
      if (next[0]?.serviceId) setSelectedService(next[0].serviceId);
      return next;
    });
  }

  function updateBundleQuantity(serviceId: string, quantity: number) {
    const service = services.find((candidate) => candidate.id === serviceId) || null;
    setSelectedBundleLines((current) =>
      current.map((line) => (line.serviceId === serviceId ? { ...line, quantity: clampBundleQuantity(service, quantity) } : line)),
    );
  }

  async function submit() {
    setError("");
    setStatus("");
    if (!selectedSlot) {
      setError("Choose an available time before you send the booking.");
      return;
    }
    const detailsValidation = requireDetailsForNextStage();
    if (detailsValidation) {
      setError(detailsValidation);
      navigateToStage("details");
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/public/booking/${tokenValue}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: publicBundlesEnabled ? primaryBundleService?.id || selectedService : selectedService,
          startsAt: selectedSlot.startsAt,
          locationId: locationId || undefined,
          staffUserId: bookingWorkflow.providerSelectionEnabled ? selectedStaff || undefined : undefined,
          customerName,
          customerEmail,
          customerPhone: customerPhone || undefined,
          vehicleRegistration: vehicleRegistration.trim() || undefined,
          lockingWheelNutAvailable,
          tradeAccountId: queryTradeAccountIdValue || undefined,
          answers: Object.entries(answers).map(([questionId, value]) => ({
            questionId,
            valueText: typeof value === "boolean" ? (value ? "Yes" : "") : value,
            valueJson: typeof value === "boolean" ? value : undefined,
          })),
          selectedOptions: Object.entries(selectedOptions).map(([key, quantity]) => ({ key, quantity })),
          serviceLines: publicBundlesEnabled
            ? selectedBundleDetails.map((line) => ({ serviceId: line.service.id, quantity: line.quantity }))
            : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.nextAvailableSlot) setNextAvailableSlot(String(data.nextAvailableSlot));
        if (data?.nextAvailableDate) setNextAvailableDate(String(data.nextAvailableDate));
        setError(data?.message || "Booking failed");
        if (data?.nextAvailableSlot) navigateToStage("availability");
        return;
      }
      const payload = data as BookingSubmitResponse;
      if (payload.depositCheckoutUrl) {
        setDepositCheckoutUrl(payload.depositCheckoutUrl);
        setStatus("Opening secure payment...");
        window.location.assign(payload.depositCheckoutUrl);
        return;
      }
      setStatus(payload.autoConfirmed ? "Confirmed. Your time is reserved." : "Request received. The team will confirm the visit shortly.");
      setEmailConfigured(Boolean(payload.emailConfigured));
      setStatusUrl(typeof payload.statusUrl === "string" ? payload.statusUrl : null);
      setDepositCheckoutUrl(null);
    } catch {
      setError("Booking failed");
    }
  }

  function renderStepRail() {
    return (
      <div className="public-booking-stepper" data-testid="public-booking-stepper">
        {stageCards.map((card) => (
          <article key={card.title} className={`public-booking-step public-booking-step--${card.state}`}>
            <span className="public-booking-step__marker" aria-hidden="true" />
            <strong>{card.title}</strong>
          </article>
        ))}
      </div>
    );
  }

  function renderLocationStep() {
    return (
      <section className="card public-booking-panel public-booking-stage" data-testid="public-booking-location-page">
        <div className="public-booking-panel__head">
          <div>
            <h2>Select a location</h2>
          </div>
        </div>
        <p className="public-booking-panel__note">Availability and services will match the branch you choose.</p>
        {locations.length ? (
          <div className="public-booking-serviceList" data-testid="public-booking-location-list">
            {locations.map((location) => (
              <button
                key={location.id}
                type="button"
                className={`public-booking-serviceCard${location.id === locationId ? " is-active" : ""}`}
                onClick={() => {
                  setLocationId(location.id);
                  setSelectedCategory("");
                  setSelectedService("");
                  setSelectedSlot(null);
                  window.setTimeout(() => navigateToStage("category"), 0);
                }}
              >
                <div className="public-booking-serviceCard__top">
                  {location.metadataJson?.imageUrl ? (
                    <img src={resolvePublicAssetUrl(location.metadataJson.imageUrl)} alt="" className="public-booking-cardImage" loading="lazy" decoding="async" />
                  ) : (
                    <span className="public-booking-cardImage public-booking-cardImage--fallback" aria-hidden="true">{location.name.slice(0, 1)}</span>
                  )}
                  <div>
                    <strong>{location.name}</strong>
                    <p>{formatLocationAddress(location)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <button className="button" type="button" onClick={() => navigateToStage("category")}>Continue to services</button>
        )}
      </section>
    );
  }

  function renderCategoryStep() {
    return (
      <section className="card public-booking-panel public-booking-stage" data-testid="public-booking-category-page">
        <div className="public-booking-panel__head">
          <div>
            <h2>Choose a service</h2>
          </div>
        </div>
        <div className="public-booking-folderGrid" data-testid="public-booking-service-folders">
          {categories.map((category) => {
            const count = availableServices.filter((service) => String(service.category || "Services") === category).length;
            const folder = folders.find((entry) => entry.key === category);
            const folderImage = folder?.imageUrl || folderImages[category];
            return (
              <button
                key={category}
                type="button"
                className={`public-booking-folder${selectedCategory === category ? " is-active" : ""}`}
                onClick={() => {
                  setSelectedCategory(category);
                  setSelectedService("");
                  setSelectedSlot(null);
                  window.setTimeout(() => navigateToStage("service"), 0);
                }}
              >
                {folderImage ? (
                  <img src={resolvePublicAssetUrl(folderImage)} alt="" className="public-booking-folder__image" loading="lazy" decoding="async" />
                ) : (
                  <span className="public-booking-folder__fallback" aria-hidden="true">{(folder?.displayName || category).slice(0, 1)}</span>
                )}
                <strong>{folder?.displayName || category}</strong>
                <span>{folder?.publicDescription || `${count} option${count === 1 ? "" : "s"}`}</span>
              </button>
            );
          })}
        </div>
        <div className="public-booking-stageActions">
          <button className="button secondary" type="button" onClick={() => navigateToStage("location")}>Back to locations</button>
        </div>
      </section>
    );
  }

  function renderServiceStep() {
    return (
      <section className="card public-booking-panel public-booking-stage" data-testid="public-booking-service-card">
        <div className="public-booking-panel__head">
          <div>
            <h2>Choose your service</h2>
          </div>
        </div>
        <p className="public-booking-panel__note">Select the service you need at {selectedLocation?.name || "this location"}.</p>
        <div className="public-booking-serviceList">
          {visibleServices.map((service) => {
            const serviceProvider = staff.find((member) => member.id === service.assignedUserId) || null;
            const isActive = selectedService === service.id;
            const isInBundle = selectedBundleLines.some((line) => line.serviceId === service.id);
            return (
              <button
                key={service.id}
                type="button"
                className={`public-booking-serviceCard${isActive ? " is-active" : ""}`}
                onClick={() => {
                  setSelectedService(service.id);
                  setSelectedSlot(null);
                  if (!publicBundlesEnabled) {
                    window.setTimeout(() => navigateToStage("availability"), 0);
                  }
                }}
                data-testid={isActive ? "public-booking-service-selected" : undefined}
                aria-pressed={isActive}
              >
                <div className="public-booking-serviceCard__top">
                  {service.imageUrl ? (
                    <img src={service.imageUrl} alt="" className="public-booking-cardImage" loading="lazy" decoding="async" />
                  ) : (
                    <span className="public-booking-cardImage public-booking-cardImage--fallback" aria-hidden="true">{service.name.slice(0, 1)}</span>
                  )}
                  <div>
                    <strong>{service.name}</strong>
                    {service.shortDescription || service.description ? <p>{service.shortDescription || service.description}</p> : null}
                  </div>
                  <span className="public-booking-serviceCard__duration">{service.durationMinutes || 60} min</span>
                </div>
                <div className="public-booking-serviceCard__meta">
                  <span>{formatMoney(service.effectivePriceCents ?? service.priceCents) || "Price on request"}</span>
                  {typeof service.discountPriceCents === "number" && typeof service.standardPriceCents === "number" ? (
                    <span className="public-booking-serviceCard__strike">{formatMoney(service.standardPriceCents)}</span>
                  ) : null}
                  {bookingWorkflow.providerSelectionEnabled && serviceProvider ? <span>{formatTeamMemberLabel(serviceProvider, workforceTerminology.publicBooking)}</span> : null}
                  {publicBundlesEnabled && isInBundle ? <span>Added</span> : null}
                </div>
              </button>
            );
          })}
        </div>
        {publicBundlesEnabled ? (
          <div className="public-booking-truth" data-testid="public-booking-bundle-summary">
            <div className="public-booking-panel__head" style={{ alignItems: "center" }}>
              <div>
                <strong>Selected services</strong>
                <p>Build one visit from eligible services. The first service stays the primary booking service.</p>
              </div>
              <button
                className="button secondary"
                type="button"
                data-testid="public-booking-add-service"
                disabled={
                  !selectedServiceDetails ||
                  !selectedServiceDetails.publicBundleEligible ||
                  selectedBundleLines.some((line) => line.serviceId === selectedServiceDetails.id) ||
                  (selectedBundleLines.length === 0 && selectedServiceDetails.publicBundleAddOn) ||
                  selectedBundleLines.length >= Number(publicBundles.maxServices || 4)
                }
                onClick={addSelectedBundleService}
              >
                Add service
              </button>
            </div>
            {selectedBundleDetails.length ? (
              <div className="public-booking-summaryGrid">
                {selectedBundleDetails.map((line, index) => (
                  <div key={line.service.id} data-testid={`public-booking-bundle-line-${index}`}>
                    <dt>{index === 0 ? "Primary" : "Add-on"}</dt>
                    <dd>
                      <strong>{line.service.name}</strong>
                      <span>{formatMoney(Number(line.service.effectivePriceCents ?? line.service.priceCents ?? 0) * line.quantity) || "Price on request"}</span>
                      {Number(line.service.publicBundleMaxQuantity || 1) > 1 ? (
                        <label className="public-booking-field" style={{ marginTop: 8 }}>
                          <span>Qty</span>
                          <input
                            className="input"
                            data-testid={`public-booking-bundle-qty-${line.service.id}`}
                            type="number"
                            min={1}
                            max={line.service.publicBundleMaxQuantity || 1}
                            value={line.quantity}
                            onChange={(event) => updateBundleQuantity(line.service.id, Number(event.target.value))}
                          />
                        </label>
                      ) : null}
                      <button className="button secondary" type="button" onClick={() => removeBundleService(line.service.id)}>
                        Remove
                      </button>
                    </dd>
                  </div>
                ))}
              </div>
            ) : (
              <p>Choose a primary service to start.</p>
            )}
            <p className="public-booking-panel__note">
              Estimated visit length: {displayedDurationMinutes || selectedServiceDetails?.durationMinutes || 60} minutes. Total: {formatMoney(displayedEffectivePriceCents) || "Price on request"}.
            </p>
          </div>
        ) : null}
        {selectedServiceDetails?.customerNotes || selectedServiceDetails?.longDescription ? (
          <details className="public-booking-details" data-testid="public-booking-service-more-details">
            <summary>More details</summary>
            {selectedServiceDetails.customerNotes ? <p data-testid="public-booking-customer-notes">{selectedServiceDetails.customerNotes}</p> : null}
            {selectedServiceDetails.longDescription ? <p>{selectedServiceDetails.longDescription}</p> : null}
          </details>
        ) : null}
        {selectedServiceDetails?.tradeAccountDepositWaived && tradeAccountMatch ? (
          <p className="public-booking-panel__note" data-testid="public-booking-trade-deposit-note">Deposit not required for this account.</p>
        ) : null}
        {Array.isArray(selectedServiceDetails?.availableOptions) && selectedServiceDetails.availableOptions.length > 0 ? (
          <div className="public-booking-questionGrid" style={{ marginTop: 12 }}>
            {selectedServiceDetails.availableOptions.map((option) => {
              const checked = Number(selectedOptions[option.key] || 0) > 0;
              return (
                <label key={option.key} className="public-booking-field" style={{ border: "1px solid rgba(148, 163, 184, 0.35)", borderRadius: 12, padding: 12 }}>
                  <span style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <strong>{option.label}</strong>
                    <span>{formatMoney(option.priceCents) || "Included"}</span>
                  </span>
                  {option.description ? <small className="muted">{option.description}</small> : null}
                  <input type="checkbox" checked={checked} onChange={(event) => toggleOption(option.key, event.target.checked)} style={{ marginTop: 10 }} />
                </label>
              );
            })}
          </div>
        ) : null}
        <div className="public-booking-stageActions">
          <button className="button secondary" type="button" onClick={() => navigateToStage("category")}>Back to service folders</button>
          {publicBundlesEnabled ? (
            <button className="button" type="button" disabled={!selectionReady} onClick={() => navigateToStage("availability")}>Continue to availability</button>
          ) : null}
        </div>
      </section>
    );
  }

  function renderAvailabilityStep() {
    return (
      <section className="card public-booking-panel public-booking-stage">
        <div className="public-booking-panel__head">
          <div>
            <h2>Choose an available time</h2>
          </div>
          <span className="public-booking-panel__quiet">{displayTimezone}</span>
        </div>
        <div className="public-booking-weekNav">
          <button className="button secondary" type="button" data-testid="public-booking-week-back" onClick={() => {
            const previous = new Date(`${date}T12:00:00.000Z`);
            previous.setUTCDate(previous.getUTCDate() - 7);
            setDate(previous.toISOString().slice(0, 10));
          }}>Previous week</button>
          <strong>{formatDateLabel(date, displayTimezone)} – {formatDateLabel(getWeekDates(date)[6], displayTimezone)}</strong>
          <button className="button secondary" type="button" data-testid="public-booking-week-forward" onClick={() => {
            const next = new Date(`${date}T12:00:00.000Z`);
            next.setUTCDate(next.getUTCDate() + 7);
            setDate(next.toISOString().slice(0, 10));
          }}>Next week</button>
          <input className="input public-booking-datePicker" aria-label="Week starting" data-testid="public-booking-date-input" type="date" value={date} onChange={(event) => setDate(getWeekStart(event.target.value))} />
          {bookingWorkflow.providerSelectionEnabled && bookingProEnabled && staff.length ? (
            <label className="public-booking-field">
              <span>Choose a {workforceTerminology.publicBooking.toLowerCase()}</span>
              <select className="input" value={selectedStaff} onChange={(event) => setSelectedStaff(event.target.value)}>
                <option value="">Any available {workforceTerminology.publicBooking.toLowerCase()}</option>
                {staff.map((member) => <option key={member.id} value={member.id}>{formatTeamMemberLabel(member, workforceTerminology.publicBooking)}</option>)}
              </select>
            </label>
          ) : null}
        </div>
        {selectedServiceDetails ? (
          <div className="public-booking-priceRow">
            <article>
              <span>Total</span>
              <strong>{formatMoney(displayedEffectivePriceCents) || "Price on request"}</strong>
            </article>
            <article>
              <span>Deposit</span>
              <strong>{formatMoney(displayedDepositCents) || "No deposit"}</strong>
            </article>
            <article>
              <span>Balance later</span>
              <strong>{formatMoney(displayedRemainingBalanceCents) || "Included"}</strong>
            </article>
          </div>
        ) : null}
        {loadingSlots ? <p className="muted">Checking live availability...</p> : null}
        {!loadingSlots && date && !slots.length ? (
          <div className="public-booking-empty" data-testid="public-booking-no-slots">
            <strong>No times left this week</strong>
            {nextAvailableSlot ? (
              <>
                <p>No times are left this week. Next available: {formatDateLabel(nextAvailableSlot, displayTimezone)} {formatTimeLabel(nextAvailableSlot, displayTimezone)}</p>
                <button
                  className="button secondary"
                  type="button"
                  data-testid="public-booking-next-available"
                  onClick={() => {
                    if (!nextAvailableDate) return;
                    setDate(getWeekStart(nextAvailableDate));
                  }}
                >
                  Jump to next available
                </button>
              </>
            ) : (
              <p>There are no open times right now. Try another day or contact the team directly.</p>
            )}
          </div>
        ) : null}
        <div className="public-booking-week" data-testid="public-booking-slot-list">
          {getWeekDates(date).map((weekDate) => {
            const daySlots = slots.filter((slot) => slot.startsAt.slice(0, 10) === weekDate);
            return (
              <section className="public-booking-day" key={weekDate}>
                <h3>{formatDateLabel(weekDate, displayTimezone)}</h3>
                {daySlots.length ? daySlots.map((slot) => (
                  <button
                    key={slot.startsAt}
                    type="button"
                    data-testid={`public-booking-slot-${slot.startsAt}`}
                    className={`public-booking-slot${selectedSlot?.startsAt === slot.startsAt ? " is-active" : ""}`}
                    onClick={() => setSelectedSlot(slot)}
                  >
                    <strong>{formatTimeLabel(slot.startsAt, displayTimezone)}</strong>
                  </button>
                )) : <span className="public-booking-day__empty">No times</span>}
              </section>
            );
          })}
        </div>
        <div className="public-booking-stageActions">
          <button className="button secondary" type="button" onClick={() => navigateToStage("service")}>Back to service</button>
          <button className="button" type="button" disabled={!slotReady} onClick={() => navigateToStage("details")}>Continue to details</button>
        </div>
      </section>
    );
  }

  function renderDetailsStep() {
    const detailsValidation = requireDetailsForNextStage();
    const renderQuestionControl = (question: BookingQuestion) => {
      const meta = question.optionsJson || {};
      const value = answers[question.id] ?? meta.defaultValue ?? "";
      const common = {
        className: "input",
        "data-testid": `public-booking-field-${question.questionKey}`,
      };
      if (question.type === "checkbox") {
        return (
          <label key={question.id} className="public-booking-confirmationCheck">
            <input
              type="checkbox"
              {...common}
              checked={value === true}
              onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.checked }))}
            />
            <span>{question.label}{question.required ? " *" : ""}</span>
          </label>
        );
      }
      if (question.type === "dropdown" || question.type === "radio") {
        return (
          <label key={question.id} className="public-booking-field">
            <span>{question.label}{question.required ? " *" : ""}</span>
            <select {...common} value={String(value)} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}>
              <option value="">Choose an option</option>
              {(meta.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            {meta.helpText ? <small>{meta.helpText}</small> : null}
          </label>
        );
      }
      if (question.type === "textarea" || question.type === "address") {
        return (
          <label key={question.id} className="public-booking-field">
            <span>{question.label}{question.required ? " *" : ""}</span>
            <textarea {...common} rows={3} placeholder={meta.placeholder || question.label} value={String(value)} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} />
            {meta.helpText ? <small>{meta.helpText}</small> : null}
          </label>
        );
      }
      const inputType = question.type === "email" ? "email" : question.type === "number" ? "number" : question.type === "date" ? "date" : "text";
      return (
        <label key={question.id} className="public-booking-field">
          <span>{question.label}{question.required ? " *" : ""}</span>
          <input {...common} type={inputType} placeholder={meta.placeholder || question.label} value={String(value)} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))} />
          {meta.helpText ? <small>{meta.helpText}</small> : null}
        </label>
      );
    };
    return (
      <section className="card public-booking-panel public-booking-stage">
        <div className="public-booking-panel__head">
          <div>
            <h2>Your details</h2>
          </div>
        </div>
        <div className="public-booking-controlGrid">
          <label className="public-booking-field">
            <span>Name</span>
            <input className="input" data-testid="public-booking-name-input" placeholder="Enter your name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
          </label>
          <label className="public-booking-field">
            <span>Phone{requireCustomerPhone ? " *" : ""}</span>
            <div className="public-booking-phone">
              <select className="input" aria-label="Phone country" data-testid="public-booking-phone-country" defaultValue="+44">
                <option value="+44">United Kingdom +44</option>
              </select>
              <input className="input" data-testid="public-booking-phone-input" placeholder="Enter phone number" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} />
            </div>
          </label>
          <label className="public-booking-field">
            <span>Email</span>
            <input className="input" data-testid="public-booking-email-input" placeholder="Enter email address" type="email" value={customerEmail} onChange={(event) => setCustomerEmail(event.target.value)} />
          </label>
          {requireVehicleRegistration ? (
            <label className="public-booking-field">
              <span>Reg Number{requireVehicleRegistration ? " *" : ""}</span>
              <input className="input" data-testid="public-booking-registration-input" placeholder="Reg Number" value={vehicleRegistration} onChange={(event) => setVehicleRegistration(event.target.value.toUpperCase())} />
            </label>
          ) : null}
        </div>
        {requireLockingWheelNut ? (
          <label className="public-booking-confirmationCheck">
            <input
              type="checkbox"
              data-testid="public-booking-locking-wheel-nut"
              checked={lockingWheelNutAvailable}
              onChange={(event) => setLockingWheelNutAvailable(event.target.checked)}
            />
            <span>Locking Wheel Nut Readily Available?</span>
          </label>
        ) : null}
        {bookingProEnabled && additionalQuestions.length > 0 ? (
          <div className="public-booking-questionGrid">
            {additionalQuestions.map(renderQuestionControl)}
          </div>
        ) : null}
        {detailsValidation ? <p className="public-booking-hero__notice public-booking-hero__notice--error">{detailsValidation}</p> : null}
        <div className="public-booking-stageActions">
          <button className="button secondary" type="button" onClick={() => navigateToStage("availability")}>Back to availability</button>
          <button
            className="button"
            type="button"
            onClick={() => {
              const nextError = requireDetailsForNextStage();
              if (nextError) {
                setError(nextError);
                return;
              }
              setError("");
              navigateToStage("confirmation");
            }}
          >
            Review booking
          </button>
        </div>
      </section>
    );
  }

  function renderConfirmationStep() {
    return (
      <section className="card public-booking-panel public-booking-stage">
        <div className="public-booking-panel__head">
          <div>
            <h2>{checkoutRequired ? "Checkout" : "Confirm your booking"}</h2>
          </div>
        </div>
        <dl className="public-booking-confirmSummary" data-testid="public-booking-summary">
          <div>
            <dt>Location</dt>
            <dd>
              <strong>{selectedLocation?.name || "Selected location"}</strong>
              <span>{formatLocationAddress(selectedLocation)}</span>
            </dd>
          </div>
          {selectedCategory ? <div><dt>Category</dt><dd>{selectedCategory}</dd></div> : null}
          <div>
            <dt>Service</dt>
            <dd>{publicBundlesEnabled && selectedBundleDetails.length > 1 ? selectedBundleDetails.map((line) => `${line.quantity}x ${line.service.name}`).join(", ") : primaryBundleService?.name}</dd>
          </div>
          <div>
            <dt>Appointment</dt>
            <dd>{formatDateLabel(selectedSlot?.startsAt, displayTimezone)} at {formatTimeLabel(selectedSlot?.startsAt, displayTimezone)}</dd>
          </div>
          <div>
            <dt>Customer</dt>
            <dd><strong>{customerName}</strong><span>{customerEmail}</span></dd>
          </div>
          {customerPhone ? <div><dt>Phone</dt><dd>{customerPhone}</dd></div> : null}
          {vehicleRegistration ? <div><dt>Registration</dt><dd>{vehicleRegistration}</dd></div> : null}
          {requireLockingWheelNut ? <div><dt>Locking wheel nut</dt><dd>{lockingWheelNutAvailable ? "Readily available" : "Not confirmed"}</dd></div> : null}
          {additionalQuestions.filter((question) => {
            const value = answers[question.id];
            return value === true || String(value || "").trim();
          }).map((question) => (
            <div key={question.id}>
              <dt>{question.label}</dt>
              <dd>{answers[question.id] === true ? "Yes" : String(answers[question.id])}</dd>
            </div>
          ))}
          <div>
            <dt>Price</dt>
            <dd><strong>{formatMoney(displayedEffectivePriceCents) || "Price on request"}</strong><span>{displayedDepositCents > 0 ? `${formatMoney(displayedDepositCents)} deposit` : "No deposit"}</span></dd>
          </div>
        </dl>
        {tradeAccountMatch ? <p className="public-booking-panel__note" data-testid="public-booking-trade-match">Trade account recognised for {tradeAccountMatch.name}.</p> : null}
        <div className="public-booking-truth" data-testid="public-booking-payment-truth">
          <strong>
            {displayedDepositCents > 0 ? `Deposit due: ${formatMoney(displayedDepositCents)}.` : "No payment is needed online today."}
          </strong>
          <p>
            {checkoutRequired
              ? onlineCheckoutAvailable
                ? "Your booking is confirmed after payment."
                : "Online payment is not available right now. Please contact the business."
              : "The business will confirm any payment details with you."}{" "}
            {displayedRemainingBalanceCents ? `Remaining balance: ${formatMoney(displayedRemainingBalanceCents)}.` : ""}
            {!checkoutRequired
              ? ` ${autoConfirmPublicBookings ? "Your booking will be confirmed when you submit." : "Your booking will be confirmed after you submit."}`
              : ""}
          </p>
        </div>
        <div className="public-booking-stageActions">
          <button className="button secondary" type="button" onClick={() => navigateToStage("details")}>Back to details</button>
          {bookingSubmissionAvailable ? (
            <button
              className="button"
              data-testid="public-booking-confirm"
              type="button"
              onClick={() => void submit()}
            >
              {onlineCheckoutAvailable ? "Pay deposit" : "Confirm booking"}
            </button>
          ) : null}
        </div>
        {status ? (
          <div className="public-booking-success" data-testid="public-booking-success">
            <h3>{status}</h3>
            <p>Use the confirmation and status page for payment guidance, rescheduling, or cancellation.</p>
            <div className="public-booking-actions">
              {statusUrl ? <a className="button secondary" href={statusUrl}>View booking status</a> : null}
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  if (!marketplaceEnabled) {
    return (
      <div className="container">
        <div className="card" style={{ padding: 22, maxWidth: 760 }}>
          <h1 style={{ marginTop: 0 }}>Online booking unavailable</h1>
          <p className="muted" style={{ marginBottom: 0 }}>Online booking is not available right now. Please contact the business.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="container public-booking-shell"
      style={{ "--booking-brand": tenant?.primaryColor || "#2563eb" } as CSSProperties}
    >
      <section id="booking-home" className="card public-booking-hero" data-testid="public-booking-brand-header">
        <div className="public-booking-brand">
          {tenant?.logoUrl && !logoFailed ? (
            <img
              data-testid="public-booking-tenant-logo"
              src={resolvePublicAssetUrl(tenant.logoUrl)}
              alt=""
              aria-label={`${tenant?.name || "Business"} logo`}
              width={320}
              height={96}
              loading="eager"
              decoding="async"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <strong className="public-booking-brand__fallback" data-testid="public-booking-tenant-name">{tenant?.name || "Business"}</strong>
          )}
        </div>
        {renderStepRail()}
        {error ? <p role="alert" className="public-booking-hero__notice public-booking-hero__notice--error">{error}</p> : null}
        {!emailConfigured ? <p className="public-booking-hero__hint">Email confirmation is not available yet. The team will confirm your booking directly.</p> : null}
      </section>

      {loadingConfig ? (
        <section className="card public-booking-panel public-booking-loading" aria-live="polite">
          <strong>Loading booking options...</strong>
        </section>
      ) : null}

      {!loadingConfig && !services.length ? (
        <section className="card public-booking-panel" data-testid="public-booking-empty-state">
          <h2 style={{ marginTop: 0 }}>Online booking is not open yet</h2>
          <p className="muted" style={{ marginBottom: 0 }}>This workspace has not published any booking services yet. Please contact the team directly to arrange a visit.</p>
        </section>
      ) : null}

      {!loadingConfig && services.length ? (
        <>
          <div className="public-booking-grid">
            {routeStage === "location" ? renderLocationStep() : null}
            {routeStage === "category" ? renderCategoryStep() : null}
            {routeStage === "service" ? renderServiceStep() : null}
            {routeStage === "availability" ? renderAvailabilityStep() : null}
            {routeStage === "details" ? renderDetailsStep() : null}
            {routeStage === "confirmation" ? renderConfirmationStep() : null}
          </div>
        </>
      ) : null}
      {tenant?.businessDetails ? (
        <footer className="public-booking-panel__note" data-testid="public-booking-business-footer" style={{ marginTop: 16, textAlign: 'center' }}>
          <strong>{tenant.businessDetails.tradingName || tenant.businessDetails.registeredBusinessName || tenant.name}</strong>
          {tenant.businessDetails.companyNumber ? <span> · Company {tenant.businessDetails.companyNumber}</span> : null}
          {tenant.businessDetails.address ? <div>{tenant.businessDetails.address}</div> : null}
          <div>{[tenant.businessDetails.phone, tenant.businessDetails.email].filter(Boolean).join(' · ')}</div>
        </footer>
      ) : null}
    </div>
  );
}
