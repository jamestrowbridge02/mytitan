import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { EntityCustomFieldsCard } from "../../components/custom-fields/EntityCustomFieldsCard";
import { DashboardShell } from "../../components/dashboard-shell";
import { OperatorActionTile } from "../../components/ui/operator-insights";
import {
  OperatorActiveFilters,
  OperatorBulkBar,
  OperatorDataTable,
  OperatorDataTableHeader,
  OperatorDataTableRow,
  OperatorEmptyStateCard,
  OperatorFilterBar,
  OperatorFilterField,
  OperatorGuidance,
  OperatorPageHeader,
  OperatorRowActions,
  OperatorSavedViews,
} from "../../components/ui/operator-page";
import { apiFetch } from "../../lib/api";
import { getBusinessTerms, getCommandCentreHref } from "../../lib/business-config";
import type { CustomFieldValue } from "../../lib/custom-fields";
import { useStickyOperatorView } from "../../lib/operator-view-state";
import { useTenantSettings } from "../../lib/tenant-settings";

type CustomerRow = {
  id: string;
  slug?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  jobCount?: number;
  activityCount?: number;
};

type ContactFilter = "all" | "email" | "phone" | "missing";
type ActivityFilter = "all" | "active" | "quiet";
type CustomerSavedView = "all" | "ready-for-work" | "needs-follow-up" | "recent-activity" | "missing-contact";

function getTimelineHref(customer: CustomerRow) {
  return `/dashboard/customers/${encodeURIComponent(customer.slug || customer.id)}?name=${encodeURIComponent(customer.name)}`;
}

function buildCustomerJobHref(customer: CustomerRow) {
  const params = new URLSearchParams({
    guided: "1",
    entry: "work",
    customerName: customer.name || "",
  });
  if (customer.email) params.set("customerEmail", customer.email);
  if (customer.phone) params.set("customerPhone", customer.phone);
  return `/dashboard/jobs/new?${params.toString()}`;
}

function describeCustomerOperatorState(customer: CustomerRow) {
  const hasContact = Boolean(customer.email || customer.phone);
  const activityCount = Number(customer.activityCount || 0);
  const jobCount = Number(customer.jobCount || 0);

  if (!hasContact) {
    return {
      label: "Needs contact detail",
      summary: "Add an email or phone number before the next customer follow-up.",
      actionLabel: "Open contact",
    };
  }

  if (jobCount > 0 && activityCount === 0) {
    return {
      label: "Needs follow-up",
      summary: "Work exists, but no customer update is logged yet.",
      actionLabel: "Open timeline",
    };
  }

  if (activityCount > 0) {
    return {
      label: "Active relationship",
      summary: "Recent updates are logged, so the next reply is easy to place.",
      actionLabel: "Open timeline",
    };
  }

  if (jobCount > 0) {
    return {
      label: "Work linked",
      summary: "Contact details are ready and work is already attached.",
      actionLabel: "Open timeline",
    };
  }

  return {
    label: "Ready for first job",
    summary: "Contact details are in place, so you can move straight into the first job.",
    actionLabel: "Create job",
  };
}

export default function CustomersPage() {
  const router = useRouter();
  const { settings } = useTenantSettings();
  const terms = getBusinessTerms(settings);
  const commandCentreHref = getCommandCentreHref(settings);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [contactFilter, setContactFilter] = useState<ContactFilter>("all");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [savedView, setSavedView] = useStickyOperatorView<CustomerSavedView>("mytitan_customers_saved_view_v1", "all");
  const [customFieldValues, setCustomFieldValues] = useState<CustomFieldValue[]>([]);
  const [customFieldCustomerId, setCustomFieldCustomerId] = useState<string | null>(null);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [contactCompanyName, setContactCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactMobile, setContactMobile] = useState("");
  const [contactSaving, setContactSaving] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.compose === "add-contact") {
      setAddContactOpen(true);
    }
  }, [router.isReady, router.query.compose]);

  useEffect(() => {
    const load = async () => {
      try {
        const rows = await apiFetch("/customers?limit=100");
        setCustomers(Array.isArray(rows) ? rows : []);
        setError("");
      } catch (err: any) {
        setError("We couldn't load customers right now. Try again in a moment.");
        setCustomers([]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    async function loadCustomFieldValues() {
      if (!customers.length) {
        setCustomFieldValues([]);
        return;
      }
      try {
        const valueRows = await apiFetch(`/custom-fields/values?entityType=customer&entityIds=${encodeURIComponent(customers.map((customer) => customer.id).join(","))}`);
        setCustomFieldValues(Array.isArray(valueRows?.values) ? valueRows.values : []);
      } catch {
        setCustomFieldValues([]);
      }
    }
    void loadCustomFieldValues();
  }, [customers]);

  function pushNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 1800);
  }

  async function createMessageEvent(customer: CustomerRow, kind: "sms.sent" | "email.sent" | "portal.viewed") {
    try {
      const label =
        kind === "sms.sent"
          ? `SMS sent to ${customer.name}`
          : kind === "email.sent"
            ? `Email sent to ${customer.name}`
            : `${customer.name} opened the customer portal`;

      await apiFetch("/activity/events", {
        method: "POST",
        body: JSON.stringify({
          type: kind,
          label,
          customerId: customer.id,
          customerName: customer.name,
          payloadJson: { customerId: customer.id, channel: kind },
        }),
      });

      pushNotice(label);
    } catch {
      pushNotice("Could not log the customer update. Try again from the timeline.");
    }
  }

  async function sendQuickCommunication(customer: CustomerRow, channel: "sms" | "email") {
    try {
      const message =
        channel === "sms"
          ? `Hi ${customer.name}, your update is ready.`
          : `Hello ${customer.name}, your latest update is ready.`;

      const subject = channel === "email" ? "Customer update" : null;

      const res = await apiFetch("/activity/communications/send", {
        method: "POST",
        body: JSON.stringify({
          channel,
          customerId: customer.id,
          customerName: customer.name,
          subject,
          message,
        }),
      });

      pushNotice(res?.label || `${channel.toUpperCase()} sent. Check the timeline for delivery status.`);
    } catch {
      pushNotice(`Could not send ${channel.toUpperCase()}. Try again from the customer record.`);
    }
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      pushNotice(`${label} copied. Paste it into the next step.`);
    } catch {
      pushNotice(`Could not copy ${label.toLowerCase()}`);
    }
  }

  async function addContact() {
    setContactSaving(true);
    try {
      const recordName = contactCompanyName.trim() || contactName.trim() || contactEmail.trim() || contactPhone.trim() || contactMobile.trim();
      if (!recordName) {
        pushNotice("Add at least one contact detail before saving.");
        return;
      }
      const created = await apiFetch("/trade-accounts", {
        method: "POST",
        body: JSON.stringify({
          name: recordName,
          creditLimit: 0,
          contactName: contactName || undefined,
          contactEmail: contactEmail || undefined,
          contactPhone: contactPhone || undefined,
          contactMobile: contactMobile || undefined,
        }),
      });
      setContactCompanyName("");
      setContactName("");
      setContactEmail("");
      setContactPhone("");
      setContactMobile("");
      setAddContactOpen(false);
      pushNotice("Contact added. Opening the record now.");
      if (created?.id && typeof window !== "undefined") {
        window.location.href = `/dashboard/trade-accounts/${created.id}`;
      }
    } catch {
      pushNotice("Could not add the contact. Check the details and try again.");
    } finally {
      setContactSaving(false);
    }
  }

  const stats = useMemo(() => {
    const linkedWork = customers.filter((customer) => Number(customer.jobCount || 0) > 0).length;
    const readyForWork = customers.filter((customer) => (customer.email || customer.phone) && Number(customer.jobCount || 0) === 0).length;
    const needsFollowUp = customers.filter((customer) => Number(customer.jobCount || 0) > 0 && Number(customer.activityCount || 0) === 0).length;
    const missingContact = customers.filter((customer) => !customer.email && !customer.phone).length;
    return [
      { label: terms.customers, value: String(customers.length), hint: `${linkedWork} already linked to work` },
      { label: "Ready for first work", value: String(readyForWork), hint: "Contact is ready and no job exists yet" },
      { label: "Needs follow-up", value: String(needsFollowUp), hint: "Work exists but the customer still needs an update" },
      { label: "Missing contact", value: String(missingContact), hint: "Add the basics before work starts" },
    ];
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return customers.filter((customer) => {
      const searchable = [customer.name, customer.email, customer.phone].filter(Boolean).join(" ").toLowerCase();
      const hasEmail = Boolean(customer.email);
      const hasPhone = Boolean(customer.phone);
      const activityCount = Number(customer.activityCount || 0);

      if (normalizedSearch && !searchable.includes(normalizedSearch)) return false;
      if (savedView === "ready-for-work" && (!hasEmail && !hasPhone || Number(customer.jobCount || 0) > 0)) return false;
      if (savedView === "needs-follow-up" && activityCount > 0) return false;
      if (savedView === "recent-activity" && activityCount <= 0) return false;
      if (savedView === "missing-contact" && (hasEmail || hasPhone)) return false;
      if (contactFilter === "email" && !hasEmail) return false;
      if (contactFilter === "phone" && !hasPhone) return false;
      if (contactFilter === "missing" && (hasEmail || hasPhone)) return false;
      if (activityFilter === "active" && activityCount <= 0) return false;
      if (activityFilter === "quiet" && activityCount > 0) return false;
      return true;
    });
  }, [activityFilter, contactFilter, customers, savedView, search]);

  const savedViewCounts = useMemo(() => {
    const counts: Record<CustomerSavedView, number> = {
      all: customers.length,
      "ready-for-work": 0,
      "needs-follow-up": 0,
      "recent-activity": 0,
      "missing-contact": 0,
    };
    for (const customer of customers) {
      const activityCount = Number(customer.activityCount || 0);
      if ((customer.email || customer.phone) && Number(customer.jobCount || 0) === 0) counts["ready-for-work"] += 1;
      if (activityCount <= 0) counts["needs-follow-up"] += 1;
      if (activityCount > 0) counts["recent-activity"] += 1;
      if (!customer.email && !customer.phone) counts["missing-contact"] += 1;
    }
    return counts;
  }, [customers]);

  const clearFilters = () => {
    setSavedView("all");
    setSearch("");
    setContactFilter("all");
    setActivityFilter("all");
  };

  const activeFilters = [
    savedView !== "all" ? { id: "view", label: `View: ${savedView.replace(/-/g, " ")}`, onClear: () => setSavedView("all") } : null,
    search ? { id: "search", label: `Search: ${search}`, onClear: () => setSearch("") } : null,
    contactFilter !== "all" ? { id: "contact", label: `Contact: ${contactFilter}`, onClear: () => setContactFilter("all") } : null,
    activityFilter !== "all" ? { id: "activity", label: `Activity: ${activityFilter}`, onClear: () => setActivityFilter("all") } : null,
  ].filter((chip): chip is { id: string; label: string; onClear: () => void } => Boolean(chip));

  const allVisibleSelected = filteredCustomers.length > 0 && filteredCustomers.every((customer) => selectedIds.includes(customer.id));
  const firstCustomerNeedingContact = filteredCustomers.find((customer) => !customer.email && !customer.phone) || customers.find((customer) => !customer.email && !customer.phone) || null;
  const firstCustomerReadyForWork =
    filteredCustomers.find((customer) => (customer.email || customer.phone) && Number(customer.jobCount || 0) === 0) ||
    customers.find((customer) => (customer.email || customer.phone) && Number(customer.jobCount || 0) === 0) ||
    null;
  const firstCustomerNeedingFollowUp =
    filteredCustomers.find((customer) => Number(customer.jobCount || 0) > 0 && Number(customer.activityCount || 0) === 0) ||
    customers.find((customer) => Number(customer.jobCount || 0) > 0 && Number(customer.activityCount || 0) === 0) ||
    null;

  return (
    <DashboardShell>
      <div data-customer-comms="enabled" hidden>
        CUSTOMER_COMMS_ENABLED
      </div>
      <div data-customer-events="enabled" hidden>
        CUSTOMER_EVENTS_ENABLED
      </div>

      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow={terms.customers}
          title={terms.customers}
          subtitle={`Keep every ${terms.customers.slice(0, -1).toLowerCase() || "customer"} relationship clear so contact details, history, and the next reply stay easy to place.`}
          actions={[
            { label: "Add contact", onClick: () => setAddContactOpen((prev) => !prev) },
            { label: `New ${terms.jobs.slice(0, -1) || "Job"}`, href: "/dashboard/jobs/new?guided=1&entry=work" },
            { label: `Review ${terms.bookings}`, href: "/dashboard/bookings", variant: "secondary" },
          ]}
          shortcuts={["Search by name, phone, or email", "Use this page to move from contact intake into the first booking or first job"]}
          stats={stats}
        />

        <section className="operator-quickRail" data-testid="customer-workflow-rail">
          <OperatorActionTile
            title={firstCustomerNeedingContact ? `${firstCustomerNeedingContact.name} still needs contact detail` : "Customer intake stays clear"}
            description={firstCustomerNeedingContact ? "Fix missing contact detail first so bookings, updates, and handoff do not stall later." : "No obvious intake blockers are waiting right now."}
            icon="customers"
            tone={firstCustomerNeedingContact ? "warning" : "success"}
            action={
              <button className="button" type="button" onClick={() => setAddContactOpen(true)}>
                {firstCustomerNeedingContact ? "Add contact now" : "Add another contact"}
              </button>
            }
          />
          <OperatorActionTile
            title={firstCustomerReadyForWork ? `${firstCustomerReadyForWork.name} is ready for first work` : "First-job path stays available"}
            description={firstCustomerReadyForWork ? "Move directly from the customer record into a guided job with the details prefilled." : "When a contact is ready, start the job from here instead of jumping around the app."}
            icon="work"
            tone="info"
            action={
              <Link className="button" href={firstCustomerReadyForWork ? buildCustomerJobHref(firstCustomerReadyForWork) : "/dashboard/jobs/new?guided=1&entry=work"}>
                Create linked job
              </Link>
            }
          />
          <OperatorActionTile
            title={firstCustomerNeedingFollowUp ? `${firstCustomerNeedingFollowUp.name} needs an update` : "Follow-up stays visible"}
            description={firstCustomerNeedingFollowUp ? "Work exists, but the timeline is still quiet. Open the record and send the next update." : "Use the timeline to keep customer communication attached to the work."}
            icon="mail"
            tone={firstCustomerNeedingFollowUp ? "warning" : "neutral"}
            action={
              <Link
                className="button secondary"
                href={
                  firstCustomerNeedingFollowUp
                    ? `${getTimelineHref(firstCustomerNeedingFollowUp)}&focus=communications`
                    : "/dashboard/customers"
                }
              >
                {firstCustomerNeedingFollowUp ? "Open follow-up" : "Review customer flow"}
              </Link>
            }
          />
        </section>

        <section className="card operator-section">
          {addContactOpen ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Add contact</h2>
              <p className="muted">Add someone quickly so work and follow-up can start without a long setup detour.</p>
              <div className="two-col">
                <div>
                  <label htmlFor="contact-company-name">Company or account name</label>
                  <input id="contact-company-name" className="input" value={contactCompanyName} onChange={(event) => setContactCompanyName(event.target.value)} />
                </div>
                <div>
                  <label htmlFor="contact-name">Primary contact name</label>
                  <input id="contact-name" className="input" value={contactName} onChange={(event) => setContactName(event.target.value)} />
                </div>
                <div>
                  <label htmlFor="contact-email">Email</label>
                  <input id="contact-email" className="input" type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} />
                </div>
                <div>
                  <label htmlFor="contact-phone">Phone</label>
                  <input id="contact-phone" className="input" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
                </div>
                <div>
                  <label htmlFor="contact-mobile">Mobile</label>
                  <input id="contact-mobile" className="input" value={contactMobile} onChange={(event) => setContactMobile(event.target.value)} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="button" type="button" onClick={() => void addContact()} disabled={contactSaving}>
                  {contactSaving ? "Saving contact..." : "Create contact"}
                </button>
                <button className="button secondary" type="button" onClick={() => setAddContactOpen(false)} disabled={contactSaving}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Customer relationships</h2>
              <p className="operator-section__subtitle">See who is ready for first work, who needs a follow-up, and who already has live work attached.</p>
            </div>
          </div>

          <OperatorSavedViews
            views={[
              { id: "all", label: "All", count: savedViewCounts.all },
              { id: "ready-for-work", label: "Ready for work", count: savedViewCounts["ready-for-work"] },
              { id: "needs-follow-up", label: "Needs follow-up", count: savedViewCounts["needs-follow-up"] },
              { id: "recent-activity", label: "Recent activity", count: savedViewCounts["recent-activity"] },
              { id: "missing-contact", label: "Missing contact", count: savedViewCounts["missing-contact"] },
            ]}
            activeView={savedView}
            onChange={(view) => setSavedView(view as CustomerSavedView)}
          />

          <OperatorFilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search customer, phone, or email"
            resultsLabel={`${filteredCustomers.length} shown of ${customers.length} ${terms.customers.toLowerCase()}`}
            actions={[
              { label: "Reset filters", variant: "secondary", onClick: clearFilters },
            ]}
          >
            <OperatorFilterField label="Contact">
              <select className="input" value={contactFilter} onChange={(event) => setContactFilter(event.target.value as ContactFilter)}>
                <option value="all">All contacts</option>
                <option value="email">Has email</option>
                <option value="phone">Has phone</option>
                <option value="missing">Missing contact</option>
              </select>
            </OperatorFilterField>
            <OperatorFilterField label="Activity">
              <select className="input" value={activityFilter} onChange={(event) => setActivityFilter(event.target.value as ActivityFilter)}>
                <option value="all">All activity</option>
                <option value="active">Has activity</option>
                <option value="quiet">No updates yet</option>
              </select>
            </OperatorFilterField>
          </OperatorFilterBar>

          <OperatorActiveFilters chips={activeFilters} onClearAll={activeFilters.length ? clearFilters : undefined} />

          <OperatorGuidance
            title="Move relationships into work"
            items={[
              "Use Ready for work when a new contact is ready to become a real job.",
              "Use Missing contact to fix the basics before you book or dispatch anything.",
            ]}
          />

          {selectedIds.length ? (
            <OperatorBulkBar count={selectedIds.length} hint="Bulk actions are non-destructive">
              <button className="button secondary operator-compact-button" type="button" onClick={() => setSelectedIds([])}>
                Clear
              </button>
              <button
                className="button secondary operator-compact-button"
                type="button"
                onClick={() =>
                  void copyText(
                    customers
                      .filter((customer) => selectedIds.includes(customer.id))
                      .map((customer) => customer.name)
                      .join(", "),
                    "Customer names",
                  )
                }
              >
                Copy names
              </button>
              <button
                className="button secondary operator-compact-button"
                type="button"
                onClick={() =>
                  void copyText(
                    customers
                      .filter((customer) => selectedIds.includes(customer.id))
                      .map((customer) => customer.email || customer.phone || customer.name)
                      .join(", "),
                    "Customer contacts",
                  )
                }
              >
                Copy contacts
              </button>
            </OperatorBulkBar>
          ) : null}

          {error ? <p role="alert" style={{ color: "#ff8a8a", marginTop: 0 }}>{error}</p> : null}
          {notice ? <div aria-live="polite" className="ccv2-toast ccv2-toast--info" role="status">{notice}</div> : null}

          {loading ? (
            <div className="operator-note">Loading customers and next steps...</div>
          ) : filteredCustomers.length ? (
            <OperatorDataTable columns="28px minmax(220px, 1.5fr) minmax(160px, 1fr) minmax(130px, 0.8fr) minmax(150px, 0.8fr) minmax(170px, auto)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">
                  <input
                    aria-label={allVisibleSelected ? "Clear visible customer selection" : "Select all visible customers"}
                    className="operator-checkbox"
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setSelectedIds(Array.from(new Set([...selectedIds, ...filteredCustomers.map((customer) => customer.id)])));
                        return;
                      }
                      setSelectedIds((prev) => prev.filter((id) => !filteredCustomers.some((customer) => customer.id === id)));
                    }}
                  />
                </div>
                <div className="operator-table__cell">Customer</div>
                <div className="operator-table__cell">Contact</div>
                <div className="operator-table__cell">Workload</div>
                <div className="operator-table__cell">Activity</div>
                <div className="operator-table__cell">Actions</div>
              </OperatorDataTableHeader>

              {filteredCustomers.map((customer) => {
                const href = getTimelineHref(customer);
                const createJobHref = buildCustomerJobHref(customer);
                const selected = selectedIds.includes(customer.id);
                const operatorState = describeCustomerOperatorState(customer);
                const visibleFieldSummaries = customFieldValues.filter((value) => value.entityId === customer.id && value.field?.visible !== false).slice(0, 2);
                const primaryAction =
                  operatorState.actionLabel === "Create job"
                    ? { label: "Create job", href: createJobHref }
                    : { label: operatorState.actionLabel, href };
                return (
                  <OperatorDataTableRow key={customer.id} selected={selected} data-testid={`customer-row-${customer.id}`}>
                    <div className="operator-table__cell">
                      <input
                        aria-label={`Select customer ${customer.name}`}
                        className="operator-checkbox"
                        type="checkbox"
                        checked={selected}
                        onChange={() => setSelectedIds((prev) => prev.includes(customer.id) ? prev.filter((id) => id !== customer.id) : [...prev, customer.id])}
                      />
                    </div>
                    <div className="operator-table__cell">
                      <div className="operator-cellTitle">
                        <Link href={href}>{customer.name}</Link>
                        <span className="badge">{operatorState.label}</span>
                        <span className="operator-tag">{Number(customer.jobCount || 0)} jobs</span>
                      </div>
                      <div className="operator-cellSubtle">
                        {operatorState.summary}
                      </div>
                      {visibleFieldSummaries.length ? (
                        <div className="operator-cellSubtle" style={{ marginTop: 6 }}>
                          {visibleFieldSummaries.map((value) => `${value.field?.label}: ${String(value.valueJson)}`).join(" | ")}
                        </div>
                      ) : null}
                    </div>
                    <div className="operator-table__cell">
                      <div className="operator-cellMeta">
                        <span><strong>{customer.email || "No email"}</strong></span>
                        <span>{customer.phone || "No phone"}</span>
                      </div>
                    </div>
                    <div className="operator-table__cell">
                      <div className="operator-cellMeta">
                        <span><strong>{Number(customer.jobCount || 0)} jobs</strong></span>
                        <span>{Number(customer.jobCount || 0) > 0 ? "Linked workload" : "No jobs yet"}</span>
                      </div>
                    </div>
                    <div className="operator-table__cell">
                      <div className="operator-cellMeta">
                        <span><strong>{Number(customer.activityCount || 0)} events</strong></span>
                        <span>{Number(customer.activityCount || 0) > 0 ? "Timeline active" : "Quiet record"}</span>
                      </div>
                    </div>
                    <div className="operator-table__cell operator-table__cell--actions">
                      <OperatorRowActions
                        primaryAction={primaryAction}
                        actions={[
                          {
                            label: "Create job",
                            description: "Start a guided job with this customer's details prefilled",
                            shortcut: "New",
                            group: "Pipeline",
                            href: createJobHref,
                            testId: `customer-create-job-${customer.id}`,
                          },
                          {
                            label: "Review bookings",
                            description: "Check bookings and scheduling before work starts",
                            shortcut: "Book",
                            group: "Pipeline",
                            href: "/dashboard/bookings",
                            testId: `customer-open-bookings-${customer.id}`,
                          },
                          ...(customer.phone ? [{
                            label: "Send SMS",
                            description: "Send a quick customer text update",
                            shortcut: "SMS",
                            group: "Communications",
                            onClick: () => void sendQuickCommunication(customer, "sms"),
                          }] : []),
                          ...(customer.email ? [{
                            label: "Send email",
                            description: "Send a quick email update",
                            shortcut: "Mail",
                            group: "Communications",
                            onClick: () => void sendQuickCommunication(customer, "email"),
                          }] : []),
                          {
                            label: "Log SMS",
                            description: "Record an outbound SMS event",
                            shortcut: "Log",
                            group: "Timeline",
                            onClick: () => void createMessageEvent(customer, "sms.sent"),
                          },
                          {
                            label: "Log email",
                            description: "Record an outbound email event",
                            shortcut: "Log",
                            group: "Timeline",
                            onClick: () => void createMessageEvent(customer, "email.sent"),
                          },
                          {
                            label: "Log portal view",
                            description: "Record that the customer opened the portal",
                            shortcut: "Log",
                            group: "Timeline",
                            onClick: () => void createMessageEvent(customer, "portal.viewed"),
                          },
                          {
                            label: "Copy contact",
                            description: "Copy the best available contact detail",
                            shortcut: "Copy",
                            group: "Tools",
                            onClick: () => void copyText(customer.email || customer.phone || customer.name, "Customer contact"),
                          },
                          {
                            label: "Custom fields",
                            description: "Review and edit workspace-specific customer fields",
                            group: "Tools",
                            onClick: () => setCustomFieldCustomerId(customer.id),
                          },
                        ]}
                      />
                    </div>
                  </OperatorDataTableRow>
                );
              })}
            </OperatorDataTable>
          ) : (
            <OperatorEmptyStateCard
              title={`No ${terms.customers.toLowerCase()} match this view`}
              description={`Reset the filters, add a contact, or start the next job when a ${terms.customers.slice(0, -1).toLowerCase() || "customer"} is ready to move into work.`}
              actions={[
                { label: "Reset filters", variant: "secondary", onClick: clearFilters },
                { label: "Add contact", onClick: () => setAddContactOpen(true) },
                { label: "Create job", href: "/dashboard/jobs/new?guided=1&entry=work" },
                { label: "Review bookings", href: "/dashboard/bookings", variant: "secondary" },
              ]}
            />
          )}
        </section>

        {customFieldCustomerId ? (
          <EntityCustomFieldsCard
            title="Customer custom fields"
            entityType="customer"
            entityId={customFieldCustomerId}
            onSaved={() => undefined}
          />
        ) : null}
      </div>
    </DashboardShell>
  );
}
