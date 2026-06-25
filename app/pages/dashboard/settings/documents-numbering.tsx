import { useEffect, useState } from "react";
import { DashboardShell } from "../../../components/dashboard-shell";
import { OperatorPageHeader } from "../../../components/ui/operator-page";
import { apiFetch } from "../../../lib/api";

type Sequence = {
  kind: "JOB_SHEET" | "INVOICE" | "QUOTE" | "STATEMENT";
  prefix: string;
  suffix: string;
  nextNumber: number;
  padding: number;
  preview: string;
};

const LABELS: Record<Sequence["kind"], string> = {
  JOB_SHEET: "Job sheets and jobs",
  INVOICE: "Invoices",
  QUOTE: "Estimates and quotes",
  STATEMENT: "Statements",
};

export default function DocumentsNumberingPage() {
  const [rows, setRows] = useState<Sequence[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const data = await apiFetch("/tenant/document-numbering");
    setRows(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    void load().catch((nextError: any) => setError(nextError?.message || "Numbering settings could not be loaded."));
  }, []);

  function patch(kind: Sequence["kind"], values: Partial<Sequence>) {
    setRows((current) => current.map((row) => {
      if (row.kind !== kind) return row;
      const next = { ...row, ...values };
      next.preview = `${next.prefix || ""}${String(next.nextNumber || 1).padStart(Math.max(1, next.padding || 1), "0")}${next.suffix || ""}`;
      return next;
    }));
  }

  async function save(row: Sequence) {
    const reason = window.prompt(`Why are you changing the ${LABELS[row.kind].toLowerCase()} numbering?`);
    if (!reason?.trim()) return;
    if (!window.confirm(`Set the next ${LABELS[row.kind].toLowerCase()} number to ${row.preview}? Historical records will not change.`)) return;
    setBusy(row.kind);
    setError("");
    setMessage("");
    try {
      await apiFetch("/tenant/document-numbering", {
        method: "PATCH",
        body: JSON.stringify({
          kind: row.kind,
          prefix: row.prefix,
          suffix: row.suffix,
          nextNumber: row.nextNumber,
          padding: row.padding,
          reason,
        }),
      });
      setMessage(`${LABELS[row.kind]} numbering saved. Existing records were not changed.`);
      await load();
    } catch (nextError: any) {
      setError(nextError?.message || "Numbering settings could not be saved.");
    } finally {
      setBusy("");
    }
  }

  return (
    <DashboardShell>
      <div className="operator-stack" data-testid="document-numbering-settings">
        <OperatorPageHeader
          eyebrow="Settings"
          title="Documents & numbering"
          subtitle="Continue numbering from a previous system without rewriting historical jobs, invoices, quotes, or statements."
        />
        {message ? <div className="alert success" role="status">{message}</div> : null}
        {error ? <div className="alert warning" role="alert">{error}</div> : null}
        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Number sequences</h2>
              <p className="operator-section__subtitle">Each sequence is tenant-scoped and allocated atomically when a new record is created or issued.</p>
            </div>
          </div>
          <div className="operator-stack">
            {rows.map((row) => (
              <article className="operator-row" key={row.kind} data-testid={`numbering-${row.kind.toLowerCase()}`}>
                <div className="operator-row__main">
                  <div className="operator-row__title">{LABELS[row.kind]}</div>
                  <div className="operator-formGrid" style={{ marginTop: 12 }}>
                    <label>Prefix<input className="input" value={row.prefix} onChange={(event) => patch(row.kind, { prefix: event.target.value })} /></label>
                    <label>Next number<input className="input" type="number" min={1} value={row.nextNumber} onChange={(event) => patch(row.kind, { nextNumber: Number(event.target.value || 1) })} /></label>
                    <label>Suffix<input className="input" value={row.suffix} onChange={(event) => patch(row.kind, { suffix: event.target.value })} /></label>
                    <label>Minimum digits<input className="input" type="number" min={1} max={12} value={row.padding} onChange={(event) => patch(row.kind, { padding: Number(event.target.value || 1) })} /></label>
                  </div>
                  <p className="operator-note">Next preview: <strong data-testid={`numbering-preview-${row.kind.toLowerCase()}`}>{row.preview}</strong></p>
                </div>
                <div className="operator-row__actions">
                  <button className="button" type="button" disabled={busy !== ""} onClick={() => void save(row)}>
                    {busy === row.kind ? "Saving..." : "Save numbering"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
