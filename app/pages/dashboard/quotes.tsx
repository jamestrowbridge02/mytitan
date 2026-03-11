import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import { OperatorNotice } from "../../components/feedback/OperatorNotice";
import { useOperatorNotice } from "../../components/feedback/useOperatorNotice";
import {
  OperatorDataTable,
  OperatorDataTableHeader,
  OperatorDataTableRow,
  OperatorEmptyStateCard,
  OperatorGuidance,
  OperatorPageHeader,
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
  taxCents: string;
  expiresAt: string;
  lineItemsText: string;
};

const EMPTY_FORM: FormState = {
  id: null,
  customerId: "",
  title: "",
  summary: "",
  currency: "GBP",
  taxCents: "0",
  expiresAt: "",
  lineItemsText: "LABOUR | Initial inspection | 1 | 8500",
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

function parseLineItems(raw: string) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [type, title, quantity, unitPriceCents] = line.split("|").map((part) => part.trim());
      return {
        sortOrder: index,
        type: String(type || "OTHER").toUpperCase(),
        title: title || `Line ${index + 1}`,
        quantity: Number(quantity || 1),
        unitPriceCents: Number(unitPriceCents || 0),
      };
    });
}

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyQuoteId, setBusyQuoteId] = useState<string | null>(null);
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
      taxCents: String(selected.taxCents || 0),
      expiresAt: toLocalInputValue(selected.expiresAt),
      lineItemsText: (selected.lineItems || [])
        .map((item) => `${item.type} | ${item.title} | ${item.quantity} | ${item.unitPriceCents}`)
        .join("\n"),
    });
  }, [selectedQuoteId, quotes]);

  const stats = useMemo(() => {
    const awaiting = quotes.filter((quote) => quote.status === "SENT").length;
    const approved = quotes.filter((quote) => quote.status === "APPROVED").length;
    const converted = quotes.filter((quote) => quote.status === "CONVERTED").length;
    const overdue = quotes.filter((quote) => quote.status === "SENT" && quote.expiresAt && new Date(quote.expiresAt).getTime() < Date.now()).length;
    return [
      { label: "Drafts", value: String(quotes.filter((quote) => quote.status === "DRAFT").length), hint: "Quotes still being prepared" },
      { label: "Awaiting approval", value: String(awaiting), hint: "Sent quotes still waiting on customer response" },
      { label: "Approved", value: String(approved), hint: "Ready for explicit operator conversion" },
      { label: "Converted", value: String(converted), hint: "Quotes already turned into executable work" },
      { label: "Expired", value: String(overdue), hint: "Sent quotes already past their expiry date" },
    ];
  }, [quotes]);

  async function saveQuote() {
    setSaving(true);
    try {
      const payload = {
        customerId: form.customerId,
        title: form.title,
        summary: form.summary || undefined,
        currency: form.currency,
        taxCents: Number(form.taxCents || 0),
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
        lineItems: parseLineItems(form.lineItemsText),
      };
      if (form.id) {
        await apiFetch(`/quotes/${form.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        showSuccess("Quote updated");
      } else {
        await apiFetch("/quotes", { method: "POST", body: JSON.stringify(payload) });
        showSuccess("Quote created");
      }
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
  }

  if (permissionsReady && !canManage) {
    return (
      <DashboardShell>
        <div className="operator-stack">
          <OperatorPageHeader
            eyebrow="Revenue ops"
            title="Quotes"
            subtitle="Quote creation and revenue execution are restricted to workspace roles trusted with billing operations."
            stats={[]}
          />
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
        <OperatorPageHeader
          eyebrow="Revenue ops"
          title="Quotes"
          subtitle="Create, approve, and convert quotes without turning MyTitan into fake accounting software."
          actions={canManage ? [{ label: "Create quote", onClick: startCreate, testId: "quote-create" }] : undefined}
          shortcuts={["Quote totals are calculated from line items", "Conversion is always explicit and auditable"]}
          stats={stats}
        />

        <OperatorGuidance
          title="Quote workflow guidance"
          items={[
            "Use send when customer approval should begin and the quote becomes externally visible in the customer workspace.",
            "Approved quotes remain separate from execution until an operator explicitly converts them.",
            "Revenue tasks are generated from real sent, approved, and invoice states instead of fake outbound sequences.",
          ]}
        />

        <OperatorNotice notice={notice} onDismiss={clearNotice} />

        <section className="card operator-section" data-testid="quote-list">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Quote list</h2>
              <p className="operator-section__subtitle">Draft, sent, approved, declined, expired, and converted quotes linked to current customers and jobs.</p>
            </div>
          </div>
          {loading ? (
            <p className="muted">Loading quotes...</p>
          ) : quotes.length ? (
            <OperatorDataTable columns="minmax(220px, 1.3fr) minmax(150px, 0.8fr) minmax(180px, 0.8fr) minmax(200px, auto)">
              <OperatorDataTableHeader>
                <div className="operator-table__cell">Quote</div>
                <div className="operator-table__cell">Value</div>
                <div className="operator-table__cell">State</div>
                <div className="operator-table__cell">Actions</div>
              </OperatorDataTableHeader>
              {quotes.map((quote) => (
                <OperatorDataTableRow
                  key={quote.id}
                  onClick={() => setSelectedQuoteId(quote.id)}
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
            <OperatorEmptyStateCard
              title="No quotes yet"
              description="Create the first quote to start a controlled revenue workflow over pricing, approval, and conversion."
            />
          )}
        </section>

        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">{form.id ? "Edit quote" : "Create quote"}</h2>
              <p className="operator-section__subtitle">One line per item: `TYPE | Title | Quantity | Unit price cents`.</p>
            </div>
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
                <span className="operator-filterbar__label">Tax cents</span>
                <input className="input" value={form.taxCents} onChange={(event) => setForm((current) => ({ ...current, taxCents: event.target.value }))} />
              </label>
              <label className="operator-filterbar__field">
                <span className="operator-filterbar__label">Expires at</span>
                <input className="input" type="datetime-local" value={form.expiresAt} onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))} />
              </label>
            </div>
            <label className="operator-filterbar__field">
              <span className="operator-filterbar__label">Line items</span>
              <textarea className="input" rows={6} value={form.lineItemsText} onChange={(event) => setForm((current) => ({ ...current, lineItemsText: event.target.value }))} data-testid="quote-line-items" />
            </label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="button" type="button" onClick={() => void saveQuote()} disabled={saving} data-testid="quote-save">
                {saving ? "Saving..." : "Save quote"}
              </button>
              <button className="button secondary" type="button" onClick={startCreate}>
                New draft
              </button>
            </div>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
