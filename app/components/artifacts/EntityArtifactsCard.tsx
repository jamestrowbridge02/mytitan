import { useEffect, useState } from "react";
import { apiFetch, getApiBase } from "../../lib/api";

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
  source?: string;
  deletable?: boolean;
};

const KIND_OPTIONS: Record<"job" | "customer", Array<{ value: string; label: string }>> = {
  job: [
    { value: "JOB_ATTACHMENT", label: "Job attachment" },
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

  async function load() {
    if (!entityId) return;
    setLoading(true);
    try {
      const response = await apiFetch(`/artifacts/entities/${entityType}/${entityId}`);
      setItems(Array.isArray(response) ? response : []);
      setError("");
    } catch (err: any) {
      setError(err?.message || "Failed to load artifacts");
      setItems([]);
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
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      if (label.trim()) form.append("label", label.trim());
      if (entityType === "job") {
        form.append("portalVisible", portalVisible ? "true" : "false");
      }
      await apiFetch(`/artifacts/entities/${entityType}/${entityId}/upload`, {
        method: "POST",
        body: form,
      });
      setFile(null);
      setLabel("");
      setPortalVisible(false);
      const input = document.querySelector<HTMLInputElement>(`input[data-artifact-input="${entityType}-${entityId}"]`);
      if (input) input.value = "";
      await load();
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

  return (
    <section className="card" data-testid={`artifact-card-${entityType}`}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <h3 style={{ marginTop: 0, marginBottom: 6 }}>{title}</h3>
          <p className="muted" style={{ margin: 0 }}>
            Durable documents linked to this {entityType}, with portal-safe visibility on job records where allowed.
          </p>
        </div>
      </div>

      {!readOnly ? (
        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          <input
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
            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
            data-artifact-input={`${entityType}-${entityId}`}
            data-testid={`artifact-file-${entityType}`}
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
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
        ) : items.length ? (
          items.map((item) => {
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
                    <span className="badge">{item.kind.replaceAll("_", " ")}</span>
                    {item.portalVisible ? <span className="badge warn">Portal visible</span> : null}
                    {item.source === "legacy" ? <span className="badge">Legacy link</span> : null}
                  </div>
                  <p className="muted" style={{ margin: "6px 0 0 0" }}>
                    {[item.fileName, item.sizeLabel, formatWhen(item.createdAt)].filter(Boolean).join(" • ")}
                  </p>
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
          <p className="muted">No artifacts linked yet.</p>
        )}
      </div>
    </section>
  );
}
