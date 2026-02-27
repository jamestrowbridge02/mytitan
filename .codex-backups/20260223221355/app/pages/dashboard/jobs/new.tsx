import { useState } from 'react';
import { useRouter } from 'next/router';
import { apiFetch } from '../../../lib/api';
import { DashboardShell } from '../../../components/dashboard-shell';

export default function NewJob() {
  const router = useRouter();
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [vehicleReg, setVehicleReg] = useState('');
  const [laborCents, setLaborCents] = useState('');
  const [partsCents, setPartsCents] = useState('');
  const [miscCents, setMiscCents] = useState('');
  const [taxRateBps, setTaxRateBps] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [wheelPricingMode, setWheelPricingMode] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    try {
      await apiFetch('/jobs', {
        method: 'POST',
        body: JSON.stringify({
          customerName,
          customerEmail: customerEmail || undefined,
          customerPhone: customerPhone || undefined,
          vehicleReg: vehicleReg || undefined,
          laborCents: laborCents === '' ? undefined : Number(laborCents),
          partsCents: partsCents === '' ? undefined : Number(partsCents),
          miscCents: miscCents === '' ? undefined : Number(miscCents),
          taxRateBps: taxRateBps === '' ? undefined : Number(taxRateBps),
          serviceName: serviceName || undefined,
          wheelPricingMode: wheelPricingMode || undefined,
        }),
      });
      router.push('/dashboard/jobs');
    } catch (err: any) {
      setError(err.message || 'Failed to create job');
    }
  }

  return (
    <DashboardShell>
      <div className="card">
        <h1>New Job</h1>
        {error && <p style={{ color: '#ff8a8a' }}>{error}</p>}
        <form onSubmit={handleSubmit}>
          <label>Customer name</label>
          <input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} required />

          <label>Customer email</label>
          <input className="input" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />

          <label>Customer phone</label>
          <input className="input" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />

          <label>Vehicle registration</label>
          <input className="input" value={vehicleReg} onChange={(e) => setVehicleReg(e.target.value)} />

          <label>Labor (cents)</label>
          <input className="input" type="number" min={0} value={laborCents} onChange={(e) => setLaborCents(e.target.value)} />

          <label>Parts (cents)</label>
          <input className="input" type="number" min={0} value={partsCents} onChange={(e) => setPartsCents(e.target.value)} />

          <label>Misc (cents)</label>
          <input className="input" type="number" min={0} value={miscCents} onChange={(e) => setMiscCents(e.target.value)} />

          <label>Tax rate (basis points)</label>
          <input className="input" type="number" min={0} value={taxRateBps} onChange={(e) => setTaxRateBps(e.target.value)} />

          <label>Service name (optional)</label>
          <input className="input" value={serviceName} onChange={(e) => setServiceName(e.target.value)} />

          <label>Wheel pricing mode (optional)</label>
          <select className="input" value={wheelPricingMode} onChange={(e) => setWheelPricingMode(e.target.value)}>
            <option value="">Use tenant default</option>
            <option value="PER_WHEEL">PER_WHEEL</option>
            <option value="SET">SET</option>
          </select>

          <button className="button" type="submit">Create Job</button>
        </form>
      </div>
    </DashboardShell>
  );
}
