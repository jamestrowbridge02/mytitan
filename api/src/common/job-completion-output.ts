type CompletionOverviewInput = {
  job: any;
  formData?: Record<string, any> | null;
  workspaceName?: string | null;
  apiPublicUrl?: string | null;
  appPublicUrl?: string | null;
};

type CompletionOverview = {
  workspaceName: string;
  jobRef: string;
  customerName: string;
  completedDate: string | null;
  vehicleSummary: string | null;
  serviceSummary: string | null;
  paymentStatusLabel: string | null;
  paymentMethodLabel: string | null;
  paymentAmountLabel: string | null;
  portalUrl: string | null;
  pdfUrl: string | null;
};

function extractPublicJobToken(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/\/(?:portal\/job|public\/job)\/([^/?#]+)(?:\/pdf)?(?:[?#].*)?$/i);
  return match ? String(match[1] || "").trim() : "";
}

export type ServiceRecordEmailPolicy = {
  includeBusinessDetails: boolean;
  includeContactDetails: boolean;
  includeBillingDetails: boolean;
  includePaymentSummary: boolean;
  includeEvidenceSummary: boolean;
  includeSignatureSummary: boolean;
  includePortalLink: boolean;
  includePdfLink: boolean;
  signatureEnabled: boolean;
  signatureText?: string | null;
};

type ServiceRecordRow = {
  label: string;
  value: string;
};

export type ServiceRecordSection = {
  key: string;
  title: string;
  rows: ServiceRecordRow[];
};

export type ServiceRecordLinkCard = {
  label: string;
  caption: string;
  href: string;
  badge: string;
  variant?: 'primary' | 'preview';
};

export type ServiceRecordLinkGroup = {
  key: string;
  title: string;
  cards: ServiceRecordLinkCard[];
};

export type ServiceRecordEmailContent = {
  subject: string;
  sections: ServiceRecordSection[];
  lines: string[];
  includedSectionKeys: string[];
  primaryActions: Array<{ label: string; href: string }>;
  linkGroups: ServiceRecordLinkGroup[];
  footerNote: string | null;
};

function firstText(...values: Array<unknown>) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function joinNonEmpty(values: Array<unknown>, separator: string) {
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(separator);
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function formatMoney(amountCents: unknown, currency: unknown) {
  const cents = Number(amountCents || 0);
  const code = String(currency || "").trim().toUpperCase();
  if (!Number.isFinite(cents) || !code) return null;
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: code,
    }).format(cents / 100);
  } catch {
    return `${code} ${(cents / 100).toFixed(2)}`;
  }
}

function humanizePaymentStatus(value: unknown) {
  const status = String(value || "").trim().toUpperCase();
  if (!status) return null;
  if (status === "PAID") return "Paid";
  if (status === "PART_PAID") return "Part paid";
  if (status === "UNPAID") return "Payment pending";
  return status
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function humanizePaymentMethod(value: unknown) {
  const method = String(value || "").trim().toUpperCase();
  if (!method) return null;
  if (method === "STRIPE_LINK" || method === "CARD") return "Card";
  if (method === "BANK_TRANSFER") return "Bank transfer";
  if (method === "CASH") return "Cash";
  return method
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildJobCompletionOverview(input: CompletionOverviewInput): CompletionOverview {
  const formData = input.formData || {};
  const apiPublic = String(input.apiPublicUrl || "").trim().replace(/\/$/, "");
  const appPublic = String(input.appPublicUrl || "").trim().replace(/\/$/, "");
  const invoicePdfUrl = String(input.job?.invoicePdfUrl || "").trim();
  const completionLink = firstText(input.job?.whatsappCompletionLink, formData.whatsappCompletionLink);
  const publicJobToken = extractPublicJobToken(invoicePdfUrl) || extractPublicJobToken(completionLink);
  const portalPath = publicJobToken ? `/portal/job/${publicJobToken}` : "";
  const pdfPath = publicJobToken ? `/public/job/${publicJobToken}/pdf` : "";
  const portalUrl = publicJobToken
    ? (appPublic ? `${appPublic}${portalPath}` : portalPath)
    : completionLink || null;
  const pdfUrl = publicJobToken
    ? (apiPublic ? `${apiPublic}${pdfPath}` : pdfPath)
    : invoicePdfUrl
      ? (invoicePdfUrl.startsWith("http") ? invoicePdfUrl : `${apiPublic}${invoicePdfUrl}` || invoicePdfUrl)
      : null;

  return {
    workspaceName: firstText(input.workspaceName, input.job?.company?.name, "MyTitan"),
    jobRef: firstText(input.job?.jobRef, input.job?.id, "Job"),
    customerName: firstText(input.job?.customerName, formData.customerTradeName, formData.customerName, "Customer"),
    completedDate: formatDate(formData.completedDate || formData.jobCompletedDate || input.job?.completedAt),
    vehicleSummary:
      joinNonEmpty(
        [
          input.job?.vehicleMake || formData.vehicleMake,
          input.job?.vehicleModel || formData.vehicleModel,
          formData.vehicleColour,
          input.job?.vehicleReg || formData.registration || formData.vehicleReg,
        ],
        " ",
      ) || null,
    serviceSummary:
      ((Array.isArray(formData.serviceTypes)
        ? formData.serviceTypes
        : Array.isArray(formData.services)
          ? formData.services
          : [])
        .map((value: unknown) => String(value || "").trim())
        .filter(Boolean)
        .join(", ")
        ||
        firstText(input.job?.serviceName, formData.serviceName, formData.serviceTypeName)) || null,
    paymentStatusLabel: humanizePaymentStatus(formData.paymentStatus || (input.job?.invoicePaidAt ? "PAID" : input.job?.invoiceIssuedAt ? "UNPAID" : "")),
    paymentMethodLabel: humanizePaymentMethod(formData.paymentMethod),
    paymentAmountLabel: formatMoney(input.job?.totalCents, input.job?.currency || formData.currency),
    portalUrl,
    pdfUrl,
  };
}

export function buildJobCompletionEmailLines(overview: CompletionOverview) {
  const lines = [
    `Service record ready for ${overview.customerName}.`,
    `Job reference: ${overview.jobRef}`,
  ];
  if (overview.completedDate) lines.push(`Completed: ${overview.completedDate}`);
  if (overview.serviceSummary) lines.push(`Service: ${overview.serviceSummary}`);
  if (overview.vehicleSummary) lines.push(`Vehicle: ${overview.vehicleSummary}`);
  if (overview.paymentAmountLabel) {
    const paymentLine = [
      overview.paymentStatusLabel || "Payment status pending",
      overview.paymentAmountLabel,
      overview.paymentMethodLabel ? `via ${overview.paymentMethodLabel}` : null,
    ]
      .filter(Boolean)
      .join(" • ");
    lines.push(`Payment: ${paymentLine}`);
  } else if (overview.paymentStatusLabel) {
    lines.push(`Payment: ${overview.paymentStatusLabel}`);
  }
  if (overview.portalUrl || overview.pdfUrl) {
    lines.push("Customer documents are ready to view below.");
  }
  if (overview.portalUrl) lines.push(`Customer portal: ${overview.portalUrl}`);
  if (overview.pdfUrl) lines.push(`Service record PDF: ${overview.pdfUrl}`);
  return lines;
}

function normalizeRows(rows: Array<{ label?: unknown; value?: unknown }> = []) {
  return rows
    .map((row) => ({
      label: String(row?.label || "").trim(),
      value: String(row?.value || "").trim(),
    }))
    .filter((row) => row.label && row.value);
}

function addSection(target: ServiceRecordSection[], key: string, title: string, rows: ServiceRecordRow[]) {
  if (rows.length === 0) return;
  target.push({ key, title, rows });
}

function buildLinkGroups(
  overview: CompletionOverview,
  evidenceRows: ServiceRecordRow[],
  signatureRows: ServiceRecordRow[],
  options: { includePortalLink: boolean; includePdfLink: boolean },
): ServiceRecordLinkGroup[] {
  const groups: ServiceRecordLinkGroup[] = [];
  const accessCards: ServiceRecordLinkCard[] = [];
  if (options.includePortalLink && overview.portalUrl) {
    accessCards.push({
      label: 'Open your customer portal',
      caption: 'Review the completed work, published files, approvals, and payment follow-up in one secure place.',
      href: overview.portalUrl,
      badge: 'PORTAL',
    });
  }
  if (options.includePdfLink && overview.pdfUrl) {
    accessCards.push({
      label: 'Download your service record PDF',
      caption: 'Open the signed, customer-safe PDF published from this completed job.',
      href: overview.pdfUrl,
      badge: 'PDF',
    });
  }
  if (accessCards.length > 0) {
    groups.push({ key: 'access_links', title: 'Documents and access', cards: accessCards });
  }

  if (options.includePortalLink && overview.portalUrl) {
    const previewCards: ServiceRecordLinkCard[] = [];
    for (const row of evidenceRows) {
      previewCards.push({
        label: row.label,
        caption: row.value,
        href: overview.portalUrl,
        badge: row.label.toUpperCase().includes('PHOTO') ? 'PHOTO' : 'PROOF',
        variant: 'preview',
      });
    }
    if (previewCards.length > 0) {
      groups.push({ key: 'evidence_links', title: 'Photos and completion proof', cards: previewCards });
    }

    const signatureCards = signatureRows
      .filter((row) => /signature/i.test(row.label))
      .map<ServiceRecordLinkCard>((row) => ({
        label: row.label,
        caption: row.value,
        href: overview.portalUrl as string,
        badge: 'SIGN',
        variant: 'preview',
      }));
    if (signatureCards.length > 0) {
      groups.push({ key: 'signature_links', title: 'Signatures', cards: signatureCards });
    }
  }

  return groups;
}

export function buildServiceRecordEmailContent(input: {
  overview: CompletionOverview;
  workspaceName?: string | null;
  customerPresentation?: {
    businessDetails?: Array<{ label?: unknown; value?: unknown }> | null;
    contactDetails?: Array<{ label?: unknown; value?: unknown }> | null;
    billingDetails?: Array<{ label?: unknown; value?: unknown }> | null;
  } | null;
  serviceSummaryRows?: Array<{ label?: unknown; value?: unknown }> | null;
  evidenceSummaryRows?: Array<{ label?: unknown; value?: unknown }> | null;
  signatureSummaryRows?: Array<{ label?: unknown; value?: unknown }> | null;
  feedbackRequest?: {
    enabled?: boolean;
    promptText?: string | null;
    publicReviewUrl?: string | null;
    thankYouText?: string | null;
  } | null;
  policy: ServiceRecordEmailPolicy;
}): ServiceRecordEmailContent {
  const sections: ServiceRecordSection[] = [];
  const completionRows: ServiceRecordRow[] = [];
  const overview = input.overview;
  const workspaceName = String(input.workspaceName || overview.workspaceName || "MyTitan").trim();
  const evidenceRows = normalizeRows(input.evidenceSummaryRows || []);
  const signatureRows = normalizeRows(input.signatureSummaryRows || []);
  const documentRows = normalizeRows([
    { label: "Document", value: "Customer service record" },
    { label: "Prepared by", value: workspaceName },
    { label: "Job reference", value: overview.jobRef },
    ...(overview.completedDate ? [{ label: "Completed", value: overview.completedDate }] : []),
  ]);

  if (input.policy.includePaymentSummary) {
    const paymentValue = [
      overview.paymentStatusLabel,
      overview.paymentAmountLabel,
      overview.paymentMethodLabel ? `via ${overview.paymentMethodLabel}` : null,
    ]
      .filter(Boolean)
      .join(" • ");
    if (paymentValue) {
      completionRows.push({ label: "Payment", value: paymentValue });
    }
  }
  if (input.policy.includePortalLink && overview.portalUrl) {
    completionRows.push({ label: "Customer portal", value: overview.portalUrl });
  }
  if (input.policy.includePdfLink && overview.pdfUrl) {
    completionRows.push({ label: "Service record PDF", value: overview.pdfUrl });
  }

  addSection(sections, "document_summary", "Document summary", documentRows);
  if (input.policy.includeBusinessDetails) {
    addSection(sections, "business_details", "Business details", normalizeRows(input.customerPresentation?.businessDetails || []));
  }
  if (input.policy.includeContactDetails) {
    addSection(sections, "contact_details", "Contact details", normalizeRows(input.customerPresentation?.contactDetails || []));
  }
  if (input.policy.includeBillingDetails) {
    addSection(sections, "billing_details", "Billing details", normalizeRows(input.customerPresentation?.billingDetails || []));
  }
  addSection(sections, "service_summary", "Service summary", normalizeRows(input.serviceSummaryRows || []));
  addSection(sections, "completion_summary", "Completion summary", completionRows);
  if (input.policy.includeEvidenceSummary) {
    addSection(sections, "evidence_summary", "Evidence summary", evidenceRows);
  }
  if (input.policy.includeSignatureSummary) {
    addSection(sections, "signatures", "Signatures", signatureRows);
  }
  if (input.feedbackRequest?.enabled && (input.feedbackRequest.promptText || input.feedbackRequest.publicReviewUrl)) {
    addSection(sections, "feedback_request", "Feedback", normalizeRows([
      ...(input.feedbackRequest.promptText ? [{ label: "Request", value: input.feedbackRequest.promptText }] : []),
      ...(input.feedbackRequest.publicReviewUrl ? [{ label: "Leave feedback", value: input.feedbackRequest.publicReviewUrl }] : []),
    ]));
  }

  const lines: string[] = [
    `Your completed service record from ${workspaceName} is ready.`,
    `Job reference: ${overview.jobRef}`,
    "",
  ];
  const primaryActions = [
    ...(input.policy.includePortalLink && overview.portalUrl ? [{ label: 'Open customer portal', href: overview.portalUrl }] : []),
    ...(input.policy.includePdfLink && overview.pdfUrl ? [{ label: 'Download service record PDF', href: overview.pdfUrl }] : []),
  ];
  if (primaryActions.length > 0) {
    lines.push('Available online');
    for (const action of primaryActions) {
      lines.push(`${action.label}: ${action.href}`);
    }
    lines.push('');
  }
  const linkGroups = buildLinkGroups(overview, evidenceRows, signatureRows, {
    includePortalLink: input.policy.includePortalLink,
    includePdfLink: input.policy.includePdfLink,
  });
  for (const group of linkGroups) {
    if (group.key === 'access_links') continue;
    lines.push(group.title);
    for (const card of group.cards) {
      lines.push(`${card.label}: ${card.caption}`);
      lines.push(`View online: ${card.href}`);
    }
    lines.push('');
  }
  for (const section of sections) {
    lines.push(section.title);
    for (const row of section.rows) {
      lines.push(`${row.label}: ${row.value}`);
    }
    lines.push("");
  }
  if (input.feedbackRequest?.enabled && (input.feedbackRequest.promptText || input.feedbackRequest.publicReviewUrl)) {
    lines.push("Feedback");
    if (input.feedbackRequest.promptText) {
      lines.push(String(input.feedbackRequest.promptText));
    }
    if (input.feedbackRequest.publicReviewUrl) {
      lines.push(`Leave feedback: ${input.feedbackRequest.publicReviewUrl}`);
    }
    if (input.feedbackRequest.thankYouText) {
      lines.push(String(input.feedbackRequest.thankYouText));
    }
    lines.push("");
  }
  if (input.policy.signatureEnabled && String(input.policy.signatureText || "").trim()) {
    lines.push("Message from the team");
    lines.push(String(input.policy.signatureText || "").trim());
  }
  const footerNote = input.policy.signatureEnabled && String(input.policy.signatureText || "").trim()
    ? String(input.policy.signatureText || "").trim()
    : null;

  return {
    subject: `Your service record is ready: ${overview.jobRef}`,
    sections,
    lines: lines.filter((line, index, all) => !(line === "" && all[index - 1] === "")),
    includedSectionKeys: sections.map((section) => section.key),
    primaryActions,
    linkGroups,
    footerNote,
  };
}
