type AddressFields = {
  line1: string | null;
  line2: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  formatted: string | null;
};

type ContactFields = {
  name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  summary: string | null;
};

type TradeAccountLocationLike = {
  id?: string | null;
  name?: string | null;
  kind?: string | null;
  legacyAliasKey?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  postcode?: string | null;
  country?: string | null;
  isPrimary?: boolean | null;
  isBilling?: boolean | null;
  isActive?: boolean | null;
};

type TradeAccountContactPreferenceLike = {
  event?: string | null;
  channel?: string | null;
  enabled?: boolean | null;
};

type TradeAccountContactLike = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  roleLabel?: string | null;
  legacyAliasKey?: string | null;
  isPrimary?: boolean | null;
  isBilling?: boolean | null;
  isActive?: boolean | null;
  tradeAccountLocationId?: string | null;
  preferences?: TradeAccountContactPreferenceLike[] | null;
};

export type CustomerOutputDisplayRow = {
  label: string;
  value: string;
};

export type CustomerOutputPresentation = {
  displayName: string | null;
  accountLabel: string | null;
  businessDetails: CustomerOutputDisplayRow[];
  contactDetails: CustomerOutputDisplayRow[];
  billingDetails: CustomerOutputDisplayRow[];
};

export type CustomerOutputProfile = {
  customerName: string | null;
  businessName: string | null;
  invoiceNumber: string | null;
  vatNumber: string | null;
  companyNumber: string | null;
  businessAddress: AddressFields;
  billingAddress: AddressFields;
  primaryContact: ContactFields;
  secondaryContact: ContactFields;
  mergeFields: Record<string, string>;
};

function text(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return null;
}

function formatJoined(values: Array<string | null | undefined>, separator: string) {
  const parts = values.map((value) => text(value)).filter(Boolean) as string[];
  return parts.length ? parts.join(separator) : null;
}

function addressFromParts(parts: {
  line1?: unknown;
  line2?: unknown;
  city?: unknown;
  postcode?: unknown;
  country?: unknown;
}): AddressFields {
  const line1 = text(parts.line1);
  const line2 = text(parts.line2);
  const city = text(parts.city);
  const postcode = text(parts.postcode);
  const country = text(parts.country);
  return {
    line1,
    line2,
    city,
    postcode,
    country,
    formatted: formatJoined([line1, line2, city, postcode, country], ", "),
  };
}

function contactFromParts(parts: {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  mobile?: unknown;
}): ContactFields {
  const name = text(parts.name);
  const email = text(parts.email);
  const phone = text(parts.phone);
  const mobile = text(parts.mobile);
  return {
    name,
    email,
    phone,
    mobile,
    summary: formatJoined([name, email, phone, mobile], " | "),
  };
}

function addMergeField(target: Record<string, string>, key: string, value: string | null) {
  if (!value) return;
  target[key] = value;
}

function addDisplayRow(target: CustomerOutputDisplayRow[], label: string, value: string | null) {
  if (!value) return;
  target.push({ label, value });
}

function getActiveLocations(tradeAccount: Record<string, any>) {
  return (Array.isArray(tradeAccount?.locations) ? tradeAccount.locations : []).filter(
    (location: TradeAccountLocationLike) => location && location.isActive !== false,
  ) as TradeAccountLocationLike[];
}

function getActiveContacts(tradeAccount: Record<string, any>) {
  return (Array.isArray(tradeAccount?.contacts) ? tradeAccount.contacts : []).filter(
    (contact: TradeAccountContactLike) => contact && contact.isActive !== false,
  ) as TradeAccountContactLike[];
}

function hasPreference(contact: TradeAccountContactLike | null | undefined, event: string, channel: string) {
  return Boolean(
    (contact?.preferences || []).some(
      (preference) =>
        preference &&
        String(preference.event || "").toUpperCase() === event &&
        String(preference.channel || "").toUpperCase() === channel &&
        preference.enabled !== false,
    ),
  );
}

function pickLocation(
  locations: TradeAccountLocationLike[],
  options: {
    alias?: string;
    kind?: string;
    billing?: boolean;
    primary?: boolean;
  },
) {
  return (
    locations.find((location) => options.alias && String(location.legacyAliasKey || "").toUpperCase() === options.alias) ||
    locations.find((location) => options.billing && location.isBilling) ||
    locations.find((location) => options.primary && location.isPrimary) ||
    locations.find((location) => options.kind && String(location.kind || "").toUpperCase() === options.kind) ||
    null
  );
}

function pickContact(
  contacts: TradeAccountContactLike[],
  options: {
    alias?: string;
    primary?: boolean;
    billing?: boolean;
    event?: string;
    channel?: string;
    requireEmail?: boolean;
    requirePhone?: boolean;
    excludeIds?: string[];
  },
) {
  const filtered = contacts.filter((contact) => !options.excludeIds?.includes(String(contact.id || "")));
  return (
    filtered.find((contact) => options.alias && String(contact.legacyAliasKey || "").toUpperCase() === options.alias) ||
    filtered.find((contact) => options.event && options.channel && hasPreference(contact, options.event, options.channel)) ||
    filtered.find((contact) => options.billing && contact.isBilling) ||
    filtered.find((contact) => options.primary && contact.isPrimary) ||
    filtered.find((contact) => options.requireEmail && text(contact.email)) ||
    filtered.find((contact) => options.requirePhone && (text(contact.phone) || text(contact.mobile))) ||
    filtered[0] ||
    null
  );
}

function resolveTradeAccountSelections(tradeAccount: Record<string, any>) {
  const locations = getActiveLocations(tradeAccount);
  const contacts = getActiveContacts(tradeAccount);
  const businessLocation =
    pickLocation(locations, { alias: "PRIMARY_BUSINESS", primary: true, kind: "BUSINESS" }) ||
    pickLocation(locations, { kind: "SERVICE" });
  const billingLocation =
    pickLocation(locations, { alias: "BILLING_LOCATION", billing: true, kind: "BILLING" }) ||
    businessLocation;
  const primaryContact =
    pickContact(contacts, { alias: "PRIMARY_CONTACT", event: "JOB_COMPLETION", channel: "EMAIL", primary: true }) ||
    pickContact(contacts, { event: "GENERAL_NOTIFICATION", channel: "WHATSAPP", primary: true });
  const billingContact =
    pickContact(contacts, {
      alias: "BILLING_CONTACT",
      event: "INVOICE",
      channel: "EMAIL",
      billing: true,
      requireEmail: true,
    }) || primaryContact;
  const secondaryContact = pickContact(contacts, {
    alias: "SECONDARY_CONTACT",
    excludeIds: [String(primaryContact?.id || ""), String(billingContact?.id || "")],
  });
  const updateCallContact =
    pickContact(contacts, { event: "UPDATE_CALL", channel: "PHONE", requirePhone: true }) ||
    primaryContact ||
    billingContact;
  return {
    businessLocation,
    billingLocation,
    primaryContact,
    billingContact,
    secondaryContact,
    updateCallContact,
  };
}

// Guardrail: runtime customer-facing output should resolve business/contact fields
// through this shared helper rather than reassembling fallbacks in controllers/pages.
export function resolveCustomerOutputFields(input: {
  job?: Record<string, any> | null;
  tradeAccount?: Record<string, any> | null;
  customer?: Record<string, any> | null;
  formData?: Record<string, any> | null;
}): CustomerOutputProfile {
  const job = input.job || {};
  const tradeAccount = input.tradeAccount || {};
  const customer = input.customer || {};
  const formData = input.formData || {};
  const selected = resolveTradeAccountSelections(tradeAccount);

  const customerName = firstText(job.customerName, customer.name, formData.customerName, formData.customerTradeName, tradeAccount.name);
  const businessName = firstText(
    formData.tradeName,
    formData.customerTradeName,
    tradeAccount.name,
    job.customerName,
    customer.name,
    formData.customerName,
  );
  const invoiceNumber = firstText(job.invoiceNumber, formData.invoiceNumber);
  const vatNumber = firstText(formData.vatNumber, tradeAccount.vatNumber);
  const companyNumber = firstText(formData.companyNumber, tradeAccount.companyNumber);

  const businessAddress = addressFromParts({
    line1: firstText(formData.addressLine1, selected.businessLocation?.addressLine1, tradeAccount.businessAddressLine1),
    line2: firstText(formData.addressLine2, selected.businessLocation?.addressLine2, tradeAccount.businessAddressLine2),
    city: firstText(formData.town, formData.city, selected.businessLocation?.city, tradeAccount.businessCity),
    postcode: firstText(formData.postcode, selected.businessLocation?.postcode, tradeAccount.businessPostcode),
    country: firstText(formData.country, selected.businessLocation?.country, tradeAccount.businessCountry),
  });

  const billingAddress = addressFromParts({
    line1: firstText(formData.billingAddressLine1, selected.billingLocation?.addressLine1, tradeAccount.billingAddressLine1),
    line2: firstText(formData.billingAddressLine2, selected.billingLocation?.addressLine2, tradeAccount.billingAddressLine2),
    city: firstText(formData.billingCity, selected.billingLocation?.city, tradeAccount.billingCity),
    postcode: firstText(formData.billingPostcode, selected.billingLocation?.postcode, tradeAccount.billingPostcode),
    country: firstText(formData.billingCountry, selected.billingLocation?.country, tradeAccount.billingCountry),
  });

  const primaryContact = contactFromParts({
    name: firstText(formData.tradeContactName, selected.primaryContact?.name, tradeAccount.contactName),
    email: firstText(
      job.customerEmail,
      formData.customerEmail,
      selected.primaryContact?.email,
      selected.billingContact?.email,
      tradeAccount.contactEmail,
      tradeAccount.billingEmail,
      customer.email,
    ),
    phone: firstText(
      job.customerPhone,
      formData.customerPhone,
      selected.updateCallContact?.phone,
      selected.primaryContact?.phone,
      customer.phone,
      tradeAccount.contactPhone,
      tradeAccount.billingPhone,
    ),
    mobile: firstText(
      formData.contactMobile,
      selected.updateCallContact?.mobile,
      selected.primaryContact?.mobile,
      tradeAccount.contactMobile,
      tradeAccount.billingMobile,
    ),
  });

  const secondaryContact = contactFromParts({
    name: firstText(formData.secondaryContactName, selected.secondaryContact?.name, tradeAccount.secondaryContactName),
    email: firstText(formData.secondaryContactEmail, selected.secondaryContact?.email, tradeAccount.secondaryContactEmail),
    phone: firstText(formData.secondaryContactPhone, selected.secondaryContact?.phone, tradeAccount.secondaryContactPhone),
    mobile: firstText(formData.secondaryContactMobile, selected.secondaryContact?.mobile, tradeAccount.secondaryContactMobile),
  });

  const billingContactName = firstText(formData.billingContactName, selected.billingContact?.name, tradeAccount.billingContactName);
  const billingEmail = firstText(formData.billingEmail, selected.billingContact?.email, tradeAccount.billingEmail);
  const billingPhone = firstText(formData.billingPhone, selected.billingContact?.phone, tradeAccount.billingPhone);
  const billingMobile = firstText(formData.billingMobile, selected.billingContact?.mobile, tradeAccount.billingMobile);

  const mergeFields: Record<string, string> = {};
  addMergeField(mergeFields, "customerName", customerName);
  addMergeField(mergeFields, "businessName", businessName);
  addMergeField(mergeFields, "tradeName", businessName);
  addMergeField(mergeFields, "customerTradeName", businessName);
  addMergeField(mergeFields, "invoiceNumber", invoiceNumber);
  addMergeField(mergeFields, "vatNumber", vatNumber);
  addMergeField(mergeFields, "companyNumber", companyNumber);

  addMergeField(mergeFields, "tradeContactName", primaryContact.name);
  addMergeField(mergeFields, "contactName", primaryContact.name);
  addMergeField(mergeFields, "primaryContactName", primaryContact.name);
  addMergeField(mergeFields, "customerEmail", primaryContact.email);
  addMergeField(mergeFields, "contactEmail", primaryContact.email);
  addMergeField(mergeFields, "primaryContactEmail", primaryContact.email);
  addMergeField(mergeFields, "customerPhone", primaryContact.phone);
  addMergeField(mergeFields, "contactPhone", primaryContact.phone);
  addMergeField(mergeFields, "primaryContactPhone", primaryContact.phone);
  addMergeField(mergeFields, "contactMobile", primaryContact.mobile);
  addMergeField(mergeFields, "primaryContactMobile", primaryContact.mobile);
  addMergeField(mergeFields, "primaryContactSummary", primaryContact.summary);

  addMergeField(mergeFields, "secondaryContactName", secondaryContact.name);
  addMergeField(mergeFields, "secondaryContactEmail", secondaryContact.email);
  addMergeField(mergeFields, "secondaryContactPhone", secondaryContact.phone);
  addMergeField(mergeFields, "secondaryContactMobile", secondaryContact.mobile);
  addMergeField(mergeFields, "secondaryContactSummary", secondaryContact.summary);

  addMergeField(mergeFields, "addressLine1", businessAddress.line1);
  addMergeField(mergeFields, "businessAddressLine1", businessAddress.line1);
  addMergeField(mergeFields, "addressLine2", businessAddress.line2);
  addMergeField(mergeFields, "businessAddressLine2", businessAddress.line2);
  addMergeField(mergeFields, "town", businessAddress.city);
  addMergeField(mergeFields, "city", businessAddress.city);
  addMergeField(mergeFields, "businessCity", businessAddress.city);
  addMergeField(mergeFields, "postcode", businessAddress.postcode);
  addMergeField(mergeFields, "businessPostcode", businessAddress.postcode);
  addMergeField(mergeFields, "country", businessAddress.country);
  addMergeField(mergeFields, "businessCountry", businessAddress.country);
  addMergeField(mergeFields, "businessAddress", businessAddress.formatted);

  addMergeField(mergeFields, "billingContactName", billingContactName);
  addMergeField(mergeFields, "billingEmail", billingEmail);
  addMergeField(mergeFields, "billingPhone", billingPhone);
  addMergeField(mergeFields, "billingMobile", billingMobile);
  addMergeField(mergeFields, "billingAddressLine1", billingAddress.line1);
  addMergeField(mergeFields, "billingAddressLine2", billingAddress.line2);
  addMergeField(mergeFields, "billingCity", billingAddress.city);
  addMergeField(mergeFields, "billingPostcode", billingAddress.postcode);
  addMergeField(mergeFields, "billingCountry", billingAddress.country);
  addMergeField(mergeFields, "billingAddress", billingAddress.formatted);

  return {
    customerName,
    businessName,
    invoiceNumber,
    vatNumber,
    companyNumber,
    businessAddress,
    billingAddress,
    primaryContact,
    secondaryContact,
    mergeFields,
  };
}

export function buildCustomerOutputPresentation(profile: CustomerOutputProfile): CustomerOutputPresentation {
  const businessDetails: CustomerOutputDisplayRow[] = [];
  const contactDetails: CustomerOutputDisplayRow[] = [];
  const billingDetails: CustomerOutputDisplayRow[] = [];
  const identifiers = [profile.vatNumber ? `VAT ${profile.vatNumber}` : null, profile.companyNumber ? `Company ${profile.companyNumber}` : null]
    .filter(Boolean)
    .join(" • ") || null;

  addDisplayRow(businessDetails, "Customer", profile.customerName);
  if (profile.businessName && profile.businessName !== profile.customerName) {
    addDisplayRow(businessDetails, "Business", profile.businessName);
  }
  addDisplayRow(businessDetails, "Business IDs", identifiers);
  addDisplayRow(businessDetails, "Business address", profile.businessAddress.formatted);
  addDisplayRow(businessDetails, "Invoice number", profile.invoiceNumber);

  addDisplayRow(contactDetails, "Primary contact", profile.primaryContact.summary);
  addDisplayRow(contactDetails, "Secondary contact", profile.secondaryContact.summary);

  addDisplayRow(billingDetails, "Billing contact", profile.mergeFields.billingContactName || null);
  addDisplayRow(
    billingDetails,
    "Billing channels",
    formatJoined(
      [
        profile.mergeFields.billingEmail || null,
        profile.mergeFields.billingPhone || null,
        profile.mergeFields.billingMobile || null,
      ],
      " | ",
    ),
  );
  addDisplayRow(billingDetails, "Billing address", profile.billingAddress.formatted);

  return {
    displayName: profile.businessName || profile.customerName,
    accountLabel: profile.businessName && profile.customerName && profile.businessName !== profile.customerName ? profile.customerName : null,
    businessDetails,
    contactDetails,
    billingDetails,
  };
}
