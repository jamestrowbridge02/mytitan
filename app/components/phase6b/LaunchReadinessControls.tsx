import { useEffect, useMemo, useState } from "react";
import { apiFetch, getApiBase, getToken } from "../../lib/api";
import { formatUploadLimit, UPLOAD_LIMITS, validateUploadFile } from "../../lib/upload-policy";

const IMPORT_FIELDS: Record<string, string[]> = {
  customers: ["name", "email", "phone"],
  services: ["name", "description", "durationMinutes", "price", "color"],
  locations: ["name", "code", "addressLine1", "city", "country", "color"],
  inventory: ["sku", "name", "unit", "category", "minLevel", "unitCost", "price"],
  suppliers: ["name", "email", "phone", "color"],
  team_members: ["email", "role"],
  jobs: ["jobRef", "customerName", "customerEmail", "serviceName", "status", "total", "currency"],
  invoices: ["jobRef", "customerName", "customerEmail", "invoiceNumber", "invoiceIssuedAt", "total", "currency"],
};

const REQUIRED_FIELDS: Record<string, string[]> = {
  customers: ["name"],
  services: ["name"],
  locations: ["name"],
  inventory: ["sku", "name"],
  suppliers: ["name"],
  team_members: ["email", "role"],
  jobs: ["jobRef", "customerName"],
  invoices: ["jobRef", "customerName", "invoiceNumber"],
};

function parseCsv(text: string) {
  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) matrix.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) matrix.push(row);
  const headers = (matrix.shift() || []).map((value) => value.trim());
  const rows = matrix.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
  return { headers, rows };
}

function defaultMapping(entityType: string, headers: string[]) {
  const lowerHeaders = new Map(headers.map((header) => [header.toLowerCase().replace(/[^a-z0-9]/g, ""), header]));
  return Object.fromEntries(
    (IMPORT_FIELDS[entityType] || []).map((field) => [
      field,
      lowerHeaders.get(field.toLowerCase().replace(/[^a-z0-9]/g, "")) || "",
    ]),
  );
}

function effectiveLabel(value: string | null | undefined, fallback: string) {
  return value || `${fallback} default`;
}

export default function LaunchReadinessControls() {
  const [colours, setColours] = useState<any>(null);
  const [colourStatus, setColourStatus] = useState("");
  const [entityType, setEntityType] = useState("customers");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<any>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [importStatus, setImportStatus] = useState("");
  const [activationLinks, setActivationLinks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [colourData, batchData] = await Promise.all([
      apiFetch("/phase-6b/colours"),
      apiFetch("/phase-6b/imports"),
    ]);
    setColours(colourData);
    setBatches(Array.isArray(batchData) ? batchData : []);
  };

  useEffect(() => {
    void load().catch((error: any) => setImportStatus(error?.message || "Could not load launch controls."));
  }, []);

  useEffect(() => {
    setMapping(defaultMapping(entityType, headers));
    setPreview(null);
  }, [entityType, headers]);

  const mappingReady = useMemo(
    () => (REQUIRED_FIELDS[entityType] || []).every((field) => Boolean(mapping[field])),
    [entityType, mapping],
  );

  async function saveColour(entity: string, id: string, color: string | null) {
    setColourStatus("");
    try {
      await apiFetch(`/phase-6b/colours/${entity}/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ color }),
      });
      setColourStatus(color ? "Colour saved and audited." : "Colour reset to the accessible default.");
      const data = await apiFetch("/phase-6b/colours");
      setColours(data);
    } catch (error: any) {
      setColourStatus(error?.message || "Colour could not be saved.");
    }
  }

  async function previewImport() {
    setBusy(true);
    setImportStatus("");
    try {
      const result = await apiFetch("/phase-6b/imports/preview", {
        method: "POST",
        body: JSON.stringify({ entityType, mode: "CREATE", headers, rows, mapping }),
      });
      setPreview(result);
      setImportStatus(`Preview ready: ${result.counts.ready} ready, ${result.counts.failed} failed, ${result.counts.skipped} skipped.`);
      await load();
    } catch (error: any) {
      setImportStatus(error?.message || "Import preview failed.");
    } finally {
      setBusy(false);
    }
  }

  async function commitImport(id: string) {
    setBusy(true);
    try {
      const result = await apiFetch(`/phase-6b/imports/${id}/commit`, { method: "POST" });
      setImportStatus(`Committed ${result.importedCount} records. Rollback remains available for this batch.`);
      setActivationLinks(Array.isArray(result.activationLinks) ? result.activationLinks : []);
      setPreview(null);
      await load();
    } catch (error: any) {
      setImportStatus(error?.message || "Import commit failed.");
    } finally {
      setBusy(false);
    }
  }

  async function rollbackImport(id: string) {
    setBusy(true);
    try {
      const result = await apiFetch(`/phase-6b/imports/${id}/rollback`, { method: "POST" });
      setImportStatus(`Rolled back ${result.rolledBackCount} records from the selected batch.`);
      await load();
    } catch (error: any) {
      setImportStatus(error?.message || "Import rollback failed.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadErrors(id: string) {
    const response = await fetch(`${getApiBase()}/phase-6b/imports/${id}/errors.csv`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!response.ok) {
      setImportStatus("The error report could not be downloaded.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mytitan-import-${id}-errors.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const colourGroups = [
    { key: "services", entity: "service", label: "Services", fallback: colours?.defaults?.service },
    { key: "suppliers", entity: "supplier", label: "Suppliers", fallback: colours?.defaults?.supplier },
    { key: "users", entity: "user", label: "Team members", fallback: colours?.defaults?.user },
    { key: "locations", entity: "location", label: "Locations", fallback: colours?.defaults?.location },
  ];

  return (
    <>
      <section className="card" style={{ marginBottom: 16 }} data-testid="phase6b-colour-settings">
        <div className="operator-section__header">
          <div>
            <p className="operator-eyebrow">Workflow colours</p>
            <h2 className="operator-section__title">Colour coding with accessible defaults</h2>
            <p className="muted">Labels always remain visible. Colours add scanning context across booking, calendar, team, location, and supplier workflows.</p>
          </div>
          <div aria-label="Job status colour legend" data-testid="phase6b-calendar-legend" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.entries(colours?.statuses || {}).map(([label, color]) => (
              <span className="operator-tag" key={label} style={{ borderLeft: `8px solid ${String(color)}` }}>{label.replace(/_/g, " ")}</span>
            ))}
          </div>
        </div>
        {colourStatus ? <p role="status">{colourStatus}</p> : null}
        <div className="operator-grid operator-grid--four">
          {colourGroups.map((group) => (
            <article className="operator-mini-card" key={group.key}>
              <strong>{group.label}</strong>
              <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                {(colours?.[group.key] || []).map((item: any) => (
                  <div key={item.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: 10 }} data-testid={`phase6b-colour-${group.entity}-${item.id}`}>
                    <span style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                      <span aria-hidden="true" style={{ width: 14, height: 14, flex: "0 0 auto", borderRadius: 999, background: item.color || group.fallback, border: "1px solid currentColor" }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{item.name || item.email}</span>
                    </span>
                    <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <label className="sr-only" htmlFor={`colour-${group.entity}-${item.id}`}>{group.label} colour for {item.name || item.email}</label>
                      <input
                        id={`colour-${group.entity}-${item.id}`}
                        type="color"
                        value={item.color || group.fallback}
                        aria-label={`${group.label} colour for ${item.name || item.email}`}
                        onChange={(event) => void saveColour(group.entity, item.id, event.target.value)}
                      />
                      <button className="button secondary operator-compact-button" type="button" onClick={() => void saveColour(group.entity, item.id, null)}>Reset</button>
                    </span>
                    <small className="muted">{effectiveLabel(item.color, group.fallback)}</small>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="card" id="phase6-import-wizard" style={{ marginBottom: 16 }} data-testid="phase6-import-wizard">
        <div className="operator-section__header">
          <div>
            <p className="operator-eyebrow">Migration</p>
            <h2 className="operator-section__title">Live CSV import and rollback</h2>
            <p className="muted">Every batch is create-only, previewed before commit, tenant-scoped, audited, and rollbackable. Payment mutations are not supported.</p>
          </div>
          <span className="operator-tag">Create mode</span>
        </div>
        <div className="operator-formGrid">
          <label>
            Record type
            <select className="input" value={entityType} onChange={(event) => setEntityType(event.target.value)} data-testid="phase6-import-type">
              {Object.keys(IMPORT_FIELDS).map((type) => <option key={type} value={type}>{type.replace(/_/g, " ")}</option>)}
            </select>
          </label>
          <label>
            CSV file
            <input
              className="input"
              type="file"
              accept=".csv,text/csv"
              data-testid="phase6-import-file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const validationError = validateUploadFile(file, { category: "csv" });
                if (validationError) {
                  setHeaders([]);
                  setRows([]);
                  setImportStatus(validationError);
                  event.target.value = "";
                  return;
                }
                void file.text().then((text) => {
                  const parsed = parseCsv(text);
                  setHeaders(parsed.headers);
                  setRows(parsed.rows);
                  setImportStatus(`${parsed.rows.length} CSV rows loaded locally. Map columns before preview.`);
                });
              }}
            />
            <small className="muted">CSV only, maximum {formatUploadLimit(UPLOAD_LIMITS.csv)} and 2,000 rows per preview.</small>
          </label>
        </div>
        {headers.length ? (
          <div className="operator-grid operator-grid--four" style={{ marginTop: 14 }} data-testid="phase6-import-mapping">
            {(IMPORT_FIELDS[entityType] || []).map((field) => (
              <label key={field}>
                {field}{REQUIRED_FIELDS[entityType]?.includes(field) ? " *" : ""}
                <select className="input" value={mapping[field] || ""} onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value }))}>
                  <option value="">Do not import</option>
                  {headers.map((header) => <option key={header} value={header}>{header}</option>)}
                </select>
              </label>
            ))}
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          <button className="button" type="button" onClick={() => void previewImport()} disabled={busy || !rows.length || !mappingReady} data-testid="phase6-import-preview">
            {busy ? "Working..." : "Validate and preview"}
          </button>
          {preview?.status === "VALIDATED" ? (
            <button className="button" type="button" onClick={() => void commitImport(preview.id)} disabled={busy} data-testid="phase6-import-commit">Commit validated batch</button>
          ) : null}
          {preview?.id && (preview?.counts?.failed || preview?.counts?.skipped) ? (
            <button className="button secondary" type="button" onClick={() => void downloadErrors(preview.id)}>Download error report</button>
          ) : null}
        </div>
        {importStatus ? <p role="status" data-testid="phase6-import-status">{importStatus}</p> : null}
        {activationLinks.length ? (
          <div className="operator-guidance" data-testid="phase6-import-activation-links">
            <strong>Team activation links</strong>
            <p>These links are shown once after commit. Share each link with the intended team member through a secure channel.</p>
            <div style={{ display: "grid", gap: 8 }}>
              {activationLinks.map((href, index) => (
                <a className="button secondary" href={href} key={href} rel="noreferrer">Open activation link {index + 1}</a>
              ))}
            </div>
          </div>
        ) : null}
        {preview?.validation ? (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Row</th><th>Result</th><th>Reason</th></tr></thead>
              <tbody>
                {preview.validation.slice(0, 20).map((row: any) => (
                  <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.status}</td><td>{row.duplicate || row.errors?.join("; ") || "Ready to create"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <div style={{ display: "grid", gap: 8, marginTop: 16 }} data-testid="phase6-import-batches">
          {batches.slice(0, 8).map((batch) => (
            <div className="operator-mini-card" key={batch.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span><strong>{batch.entityType.replace(/_/g, " ")}</strong> · {batch.status} · {batch.importedCount} imported · {batch.failedCount} failed · {batch.skippedCount} skipped</span>
              <span style={{ display: "flex", gap: 8 }}>
                {(batch.failedCount || batch.skippedCount) ? <button className="button secondary operator-compact-button" type="button" onClick={() => void downloadErrors(batch.id)}>Errors</button> : null}
                {batch.status === "COMMITTED" ? <button className="button secondary operator-compact-button" type="button" onClick={() => void rollbackImport(batch.id)} disabled={busy} data-testid={`phase6-import-rollback-${batch.id}`}>Rollback</button> : null}
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
