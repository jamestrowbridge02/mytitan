import { useEffect, useState } from "react";
import { DashboardShell } from "../../components/dashboard-shell";
import { OperatorPageHeader, OperatorStatusBadge } from "../../components/ui/operator-page";
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

  return (
    <DashboardShell>
      <OperatorPageHeader
        eyebrow="Operations"
        title="Assets & tools"
        info="Track equipment availability, assignment, maintenance, inspections, and required-job warnings."
      />
      {error ? <div className="alert error">{error}</div> : null}
      {message ? <div className="alert success">{message}</div> : null}

      <section className="operator-section" data-testid="asset-register">
        <div className="operator-section__header">
          <div>
            <h2 className="operator-section__title">Asset register</h2>
            <p className="operator-section__subtitle">{assets.length} tracked assets</p>
          </div>
        </div>
        <div className="settings-premium-grid">
          <label>Asset name<input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Equipment type<input className="input" value={form.equipmentType} onChange={(event) => setForm({ ...form, equipmentType: event.target.value })} /></label>
          <label>Serial number<input className="input" value={form.serialNumber} onChange={(event) => setForm({ ...form, serialNumber: event.target.value })} /></label>
          <label>Required for template<input className="input" value={form.requiredForTemplate} onChange={(event) => setForm({ ...form, requiredForTemplate: event.target.value })} /></label>
        </div>
        <button className="button" type="button" onClick={() => void createAsset()} disabled={!form.name || !form.equipmentType || busy === "create"} data-testid="asset-create">Add asset</button>

        <div className="billing-provider-list" style={{ marginTop: 16 }}>
          {assets.map((asset) => (
            <article className="billing-provider-card" key={asset.id} data-testid={`asset-row-${asset.id}`}>
              <div className="billing-ops-panel__header">
                <div>
                  <strong>{asset.name}</strong>
                  <p className="muted" style={{ margin: "4px 0 0" }}>{asset.equipmentType}{asset.serialNumber ? ` · ${asset.serialNumber}` : ""}</p>
                </div>
                <OperatorStatusBadge label={asset.status.replaceAll("_", " ")} tone={asset.status === "AVAILABLE" ? "success" : asset.status === "OUT_OF_SERVICE" ? "warning" : "info"} />
              </div>
              <p className="muted">Required for: {asset.requiredForTemplate || "No template requirement"} · Assigned job: {asset.assignedJobId || "None"}</p>
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
        </div>
      </section>
    </DashboardShell>
  );
}
