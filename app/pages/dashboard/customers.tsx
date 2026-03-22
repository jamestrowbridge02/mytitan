import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EntityCustomFieldsCard } from "../../components/custom-fields/EntityCustomFieldsCard";
import { DashboardShell } from "../../components/dashboard-shell";
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
type CustomerSavedView = "all" | "needs-follow-up" | "recent-activity" | "missing-contact";

function getTimelineHref(customer: CustomerRow) {
  return `/dashboard/customers/${encodeURIComponent(customer.slug || customer.id)}?name=${encodeURIComponent(customer.name)}`;
}

export default function CustomersPage() {
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

  useEffect(() => {
    const load = async () => {
      try {
        const rows = await apiFetch("/customers?limit=100");
        setCustomers(Array.isArray(rows) ? rows : []);
        setError("");
      } catch (err: any) {
        setError(err?.message || "Failed to load customers");
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
      pushNotice("Could not create messaging event");
    }
  }

  async function sendQuickCommunication(customer: CustomerRow, channel: "sms" | "email") {
    try {
      const message =
        channel === "sms"
          ? `Hi ${customer.name}, your MyTitan update is ready.`
          : `Hello ${customer.name}, your latest MyTitan update is ready.`;

      const subject = channel === "email" ? "MyTitan customer update" : null;

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

      pushNotice(res?.label || `${channel.toUpperCase()} sent`);
    } catch {
      pushNotice(`Could not send ${channel.toUpperCase()}`);
    }
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      pushNotice(`${label} copied`);
    } catch {
      pushNotice(`Could not copy ${label.toLowerCase()}`);
    }
  }

  const stats = useMemo(() => {
    const totalJobs = customers.reduce((sum, customer) => sum + Number(customer.jobCount || 0), 0);
    const totalActivity = customers.reduce((sum, customer) => sum + Number(customer.activityCount || 0), 0);
    const contactable = customers.filter((customer) => customer.email || customer.phone).length;
    return [
      { label: terms.customers, value: String(customers.length), hint: `${contactable} with direct contact details` },
      { label: "Jobs linked", value: String(totalJobs), hint: "Current customer workload" },
      { label: "Timeline events", value: String(totalActivity), hint: "Logged communications and activity" },
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
      "needs-follow-up": 0,
      "recent-activity": 0,
      "missing-contact": 0,
    };
    for (const customer of customers) {
      const activityCount = Number(customer.activityCount || 0);
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

  return (
    <DashboardShell>
      <div data-customer-comms="enabled" style={{ position: "absolute", left: -99999, top: -99999, width: 1, height: 1, overflow: "hidden" }}>
        CUSTOMER_COMMS_ENABLED
      </div>
      <div data-customer-events="enabled" style={{ position: "absolute", left: -99999, top: -99999, width: 1, height: 1, overflow: "hidden" }}>
        CUSTOMER_EVENTS_ENABLED
      </div>

      <div className="operator-stack">
        <OperatorPageHeader
          eyebrow={terms.customers}
          title={terms.customers}
          subtitle={`Find the right ${terms.customers.toLowerCase()} quickly, see recent contact, and open the right record without digging around.`}
          actions={[
            { label: "Open live board", href: commandCentreHref, variant: "secondary" },
            { label: `New ${terms.jobs.slice(0, -1) || "Job"}`, href: "/dashboard/jobs/new" },
          ]}
          shortcuts={["Search by name, phone, or email", "Use each row for contact, follow-up, and history"]}
          stats={stats}
        />

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Customer list</h2>
              <p className="operator-section__subtitle">See contact details, recent activity, and current workload in one place.</p>
            </div>
          </div>

          <OperatorSavedViews
            views={[
              { id: "all", label: "All", count: savedViewCounts.all },
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
                <option value="quiet">No activity yet</option>
              </select>
            </OperatorFilterField>
          </OperatorFilterBar>

          <OperatorActiveFilters chips={activeFilters} onClearAll={activeFilters.length ? clearFilters : undefined} />

          <OperatorGuidance
            title="Follow-up tips"
            items={[
              "Saved views keep your key customer lists ready on this device.",
              "Select rows to copy names or contact details before you reach out.",
              "Use each row menu to message, log, or copy details without leaving the list.",
            ]}
          />

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

          {error ? <p role="alert" style={{ color: "#ff8a8a", marginTop: 0 }}>{error}</p> : null}
          {notice ? <div aria-live="polite" className="ccv2-toast ccv2-toast--info" role="status">{notice}</div> : null}

          {loading ? (
            <div className="operator-note">Loading customers...</div>
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
                const selected = selectedIds.includes(customer.id);
                const visibleFieldSummaries = customFieldValues.filter((value) => value.entityId === customer.id && value.field?.visible !== false).slice(0, 2);
                return (
                  <OperatorDataTableRow key={customer.id} selected={selected}>
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
                        <span className="operator-tag">{Number(customer.jobCount || 0)} jobs</span>
                      </div>
                      <div className="operator-cellSubtle">
                        {customer.email || customer.phone ? "Direct contact available" : "Needs contact detail"}
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
                        primaryAction={{ label: "Open timeline", href }}
                        actions={[
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
              description="Clear the filters, create a job, or log a customer update to start building history here."
              actions={[
                { label: "Reset filters", variant: "secondary", onClick: clearFilters },
                { label: "Create job", href: "/dashboard/jobs/new" },
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
