import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import { isInventoryV1Enabled } from "../../lib/feature-flags";
import { readActiveLocationId, subscribeActiveLocationId } from "../../lib/location-context";

type InventoryWorkspaceTab = "parts" | "inventory" | "purchase-orders";

const TAB_META: Record<InventoryWorkspaceTab, { title: string; subtitle: string }> = {
  parts: {
    title: "Parts",
    subtitle: "Operator-safe catalog of parts, pricing, and availability across stock locations.",
  },
  inventory: {
    title: "Inventory",
    subtitle: "Track on-hand, reserved, and shortage pressure by location without introducing warehouse theater.",
  },
  "purchase-orders": {
    title: "Purchase Orders",
    subtitle: "Basic procurement workflow for ordered and received stock against live inventory locations.",
  },
};

function money(cents: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "GBP" }).format((cents || 0) / 100);
}

export function InventoryWorkspace({ initialTab }: { initialTab: InventoryWorkspaceTab }) {
  const enabled = isInventoryV1Enabled();
  const [tab, setTab] = useState<InventoryWorkspaceTab>(initialTab);
  const [parts, setParts] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [stock, setStock] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [activeLocationId, setActiveLocationId] = useState('all');
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [partForm, setPartForm] = useState({ sku: "", name: "", category: "", unit: "pcs", minLevel: 0, avgUnitCost: 0, unitPriceCents: 0 });
  const [locationForm, setLocationForm] = useState({ name: "", kind: "WAREHOUSE" });
  const [adjustForm, setAdjustForm] = useState({ stockItemId: "", inventoryLocationId: "", quantityDelta: 0, reorderPoint: 0, reason: "" });
  const [poForm, setPoForm] = useState({ supplierName: "", inventoryLocationId: "", stockItemId: "", qtyOrdered: 1, unitCost: 0, status: "ORDERED" });

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!enabled) return;
    setActiveLocationId(readActiveLocationId());
    return subscribeActiveLocationId(setActiveLocationId);
  }, [enabled]);

  async function loadAll() {
    if (!enabled) return;
    try {
      const [partsRes, locationsRes, stockRes, poRes, alertsRes] = await Promise.all([
        apiFetch(`/parts?q=${encodeURIComponent(query)}`),
        apiFetch(`/inventory/locations?locationId=${encodeURIComponent(activeLocationId)}`),
        apiFetch(`/inventory/stock?inventoryLocationId=all&locationId=${encodeURIComponent(activeLocationId)}&q=${encodeURIComponent(query)}`),
        apiFetch(`/purchase-orders?locationId=${encodeURIComponent(activeLocationId)}`),
        apiFetch(`/inventory/alerts?locationId=${encodeURIComponent(activeLocationId)}`).catch(() => []),
      ]);
      setParts(Array.isArray(partsRes) ? partsRes : []);
      setLocations(Array.isArray(locationsRes) ? locationsRes : []);
      setStock(Array.isArray(stockRes) ? stockRes : []);
      setPurchaseOrders(Array.isArray(poRes) ? poRes : []);
      setAlerts(Array.isArray(alertsRes) ? alertsRes : []);
      setError("");
    } catch (err: any) {
      setError(err?.message || "Failed to load parts and inventory workspace");
    }
  }

  useEffect(() => {
    void loadAll();
  }, [enabled, query, activeLocationId]);

  const stockSummary = useMemo(() => {
    return stock.reduce(
      (summary, row) => {
        summary.onHand += Number(row.quantityOnHand || 0);
        summary.reserved += Number(row.quantityReserved || 0);
        if (row.lowStock) summary.lowStock += 1;
        if (row.shortage || Number(row.availableQuantity || 0) <= 0) summary.shortage += 1;
        return summary;
      },
      { onHand: 0, reserved: 0, lowStock: 0, shortage: 0 },
    );
  }, [stock]);

  const openPurchaseOrders = useMemo(
    () => purchaseOrders.filter((po) => !["RECEIVED", "CANCELLED"].includes(String(po.status || ""))),
    [purchaseOrders],
  );

  async function createPart(event: React.FormEvent) {
    event.preventDefault();
    try {
      await apiFetch("/parts", {
        method: "POST",
        body: JSON.stringify(partForm),
      });
      setPartForm({ sku: "", name: "", category: "", unit: "pcs", minLevel: 0, avgUnitCost: 0, unitPriceCents: 0 });
      setStatus("Part created");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Failed to create part");
    }
  }

  async function createLocation(event: React.FormEvent) {
    event.preventDefault();
    try {
      await apiFetch("/inventory/locations", {
        method: "POST",
        body: JSON.stringify(locationForm),
      });
      setLocationForm({ name: "", kind: "WAREHOUSE" });
      setStatus("Inventory location created");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Failed to create inventory location");
    }
  }

  async function adjustStock(event: React.FormEvent) {
    event.preventDefault();
    try {
      await apiFetch("/inventory/stock/adjust", {
        method: "POST",
        body: JSON.stringify(adjustForm),
      });
      setAdjustForm({ stockItemId: "", inventoryLocationId: "", quantityDelta: 0, reorderPoint: 0, reason: "" });
      setStatus("Stock adjusted");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Failed to adjust stock");
    }
  }

  async function savePurchaseOrder(event: React.FormEvent) {
    event.preventDefault();
    try {
      await apiFetch("/purchase-orders", {
        method: "POST",
        body: JSON.stringify({
          supplierName: poForm.supplierName || undefined,
          inventoryLocationId: poForm.inventoryLocationId,
          status: poForm.status,
          lines: [
            {
              stockItemId: poForm.stockItemId,
              qtyOrdered: poForm.qtyOrdered,
              unitCost: poForm.unitCost,
            },
          ],
        }),
      });
      setPoForm({ supplierName: "", inventoryLocationId: "", stockItemId: "", qtyOrdered: 1, unitCost: 0, status: "ORDERED" });
      setStatus("Purchase order created");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Failed to create purchase order");
    }
  }

  async function receivePurchaseOrder(id: string) {
    try {
      await apiFetch(`/purchase-orders/${id}/receive`, { method: "POST", body: JSON.stringify({}) });
      setStatus("Purchase order received");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Failed to receive purchase order");
    }
  }

  const meta = TAB_META[tab];

  return (
    <div className="operator-stack">
      <section className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <p className="muted" style={{ margin: 0, textTransform: "uppercase", letterSpacing: "0.08em" }}>Operations system of record</p>
            <h1 style={{ margin: "8px 0 6px 0" }}>{meta.title}</h1>
            <p className="muted" style={{ margin: 0, maxWidth: 760 }}>{meta.subtitle}</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link className="button secondary" href="/dashboard/jobs/e2e-job-portal-active">Open seeded job</Link>
            <Link className="button secondary" href="/dashboard/analytics">Analytics</Link>
            <Link className="button secondary" href="/dashboard/intelligence">Intelligence</Link>
          </div>
        </div>
        {!enabled ? <p className="muted" style={{ marginTop: 12 }}>Inventory is currently disabled.</p> : null}
        {status ? <p style={{ color: "#0b7a5f", marginTop: 12 }}>{status}</p> : null}
        {error ? <p style={{ color: "#c2410c", marginTop: 12 }}>{error}</p> : null}
        <div className="tab-row" style={{ marginTop: 14 }}>
          <button className={`tab-button ${tab === "parts" ? "active" : ""}`} type="button" onClick={() => setTab("parts")}>Parts</button>
          <button className={`tab-button ${tab === "inventory" ? "active" : ""}`} type="button" onClick={() => setTab("inventory")}>Inventory</button>
          <button className={`tab-button ${tab === "purchase-orders" ? "active" : ""}`} type="button" onClick={() => setTab("purchase-orders")}>Purchase Orders</button>
        </div>
      </section>

      <section className="card operator-section" style={{ marginBottom: 16 }}>
        <div className="operator-section__header">
          <div>
            <h2 className="operator-section__title">Inventory posture</h2>
            <p className="operator-section__subtitle">Live stock, procurement, and shortage pressure derived from durable inventory rows.</p>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <div className="metric-card">
            <strong>Parts</strong>
            <p>{parts.length}</p>
          </div>
          <div className="metric-card">
            <strong>On hand units</strong>
            <p>{stockSummary.onHand.toFixed(2)}</p>
          </div>
          <div className="metric-card">
            <strong>Reserved units</strong>
            <p>{stockSummary.reserved.toFixed(2)}</p>
          </div>
          <div className="metric-card">
            <strong>Low stock rows</strong>
            <p>{stockSummary.lowStock}</p>
          </div>
          <div className="metric-card">
            <strong>Shortage rows</strong>
            <p>{stockSummary.shortage}</p>
          </div>
          <div className="metric-card">
            <strong>Open purchase orders</strong>
            <p>{openPurchaseOrders.length}</p>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginBottom: 16 }}>
        <label htmlFor="inventory-query">Search parts or stock</label>
        <input id="inventory-query" className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by SKU, name, or category" />
      </section>

      {tab === "parts" ? (
        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Part catalog</h2>
              <p className="operator-section__subtitle">Commercial part definitions stay separate from stock movements and job usage.</p>
            </div>
          </div>
          <form onSubmit={createPart} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 16 }}>
            <input className="input" placeholder="SKU" value={partForm.sku} onChange={(event) => setPartForm((current) => ({ ...current, sku: event.target.value }))} required />
            <input className="input" placeholder="Name" value={partForm.name} onChange={(event) => setPartForm((current) => ({ ...current, name: event.target.value }))} required />
            <input className="input" placeholder="Category" value={partForm.category} onChange={(event) => setPartForm((current) => ({ ...current, category: event.target.value }))} />
            <input className="input" placeholder="Unit" value={partForm.unit} onChange={(event) => setPartForm((current) => ({ ...current, unit: event.target.value }))} required />
            <input className="input" type="number" placeholder="Reorder point" value={partForm.minLevel} onChange={(event) => setPartForm((current) => ({ ...current, minLevel: Number(event.target.value || 0) }))} />
            <input className="input" type="number" placeholder="Unit cost" value={partForm.avgUnitCost} onChange={(event) => setPartForm((current) => ({ ...current, avgUnitCost: Number(event.target.value || 0) }))} />
            <input className="input" type="number" placeholder="Unit price cents" value={partForm.unitPriceCents} onChange={(event) => setPartForm((current) => ({ ...current, unitPriceCents: Number(event.target.value || 0) }))} />
            <div style={{ display: "flex", alignItems: "center" }}>
              <button className="button" type="submit">Save part</button>
            </div>
          </form>
          <div data-testid="part-list" style={{ display: "grid", gap: 10 }}>
            {parts.map((part) => (
              <div key={part.id} className="integration-card">
                <div>
                  <strong>{part.sku} · {part.name}</strong>
                  <p className="muted" style={{ margin: "4px 0 0 0" }}>
                    {part.category || "Uncategorised"} • {part.unit} • Cost {money(Number(part.unitCostCents || 0))} • Price {money(Number(part.unitPriceCents || 0))}
                  </p>
                </div>
                <div className="muted" style={{ textAlign: "right" }}>
                  <div>On hand {Number(part.quantityOnHand || 0).toFixed(2)}</div>
                  <div>Reserved {Number(part.quantityReserved || 0).toFixed(2)}</div>
                </div>
              </div>
            ))}
            {parts.length === 0 ? <p className="muted">No parts yet.</p> : null}
          </div>
        </section>
      ) : null}

      {tab === "inventory" ? (
        <>
          <section className="card operator-section" style={{ marginBottom: 16 }}>
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Locations and stock controls</h2>
                <p className="operator-section__subtitle">Adjust live stock, create locations, and monitor low-stock conditions by location.</p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
              <form onSubmit={createLocation} style={{ display: "grid", gap: 10 }}>
                <strong>Create location</strong>
                <input className="input" placeholder="Location name" value={locationForm.name} onChange={(event) => setLocationForm((current) => ({ ...current, name: event.target.value }))} required />
                <select className="input" value={locationForm.kind} onChange={(event) => setLocationForm((current) => ({ ...current, kind: event.target.value }))}>
                  <option value="WAREHOUSE">Warehouse</option>
                  <option value="VAN">Van</option>
                  <option value="OFFICE">Office</option>
                  <option value="SUPPLIER_VIRTUAL">Supplier virtual</option>
                </select>
                <button className="button secondary" type="submit">Save location</button>
              </form>
              <form onSubmit={adjustStock} style={{ display: "grid", gap: 10 }}>
                <strong>Adjust stock</strong>
                <select className="input" value={adjustForm.stockItemId} onChange={(event) => setAdjustForm((current) => ({ ...current, stockItemId: event.target.value }))} required>
                  <option value="">Select part</option>
                  {parts.map((part) => (
                    <option key={part.id} value={part.id}>{part.sku} · {part.name}</option>
                  ))}
                </select>
                <select className="input" value={adjustForm.inventoryLocationId} onChange={(event) => setAdjustForm((current) => ({ ...current, inventoryLocationId: event.target.value }))} required>
                  <option value="">Select location</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>{location.name}</option>
                  ))}
                </select>
                <input className="input" type="number" placeholder="Quantity delta" value={adjustForm.quantityDelta} onChange={(event) => setAdjustForm((current) => ({ ...current, quantityDelta: Number(event.target.value || 0) }))} required />
                <input className="input" type="number" placeholder="Reorder point" value={adjustForm.reorderPoint} onChange={(event) => setAdjustForm((current) => ({ ...current, reorderPoint: Number(event.target.value || 0) }))} />
                <input className="input" placeholder="Reason" value={adjustForm.reason} onChange={(event) => setAdjustForm((current) => ({ ...current, reason: event.target.value }))} />
                <button className="button" type="submit">Apply adjustment</button>
              </form>
            </div>
          </section>

          <section className="card operator-section">
            <div className="operator-section__header">
              <div>
                <h2 className="operator-section__title">Stock by location</h2>
                <p className="operator-section__subtitle">Shortage pressure is explicit: no hidden reservations and no silent negative inventory.</p>
              </div>
            </div>
            <div data-testid="inventory-stock-grid" style={{ display: "grid", gap: 10 }}>
              {stock.map((row) => (
                <div key={row.id} className="integration-card">
                  <div>
                    <strong>{row.sku} · {row.name}</strong>
                    <p className="muted" style={{ margin: "4px 0 0 0" }}>
                      {row.locationName} • On hand {Number(row.quantityOnHand || 0).toFixed(2)} • Reserved {Number(row.quantityReserved || 0).toFixed(2)} • Available {Number(row.availableQuantity || 0).toFixed(2)}
                    </p>
                  </div>
                  <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                    {row.lowStock ? <span className="badge warn">Low stock</span> : <span className="badge">Healthy</span>}
                    {row.lowStock || row.shortage || Number(row.availableQuantity || 0) <= 0 ? <span className="badge warn">Shortage pressure</span> : null}
                  </div>
                </div>
              ))}
              {stock.length === 0 ? <p className="muted">No stock rows yet.</p> : null}
            </div>
            {alerts.length ? (
              <div style={{ marginTop: 14 }}>
                <strong>Live low-stock alerts</strong>
                <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
                  {alerts.map((alert) => (
                    <div key={`${alert.inventoryLocationId}-${alert.partId}`} className="integration-card">
                      <div>
                        <strong>{alert.item?.sku || alert.sku} · {alert.item?.name || alert.name}</strong>
                        <p className="muted" style={{ margin: "4px 0 0 0" }}>
                          {alert.inventoryLocationName || alert.locationName} • Current {alert.currentLevel ?? alert.quantityOnHand} • Threshold {alert.item?.minLevel ?? alert.reorderPoint}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      {tab === "purchase-orders" ? (
        <section className="card operator-section">
          <div className="operator-section__header">
            <div>
              <h2 className="operator-section__title">Procurement queue</h2>
              <p className="operator-section__subtitle">Draft, order, receive, and trace purchase orders back into live stock rows.</p>
            </div>
          </div>
          <form onSubmit={savePurchaseOrder} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 16 }}>
            <input className="input" data-testid="purchase-order-supplier" placeholder="Supplier name" value={poForm.supplierName} onChange={(event) => setPoForm((current) => ({ ...current, supplierName: event.target.value }))} />
            <select className="input" data-testid="purchase-order-location" value={poForm.inventoryLocationId} onChange={(event) => setPoForm((current) => ({ ...current, inventoryLocationId: event.target.value }))} required>
              <option value="">Select receiving location</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>{location.name}</option>
              ))}
            </select>
            <select className="input" data-testid="purchase-order-part" value={poForm.stockItemId} onChange={(event) => setPoForm((current) => ({ ...current, stockItemId: event.target.value }))} required>
              <option value="">Select part</option>
              {parts.map((part) => (
                <option key={part.id} value={part.id}>{part.sku} · {part.name}</option>
              ))}
            </select>
            <input className="input" data-testid="purchase-order-qty" type="number" min="0.01" step="0.01" placeholder="Qty ordered" value={poForm.qtyOrdered} onChange={(event) => setPoForm((current) => ({ ...current, qtyOrdered: Number(event.target.value || 0) }))} required />
            <input className="input" type="number" min="0" step="0.01" placeholder="Unit cost" value={poForm.unitCost} onChange={(event) => setPoForm((current) => ({ ...current, unitCost: Number(event.target.value || 0) }))} />
            <select className="input" value={poForm.status} onChange={(event) => setPoForm((current) => ({ ...current, status: event.target.value }))}>
              <option value="DRAFT">Draft</option>
              <option value="ORDERED">Ordered</option>
            </select>
            <div style={{ display: "flex", alignItems: "center" }}>
              <button className="button" data-testid="purchase-order-save" type="submit">Save purchase order</button>
            </div>
          </form>
          <div data-testid="purchase-order-list" style={{ display: "grid", gap: 10 }}>
            {purchaseOrders.map((po) => (
              <div key={po.id} className="integration-card">
                <div>
                  <strong>{po.supplierName || "Unassigned supplier"} · {po.status}</strong>
                  <p className="muted" style={{ margin: "4px 0 0 0" }}>
                    {po.inventoryLocationName || "No receiving location"} • {(po.lines || []).map((line: any) => `${line.sku || line.partId} x${line.quantityOrdered}`).join(", ")}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="muted">Received {(po.lines || []).reduce((sum: number, line: any) => sum + Number(line.quantityReceived || 0), 0).toFixed(2)}</span>
                  {!["RECEIVED", "CANCELLED"].includes(String(po.status || "")) ? (
                    <button className="button secondary" type="button" onClick={() => void receivePurchaseOrder(po.id)}>Receive</button>
                  ) : null}
                </div>
              </div>
            ))}
            {purchaseOrders.length === 0 ? <p className="muted">No purchase orders yet.</p> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
