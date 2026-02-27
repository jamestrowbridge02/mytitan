import { useEffect, useState } from 'react';
import { DashboardShell } from '../../components/dashboard-shell';
import { apiFetch } from '../../lib/api';
import { isInventoryV1Enabled } from '../../lib/feature-flags';

type TabKey = 'items' | 'levels' | 'po' | 'movements';

export default function InventoryPage() {
  const enabled = isInventoryV1Enabled();
  const [tab, setTab] = useState<TabKey>('items');
  const [items, setItems] = useState<any[]>([]);
  const [levels, setLevels] = useState<any[]>([]);
  const [pos, setPos] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [newItem, setNewItem] = useState<any>({ sku: '', name: '', unit: 'pcs', minLevel: 0 });
  const [newMove, setNewMove] = useState<any>({ stockItemId: '', type: 'OUT', qty: 1, reason: '' });
  const [newPo, setNewPo] = useState<any>({ lines: [] as any[] });

  async function loadAll() {
    if (!enabled) return;
    try {
      const [itemsRes, levelsRes, poRes] = await Promise.all([
        apiFetch(`/inventory/items?locationId=all&q=${encodeURIComponent(query)}`),
        apiFetch('/inventory/levels?locationId=all'),
        apiFetch('/inventory/purchase-orders'),
      ]);
      setItems(Array.isArray(itemsRes) ? itemsRes : []);
      setLevels(Array.isArray(levelsRes) ? levelsRes : []);
      setPos(Array.isArray(poRes) ? poRes : []);
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
      setNewItem({ sku: '', name: '', unit: 'pcs', minLevel: 0 });
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

  return (
    <DashboardShell>
      <div className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ marginTop: 0 }}>Inventory</h1>
        <p className="muted">Track parts, stock levels, purchase orders, and movements.</p>
        {!enabled ? <p className="muted">Inventory feature is disabled.</p> : null}
        {status ? <p style={{ color: '#5eead4' }}>{status}</p> : null}
        {error ? <p style={{ color: '#ff8a8a' }}>{error}</p> : null}
        <div className="tab-row">
          <button className={`tab-button ${tab === 'items' ? 'active' : ''}`} onClick={() => setTab('items')} type="button">Items</button>
          <button className={`tab-button ${tab === 'levels' ? 'active' : ''}`} onClick={() => setTab('levels')} type="button">Stock Levels</button>
          <button className={`tab-button ${tab === 'po' ? 'active' : ''}`} onClick={() => setTab('po')} type="button">Purchase Orders</button>
          <button className={`tab-button ${tab === 'movements' ? 'active' : ''}`} onClick={() => setTab('movements')} type="button">Movements</button>
        </div>
      </div>

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
            <label>Min level</label>
            <input className="input" type="number" value={newItem.minLevel} onChange={(e) => setNewItem({ ...newItem, minLevel: Number(e.target.value || 0) })} />
            <button className="button" type="submit">Create item</button>
          </form>
          <div className="list" style={{ marginTop: 16 }}>
            {items.map((item) => (
              <div key={item.id} className="integration-card">
                <div>
                  <strong>{item.sku} — {item.name}</strong>
                  <p className="muted" style={{ margin: '4px 0 0 0' }}>Unit: {item.unit}</p>
                </div>
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
        <div className="card">
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
        </div>
      ) : null}
    </DashboardShell>
  );
}

