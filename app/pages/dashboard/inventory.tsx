import { useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '../../components/dashboard-shell';
import { apiFetch } from '../../lib/api';
import { isInventoryProV1Enabled, isInventoryV1Enabled } from '../../lib/feature-flags';

type TabKey = 'dashboard' | 'items' | 'levels' | 'po' | 'movements';

function HelpTip({ text }: { text: string }) {
  return <span title={text} style={{ marginLeft: 6, cursor: 'help' }}>?</span>;
}

export default function InventoryPage() {
  const enabled = isInventoryV1Enabled();
  const proEnabled = isInventoryProV1Enabled();
  const [tab, setTab] = useState<TabKey>('dashboard');
  const [items, setItems] = useState<any[]>([]);
  const [levels, setLevels] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [valuation, setValuation] = useState<any>({ totalValue: 0, items: [] });
  const [movements, setMovements] = useState<any[]>([]);
  const [pos, setPos] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [newItem, setNewItem] = useState<any>({ sku: '', name: '', unit: 'pcs', minLevel: 0, avgUnitCost: 0, supplierId: '' });
  const [newMove, setNewMove] = useState<any>({ stockItemId: '', type: 'OUT', qty: 1, reason: '' });
  const [newPo, setNewPo] = useState<any>({ lines: [] as any[] });
  const [receiveStepSkipped, setReceiveStepSkipped] = useState(false);

  async function loadAll() {
    if (!enabled) return;
    try {
      const [itemsRes, levelsRes, poRes, alertsRes, valuationRes, movementRes] = await Promise.all([
        apiFetch(`/inventory/items?locationId=all&q=${encodeURIComponent(query)}`),
        apiFetch('/inventory/levels?locationId=all'),
        apiFetch('/inventory/purchase-orders'),
        apiFetch('/inventory/alerts').catch(() => []),
        apiFetch('/inventory/valuation').catch(() => ({ totalValue: 0, items: [] })),
        apiFetch('/inventory/movements').catch(() => []),
      ]);
      setItems(Array.isArray(itemsRes) ? itemsRes : []);
      setLevels(Array.isArray(levelsRes) ? levelsRes : []);
      setPos(Array.isArray(poRes) ? poRes : []);
      setAlerts(Array.isArray(alertsRes) ? alertsRes : []);
      setValuation(valuationRes || { totalValue: 0, items: [] });
      setMovements(Array.isArray(movementRes) ? movementRes : []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load inventory');
    }
  }

  useEffect(() => {
    loadAll();
  }, [enabled, query]);

  async function createItem(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setStatus('');
    try {
      await apiFetch('/inventory/items', {
        method: 'POST',
        body: JSON.stringify(newItem),
      });
      setNewItem({ sku: '', name: '', unit: 'pcs', minLevel: 0, avgUnitCost: 0, supplierId: '' });
      setStatus('Item created');
      loadAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to create item');
    }
  }

  async function addMovement(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setStatus('');
    try {
      await apiFetch('/inventory/movements', {
        method: 'POST',
        body: JSON.stringify(newMove),
      });
      setStatus('Movement added');
      setNewMove({ stockItemId: '', type: 'OUT', qty: 1, reason: '' });
      loadAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to add movement');
    }
  }

  async function createPo() {
    setError('');
    setStatus('');
    try {
      await apiFetch('/inventory/purchase-orders', {
        method: 'POST',
        body: JSON.stringify(newPo),
      });
      setStatus('Purchase order created');
      setNewPo({ lines: [] });
      loadAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to create purchase order');
    }
  }

  async function receivePo(id: string) {
    setError('');
    try {
      await apiFetch(`/inventory/purchase-orders/${id}/receive`, { method: 'POST' });
      setStatus('Purchase order received');
      loadAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to receive purchase order');
    }
  }

  async function reorderDraft(itemId: string) {
    try {
      await apiFetch(`/inventory/items/${itemId}/reorder-draft`, { method: 'POST', body: JSON.stringify({}) });
      setStatus('Reorder draft created');
      loadAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to create reorder draft');
    }
  }

  const openPOs = useMemo(() => pos.filter((p) => p.status !== 'RECEIVED' && p.status !== 'CANCELLED'), [pos]);

  return (
    <DashboardShell>
      <div className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ marginTop: 0 }}>Inventory</h1>
        <p className="muted">Track parts, stock levels, purchase orders, movements, and valuation.</p>
        {!enabled ? <p className="muted">Inventory feature is disabled.</p> : null}
        {status ? <p style={{ color: '#5eead4' }}>{status}</p> : null}
        {error ? <p style={{ color: '#ff8a8a' }}>{error}</p> : null}
        <div className="tab-row">
          <button className={`tab-button ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')} type="button">Inventory Dashboard</button>
          <button className={`tab-button ${tab === 'items' ? 'active' : ''}`} onClick={() => setTab('items')} type="button">Items</button>
          <button className={`tab-button ${tab === 'levels' ? 'active' : ''}`} onClick={() => setTab('levels')} type="button">Stock Levels</button>
          <button className={`tab-button ${tab === 'po' ? 'active' : ''}`} onClick={() => setTab('po')} type="button">Purchase Orders</button>
          <button className={`tab-button ${tab === 'movements' ? 'active' : ''}`} onClick={() => setTab('movements')} type="button">Movements</button>
        </div>
      </div>

      {tab === 'dashboard' ? (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ marginTop: 0 }}>Inventory Dashboard</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
              <div className="metric-card"><strong>Low stock alerts</strong><p>{alerts.length}</p></div>
              <div className="metric-card"><strong>Open POs</strong><p>{openPOs.length}</p></div>
              <div className="metric-card"><strong>Recent movements</strong><p>{movements.length}</p></div>
              <div className="metric-card"><strong>Stock valuation</strong><p>{Number(valuation?.totalValue || 0).toFixed(2)}</p></div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>Low stock</h3>
            <div className="list">
              {alerts.map((row: any) => (
                <div key={row.item.id} className="integration-card">
                  <div>
                    <strong>{row.item.sku} — {row.item.name}</strong>
                    <p className="muted">Current: {row.currentLevel} • Threshold: {row.item.minLevel}</p>
                  </div>
                  <button className="button secondary" type="button" onClick={() => reorderDraft(row.item.id)}>Quick reorder draft PO</button>
                </div>
              ))}
              {alerts.length === 0 ? <p className="muted">No low-stock alerts.</p> : null}
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Guided Receive PO workflow</h3>
            <p className="muted">Step 1: create/select PO. Step 2: receive PO. Step 3: allocate to job. You can skip.</p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={receiveStepSkipped} onChange={(e) => setReceiveStepSkipped(Boolean(e.target.checked))} />
              Skip receive workflow for now
            </label>
            <button className="button secondary" type="button" onClick={() => setTab('po')}>Open PO tab</button>
          </div>
        </>
      ) : null}

      {tab === 'items' ? (
        <div className="card">
          <label>Search items</label>
          <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="SKU or name" />
          <form onSubmit={createItem}>
            <label>SKU</label>
            <input className="input" value={newItem.sku} onChange={(e) => setNewItem({ ...newItem, sku: e.target.value })} required />
            <label>Name</label>
            <input className="input" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} required />
            <label>Unit</label>
            <input className="input" value={newItem.unit} onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })} required />
            <label>Low stock threshold<HelpTip text="Alert when current qty is <= this number." /></label>
            <input className="input" type="number" value={newItem.minLevel} onChange={(e) => setNewItem({ ...newItem, minLevel: Number(e.target.value || 0) })} />
            {proEnabled ? (
              <>
                <label>Average unit cost</label>
                <input className="input" type="number" value={newItem.avgUnitCost} onChange={(e) => setNewItem({ ...newItem, avgUnitCost: Number(e.target.value || 0) })} />
                <label>Supplier ID<HelpTip text="Optional: link item to a supplier for quick reorder drafts." /></label>
                <input className="input" value={newItem.supplierId} onChange={(e) => setNewItem({ ...newItem, supplierId: e.target.value })} />
              </>
            ) : null}
            <button className="button" type="submit">Create item</button>
          </form>
          <div className="list" style={{ marginTop: 16 }}>
            {items.map((item) => (
              <div key={item.id} className="integration-card">
                <div>
                  <strong>{item.sku} — {item.name}</strong>
                  <p className="muted" style={{ margin: '4px 0 0 0' }}>Unit: {item.unit} • Min: {item.minLevel} • Avg cost: {item.avgUnitCost || 0}</p>
                </div>
                <button className="button secondary" type="button" onClick={() => reorderDraft(item.id)}>Reorder draft</button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === 'levels' ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Stock levels by location</h2>
          <div className="list">
            {levels.map((row: any) => (
              <div key={row.item.id} className="integration-card">
                <div>
                  <strong>{row.item.sku} — {row.item.name}</strong>
                  <p className="muted" style={{ margin: '4px 0 0 0' }}>Current: {row.currentLevel} • Min: {row.item.minLevel}</p>
                </div>
                {row.lowStock ? <span className="badge warn">Low stock</span> : <span className="badge">OK</span>}
              </div>
            ))}
            {levels.length === 0 ? <p className="muted">No stock levels yet.</p> : null}
          </div>
        </div>
      ) : null}

      {tab === 'po' ? (
        <div className="card" id="po">
          <h2 style={{ marginTop: 0 }}>Purchase Orders</h2>
          <p className="muted">Quick create then receive when goods arrive.</p>
          <button className="button" type="button" onClick={createPo}>Create empty PO</button>
          <div className="list" style={{ marginTop: 16 }}>
            {pos.map((po) => (
              <div key={po.id} className="integration-card">
                <div>
                  <strong>{po.id.slice(0, 12)}</strong>
                  <p className="muted" style={{ margin: '4px 0 0 0' }}>Status: {po.status} • Lines: {po.lines?.length || 0}</p>
                </div>
                <div className="integration-actions">
                  {po.status !== 'RECEIVED' ? <button className="button secondary" type="button" onClick={() => receivePo(po.id)}>Receive</button> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === 'movements' ? (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Add stock movement</h2>
          <form onSubmit={addMovement}>
            <label>Stock item ID</label>
            <input className="input" value={newMove.stockItemId} onChange={(e) => setNewMove({ ...newMove, stockItemId: e.target.value })} required />
            <label>Type</label>
            <select className="input" value={newMove.type} onChange={(e) => setNewMove({ ...newMove, type: e.target.value })}>
              <option value="IN">IN</option>
              <option value="OUT">OUT</option>
              <option value="ADJUST">ADJUST</option>
            </select>
            <label>Qty</label>
            <input className="input" type="number" value={newMove.qty} onChange={(e) => setNewMove({ ...newMove, qty: Number(e.target.value || 0) })} required />
            <label>Reason</label>
            <input className="input" value={newMove.reason} onChange={(e) => setNewMove({ ...newMove, reason: e.target.value })} />
            <button className="button" type="submit">Add movement</button>
          </form>
          <h3>Recent movements</h3>
          <div className="list">
            {movements.map((m) => (
              <div key={m.id} className="integration-card">
                <div>
                  <strong>{m.type} {m.qty}</strong>
                  <p className="muted">{m.stockItem?.sku} {m.stockItem?.name} • {new Date(m.createdAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}
