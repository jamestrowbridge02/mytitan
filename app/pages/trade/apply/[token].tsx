import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getApiBase } from '../../../lib/api';

const API_BASE = getApiBase();

export default function TradeApplicationPage() {
  const router = useRouter();
  const token = String(router.query.token || '');
  const [config, setConfig] = useState<any>(null);
  const [form, setForm] = useState<any>({ businessName: '', contactName: '', contactEmail: '', contactPhone: '', companyNumber: '', taxRegistrationNumber: '', answers: {} });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/public/trade/applications/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.message || 'Trade applications are not open.');
        setConfig(body);
      })
      .catch((nextError) => setError(nextError.message));
  }, [token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/public/trade/applications/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message || 'Application could not be submitted.');
      await router.push(body.statusUrl);
    } catch (nextError: any) {
      setError(nextError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="container" style={{ maxWidth: 760, paddingTop: 32, paddingBottom: 48, ['--brand-600' as any]: config?.primaryColor || '#2563eb' }}>
      <section className="card">
        {config?.logoUrl ? <img src={config.logoUrl} alt="" style={{ width: 220, height: 84, objectFit: 'contain' }} /> : <strong>{config?.businessName || 'Trade account application'}</strong>}
        <h1>Open a trade account</h1>
        <p className="muted">Send your business details for review. Access is provided only after approval.</p>
        {error ? <p role="alert" className="error">{error}</p> : null}
        <form onSubmit={submit}>
          <label>Business name<input className="input" required value={form.businessName} onChange={(event) => setForm({ ...form, businessName: event.target.value })} /></label>
          <label>Contact name<input className="input" required value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} /></label>
          <div className="two-col">
            <label>Email<input className="input" type="email" required value={form.contactEmail} onChange={(event) => setForm({ ...form, contactEmail: event.target.value })} /></label>
            <label>Phone<input className="input" value={form.contactPhone} onChange={(event) => setForm({ ...form, contactPhone: event.target.value })} /></label>
            <label>Company number<input className="input" value={form.companyNumber} onChange={(event) => setForm({ ...form, companyNumber: event.target.value })} /></label>
            <label>VAT or tax number<input className="input" value={form.taxRegistrationNumber} onChange={(event) => setForm({ ...form, taxRegistrationNumber: event.target.value })} /></label>
          </div>
          {(config?.fields || []).map((field: any) => (
            <label key={field.key || field.label}>
              {field.label}
              <input
                className="input"
                required={Boolean(field.required)}
                placeholder={field.placeholder || ''}
                value={form.answers[field.key] || ''}
                onChange={(event) => setForm({ ...form, answers: { ...form.answers, [field.key]: event.target.value } })}
              />
            </label>
          ))}
          <button className="button" disabled={saving} type="submit">{saving ? 'Submitting...' : 'Submit application'}</button>
        </form>
      </section>
    </main>
  );
}
