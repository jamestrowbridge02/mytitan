import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { DashboardShell } from "../../../components/dashboard-shell";
import OnboardingCoach from "../../../components/coach/OnboardingCoach";
import EntityHeader from "../../../components/entity/EntityHeader";
import RelatedLinks from "../../../components/entity/RelatedLinks";
import EntitySection from "../../../components/entity/EntitySection";
import EntityTimeline, { type EntityTimelineItem } from "../../../components/entity/EntityTimeline";
import { ErrorState } from "../../../components/states/ErrorState";
import { LoadingState } from "../../../components/states/LoadingState";
import { ApiError, apiFetch } from "../../../lib/api";
import { isCrmProV1Enabled, isNotificationsV1Enabled } from "../../../lib/feature-flags";
import { sortTimelineItems, toTimelineItemsFromCommsEvents, toTimelineItemsFromCrmNotes } from "../../../lib/timeline-adapter";

function money(cents: number, currency = "GBP") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format((cents || 0) / 100);
}

type NextActionType = "CALL" | "EMAIL" | "WHATSAPP" | "FOLLOW_UP" | "MEETING";

type TimelineEntry = {
  type?: string;
  createdAt?: string;
  data?: {
    id?: string;
    body?: string;
    jobRef?: string;
    customerName?: string;
    totalCents?: number;
    message?: string;
  };
};

type ContactPreferenceState = {
  event: "JOB_COMPLETION" | "INVOICE" | "UPDATE_CALL" | "GENERAL_NOTIFICATION";
  channel: "EMAIL" | "WHATSAPP" | "PHONE";
  enabled: boolean;
};

type LocationState = {
  id: string;
  name: string;
  kind: "BUSINESS" | "BILLING" | "SERVICE" | "OTHER";
  addressLine1: string;
  addressLine2: string;
  city: string;
  postcode: string;
  country: string;
  isPrimary: boolean;
  isBilling: boolean;
  isActive: boolean;
};

type ContactState = {
  id: string;
  name: string;
  roleLabel: string;
  email: string;
  phone: string;
  mobile: string;
  tradeAccountLocationId: string;
  isPrimary: boolean;
  isBilling: boolean;
  isActive: boolean;
  preferences: ContactPreferenceState[];
};

const DEFAULT_PREFERENCES: ContactPreferenceState[] = [
  { event: "JOB_COMPLETION", channel: "EMAIL", enabled: false },
  { event: "INVOICE", channel: "EMAIL", enabled: false },
  { event: "UPDATE_CALL", channel: "PHONE", enabled: false },
  { event: "GENERAL_NOTIFICATION", channel: "WHATSAPP", enabled: false },
];

function tempId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function blankLocation(): LocationState {
  return {
    id: tempId("location"),
    name: "",
    kind: "BUSINESS",
    addressLine1: "",
    addressLine2: "",
    city: "",
    postcode: "",
    country: "",
    isPrimary: false,
    isBilling: false,
    isActive: true,
  };
}

function blankContact(): ContactState {
  return {
    id: tempId("contact"),
    name: "",
    roleLabel: "",
    email: "",
    phone: "",
    mobile: "",
    tradeAccountLocationId: "",
    isPrimary: false,
    isBilling: false,
    isActive: true,
    preferences: DEFAULT_PREFERENCES.map((item) => ({ ...item })),
  };
}

function normalizeLocations(account: any): LocationState[] {
  const locations = Array.isArray(account?.locations) ? account.locations : [];
  if (locations.length === 0) {
    return [blankLocation()];
  }
  return locations.map((location: any, index: number) => ({
    id: String(location.id || tempId(`location-${index}`)),
    name: location.name || "",
    kind: location.kind || "BUSINESS",
    addressLine1: location.addressLine1 || "",
    addressLine2: location.addressLine2 || "",
    city: location.city || "",
    postcode: location.postcode || "",
    country: location.country || "",
    isPrimary: Boolean(location.isPrimary),
    isBilling: Boolean(location.isBilling),
    isActive: location.isActive !== false,
  }));
}

function normalizeContacts(account: any): ContactState[] {
  const contacts = Array.isArray(account?.contacts) ? account.contacts : [];
  if (contacts.length === 0) {
    return [blankContact()];
  }
  return contacts.map((contact: any, index: number) => {
    const preferenceMap = new Map(
      (Array.isArray(contact.preferences) ? contact.preferences : []).map((preference: any) => [
        `${preference.event}:${preference.channel}`,
        preference.enabled !== false,
      ]),
    );
    return {
      id: String(contact.id || tempId(`contact-${index}`)),
      name: contact.name || "",
      roleLabel: contact.roleLabel || "",
      email: contact.email || "",
      phone: contact.phone || "",
      mobile: contact.mobile || "",
      tradeAccountLocationId: contact.tradeAccountLocationId || "",
      isPrimary: Boolean(contact.isPrimary),
      isBilling: Boolean(contact.isBilling),
      isActive: contact.isActive !== false,
      preferences: DEFAULT_PREFERENCES.map((preference) => ({
        ...preference,
        enabled: preferenceMap.get(`${preference.event}:${preference.channel}`) ?? false,
      })),
    };
  });
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function formatTimelineLabel(entry: TimelineEntry) {
  return (entry.type || "activity").replace(/_/g, " ");
}

function formatTimelineDescription(entry: TimelineEntry) {
  if (entry.type === "note") return entry.data?.body || "Note added";
  if (entry.type === "job") return entry.data?.jobRef || "Job created";
  if (entry.type === "booking") return entry.data?.customerName || "Booking created";
  if (entry.type === "payment") return `Paid ${money(Number(entry.data?.totalCents || 0))}`;
  return entry.data?.message || "Activity logged";
}

function openExternal(url: string) {
  if (typeof window === "undefined" || !url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

type CrmDraftFallback = {
  noteText: string;
  nextActionType: string;
  nextActionDueAt: string;
  nextActionUserId: string;
};

function readLocalDraft(key: string): CrmDraftFallback | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CrmDraftFallback>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      noteText: String(parsed.noteText || ""),
      nextActionType: String(parsed.nextActionType || ""),
      nextActionDueAt: String(parsed.nextActionDueAt || ""),
      nextActionUserId: String(parsed.nextActionUserId || ""),
    };
  } catch {
    return null;
  }
}

function writeLocalDraft(key: string, payload: CrmDraftFallback) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(payload));
}

function clearLocalDraft(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}

function readInputValue(id: string, fallback: any) {
  if (typeof document === "undefined") return fallback;
  const input = document.getElementById(id) as HTMLInputElement | null;
  return input ? input.value : fallback;
}

function normalizeNextActionType(value: string): NextActionType | "" {
  return ["CALL", "EMAIL", "WHATSAPP", "FOLLOW_UP", "MEETING"].includes(value) ? (value as NextActionType) : "";
}

export default function TradeAccountProfilePage() {
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const crmProEnabled = isCrmProV1Enabled();
  const [data, setData] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [commsEvents, setCommsEvents] = useState<any[]>([]);
  const [commsLoading, setCommsLoading] = useState(false);
  const [commsError, setCommsError] = useState("");
  const [noteText, setNoteText] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [draftState, setDraftState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [profileForm, setProfileForm] = useState<Record<string, any>>({});
  const profileFormRef = useRef<Record<string, any>>({});
  const [locationForm, setLocationForm] = useState<LocationState[]>([blankLocation()]);
  const [contactForm, setContactForm] = useState<ContactState[]>([blankContact()]);
  const [profileSaving, setProfileSaving] = useState(false);
  const [nextActionType, setNextActionType] = useState<NextActionType | "">("");
  const [nextActionDueAt, setNextActionDueAt] = useState("");
  const [nextActionUserId, setNextActionUserId] = useState("");
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [portalAccess, setPortalAccess] = useState<any[]>([]);
  const [portalInviteEmail, setPortalInviteEmail] = useState("");
  const commsEnabled = isNotificationsV1Enabled();

  const localDraftKey = useMemo(() => `mytitan_crm_draft_${id}`, [id]);

  async function load() {
    if (!id) return;
    setError("");
    setRequestId(undefined);
    setCommsError("");
    setLoading(true);
    if (commsEnabled) {
      setCommsLoading(true);
    }
    try {
      const [accountPayload, timelinePayload, crmDraft, accessRows] = await Promise.all([
        crmProEnabled ? apiFetch(`/crm/accounts/${id}/full`) : apiFetch(`/trade-accounts/${id}`),
        crmProEnabled ? Promise.resolve(null) : apiFetch(`/trade-accounts/${id}/timeline?page=1&pageSize=25`),
        apiFetch("/drafts/latest?kind=crm_note").catch(() => null),
        apiFetch(`/trade-accounts/${id}/portal-access`).catch(() => []),
      ]);
      if (commsEnabled) {
        try {
          const res = await apiFetch(`/notifications/entity?entityType=trade_account&entityId=${id}`);
          setCommsEvents(Array.isArray(res) ? res : []);
        } catch (err: any) {
          setCommsError(err?.message || "Failed to load communications");
        }
      }
      setData(accountPayload);
      setTimeline(
        crmProEnabled
          ? Array.isArray(accountPayload?.timeline)
            ? accountPayload.timeline
            : []
          : Array.isArray(timelinePayload?.timeline)
          ? timelinePayload.timeline
          : []
      );
      const account = accountPayload?.account || accountPayload || {};
      const nextProfileForm = {
        name: account.name || "",
        contactName: account.contactName || "",
        contactEmail: account.contactEmail || "",
        contactPhone: account.contactPhone || "",
        contactMobile: account.contactMobile || "",
        secondaryContactName: account.secondaryContactName || "",
        secondaryContactEmail: account.secondaryContactEmail || "",
        secondaryContactPhone: account.secondaryContactPhone || "",
        secondaryContactMobile: account.secondaryContactMobile || "",
        vatNumber: account.vatNumber || "",
        companyNumber: account.companyNumber || "",
        businessAddressLine1: account.businessAddressLine1 || "",
        businessAddressLine2: account.businessAddressLine2 || "",
        businessCity: account.businessCity || "",
        businessPostcode: account.businessPostcode || "",
        businessCountry: account.businessCountry || "",
        billingContactName: account.billingContactName || "",
        billingEmail: account.billingEmail || "",
        billingPhone: account.billingPhone || "",
        billingMobile: account.billingMobile || "",
        billingAddressLine1: account.billingAddressLine1 || "",
        billingAddressLine2: account.billingAddressLine2 || "",
        billingCity: account.billingCity || "",
        billingPostcode: account.billingPostcode || "",
        billingCountry: account.billingCountry || "",
        paymentTermsDays: account.paymentTermsDays ?? 7,
        portalEnabled: Boolean(account.portalEnabled),
      };
      profileFormRef.current = nextProfileForm;
      setProfileForm(nextProfileForm);
      setPortalInviteEmail(account.billingEmail || account.contactEmail || "");
      setPortalAccess(Array.isArray(accessRows) ? accessRows : []);
      setLocationForm(normalizeLocations(account));
      setContactForm(normalizeContacts(account));
      setNextActionType(account.nextActionType || "");
      setNextActionDueAt(account.nextActionDueAt ? String(account.nextActionDueAt).slice(0, 10) : "");
      setNextActionUserId(account.nextActionUserId || "");
      if (crmDraft?.tradeAccountId === id && crmDraft?.payload) {
        setNoteText(String(crmDraft.payload.noteText || ""));
        setNextActionType(normalizeNextActionType(String(crmDraft.payload.nextActionType || "")));
        setNextActionDueAt(String(crmDraft.payload.nextActionDueAt || ""));
        setNextActionUserId(String(crmDraft.payload.nextActionUserId || ""));
      } else {
        const fallback = readLocalDraft(localDraftKey);
        if (fallback) {
          setNoteText(fallback.noteText);
          setNextActionType(normalizeNextActionType(fallback.nextActionType));
          setNextActionDueAt(fallback.nextActionDueAt);
          setNextActionUserId(fallback.nextActionUserId);
        }
      }
      setDraftHydrated(true);
    } catch (err: any) {
      setError(err?.message || "Failed to load account profile");
      setRequestId(err instanceof ApiError ? err.requestId : undefined);
    } finally {
      setLoading(false);
      setCommsLoading(false);
    }
  }

  useEffect(() => {
    setDraftHydrated(false);
    load();
  }, [id, crmProEnabled, commsEnabled]);

  useEffect(() => {
    if (!id || !draftHydrated) return;
    const payload = {
      noteText,
      nextActionType,
      nextActionDueAt,
      nextActionUserId,
    };
    if (payload.noteText || payload.nextActionType || payload.nextActionDueAt || payload.nextActionUserId) {
      writeLocalDraft(localDraftKey, payload);
    } else {
      clearLocalDraft(localDraftKey);
    }
  }, [id, noteText, nextActionType, nextActionDueAt, nextActionUserId, localDraftKey, draftHydrated]);

  useEffect(() => {
    if (!id || !draftHydrated) return;
    const timer = setTimeout(async () => {
      const payload = {
        noteText,
        nextActionType,
        nextActionDueAt,
        nextActionUserId,
      };
      try {
        setDraftState("saving");
        await apiFetch("/drafts/crm-note", {
          method: "PUT",
          body: JSON.stringify({
            tradeAccountId: id,
            payload,
          }),
        });
        clearLocalDraft(localDraftKey);
        setDraftState("saved");
      } catch {
        writeLocalDraft(localDraftKey, payload);
        setDraftState("error");
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [id, noteText, nextActionType, nextActionDueAt, nextActionUserId, localDraftKey, draftHydrated]);

  async function saveNextAction() {
    setStatus("");
    setError("");
    setRequestId(undefined);
    try {
      await apiFetch(`/trade-accounts/${id}/next-action`, {
        method: "PATCH",
        body: JSON.stringify({
          type: nextActionType || null,
          dueAt: nextActionDueAt ? new Date(`${nextActionDueAt}T12:00:00Z`).toISOString() : null,
          assignedUserId: nextActionUserId || null,
        }),
      });
      setStatus("Next action saved");
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to save next action");
      setRequestId(err instanceof ApiError ? err.requestId : undefined);
    }
  }

  async function addNote() {
    if (!noteText.trim()) return;
    setStatus("");
    setError("");
    setRequestId(undefined);
    try {
      await apiFetch(`/trade-accounts/${id}/notes`, {
        method: "POST",
        body: JSON.stringify({
          body: noteText.trim(),
          attachmentsMeta: {},
        }),
      });
      const nextDraftPayload = {
        noteText: "",
        nextActionType,
        nextActionDueAt,
        nextActionUserId,
      };
      setNoteText("");
      try {
        await apiFetch("/drafts/crm-note", {
          method: "PUT",
          body: JSON.stringify({
            tradeAccountId: id,
            payload: nextDraftPayload,
          }),
        });
        clearLocalDraft(localDraftKey);
        setDraftState("saved");
      } catch {
        writeLocalDraft(localDraftKey, nextDraftPayload);
        setDraftState("error");
      }
      setStatus("Note added");
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to add note");
      setRequestId(err instanceof ApiError ? err.requestId : undefined);
    }
  }

  async function saveProfile() {
    setStatus("");
    setError("");
    setRequestId(undefined);
    setProfileSaving(true);
    const currentProfileForm: Record<string, any> = {
      ...(profileFormRef.current || profileForm),
      contactName: readInputValue("crm-contact-name", profileFormRef.current?.contactName ?? profileForm.contactName),
      contactEmail: readInputValue("crm-contact-email", profileFormRef.current?.contactEmail ?? profileForm.contactEmail),
      contactPhone: readInputValue("crm-contact-phone", profileFormRef.current?.contactPhone ?? profileForm.contactPhone),
      contactMobile: readInputValue("crm-contact-mobile", profileFormRef.current?.contactMobile ?? profileForm.contactMobile),
      secondaryContactName: readInputValue("crm-secondary-contact-name", profileFormRef.current?.secondaryContactName ?? profileForm.secondaryContactName),
      secondaryContactEmail: readInputValue("crm-secondary-contact-email", profileFormRef.current?.secondaryContactEmail ?? profileForm.secondaryContactEmail),
      secondaryContactPhone: readInputValue("crm-secondary-contact-phone", profileFormRef.current?.secondaryContactPhone ?? profileForm.secondaryContactPhone),
      secondaryContactMobile: readInputValue("crm-secondary-contact-mobile", profileFormRef.current?.secondaryContactMobile ?? profileForm.secondaryContactMobile),
      vatNumber: readInputValue("crm-vat-number", profileFormRef.current?.vatNumber ?? profileForm.vatNumber),
      companyNumber: readInputValue("crm-company-number", profileFormRef.current?.companyNumber ?? profileForm.companyNumber),
      paymentTermsDays: Number(readInputValue("crm-payment-terms", profileFormRef.current?.paymentTermsDays ?? profileForm.paymentTermsDays ?? 7)),
      businessAddressLine1: readInputValue("crm-business-address-1", profileFormRef.current?.businessAddressLine1 ?? profileForm.businessAddressLine1),
      businessAddressLine2: readInputValue("crm-business-address-2", profileFormRef.current?.businessAddressLine2 ?? profileForm.businessAddressLine2),
      businessCity: readInputValue("crm-business-city", profileFormRef.current?.businessCity ?? profileForm.businessCity),
      businessPostcode: readInputValue("crm-business-postcode", profileFormRef.current?.businessPostcode ?? profileForm.businessPostcode),
      businessCountry: readInputValue("crm-business-country", profileFormRef.current?.businessCountry ?? profileForm.businessCountry),
      billingContactName: readInputValue("crm-billing-contact-name", profileFormRef.current?.billingContactName ?? profileForm.billingContactName),
      billingEmail: readInputValue("crm-billing-email", profileFormRef.current?.billingEmail ?? profileForm.billingEmail),
      billingPhone: readInputValue("crm-billing-phone", profileFormRef.current?.billingPhone ?? profileForm.billingPhone),
      billingMobile: readInputValue("crm-billing-mobile", profileFormRef.current?.billingMobile ?? profileForm.billingMobile),
      billingAddressLine1: readInputValue("crm-billing-address-1", profileFormRef.current?.billingAddressLine1 ?? profileForm.billingAddressLine1),
      billingAddressLine2: readInputValue("crm-billing-address-2", profileFormRef.current?.billingAddressLine2 ?? profileForm.billingAddressLine2),
      billingCity: readInputValue("crm-billing-city", profileFormRef.current?.billingCity ?? profileForm.billingCity),
      billingPostcode: readInputValue("crm-billing-postcode", profileFormRef.current?.billingPostcode ?? profileForm.billingPostcode),
      billingCountry: readInputValue("crm-billing-country", profileFormRef.current?.billingCountry ?? profileForm.billingCountry),
    };
    profileFormRef.current = currentProfileForm;
    const profilePayload = {
      ...currentProfileForm,
      locations: locationForm
        .map((location) => ({
          id: location.id,
          name: location.name.trim(),
          kind: location.kind,
          addressLine1: String(
            location.isBilling
              ? currentProfileForm.billingAddressLine1 ?? location.addressLine1
              : location.isPrimary
                ? currentProfileForm.businessAddressLine1 ?? location.addressLine1
                : location.addressLine1,
          ).trim(),
          addressLine2: String(
            location.isBilling
              ? currentProfileForm.billingAddressLine2 ?? location.addressLine2
              : location.isPrimary
                ? currentProfileForm.businessAddressLine2 ?? location.addressLine2
                : location.addressLine2,
          ).trim(),
          city: String(
            location.isBilling
              ? currentProfileForm.billingCity ?? location.city
              : location.isPrimary
                ? currentProfileForm.businessCity ?? location.city
                : location.city,
          ).trim(),
          postcode: String(
            location.isBilling
              ? currentProfileForm.billingPostcode ?? location.postcode
              : location.isPrimary
                ? currentProfileForm.businessPostcode ?? location.postcode
                : location.postcode,
          ).trim(),
          country: String(
            location.isBilling
              ? currentProfileForm.billingCountry ?? location.country
              : location.isPrimary
                ? currentProfileForm.businessCountry ?? location.country
                : location.country,
          ).trim(),
          isPrimary: location.isPrimary,
          isBilling: location.isBilling,
          isActive: location.isActive,
        }))
        .filter(
          (location) =>
            location.name ||
            location.addressLine1 ||
            location.addressLine2 ||
            location.city ||
            location.postcode ||
            location.country,
        ),
      contacts: contactForm
        .map((contact) => ({
          id: contact.id,
          name: String(
            contact.isPrimary
              ? currentProfileForm.contactName ?? contact.name
              : contact.isBilling
                ? currentProfileForm.billingContactName ?? contact.name
                : contact.name,
          ).trim(),
          roleLabel: contact.roleLabel.trim(),
          email: String(
            contact.isPrimary
              ? currentProfileForm.contactEmail ?? contact.email
              : contact.isBilling
                ? currentProfileForm.billingEmail ?? contact.email
                : contact.email,
          ).trim(),
          phone: String(
            contact.isPrimary
              ? currentProfileForm.contactPhone ?? contact.phone
              : contact.isBilling
                ? currentProfileForm.billingPhone ?? contact.phone
                : contact.phone,
          ).trim(),
          mobile: String(
            contact.isPrimary
              ? currentProfileForm.contactMobile ?? contact.mobile
              : contact.isBilling
                ? currentProfileForm.billingMobile ?? contact.mobile
                : contact.mobile,
          ).trim(),
          tradeAccountLocationId: contact.tradeAccountLocationId || undefined,
          isPrimary: contact.isPrimary,
          isBilling: contact.isBilling,
          isActive: contact.isActive,
          preferences: contact.preferences
            .filter((preference) => preference.enabled)
            .map((preference) => ({
              event: preference.event,
              channel: preference.channel,
              enabled: preference.enabled,
            })),
        }))
        .filter((contact) => contact.name || contact.email || contact.phone || contact.mobile),
    };
    try {
      if (crmProEnabled) {
        await apiFetch(`/crm/accounts/${id}`, {
          method: "PATCH",
          body: JSON.stringify(profilePayload),
        });
      } else {
        await apiFetch("/trade-accounts", {
          method: "POST",
          body: JSON.stringify({
            id,
            name: account.name || currentProfileForm.name || "Trade account",
            ...profilePayload,
          }),
        });
      }
      setStatus("Account details saved");
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to save account details");
      setRequestId(err instanceof ApiError ? err.requestId : undefined);
    } finally {
      setProfileSaving(false);
    }
  }

  async function invitePortalContact() {
    setProfileSaving(true);
    setError("");
    try {
      const result = await apiFetch(`/trade-accounts/${id}/portal-invite`, {
        method: "POST",
        body: JSON.stringify({ email: portalInviteEmail }),
      });
      setStatus(`Secure invite created for ${result.email}`);
      await load();
    } catch (err: any) {
      setError(err?.message || "Trade portal invite could not be created");
    } finally {
      setProfileSaving(false);
    }
  }

  async function revokePortalAccess(accessId: string) {
    setProfileSaving(true);
    try {
      await apiFetch(`/trade-accounts/${id}/portal-access/${accessId}/revoke`, { method: "POST" });
      setStatus("Trade portal access revoked");
      await load();
    } catch (err: any) {
      setError(err?.message || "Trade portal access could not be revoked");
    } finally {
      setProfileSaving(false);
    }
  }

  const account = data?.account || data || {};
  const summary = data?.summary || data?.financialSummary || { unpaidCount: 0, unpaidTotalCents: 0, paidTotalCents: 0 };
  const crmNotes = Array.isArray(data?.notes) ? data.notes : [];
  const crmTasks = Array.isArray(data?.tasks) ? data.tasks : [];
  const crmTags = Array.isArray(data?.tags) ? data.tags : [];
  const crmAttachments = Array.isArray(data?.attachments) ? data.attachments : [];
  const activeLocationOptions = locationForm.filter((location) => location.isActive !== false);

  function updateLocationRow(locationId: string, patch: Partial<LocationState>) {
    setLocationForm((current) =>
      current.map((location) => {
        if (location.id !== locationId) return location;
        return { ...location, ...patch };
      }),
    );
  }

  function updateContactRow(contactId: string, patch: Partial<ContactState>) {
    setContactForm((current) =>
      current.map((contact) => {
        if (contact.id !== contactId) return contact;
        return { ...contact, ...patch };
      }),
    );
  }

  function updatePrimaryContact(patch: Partial<ContactState>) {
    setContactForm((current) => {
      const primaryId = current.find((contact) => contact.isPrimary)?.id || current[0]?.id;
      return current.map((contact) => contact.id === primaryId ? { ...contact, ...patch } : contact);
    });
  }

  function updateProfileField(key: string, value: any) {
    profileFormRef.current = { ...(profileFormRef.current || profileForm), [key]: value };
    setProfileForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleContactPreference(contactId: string, event: ContactPreferenceState["event"], channel: ContactPreferenceState["channel"]) {
    setContactForm((current) =>
      current.map((contact) => {
        if (contact.id !== contactId) return contact;
        return {
          ...contact,
          preferences: contact.preferences.map((preference) =>
            preference.event === event && preference.channel === channel
              ? { ...preference, enabled: !preference.enabled }
              : preference,
          ),
        };
      }),
    );
  }

  const contactLine = `${account.contactName || "No contact"} | ${account.contactEmail || "No email"} | ${account.contactPhone || account.contactMobile || "No phone"}`;

  const jobHref = `/dashboard/jobs/new?tradeAccountId=${id}&customerName=${encodeURIComponent(
    account.name || ""
  )}&customerEmail=${encodeURIComponent(account.contactEmail || "")}&customerPhone=${encodeURIComponent(
    account.contactPhone || ""
  )}`;

  const bookingHref = `/dashboard/booking/calendar?tradeAccountId=${id}&customerName=${encodeURIComponent(
    account.name || ""
  )}&customerEmail=${encodeURIComponent(account.contactEmail || "")}&customerPhone=${encodeURIComponent(
    account.contactPhone || ""
  )}`;

  const whatsappHref = account.contactPhone || account.contactMobile
    ? `https://wa.me/${String(account.contactPhone || account.contactMobile).replace(/[^\d]/g, "")}`
    : "";
  const emailHref = account.contactEmail ? `mailto:${account.contactEmail}` : "";

  const timelineItems: EntityTimelineItem[] = sortTimelineItems([
    ...toTimelineItemsFromCrmNotes(timeline),
    ...toTimelineItemsFromCommsEvents(commsEvents),
  ]);

  const relatedJobId = timeline.find((entry: any) => entry?.type === "job" && entry?.data?.id)?.data?.id || null;
  const relatedBookingId = timeline.find((entry: any) => entry?.type === "booking" && entry?.data?.id)?.data?.id || null;

  if (loading && !data) {
    return (
      <DashboardShell>
        <LoadingState title="Loading account profile" description="Fetching CRM timeline and account details." />
      </DashboardShell>
    );
  }

  if (error && !data) {
    return (
      <DashboardShell>
        <ErrorState
          title="Could not load account"
          description={error}
          requestId={requestId}
          primaryAction={{ label: "Try again", onClick: load }}
          secondaryAction={{ label: "Back to accounts", href: "/dashboard/trade-accounts" }}
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <EntityHeader
        title={account.name || "Trade account"}
        subtitle={contactLine}
        badges={
          <>
            <span className="badge">{account.status || "ACTIVE"}</span>
            <span className="badge">Unpaid {money(Number(summary.unpaidTotalCents || 0))}</span>
            <span className="badge">Paid {money(Number(summary.paidTotalCents || 0))}</span>
          </>
        }
        primaryAction={{ label: "Create Job", href: jobHref }}
        secondaryActions={[{ label: "Create Booking", href: bookingHref }]}
      />

      {error ? (
        <ErrorState
          title="Action failed"
          description={error}
          requestId={requestId}
          primaryAction={{ label: "Reload", onClick: load }}
        />
      ) : null}
      {status ? (
        <p data-testid="trade-account-save-status" style={{ color: "#5eead4" }}>
          {status}
        </p>
      ) : null}

      <div className="entity-grid">
        <div>
          <RelatedLinks
            jobId={relatedJobId}
            bookingId={relatedBookingId}
          />
          <EntitySection title="Contact" subtitle="Primary contact and account identifiers.">
            <div className="two-col">
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Contact name
                </p>
                <p style={{ marginTop: 4 }}>{account.contactName || "No contact"}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Contact email
                </p>
                {account.contactEmail ? (
                  <a href={emailHref}>{account.contactEmail}</a>
                ) : (
                  <p style={{ marginTop: 4 }}>No email</p>
                )}
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Contact phone
                </p>
                {account.contactPhone ? (
                  <p style={{ marginTop: 4 }}>{account.contactPhone}</p>
                ) : (
                  <p style={{ marginTop: 4 }}>No phone</p>
                )}
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Contact mobile
                </p>
                <p style={{ marginTop: 4 }}>{account.contactMobile || "No mobile"}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  VAT number
                </p>
                <p style={{ marginTop: 4 }}>{account.vatNumber || "-"}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Company number
                </p>
                <p style={{ marginTop: 4 }}>{account.companyNumber || "-"}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Account ID
                </p>
                <p style={{ marginTop: 4 }}>{account.id || id || "-"}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Created
                </p>
                <p style={{ marginTop: 4 }}>{formatDate(account.createdAt)}</p>
              </div>
              <div>
                <p className="muted" style={{ margin: 0 }}>
                  Updated
                </p>
                <p style={{ marginTop: 4 }}>{formatDate(account.updatedAt)}</p>
              </div>
            </div>
          </EntitySection>

          <EntitySection title="Business Profile" subtitle="Optional business identity, billing, and contact fields used in job output.">
            <div className="two-col">
              <div>
                <label htmlFor="crm-contact-name">Primary contact</label>
                <input id="crm-contact-name" className="input" value={profileForm.contactName || ""} onChange={(e) => {
                  updateProfileField("contactName", e.target.value);
                  updatePrimaryContact({ name: e.target.value });
                }} />
              </div>
              <div>
                <label htmlFor="crm-contact-email">Primary email</label>
                <input id="crm-contact-email" className="input" type="email" value={profileForm.contactEmail || ""} onChange={(e) => {
                  updateProfileField("contactEmail", e.target.value);
                  updatePrimaryContact({ email: e.target.value });
                }} />
              </div>
              <div>
                <label htmlFor="crm-contact-phone">Primary phone</label>
                <input id="crm-contact-phone" className="input" value={profileForm.contactPhone || ""} onChange={(e) => {
                  updateProfileField("contactPhone", e.target.value);
                  updatePrimaryContact({ phone: e.target.value });
                }} />
              </div>
              <div>
                <label htmlFor="crm-contact-mobile">Primary mobile</label>
                <input id="crm-contact-mobile" className="input" value={profileForm.contactMobile || ""} onChange={(e) => {
                  updateProfileField("contactMobile", e.target.value);
                  updatePrimaryContact({ mobile: e.target.value });
                }} />
              </div>
              <div>
                <label htmlFor="crm-secondary-contact-name">Secondary contact</label>
                <input id="crm-secondary-contact-name" className="input" value={profileForm.secondaryContactName || ""} onChange={(e) => setProfileForm((prev) => ({ ...prev, secondaryContactName: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="crm-secondary-contact-email">Secondary email</label>
                <input id="crm-secondary-contact-email" className="input" type="email" value={profileForm.secondaryContactEmail || ""} onChange={(e) => setProfileForm((prev) => ({ ...prev, secondaryContactEmail: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="crm-secondary-contact-phone">Secondary phone</label>
                <input id="crm-secondary-contact-phone" className="input" value={profileForm.secondaryContactPhone || ""} onChange={(e) => setProfileForm((prev) => ({ ...prev, secondaryContactPhone: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="crm-secondary-contact-mobile">Secondary mobile</label>
                <input id="crm-secondary-contact-mobile" className="input" value={profileForm.secondaryContactMobile || ""} onChange={(e) => setProfileForm((prev) => ({ ...prev, secondaryContactMobile: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="crm-vat-number">VAT number</label>
                <input id="crm-vat-number" className="input" value={profileForm.vatNumber || ""} onChange={(e) => setProfileForm((prev) => ({ ...prev, vatNumber: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="crm-company-number">Company number</label>
                <input id="crm-company-number" className="input" value={profileForm.companyNumber || ""} onChange={(e) => setProfileForm((prev) => ({ ...prev, companyNumber: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="crm-payment-terms">Payment terms (days)</label>
                <input id="crm-payment-terms" className="input" type="number" min={0} max={365} value={profileForm.paymentTermsDays ?? 7} onChange={(e) => setProfileForm((prev) => ({ ...prev, paymentTermsDays: Number(e.target.value || 0) }))} />
              </div>
              <div>
                <label htmlFor="crm-business-address-1">Business address 1</label>
                <input id="crm-business-address-1" className="input" value={profileForm.businessAddressLine1 || ""} onChange={(e) => setProfileForm((prev) => ({ ...prev, businessAddressLine1: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="crm-business-address-2">Business address 2</label>
                <input id="crm-business-address-2" className="input" value={profileForm.businessAddressLine2 || ""} onChange={(e) => setProfileForm((prev) => ({ ...prev, businessAddressLine2: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="crm-business-city">Business city</label>
                <input id="crm-business-city" className="input" value={profileForm.businessCity || ""} onChange={(e) => setProfileForm((prev) => ({ ...prev, businessCity: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="crm-business-postcode">Business postcode</label>
                <input id="crm-business-postcode" className="input" value={profileForm.businessPostcode || ""} onChange={(e) => setProfileForm((prev) => ({ ...prev, businessPostcode: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="crm-business-country">Business country</label>
                <input id="crm-business-country" className="input" value={profileForm.businessCountry || ""} onChange={(e) => setProfileForm((prev) => ({ ...prev, businessCountry: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="crm-billing-contact-name">Billing contact</label>
                <input id="crm-billing-contact-name" className="input" value={profileForm.billingContactName || ""} onChange={(e) => setProfileForm((prev) => ({ ...prev, billingContactName: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="crm-billing-email">Billing email</label>
                <input id="crm-billing-email" className="input" type="email" value={profileForm.billingEmail || ""} onChange={(e) => setProfileForm((prev) => ({ ...prev, billingEmail: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="crm-billing-phone">Billing phone</label>
                <input id="crm-billing-phone" className="input" value={profileForm.billingPhone || ""} onChange={(e) => setProfileForm((prev) => ({ ...prev, billingPhone: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="crm-billing-mobile">Billing mobile</label>
                <input id="crm-billing-mobile" className="input" value={profileForm.billingMobile || ""} onChange={(e) => setProfileForm((prev) => ({ ...prev, billingMobile: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="crm-billing-address-1">Billing address 1</label>
                <input id="crm-billing-address-1" className="input" value={profileForm.billingAddressLine1 || ""} onChange={(e) => setProfileForm((prev) => ({ ...prev, billingAddressLine1: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="crm-billing-address-2">Billing address 2</label>
                <input id="crm-billing-address-2" className="input" value={profileForm.billingAddressLine2 || ""} onChange={(e) => setProfileForm((prev) => ({ ...prev, billingAddressLine2: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="crm-billing-city">Billing city</label>
                <input id="crm-billing-city" className="input" value={profileForm.billingCity || ""} onChange={(e) => updateProfileField("billingCity", e.target.value)} />
              </div>
              <div>
                <label htmlFor="crm-billing-postcode">Billing postcode</label>
                <input id="crm-billing-postcode" className="input" value={profileForm.billingPostcode || ""} onChange={(e) => setProfileForm((prev) => ({ ...prev, billingPostcode: e.target.value }))} />
              </div>
              <div>
                <label htmlFor="crm-billing-country">Billing country</label>
                <input id="crm-billing-country" className="input" value={profileForm.billingCountry || ""} onChange={(e) => setProfileForm((prev) => ({ ...prev, billingCountry: e.target.value }))} />
              </div>
            </div>
            <button
              className="button"
              type="button"
              onClick={saveProfile}
              disabled={profileSaving}
              data-testid="trade-account-save-button"
            >
              {profileSaving ? "Saving..." : "Save Business Profile"}
            </button>
          </EntitySection>

          <EntitySection title="Trade portal access" subtitle="Invite named billing contacts with a time-limited link. Access can be revoked at any time.">
            <div className="two-col">
              <label>
                <span>Portal contact email</span>
                <input className="input" type="email" value={portalInviteEmail} onChange={(event) => setPortalInviteEmail(event.target.value)} />
              </label>
              <div style={{ alignSelf: "end" }}>
                <button className="button" type="button" disabled={profileSaving || !portalInviteEmail.trim()} onClick={() => void invitePortalContact()}>
                  Send secure invite
                </button>
              </div>
            </div>
            <div className="operator-table" style={{ marginTop: 12 }}>
              {portalAccess.map((access) => (
                <div className="operator-table__row" key={access.id}>
                  <div className="operator-table__cell"><strong>{access.email}</strong></div>
                  <div className="operator-table__cell">{String(access.status).toLowerCase()}</div>
                  <div className="operator-table__cell">{access.lastAccessedAt ? `Last used ${formatDate(access.lastAccessedAt)}` : "Not used yet"}</div>
                  <div className="operator-table__cell">
                    {access.status !== "REVOKED" ? <button className="button secondary" type="button" onClick={() => void revokePortalAccess(access.id)}>Revoke</button> : null}
                  </div>
                </div>
              ))}
              {!portalAccess.length ? <p className="muted">No portal contacts invited yet.</p> : null}
            </div>
          </EntitySection>

          <EntitySection
            title="Locations"
            subtitle="Manage the business, service, and billing locations that downstream jobs, invoices, and portal documents inherit."
          >
            <div style={{ display: "grid", gap: 16 }}>
              {locationForm.map((location, index) => (
                <div key={location.id} className="crm-card">
                  <div className="crm-card-header">
                    <strong>{location.name || `Location ${index + 1}`}</strong>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() =>
                        setLocationForm((current) => (current.length > 1 ? current.filter((item) => item.id !== location.id) : current))
                      }
                      disabled={locationForm.length <= 1}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="two-col">
                    <div>
                      <label>Location name</label>
                      <input className="input" value={location.name} onChange={(e) => updateLocationRow(location.id, { name: e.target.value })} />
                    </div>
                    <div>
                      <label>Type</label>
                      <select className="input" value={location.kind} onChange={(e) => updateLocationRow(location.id, { kind: e.target.value as LocationState["kind"] })}>
                        <option value="BUSINESS">Business</option>
                        <option value="BILLING">Billing</option>
                        <option value="SERVICE">Service</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                    <div>
                      <label>Address line 1</label>
                      <input className="input" value={location.addressLine1} onChange={(e) => updateLocationRow(location.id, { addressLine1: e.target.value })} />
                    </div>
                    <div>
                      <label>Address line 2</label>
                      <input className="input" value={location.addressLine2} onChange={(e) => updateLocationRow(location.id, { addressLine2: e.target.value })} />
                    </div>
                    <div>
                      <label>City / town</label>
                      <input className="input" value={location.city} onChange={(e) => updateLocationRow(location.id, { city: e.target.value })} />
                    </div>
                    <div>
                      <label>Postcode</label>
                      <input className="input" value={location.postcode} onChange={(e) => updateLocationRow(location.id, { postcode: e.target.value })} />
                    </div>
                    <div>
                      <label>Country</label>
                      <input className="input" value={location.country} onChange={(e) => updateLocationRow(location.id, { country: e.target.value })} />
                    </div>
                  </div>
                  <div className="crm-toggle-row">
                    <label className="crm-toggle">
                      <input
                        type="checkbox"
                        checked={location.isPrimary}
                        onChange={(e) =>
                          setLocationForm((current) =>
                            current.map((item) => ({ ...item, isPrimary: item.id === location.id ? e.target.checked : e.target.checked ? false : item.isPrimary })),
                          )
                        }
                      />
                      Primary job/document address
                    </label>
                    <label className="crm-toggle">
                      <input
                        type="checkbox"
                        checked={location.isBilling}
                        onChange={(e) =>
                          setLocationForm((current) =>
                            current.map((item) => ({ ...item, isBilling: item.id === location.id ? e.target.checked : e.target.checked ? false : item.isBilling })),
                          )
                        }
                      />
                      Billing address
                    </label>
                    <label className="crm-toggle">
                      <input type="checkbox" checked={location.isActive} onChange={(e) => updateLocationRow(location.id, { isActive: e.target.checked })} />
                      Active
                    </label>
                  </div>
                </div>
              ))}
              <button className="button secondary" type="button" onClick={() => setLocationForm((current) => [...current, blankLocation()])}>
                Add Location
              </button>
            </div>
          </EntitySection>

          <EntitySection
            title="Contacts"
            subtitle="Manage multiple contacts and choose who receives job completion, invoice, WhatsApp, and update-call communications."
          >
            <div style={{ display: "grid", gap: 16 }}>
              {contactForm.map((contact, index) => (
                <div key={contact.id} className="crm-card">
                  <div className="crm-card-header">
                    <strong>{contact.name || `Contact ${index + 1}`}</strong>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() =>
                        setContactForm((current) => (current.length > 1 ? current.filter((item) => item.id !== contact.id) : current))
                      }
                      disabled={contactForm.length <= 1}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="two-col">
                    <div>
                      <label>Contact name</label>
                      <input className="input" value={contact.name} onChange={(e) => updateContactRow(contact.id, { name: e.target.value })} />
                    </div>
                    <div>
                      <label>Role label</label>
                      <input className="input" value={contact.roleLabel} onChange={(e) => updateContactRow(contact.id, { roleLabel: e.target.value })} placeholder="Operations, Accounts, Site lead..." />
                    </div>
                    <div>
                      <label>Email</label>
                      <input className="input" type="email" value={contact.email} onChange={(e) => updateContactRow(contact.id, { email: e.target.value })} />
                    </div>
                    <div>
                      <label>Phone</label>
                      <input className="input" value={contact.phone} onChange={(e) => updateContactRow(contact.id, { phone: e.target.value })} />
                    </div>
                    <div>
                      <label>Mobile</label>
                      <input className="input" value={contact.mobile} onChange={(e) => updateContactRow(contact.id, { mobile: e.target.value })} />
                    </div>
                    <div>
                      <label>Linked location</label>
                      <select className="input" value={contact.tradeAccountLocationId} onChange={(e) => updateContactRow(contact.id, { tradeAccountLocationId: e.target.value })}>
                        <option value="">Business-wide</option>
                        {activeLocationOptions.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name || "Unnamed location"}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="crm-toggle-row">
                    <label className="crm-toggle">
                      <input
                        type="checkbox"
                        checked={contact.isPrimary}
                        onChange={(e) =>
                          setContactForm((current) =>
                            current.map((item) => ({ ...item, isPrimary: item.id === contact.id ? e.target.checked : e.target.checked ? false : item.isPrimary })),
                          )
                        }
                      />
                      Primary customer contact
                    </label>
                    <label className="crm-toggle">
                      <input
                        type="checkbox"
                        checked={contact.isBilling}
                        onChange={(e) =>
                          setContactForm((current) =>
                            current.map((item) => ({ ...item, isBilling: item.id === contact.id ? e.target.checked : e.target.checked ? false : item.isBilling })),
                          )
                        }
                      />
                      Billing contact
                    </label>
                    <label className="crm-toggle">
                      <input type="checkbox" checked={contact.isActive} onChange={(e) => updateContactRow(contact.id, { isActive: e.target.checked })} />
                      Active
                    </label>
                  </div>
                  <div className="crm-pref-grid">
                    {contact.preferences.map((preference) => {
                      const key = `${preference.event}:${preference.channel}`;
                      const labelMap: Record<string, string> = {
                        "JOB_COMPLETION:EMAIL": "Job completion email",
                        "INVOICE:EMAIL": "Invoice email",
                        "UPDATE_CALL:PHONE": "Update call",
                        "GENERAL_NOTIFICATION:WHATSAPP": "WhatsApp notification",
                      };
                      return (
                        <label key={key} className="crm-toggle">
                          <input
                            type="checkbox"
                            checked={preference.enabled}
                            onChange={() => toggleContactPreference(contact.id, preference.event, preference.channel)}
                          />
                          {labelMap[key] || key}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
              <button className="button secondary" type="button" onClick={() => setContactForm((current) => [...current, blankContact()])}>
                Add Contact
              </button>
            </div>
          </EntitySection>

          {crmProEnabled ? (
            <EntitySection title="CRM Pro" subtitle="Profile header, financial summary, timeline, notes, tasks, attachments, tags, quick actions.">
              <div className="pill-row">
                {crmTags.map((tag: any) => (
                  <span className="badge" key={tag.id || tag.label}>
                    {tag.label || tag.name}
                  </span>
                ))}
                {crmTags.length === 0 ? <span className="muted">No tags</span> : null}
              </div>
              <p className="muted">Tasks: {crmTasks.length} | Notes: {crmNotes.length} | Attachments: {crmAttachments.length}</p>
            </EntitySection>
          ) : null}

          <EntitySection title="Quick Actions" subtitle="Common next steps for this trade account.">
            <div style={{ display: "grid", gap: 10 }}>
              <Link className="button secondary" href={bookingHref}>
                Create Booking
              </Link>
              {account.contactPhone || account.contactMobile ? (
                <button className="button secondary" type="button" onClick={() => openExternal(whatsappHref)}>
                  WhatsApp
                </button>
              ) : null}
              {account.contactEmail ? (
                <a className="button secondary" href={emailHref}>
                  Email
                </a>
              ) : null}
            </div>
          </EntitySection>

          <EntitySection title="Next Action" subtitle="Keep a reminder for the next outreach.">
            <label htmlFor="next-action-type">Type</label>
            <select
              id="next-action-type"
              className="input"
              value={nextActionType}
              onChange={(e) => setNextActionType(e.target.value as NextActionType | "")}
            >
              <option value="">None</option>
              <option value="CALL">Call</option>
              <option value="EMAIL">Email</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="FOLLOW_UP">Follow up</option>
              <option value="MEETING">Meeting</option>
            </select>
            <label htmlFor="next-action-date">Due date</label>
            <input
              id="next-action-date"
              className="input"
              type="date"
              value={nextActionDueAt}
              onChange={(e) => setNextActionDueAt(e.target.value)}
            />
            <label htmlFor="next-action-user">Assigned user id</label>
            <input
              id="next-action-user"
              className="input"
              value={nextActionUserId}
              onChange={(e) => setNextActionUserId(e.target.value)}
              placeholder="Optional user id"
            />
            <button className="button" type="button" onClick={saveNextAction}>
              Save Next Action
            </button>
          </EntitySection>

          <EntitySection title="Notes" subtitle="Use @name for mentions. Draft autosaves automatically.">
            <textarea
              className="input"
              rows={5}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a note..."
            />
            <p className="muted" style={{ marginTop: -8 }}>
              Draft: {draftState === "saving" ? "Saving..." : draftState === "saved" ? "Saved" : draftState === "error" ? "Save failed" : "Idle"}
            </p>
            {draftState === "error" ? (
              <p className="muted" style={{ marginTop: -8, color: "#b45309" }}>
                Draft save failed. Changes are kept locally until the connection recovers.
              </p>
            ) : null}
            <button className="button" type="button" onClick={addNote}>
              Add note
            </button>
          </EntitySection>
        </div>
        <div className="entity-rail">
          <OnboardingCoach
            actions={{
              booking_to_job: [{ label: "Create booking", href: bookingHref }],
            }}
          />
          {commsLoading && timelineItems.length === 0 ? (
            <LoadingState title="Loading timeline" description="Fetching CRM activity and communications." />
          ) : (
            <EntityTimeline
              timelineItems={timelineItems}
              emptyAction={{ label: "Create a job", href: `/dashboard/jobs/new?tradeAccountId=${id}` }}
            />
          )}
          {commsError ? (
            <p className="muted" style={{ marginTop: 8 }}>{commsError}</p>
          ) : null}
        </div>
      </div>
      <style jsx>{`
        .entity-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 320px;
          gap: 16px;
          align-items: start;
        }

        .entity-rail {
          position: sticky;
          top: 90px;
        }

        .crm-card {
          border: 1px solid rgba(148, 163, 184, 0.18);
          border-radius: 16px;
          padding: 16px;
          background: rgba(15, 23, 42, 0.28);
        }

        .crm-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .crm-toggle-row {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 12px;
        }

        .crm-toggle {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: rgba(226, 232, 240, 0.92);
          font-size: 0.95rem;
        }

        .crm-pref-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 10px;
          margin-top: 14px;
        }

        @media (max-width: 900px) {
          .entity-grid {
            grid-template-columns: 1fr;
          }

          .entity-rail {
            position: static;
          }
        }
      `}</style>
    </DashboardShell>
  );
}
