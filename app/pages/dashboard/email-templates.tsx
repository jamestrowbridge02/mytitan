import { useEffect, useState } from 'react';
import { DashboardShell } from '../../components/dashboard-shell';
import { apiFetch } from '../../lib/api';

const TEMPLATE_TYPES = ['JOB_NOTIFICATION', 'INVOICE', 'BOOKING_CONFIRMATION'];

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState('JOB_NOTIFICATION');
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await apiFetch('/tenant/email-templates');
      setTemplates(Array.isArray(res) ? res : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load templates');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const payload = {
      type,
      subject,
      bodyText: bodyText || undefined,
      bodyHtml: bodyHtml || undefined,
    };
    try {
      if (editingId) {
        await apiFetch(`/tenant/email-templates/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch('/tenant/email-templates', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      setEditingId(null);
      setType('JOB_NOTIFICATION');
      setSubject('');
      setBodyText('');
      setBodyHtml('');
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to save template');
    }
  }

  async function remove(id: string) {
    setError('');
    try {
      await apiFetch(`/tenant/email-templates/${id}`, { method: 'DELETE' });
      await load();
    } catch (err: any) {
      setError(err.message || 'Failed to delete template');
    }
  }

  return (
    <DashboardShell>
      <div className="card">
        <h1>Email Templates</h1>
        {error && <p style={{ color: '#ff8a8a' }}>{error}</p>}

        <form onSubmit={save}>
          <label>Template type</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {TEMPLATE_TYPES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <label>Subject</label>
          <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} required />

          <label>Body (text)</label>
          <textarea className="input" rows={4} value={bodyText} onChange={(e) => setBodyText(e.target.value)} />

          <label>Body (HTML)</label>
          <textarea className="input" rows={4} value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} />

          <button className="button" type="submit">
            {editingId ? 'Update Template' : 'Create Template'}
          </button>
        </form>

        <div className="list" style={{ marginTop: 20 }}>
          {templates.map((template) => (
            <div key={template.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <strong>{template.type}</strong>
                <span className="badge">{template.subject}</span>
              </div>
              <p className="muted">{template.bodyText || 'No text body'}</p>
              <button
                className="button"
                type="button"
                style={{ marginRight: 10 }}
                onClick={() => {
                  setEditingId(template.id);
                  setType(template.type);
                  setSubject(template.subject || '');
                  setBodyText(template.bodyText || '');
                  setBodyHtml(template.bodyHtml || '');
                }}
              >
                Edit
              </button>
              <button className="button" type="button" onClick={() => remove(template.id)}>
                Delete
              </button>
            </div>
          ))}
          {templates.length === 0 && !error && <p>No templates yet.</p>}
        </div>
      </div>
    </DashboardShell>
  );
}
