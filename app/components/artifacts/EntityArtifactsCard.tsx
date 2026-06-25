import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { apiFetch, getApiBase } from "../../lib/api";
import { formatUploadLimit, UPLOAD_LIMITS, validateUploadFile } from "../../lib/upload-policy";

type EntityArtifactsCardProps = {
  title: string;
  entityType: "job" | "customer";
  entityId: string;
  readOnly?: boolean;
};

type ArtifactItem = {
  id: string;
  kind: string;
  label: string;
  fileName?: string | null;
  sizeLabel?: string | null;
  portalVisible?: boolean;
  createdAt?: string | null;
  downloadUrl?: string | null;
  folder?: string | null;
  tags?: string[];
  source?: string;
  deletable?: boolean;
};

type MediaGovernance = {
  storage?: { totalLabel?: string | null; storageLimitLabel?: string | null; nearLimit?: boolean };
  counts?: { customerVisible?: number; beforePhotos?: number; afterPhotos?: number; videos?: number; evidence?: number };
  retentionPolicy?: { configured?: boolean; archivePolicyReadiness?: string | null; exportPolicy?: string | null };
  warnings?: Array<{ key: string; impact?: string; action?: string; href?: string }>;
  destructiveActions?: { deleteWithoutExplicitAction?: boolean; archiveWithoutExplicitAction?: boolean; exportWithoutExplicitAction?: boolean; auditRequired?: boolean };
  search?: { enabled?: boolean; fields?: string[] };
  tagging?: { enabled?: boolean; tagsDerivedFromKindFolderAndVisibility?: boolean; customTagStorageReady?: boolean };
  folderTaxonomy?: Array<{ folder: string; searchable?: boolean; filterable?: boolean; taggable?: boolean; retentionReady?: boolean; exportReady?: boolean }>;
  uploadPolicy?: {
    virusScanning?: { status?: string; detail?: string };
    resumableUploads?: { supported?: boolean; readiness?: string; detail?: string };
  };
};

const KIND_OPTIONS: Record<"job" | "customer", Array<{ value: string; label: string }>> = {
  job: [
    { value: "JOB_ATTACHMENT", label: "Job attachment" },
    { value: "BEFORE_PHOTO", label: "Before photo" },
    { value: "AFTER_PHOTO", label: "After photo" },
    { value: "DAMAGE_PHOTO", label: "Damage photo" },
    { value: "TORQUE_EVIDENCE", label: "Torque evidence" },
    { value: "PAYMENT_EVIDENCE", label: "Payment evidence" },
    { value: "SUPPLIER_DOC", label: "Supplier document" },
    { value: "COMPLIANCE_DOC", label: "Compliance document" },
    { value: "VIDEO", label: "Video" },
    { value: "PORTAL_DOCUMENT", label: "Portal document" },
    { value: "INVOICE", label: "Invoice" },
    { value: "RECEIPT", label: "Receipt" },
  ],
  customer: [{ value: "CUSTOMER_ATTACHMENT", label: "Customer attachment" }],
};

function formatWhen(value?: string | null) {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString();
}

export function EntityArtifactsCard({
  title,
  entityType,
  entityId,
  readOnly = false,
}: EntityArtifactsCardProps) {
  const [items, setItems] = useState<ArtifactItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState(KIND_OPTIONS[entityType][0]?.value || "");
  const [portalVisible, setPortalVisible] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState("ALL");
  const [governance, setGovernance] = useState<MediaGovernance | null>(null);
  const labelInputRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    if (!entityId) return;
    setLoading(true);
    try {
      const response = await apiFetch(`/artifacts/entities/${entityType}/${entityId}`);
      setItems(Array.isArray(response) ? response : []);
      const governanceResponse = await apiFetch("/artifacts/governance").catch(() => null);
      setGovernance(governanceResponse || null);
    } catch (err: any) {
      setError(err?.message || "Failed to load artifacts");
      setItems([]);
      setGovernance(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  useEffect(() => {
    setKind(KIND_OPTIONS[entityType][0]?.value || "");
    setPortalVisible(false);
    setFile(null);
    setLabel("");
  }, [entityType, entityId]);

  async function upload() {
    if (!entityId || !file) return;
    const validationError = validateUploadFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const currentLabel = String(labelInputRef.current?.value || label || "").trim();
      const form = new FormData();
      if (currentLabel) form.append("label", currentLabel);
      form.append("kind", kind);
      if (entityType === "job") {
        form.append("portalVisible", portalVisible ? "true" : "false");
      }
      form.append("file", file);
      const created = await apiFetch(`/artifacts/entities/${entityType}/${entityId}/upload`, {
        method: "POST",
        body: form,
      });
      if (created?.id) {
        setItems((current) => [created, ...current.filter((item) => item.id !== created.id)]);
        setLoading(false);
      }
      setFile(null);
      setLabel("");
      setPortalVisible(false);
      const input = document.querySelector<HTMLInputElement>(`input[data-artifact-input="${entityType}-${entityId}"]`);
      if (input) input.value = "";
      void load();
    } catch (err: any) {
      setError(err?.message || "Failed to upload artifact");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/artifacts/${id}`, { method: "DELETE" });
      await load();
    } catch (err: any) {
      setError(err?.message || "Failed to remove artifact");
    } finally {
      setBusy(false);
    }
  }

  const taxonomyFolders = Array.isArray(governance?.folderTaxonomy) ? governance.folderTaxonomy.map((row) => row.folder).filter(Boolean) : [];
  const folders = Array.from(new Set([...taxonomyFolders, ...items.map((item) => item.folder || "job")])).sort();
  const visibleItems = items.filter((item) => {
    const folder = item.folder || "job";
    if (folderFilter !== "ALL" && folder !== folderFilter) return false;
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return [item.label, item.kind, item.fileName, folder, ...(Array.isArray(item.tags) ? item.tags : [])].filter(Boolean).join(" ").toLowerCase().includes(needle);
  });

  return (
    <section className="card" data-testid={`artifact-card-${entityType}`}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <h3 style={{ marginTop: 0, marginBottom: 6 }}>{title}</h3>
          <p className="muted" style={{ margin: 0 }}>
            Durable media and documents linked to this {entityType}, with foldering, search, and portal-safe visibility where allowed.
          </p>
        </div>
      </div>

      {governance ? (
        <div className="mt-pulse-grid" style={{ marginTop: 14 }} data-testid={`media-governance-${entityType}`}>
          <article className="mt-surface-note">
            <strong>{governance.storage?.totalLabel || "0 B"} stored</strong>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Limit warning: {governance.storage?.storageLimitLabel || "not configured"} · near limit: {governance.storage?.nearLimit ? "yes" : "no"}
            </p>
          </article>
          <article className="mt-surface-note">
            <strong>{governance.counts?.customerVisible || 0} customer-visible files</strong>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Before {governance.counts?.beforePhotos || 0} · after {governance.counts?.afterPhotos || 0} · videos {governance.counts?.videos || 0} · evidence {governance.counts?.evidence || 0}
            </p>
          </article>
          <article className="mt-surface-note">
            <strong>{governance.retentionPolicy?.configured ? "Retention reviewed" : "Retention needs review"}</strong>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              {String(governance.retentionPolicy?.archivePolicyReadiness || "needs_owner_review").replace(/_/g, " ")} · no automatic delete: {governance.destructiveActions?.deleteWithoutExplicitAction ? "no" : "yes"}
            </p>
          </article>
          <article className="mt-surface-note">
            <strong>{governance.search?.enabled ? "Search ready" : "Search needs review"} · {governance.tagging?.enabled ? "tagging ready" : "tagging needs review"}</strong>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              {governance.folderTaxonomy?.length || 0} governed folders · export readiness: {governance.retentionPolicy?.exportPolicy || "manual_export_before_archive"}
            </p>
          </article>
        </div>
      ) : null}

      {governance?.warnings?.length ? (
        <div className="operator-chipRow" style={{ marginTop: 12 }} data-testid={`media-governance-warnings-${entityType}`}>
          {governance.warnings.slice(0, 3).map((warning) => (
            <a key={warning.key} className="operator-tag" href={warning.href || "/dashboard/settings/operations#media-governance"}>
              {warning.action || warning.key.replaceAll("_", " ")}
            </a>
          ))}
        </div>
      ) : null}

      <div className="operator-grid operator-grid--three" style={{ marginTop: 14 }} data-testid={`artifact-folder-summary-${entityType}`}>
        {folders.length ? (
          folders.map((folder) => (
            <button
              key={folder}
              className={folderFilter === folder ? "button primary" : "button secondary"}
              type="button"
              onClick={() => setFolderFilter(folder)}
              data-testid={`artifact-folder-${folder}`}
            >
              {folder.replaceAll("-", " ")} · {items.filter((item) => (item.folder || "job") === folder).length}
            </button>
          ))
        ) : (
          <span className="muted">Folders appear when media or documents are attached.</span>
        )}
      </div>

      <div className="form-grid form-grid--two" style={{ marginTop: 12 }} data-testid={`artifact-search-filter-${entityType}`}>
        <label className="form-field">
          <span>Search media and documents</span>
          <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search label, type, or folder" data-testid={`artifact-search-${entityType}`} />
        </label>
        <label className="form-field">
          <span>Folder</span>
          <select className="input" value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)} data-testid={`artifact-folder-filter-${entityType}`}>
            <option value="ALL">All folders</option>
            {folders.map((folder) => (
              <option key={folder} value={folder}>{folder.replaceAll("-", " ")}</option>
            ))}
          </select>
        </label>
      </div>

      {!readOnly ? (
        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          <input
            ref={labelInputRef}
            className="input"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Label"
            data-testid={`artifact-label-${entityType}`}
          />
          <select
            className="input"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            data-testid={`artifact-kind-${entityType}`}
          >
            {KIND_OPTIONS[entityType].map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            type="file"
            className="input"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.mp4,.webm,.mov"
            data-artifact-input={`${entityType}-${entityId}`}
            data-testid={`artifact-file-${entityType}`}
            onChange={(event) => {
              const nextFile = event.target.files?.[0] || null;
              if (!nextFile) {
                setFile(null);
                return;
              }
              const validationError = validateUploadFile(nextFile);
              flushSync(() => {
                setError(validationError || "");
                setFile(validationError ? null : nextFile);
              });
              if (validationError) event.target.value = "";
            }}
          />
          <p className="muted" style={{ margin: 0 }} data-testid={`artifact-upload-policy-${entityType}`}>
            Images up to {formatUploadLimit(UPLOAD_LIMITS.image)}, videos up to {formatUploadLimit(UPLOAD_LIMITS.video)},
            PDFs up to {formatUploadLimit(UPLOAD_LIMITS.document)}, text up to {formatUploadLimit(UPLOAD_LIMITS.text)}.
            Large images or videos should be compressed before upload.
          </p>
          <p className="muted" style={{ margin: 0 }}>
            Virus scanning: {governance?.uploadPolicy?.virusScanning?.status || "not configured"}.
            Resumable uploads: {governance?.uploadPolicy?.resumableUploads?.supported ? "enabled" : "not enabled; retry queue ready"}.
          </p>
          {entityType === "job" ? (
            <label className="muted" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={portalVisible}
                onChange={(event) => setPortalVisible(event.target.checked)}
                data-testid={`artifact-portal-visible-${entityType}`}
              />
              Portal visible
            </label>
          ) : null}
          <div>
            <button
              className="button"
              type="button"
              onClick={() => void upload()}
              disabled={busy || !file}
              data-testid={`artifact-upload-${entityType}`}
            >
              {busy ? "Saving..." : "Add artifact"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="muted" style={{ color: "#fca5a5", marginTop: 12 }}>
          {error}
        </p>
      ) : null}

      <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
        {loading ? (
          <p className="muted">Loading artifacts...</p>
        ) : visibleItems.length ? (
          visibleItems.map((item) => {
            const href = item.downloadUrl
              ? item.downloadUrl.startsWith("http")
                ? item.downloadUrl
                : `${getApiBase()}${item.downloadUrl}`
              : null;
            return (
              <div
                key={item.id}
                className="integration-card"
                data-testid={`artifact-row-${item.id}`}
                style={{ alignItems: "center" }}
              >
                <div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <strong>{item.label}</strong>
                    {item.folder ? <span className="badge">{item.folder.replaceAll("-", " ")}</span> : null}
                    <span className="badge">{item.kind.replaceAll("_", " ")}</span>
                    {item.portalVisible ? <span className="badge warn">Portal visible</span> : null}
                    {item.source === "legacy" ? <span className="badge">Legacy link</span> : null}
                  </div>
                  <p className="muted" style={{ margin: "6px 0 0 0" }}>
                    {[item.fileName, item.sizeLabel, formatWhen(item.createdAt)].filter(Boolean).join(" • ")}
                  </p>
                  {Array.isArray(item.tags) && item.tags.length ? (
                    <p className="muted" style={{ margin: "4px 0 0 0" }}>Tags: {item.tags.slice(0, 3).join(", ")}</p>
                  ) : null}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {href ? (
                    <a className="button secondary" href={href} target="_blank" rel="noreferrer noopener">
                      Open
                    </a>
                  ) : null}
                  {!readOnly && item.deletable ? (
                    <button
                      className="button secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(item.id)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })
        ) : (
          <p className="muted">{items.length ? "No media or documents match the current filter." : "No artifacts linked yet."}</p>
        )}
      </div>
    </section>
  );
}
