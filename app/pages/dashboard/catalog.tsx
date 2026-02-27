import { useEffect, useState } from 'react';
import { DashboardShell } from '../../components/dashboard-shell';
import { apiFetch } from '../../lib/api';

export default function CatalogPage() {
  const [items, setItems] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [unitPrice, setUnitPrice] = useState('0');
  const [defaultQty, setDefaultQty] = useState('1');
  const [active, setActive] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiFetch('/catalog/items');
      setItems(Array.isArray(res) ? res : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load catalog');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        name,
        unitPrice: Number(unitPrice),
        defaultQty: Number(defaultQty),
        active,
      };
      if (editingId) {
        await apiFetch(`/catalog/items/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/catalog/items', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setName('');
      setUnitPrice('0');
      setDefaultQty('1');
      setActive(true);
      setEditingId(null);
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to save item');
    }
  }

  async function remove(id: string) {
    setError('');
    try {
      await apiFetch(`/catalog/items/${id}`, { method: 'DELETE' });
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to delete item');
    }
  }

  return (
    <DashboardShell>
      <div className="card">
        <h1>Service Catalog</h1>
        {error && <p style={{ color: '#ff8a8a' }}>{error}</p>}

        <form onSubmit={save}>
          <label>Item name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />

          <label>Unit price</label>
          <input className="input" type="number" min={0} step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} required />

          <label>Default quantity</label>
          <input className="input" type="number" min={1} value={defaultQty} onChange={(e) => setDefaultQty(e.target.value)} required />

          <label>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ marginRight: 8 }} />
            Active
          </label>

          <button className="button" type="submit" style={{ marginTop: 12 }}>
            {editingId ? 'Update Item' : 'Create Item'}
          </button>
        </form>

        <div className="list" style={{ marginTop: 20 }}>
          {items.map((item) => (
            <div key={item.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong>{item.name}</strong>
                <span className="badge">{item.active ? 'ACTIVE' : 'INACTIVE'}</span>
              </div>
              <p className="muted" style={{ marginBottom: 8 }}>Unit: {String(item.unitPrice)} | Qty: {item.defaultQty}</p>
              <button
                className="button"
                type="button"
                style={{ marginRight: 10 }}
                onClick={() => {
                  setEditingId(item.id);
                  setName(item.name);
                  setUnitPrice(String(item.unitPrice));
                  setDefaultQty(String(item.defaultQty));
                  setActive(Boolean(item.active));
                }}
              >
                Edit
              </button>
              <button className="button" type="button" onClick={() => remove(item.id)}>
                Delete
              </button>
            </div>
          ))}
          {items.length === 0 && !error && <p>No catalog items yet.</p>}
        </div>
      </div>
    </DashboardShell>
  );
}
