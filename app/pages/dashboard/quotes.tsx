import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import { OperatorNotice } from "../../components/feedback/OperatorNotice";
import { useOperatorNotice } from "../../components/feedback/useOperatorNotice";
import {
  OperatorDataTable,
  OperatorDataTableHeader,
  OperatorDataTableRow,
  OperatorEmptyStateCard,
  OperatorSavedViews,
} from "../../components/ui/operator-page";
import { apiFetch } from "../../lib/api";
import { emptyPermissionSnapshot, hasWorkspacePermission, normalizePermissionSnapshot } from "../../lib/workspace-permissions";

type CustomerOption = { id: string; name: string; email?: string | null };
type Quote = {
  id: string;
  customerId: string;
  customerName?: string | null;
  jobId?: string | null;
  jobRef?: string | null;
  quoteNumber: string;
  status: "DRAFT" | "SENT" | "APPROVED" | "DECLINED" | "EXPIRED" | "CONVERTED";
  title: string;
  summary?: string | null;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  expiresAt?: string | null;
  approvedAt?: string | null;
  convertedAt?: string | null;
  lineItems: Array<{ type: string; title: string; quantity: number; unitPriceCents: number; totalPriceCents: number }>;
};

type FormState = {
  id: string | null;
  customerId: string;
  title: string;
  summary: string;
  currency: string;
  taxAmount: string;
  expiresAt: string;
  lineItems: LineItemForm[];
};

type LineItemForm = {
  type: string;
  title: string;
  quantity: string;
  unitPrice: string;
};

const EMPTY_FORM: FormState = {
  id: null,
  customerId: "",
  title: "",
  summary: "",
  currency: "GBP",
  taxAmount: "0.00",
  expiresAt: "",
  lineItems: [{ type: "LABOUR", title: "Initial inspection", quantity: "1", unitPrice: "85.00" }],
};

function money(cents: number, currency = "GBP") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format((cents || 0) / 100);
}

function toLocalInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const shifted = new Date(date.getTime() - offset * 60 * 1000);
  return shifted.toISOString().slice(0, 16);
}

function toMoneyInput(cents: number) {
  return ((cents || 0) / 100).toFixed(2);
}

function moneyInputToCents(value: string) {
  const normalized = String(value || "0").replace(/[^\d.-]/g, "");
  return Math.round(Number(normalized || 0) * 100);
}

function parseLineItems(items: LineItemForm[]) {
  return items
    .filter((item) => item.title.trim())
    .map((item, index) => ({
      sortOrder: index,
      type: String(item.type || "OTHER").toUpperCase(),
      title: item.title.trim() || `Line ${index + 1}`,
      quantity: Number(item.quantity || 1),
      unitPriceCents: moneyInputToCents(item.unitPrice),
    }));
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyQuoteId, setBusyQuoteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Quote["status"]>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [permissions, setPermissions] = useState(() => emptyPermissionSnapshot());
  const [permissionsReady, setPermissionsReady] = useState(false);
  const { notice, showError, showSuccess, clearNotice } = useOperatorNotice();

  const canManage = hasWorkspacePermission(permissions, "billing.manage");

  async function loadData(keepSelection = true) {
    const [quoteRows, customerRows] = await Promise.all([
      apiFetch("/quotes"),
      apiFetch("/customers?limit=200"),
    ]);
    const nextQuotes = Array.isArray(quoteRows) ? quoteRows : [];
    setQuotes(nextQuotes);
    setCustomers(Array.isArray(customerRows) ? customerRows : []);
    if (!keepSelection) {
      setSelectedQuoteId(nextQuotes[0]?.id || null);
      return;
    }
    if (!selectedQuoteId && nextQuotes[0]?.id) {
      setSelectedQuoteId(nextQuotes[0].id);
    } else if (selectedQuoteId && !nextQuotes.some((row: Quote) => row.id === selectedQuoteId)) {
      setSelectedQuoteId(nextQuotes[0]?.id || null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const me = await apiFetch("/me");
        if (cancelled) return;
        setPermissions(normalizePermissionSnapshot(me?.permissions));
        if (hasWorkspacePermission(normalizePermissionSnapshot(me?.permissions), "billing.manage")) {
          await loadData(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          showError(err?.message || "Failed to load quotes");
        }
      } finally {
        if (!cancelled) {
          setPermissionsReady(true);
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const selected = quotes.find((quote) => quote.id === selectedQuoteId);
    if (!selected) {
      setForm(EMPTY_FORM);
      return;
    }
    setForm({
      id: selected.id,
      customerId: selected.customerId,
      title: selected.title,
      summary: selected.summary || "",
      currency: selected.currency || "GBP",
      taxAmount: toMoneyInput(selected.taxCents || 0),
      expiresAt: toLocalInputValue(selected.expiresAt),
      lineItems: (selected.lineItems || []).length
        ? selected.lineItems.map((item) => ({
          type: item.type || "OTHER",
          title: item.title || "",
          quantity: String(item.quantity || 1),
          unitPrice: toMoneyInput(item.unitPriceCents || 0),
        }))
        : [{ type: "LABOUR", title: "", quantity: "1", unitPrice: "0.00" }],
    });
  }, [selectedQuoteId, quotes]);

  const stats = useMemo(() => {
    const awaiting = quotes.filter((quote) => quote.status === "SENT").length;
    const approved = quotes.filter((quote) => quote.status === "APPROVED").length;
    return [
      { id: "DRAFT", label: "Draft", value: String(quotes.filter((quote) => quote.status === "DRAFT").length) },
      { id: "SENT", label: "Awaiting response", value: String(awaiting) },
      { id: "APPROVED", label: "Approved", value: String(approved) },
      { id: "EXPIRED", label: "Expired", value: String(quotes.filter((quote) => quote.status === "EXPIRED").length) },
    ];
  }, [quotes]);

  const filteredQuotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quotes.filter((quote) => {
      const haystack = [quote.quoteNumber, quote.customerName, quote.title, quote.status, quote.jobRef].filter(Boolean).join(" ").toLowerCase();
      if (q && !haystack.includes(q)) return false;
      if (statusFilter !== "all" && quote.status !== statusFilter) return false;
      return true;
    });
  }, [quotes, search, statusFilter]);

  const savedViewCounts = useMemo(() => {
    const counts: Record<string, number> = { all: quotes.length };
    for (const status of ["DRAFT", "SENT", "APPROVED", "DECLINED", "EXPIRED", "CONVERTED"]) {
      counts[status] = quotes.filter((quote) => quote.status === status).length;
    }
    return counts;
  }, [quotes]);

  async function saveQuote() {
    setSaving(true);
    try {
      const payload = {
        customerId: form.customerId,
        title: form.title,
        summary: form.summary || undefined,
        currency: form.currency,
        taxCents: moneyInputToCents(form.taxAmount),
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
        lineItems: parseLineItems(form.lineItems),
      };
      if (form.id) {
        await apiFetch(`/quotes/${form.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        showSuccess("Quote updated");
      } else {
        await apiFetch("/quotes", { method: "POST", body: JSON.stringify(payload) });
        showSuccess("Quote created");
      }
      setEditorOpen(false);
      await loadData();
    } catch (err: any) {
      showError(err?.message || "Failed to save quote");
    } finally {
      setSaving(false);
    }
  }

  async function runAction(id: string, action: "send" | "approve" | "decline" | "convert") {
    setBusyQuoteId(id);
    try {
      await apiFetch(`/quotes/${id}/${action}`, {
        method: "POST",
        body: action === "decline" ? JSON.stringify({ note: "Declined by operator" }) : JSON.stringify({}),
      });
      showSuccess(
        action === "send"
          ? "Quote sent"
          : action === "approve"
          ? "Quote approved"
          : action === "decline"
          ? "Quote declined"
          : "Quote converted",
      );
      await loadData();
    } catch (err: any) {
      showError(err?.message || `Failed to ${action} quote`);
    } finally {
      setBusyQuoteId(null);
    }
  }

  function startCreate() {
    setSelectedQuoteId(null);
    setForm(EMPTY_FORM);
    setEditorOpen(true);
  }

  function openQuote(id: string) {
    setSelectedQuoteId(id);
    setEditorOpen(true);
  }

  function updateLineItem(index: number, patch: Partial<LineItemForm>) {
    setForm((current) => ({
      ...current,
      lineItems: current.lineItems.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
    }));
  }

  function addLineItem() {
    setForm((current) => ({
      ...current,
      lineItems: [...current.lineItems, { type: "OTHER", title: "", quantity: "1", unitPrice: "0.00" }],
    }));
  }

  function removeLineItem(index: number) {
    setForm((current) => ({
      ...current,
      lineItems: current.lineItems.length > 1 ? current.lineItems.filter((_, itemIndex) => itemIndex !== index) : current.lineItems,
    }));
  }

  if (permissionsReady && !canManage) {
    return (
      <DashboardShell>
        <div className="operator-stack">
          <header className="premium-page-header"><div><h1>Quotes</h1><p>Access restricted</p></div></header>
          <OperatorEmptyStateCard
            title="Quote access restricted"
            description="Your role cannot manage quotes or pricing actions. Ask an owner, admin, finance user, or legacy staff operator for access."
          />
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="operator-stack">
        <header className="premium-page-header" data-testid="quotes-premium-header">
          <div>
            <h1>Quotes</h1>
            <p>Quote queue</p>
          </div>
          <div className="premium-page-header__actions">
            {canManage ? <button className="button" type="button" onClick={startCreate} data-testid="quote-create">Create quote</button> : null}
          </div>
        </header>

        <section className="premium-metric-grid" aria-label="Quote overview">
          {stats.map((stat) => (
            <button key={stat.id} type="button" className={`premium-metric-card${statusFilter === stat.id ? " is-active" : ""}`} onClick={() => setStatusFilter(stat.id as Quote["status"])}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </button>
          ))}
        </section>

        <OperatorNotice notice={notice} onDismiss={clearNotice} />

        <section className="card operator-section" data-testid="quote-list">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Quote queue</h2>
            </div>
          </div>
          <div className="premium-toolbar">
            <label className="operator-filterbar__search">
              <span className="operator-filterbar__label">Search</span>
              <input className="input operator-filterbar__input" aria-label="Search quotes..." placeholder="Search quotes..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
            <OperatorSavedViews
              views={[
                { id: "all", label: "All", count: savedViewCounts.all },
                { id: "DRAFT", label: "Draft", count: savedViewCounts.DRAFT },
                { id: "SENT", label: "Sent", count: savedViewCounts.SENT },
                { id: "APPROVED", label: "Approved", count: savedViewCounts.APPROVED },
                { id: "DECLINED", label: "Declined", count: savedViewCounts.DECLINED },
                { id: "EXPIRED", label: "Expired", count: savedViewCounts.EXPIRED },
                { id: "CONVERTED", label: "Converted", count: savedViewCounts.CONVERTED },
              ]}
              activeView={statusFilter}
              onChange={(view) => setStatusFilter(view as typeof statusFilter)}
            />
            {(search || statusFilter !== "all") ? <button className="button secondary" type="button" onClick={() => { setSearch(""); setStatusFilter("all"); }}>Reset filters</button> : null}
          </div>
          {loading ? (
            <p className="muted">Loading quotes...</p>
          ) : filteredQuotes.length ? (
            <OperatorDataTable columns="minmax(220px, 1.3fr) minmax(150px, 0.8fr) minmax(180px, 0.8fr) minmax(200px, auto)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Quote</div>
                <div className="operator-table__cell">Value</div>
                <div className="operator-table__cell">State</div>
                <div className="operator-table__cell">Actions</div>
              </OperatorDataTableHeader>
              {filteredQuotes.map((quote) => (
                <OperatorDataTableRow
                  key={quote.id}
                  onClick={() => openQuote(quote.id)}
                  className={selectedQuoteId === quote.id ? "is-selected" : undefined}
                >
                  <div className="operator-table__cell">
                    <div className="operator-cellTitle">{quote.quoteNumber}</div>
                    <div className="operator-cellSubtle">{quote.customerName || "Customer"} · {quote.title}</div>
                    {quote.jobRef ? <div className="operator-cellSubtle">Job {quote.jobRef}</div> : null}
                  </div>
                  <div className="operator-table__cell">
                    <div className="operator-cellMeta">
                      <span><strong>{money(quote.totalCents, quote.currency)}</strong></span>
                      <span>Subtotal {money(quote.subtotalCents, quote.currency)}</span>
                      <span>{quote.lineItems.length} line items</span>
                    </div>
                  </div>
                  <div className="operator-table__cell">
                    <div className="operator-cellMeta">
                      <span><strong>{quote.status}</strong></span>
                      {quote.expiresAt ? <span>Expires {new Date(quote.expiresAt).toLocaleDateString()}</span> : null}
                      {quote.approvedAt ? <span>Approved {new Date(quote.approvedAt).toLocaleDateString()}</span> : null}
                      {quote.convertedAt ? <span>Converted {new Date(quote.convertedAt).toLocaleDateString()}</span> : null}
                    </div>
                  </div>
                  <div className="operator-table__cell operator-table__cell--actions">
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {(quote.status === "DRAFT" || quote.status === "EXPIRED") ? (
                        <button className="button secondary" type="button" onClick={(event) => { event.stopPropagation(); void runAction(quote.id, "send"); }} disabled={busyQuoteId === quote.id} data-testid={selectedQuoteId === quote.id ? "quote-send" : undefined}>
                          {busyQuoteId === quote.id ? "Sending..." : "Send"}
                        </button>
                      ) : null}
                      {quote.status === "SENT" ? (
                        <>
                          <button className="button secondary" type="button" onClick={(event) => { event.stopPropagation(); void runAction(quote.id, "approve"); }} disabled={busyQuoteId === quote.id} data-testid={selectedQuoteId === quote.id ? "quote-approve" : undefined}>
                            Approve
                          </button>
                          <button className="button secondary" type="button" onClick={(event) => { event.stopPropagation(); void runAction(quote.id, "decline"); }} disabled={busyQuoteId === quote.id}>
                            Decline
                          </button>
                        </>
                      ) : null}
                      {quote.status === "APPROVED" ? (
                        <button className="button" type="button" onClick={(event) => { event.stopPropagation(); void runAction(quote.id, "convert"); }} disabled={busyQuoteId === quote.id} data-testid={selectedQuoteId === quote.id ? "quote-convert" : undefined}>
                          {busyQuoteId === quote.id ? "Converting..." : "Convert"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </OperatorDataTableRow>
              ))}
            </OperatorDataTable>
          ) : (
            <div className="premium-empty-state">
              <h3>{quotes.length ? "No quotes match these filters." : "No quotes yet"}</h3>
              {quotes.length ? <button className="button secondary" type="button" onClick={() => { setSearch(""); setStatusFilter("all"); }}>Clear filters</button> : <button className="button" type="button" onClick={startCreate}>Create quote</button>}
            </div>
          )}
        </section>

        {editorOpen ? <section className="card operator-section" data-testid="quote-editor">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">{form.id ? "Edit quote" : "Create quote"}</h2>
            </div>
            <button className="button secondary" type="button" onClick={() => setEditorOpen(false)}>Close</button>
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            <label className="operator-filterbar__field">
              <span className="operator-filterbar__label">Customer</span>
              <select className="input" value={form.customerId} onChange={(event) => setForm((current) => ({ ...current, customerId: event.target.value }))} data-testid="quote-customer">
                <option value="">Select customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </select>
            </label>
            <label className="operator-filterbar__field">
              <span className="operator-filterbar__label">Title</span>
              <input className="input" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} data-testid="quote-title" />
            </label>
            <label className="operator-filterbar__field">
              <span className="operator-filterbar__label">Summary</span>
              <textarea className="input" rows={3} value={form.summary} onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))} />
            </label>
            <div className="operator-split" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
              <label className="operator-filterbar__field">
                <span className="operator-filterbar__label">Currency</span>
                <input className="input" value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))} />
              </label>
              <label className="operator-filterbar__field">
                <span className="operator-filterbar__label">Tax</span>
                <input className="input" inputMode="decimal" value={form.taxAmount} onChange={(event) => setForm((current) => ({ ...current, taxAmount: event.target.value }))} />
              </label>
              <label className="operator-filterbar__field">
                <span className="operator-filterbar__label">Expires at</span>
                <input className="input" type="datetime-local" value={form.expiresAt} onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))} />
              </label>
            </div>
            <div className="quote-line-editor" data-testid="quote-line-items">
              <div className="operator-section__header">
                <h3 className="operator-section__title">Line items</h3>
                <button className="button secondary" type="button" onClick={addLineItem} data-testid="quote-add-line-item">Add row</button>
              </div>
              {form.lineItems.map((item, index) => (
                <div className="quote-line-editor__row" key={index}>
                  <label><span>Type</span><select className="input" value={item.type} onChange={(event) => updateLineItem(index, { type: event.target.value })} data-testid={`quote-line-type-${index}`}><option value="LABOUR">Labour</option><option value="PART">Part</option><option value="MATERIAL">Material</option><option value="OTHER">Custom</option></select></label>
                  <label><span>Description</span><input className="input" value={item.title} onChange={(event) => updateLineItem(index, { title: event.target.value })} data-testid={`quote-line-title-${index}`} /></label>
                  <label><span>Qty</span><input className="input" inputMode="decimal" value={item.quantity} onChange={(event) => updateLineItem(index, { quantity: event.target.value })} data-testid={`quote-line-quantity-${index}`} /></label>
                  <label><span>Unit price</span><input className="input" inputMode="decimal" value={item.unitPrice} onChange={(event) => updateLineItem(index, { unitPrice: event.target.value })} data-testid={`quote-line-unit-price-${index}`} /></label>
                  <button className="button secondary" type="button" onClick={() => removeLineItem(index)} disabled={form.lineItems.length <= 1}>Remove</button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="button" type="button" onClick={() => void saveQuote()} disabled={saving} data-testid="quote-save">
                {saving ? "Saving..." : "Save quote"}
              </button>
              <button className="button secondary" type="button" onClick={startCreate}>
                New draft
              </button>
            </div>
          </div>
        </section> : null}
      </div>
    </DashboardShell>
  );
}
