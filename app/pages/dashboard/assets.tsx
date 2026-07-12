import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import { OperatorStatusBadge } from "../../components/ui/operator-page";
import { apiFetch } from "../../lib/api";

type Asset = {
  id: string;
  name: string;
  equipmentType: string;
  serialNumber?: string | null;
  status: string;
  assignedOperatorId?: string | null;
  assignedJobId?: string | null;
  maintenanceDueAt?: string | null;
  requiredForTemplate?: string | null;
};

export default function AssetsPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [form, setForm] = useState({ name: "", equipmentType: "", serialNumber: "", requiredForTemplate: "" });
  const [operatorId, setOperatorId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    setAssets(await apiFetch("/enterprise/phase-9/assets"));
  }

  useEffect(() => {
    void load().catch((err) => setError(err?.message || "Failed to load assets"));
  }, []);

  async function createAsset() {
    setBusy("create");
    setError("");
    try {
      await apiFetch("/enterprise/phase-9/assets", { method: "POST", body: JSON.stringify(form) });
      setForm({ name: "", equipmentType: "", serialNumber: "", requiredForTemplate: "" });
      setCreateOpen(false);
      setMessage("Asset added.");
      await load();
    } catch (err: any) {
      setError(err?.message || "Asset could not be added");
    } finally {
      setBusy("");
    }
  }

  async function action(asset: Asset, actionName: string) {
    setBusy(asset.id);
    setError("");
    try {
      await apiFetch(`/enterprise/phase-9/assets/${asset.id}/${actionName}`, {
        method: "POST",
        body: JSON.stringify(actionName === "checkout" ? { operatorId } : {}),
      });
      setMessage(`${asset.name} updated.`);
      await load();
    } catch (err: any) {
      setError(err?.message || "Asset could not be updated");
    } finally {
      setBusy("");
    }
  }

  const assetTypes = useMemo(() => Array.from(new Set(assets.map((asset) => asset.equipmentType).filter(Boolean))).sort(), [assets]);
  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((asset) => {
      const haystack = [asset.name, asset.equipmentType, asset.serialNumber, asset.requiredForTemplate, asset.assignedJobId].filter(Boolean).join(" ").toLowerCase();
      if (q && !haystack.includes(q)) return false;
      if (statusFilter !== "all" && asset.status !== statusFilter) return false;
      if (typeFilter !== "all" && asset.equipmentType !== typeFilter) return false;
      return true;
    });
  }, [assets, search, statusFilter, typeFilter]);
  const activeFilters = Boolean(search || statusFilter !== "all" || typeFilter !== "all");
  const metrics = [
    { id: "all", label: "Tracked", value: assets.length },
    { id: "AVAILABLE", label: "Active", value: assets.filter((asset) => asset.status === "AVAILABLE").length },
    { id: "CHECKED_OUT", label: "Assigned", value: assets.filter((asset) => asset.status === "CHECKED_OUT" || asset.assignedOperatorId || asset.assignedJobId).length },
    { id: "OUT_OF_SERVICE", label: "Unavailable", value: assets.filter((asset) => asset.status === "OUT_OF_SERVICE").length },
  ];

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setTypeFilter("all");
  }

  return (
    <DashboardShell>
      <div className="operator-stack">
        <header className="premium-page-header" data-testid="assets-premium-header">
          <div>
            <h1>Assets</h1>
            <p>Asset register</p>
          </div>
          <div className="premium-page-header__actions">
            <button className="button" type="button" onClick={() => setCreateOpen((open) => !open)} data-testid="asset-create-open">Add asset</button>
          </div>
        </header>

        <section className="premium-metric-grid" aria-label="Asset overview">
          {metrics.map((metric) => (
            <button
              key={metric.id}
              type="button"
              className={`premium-metric-card${statusFilter === metric.id || (metric.id === "all" && statusFilter === "all") ? " is-active" : ""}`}
              onClick={() => setStatusFilter(metric.id)}
            >
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </button>
          ))}
        </section>

        {error ? <div className="alert error" role="alert">{error}</div> : null}
        {message ? <div className="alert success" role="status">{message}</div> : null}

        <section className="card operator-section" data-testid="asset-register">
          {createOpen ? (
            <div className="premium-drawer-panel" data-testid="asset-create-panel">
              <div className="operator-section__header">
                <div>
                  <h2 className="operator-section__title">Add asset</h2>
                </div>
              </div>
              <div className="settings-premium-grid">
                <label>Asset name<input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
                <label>Equipment type<input className="input" value={form.equipmentType} onChange={(event) => setForm({ ...form, equipmentType: event.target.value })} /></label>
                <label>Serial number<input className="input" value={form.serialNumber} onChange={(event) => setForm({ ...form, serialNumber: event.target.value })} /></label>
                <label>Required on selected job sheets<input className="input" value={form.requiredForTemplate} onChange={(event) => setForm({ ...form, requiredForTemplate: event.target.value })} /></label>
              </div>
              <div className="premium-inline-actions">
                <button className="button" type="button" onClick={() => void createAsset()} disabled={!form.name || !form.equipmentType || busy === "create"} data-testid="asset-create">Add asset</button>
                <button className="button secondary" type="button" onClick={() => setCreateOpen(false)} disabled={busy === "create"}>Cancel</button>
              </div>
            </div>
          ) : null}

          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Asset register</h2>
            </div>
          </div>

          <div className="premium-toolbar">
            <label className="operator-filterbar__search">
              <span className="operator-filterbar__label">Search</span>
              <input className="input operator-filterbar__input" aria-label="Search assets..." placeholder="Search assets..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
            <label className="operator-filterbar__field">
              <span className="operator-filterbar__label">Type</span>
              <select className="input" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="all">All types</option>
                {assetTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="operator-filterbar__field">
              <span className="operator-filterbar__label">Status</span>
              <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="AVAILABLE">Available</option>
                <option value="CHECKED_OUT">Assigned</option>
                <option value="OUT_OF_SERVICE">Unavailable</option>
              </select>
            </label>
            {activeFilters ? <button className="button secondary" type="button" onClick={clearFilters}>Reset filters</button> : null}
          </div>

          <div className="billing-provider-list" style={{ marginTop: 16 }}>
          {filteredAssets.map((asset) => (
            <article className="billing-provider-card" key={asset.id} data-testid={`asset-row-${asset.id}`}>
              <div className="billing-ops-panel__header">
                <div>
                  <strong>{asset.name}</strong>
                  <p className="muted" style={{ margin: "4px 0 0" }}>{asset.equipmentType}{asset.serialNumber ? ` · ${asset.serialNumber}` : ""}</p>
                </div>
                <OperatorStatusBadge label={asset.status.replaceAll("_", " ")} tone={asset.status === "AVAILABLE" ? "success" : asset.status === "OUT_OF_SERVICE" ? "warning" : "info"} />
              </div>
              <p className="muted">Required on job sheets: {asset.requiredForTemplate || "None"} · Assigned job: {asset.assignedJobId || "None"}</p>
              <div className="billing-page-actions">
                {asset.status === "AVAILABLE" ? (
                  <>
                    <input className="input" aria-label={`Operator for ${asset.name}`} placeholder="Assigned operator ID" value={operatorId} onChange={(event) => setOperatorId(event.target.value)} />
                    <button className="button secondary" type="button" onClick={() => void action(asset, "checkout")} disabled={!operatorId || busy === asset.id}>Check out</button>
                  </>
                ) : (
                  <button className="button secondary" type="button" onClick={() => void action(asset, "checkin")} disabled={busy === asset.id}>Check in</button>
                )}
                <button className="button secondary" type="button" onClick={() => void action(asset, "maintenance-due")} disabled={busy === asset.id}>Maintenance due</button>
                <button className="button secondary" type="button" onClick={() => void action(asset, "out-of-service")} disabled={busy === asset.id}>Out of service</button>
                <button className="button secondary" type="button" onClick={() => void action(asset, "inspect")} disabled={busy === asset.id}>Record inspection</button>
              </div>
            </article>
          ))}
          {!filteredAssets.length ? (
            <div className="premium-empty-state" data-testid="assets-empty-state">
              <h3>{assets.length ? "No assets match these filters." : "No assets yet"}</h3>
              {assets.length ? <button className="button secondary" type="button" onClick={clearFilters}>Clear filters</button> : <button className="button" type="button" onClick={() => setCreateOpen(true)}>Add asset</button>}
            </div>
          ) : null}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
