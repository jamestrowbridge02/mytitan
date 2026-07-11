import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';

type PublicPaymentRequest = {
  business: {
    name: string;
    logoUrl?: string | null;
    brandPrimary?: string | null;
    replyTo?: string | null;
  };
  request: {
    status: string;
    amountCents: number;
    currency: string;
    description: string;
    reference?: string | null;
    relatedRecordLabel?: string | null;
    dueAt?: string | null;
    expiresAt?: string | null;
    paidAt?: string | null;
    providerLabel: string;
    actionAvailable: boolean;
    actionUrl?: string | null;
    manualInstructions?: string | null;
    unavailableReason?: string | null;
  };
  separation: {
    customerMoney: string;
    myTitanBillingStripe: string;
  };
};

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'GBP' }).format((cents || 0) / 100);
}

function formatDate(value?: string | null) {
  if (!value) return 'Not set';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Not set';
  return parsed.toLocaleDateString();
}

export default function PaymentRequestPage() {
  const router = useRouter();
  const token = typeof router.query.token === 'string' ? router.query.token : '';
  const [data, setData] = useState<PublicPaymentRequest | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    let active = true;
    apiFetch(`/public/payment-request/${encodeURIComponent(token)}`)
      .then((payload) => {
        if (active) setData(payload as PublicPaymentRequest);
      })
      .catch((err) => {
        if (active) setError(err?.message || 'Payment request is unavailable.');
      });
    return () => {
      active = false;
    };
  }, [token]);

  const accent = data?.business.brandPrimary || '#1d4ed8';

  return (
    <main className="public-payment-page" style={{ minHeight: '100vh', background: '#f8fafc', color: '#111827', padding: '32px 16px' }}>
      <section style={{ maxWidth: 720, margin: '0 auto', background: '#ffffff', border: '1px solid #d1d5db', borderRadius: 8, padding: 24, boxShadow: '0 12px 30px rgba(15, 23, 42, 0.08)' }}>
        {!data && !error ? <p>Loading payment request...</p> : null}
        {error ? (
          <>
            <h1 style={{ marginTop: 0 }}>Payment request unavailable</h1>
            <p>{error}</p>
          </>
        ) : null}
        {data ? (
          <>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 20 }}>
              {data.business.logoUrl ? <img src={data.business.logoUrl} alt="" style={{ width: 48, height: 48, objectFit: 'contain' }} /> : null}
              <div>
                <h1 style={{ margin: 0 }}>{data.business.name}</h1>
                <p style={{ margin: '4px 0 0', color: '#4b5563' }}>Secure payment request</p>
              </div>
            </div>

            <div style={{ borderTop: `4px solid ${accent}`, paddingTop: 18 }}>
              <p style={{ color: '#4b5563', margin: 0 }}>Amount</p>
              <strong style={{ fontSize: 34 }}>{formatMoney(data.request.amountCents, data.request.currency)}</strong>
            </div>

            <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(130px, 1fr) 2fr', gap: 12, marginTop: 24 }}>
              <dt>Description</dt><dd>{data.request.description}</dd>
              <dt>Reference</dt><dd>{data.request.reference || data.request.relatedRecordLabel || 'Not set'}</dd>
              <dt>Provider</dt><dd>{data.request.providerLabel}</dd>
              <dt>Status</dt><dd>{data.request.status.replaceAll('_', ' ')}</dd>
              <dt>Due</dt><dd>{formatDate(data.request.dueAt)}</dd>
              <dt>Expires</dt><dd>{formatDate(data.request.expiresAt)}</dd>
              <dt>Replies</dt><dd>{data.business.replyTo || 'Contact the business directly'}</dd>
            </dl>

            {data.request.actionAvailable && data.request.actionUrl ? (
              <a href={data.request.actionUrl} style={{ display: 'inline-block', marginTop: 24, background: accent, color: '#ffffff', padding: '12px 18px', borderRadius: 6, textDecoration: 'none', fontWeight: 700 }}>
                Pay securely
              </a>
            ) : (
              <p style={{ marginTop: 24, background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, padding: 12 }}>
                {data.request.unavailableReason || data.request.manualInstructions || 'Payment instructions are handled by the business.'}
              </p>
            )}

            <p style={{ marginTop: 24, color: '#4b5563' }}>
              Customer money is handled by the business payment provider. MyTitan Billing Stripe is not used for this payment.
            </p>
          </>
        ) : null}
      </section>
    </main>
  );
}
