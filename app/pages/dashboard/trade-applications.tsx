import { useEffect, useState } from 'react';
import { DashboardShell } from '../../components/dashboard-shell';
import { apiFetch } from '../../lib/api';

export default function TradeApplicationsPage() {
  const [settings, setSettings] = useState<any>(null);
  const [applications, setApplications] = useState<any[]>([]);
  const [fields, setFields] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [nextSettings, nextApplications] = await Promise.all([
        apiFetch('/trade-account-applications/settings'),
        apiFetch('/trade-account-applications'),
      ]);
      setSettings(nextSettings);
      setFields(Array.isArray(nextSettings?.fieldsJson) ? nextSettings.fieldsJson : []);
      setApplications(Array.isArray(nextApplications) ? nextApplications : []);
    } catch (nextError: any) {
      setError(nextError.message || 'Trade applications could not be loaded.');
    }
  }

  useEffect(() => { void load(); }, []);

  async function saveSettings(enabled: boolean) {
    setBusy(true);
    setError('');
    try {
      const updated = await apiFetch('/trade-account-applications/settings', {
        method: 'PATCH',
        body: JSON.stringify({ enabled, fields }),
      });
      setSettings(updated);
      setMessage('Trade application settings saved.');
    } catch (nextError: any) {
      setError(nextError.message || 'Settings could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function review(id: string, status: 'APPROVED' | 'REJECTED') {
    setBusy(true);
    try {
      await apiFetch(`/trade-account-applications/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ status, sendPortalInvite: status === 'APPROVED' }),
      });
      setMessage(status === 'APPROVED' ? 'Application approved and portal invite prepared.' : 'Application rejected.');
      await load();
    } catch (nextError: any) {
      setError(nextError.message || 'Application review failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardShell>
      <div className="operator-stack">
        <section className="card">
          <h1>Trade account applications</h1>
          <p className="muted">Publish a branded application form, review submissions, then create portal access only after approval.</p>
          {message ? <p role="status">{message}</p> : null}
          {error ? <p role="alert">{error}</p> : null}
          <label>
            <input type="checkbox" checked={Boolean(settings?.enabled)} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} /> Accept trade account applications
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button className="button" type="button" disabled={busy} onClick={() => void saveSettings(Boolean(settings?.enabled))}>Save application settings</button>
            {settings?.publicUrl ? <a className="button secondary" href={settings.publicUrl} target="_blank" rel="noreferrer">Preview application form</a> : null}
          </div>
        </section>
        <section className="card">
          <h2>Applications</h2>
          <div className="operator-table">
            {applications.map((application) => (
              <div className="operator-table__row" key={application.id}>
                <div className="operator-table__cell"><strong>{application.businessName}</strong><div className="operator-cellSubtle">{application.contactName} · {application.contactEmail}</div></div>
                <div className="operator-table__cell">{String(application.status).toLowerCase()}</div>
                <div className="operator-table__cell" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {application.status === 'PENDING' ? (
                    <>
                      <button className="button" disabled={busy} type="button" onClick={() => void review(application.id, 'APPROVED')}>Approve and invite</button>
                      <button className="button secondary" disabled={busy} type="button" onClick={() => void review(application.id, 'REJECTED')}>Reject</button>
                    </>
                  ) : <span>{application.reviewNote || 'Reviewed'}</span>}
                </div>
              </div>
            ))}
            {!applications.length ? <p className="muted">No trade applications yet.</p> : null}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
