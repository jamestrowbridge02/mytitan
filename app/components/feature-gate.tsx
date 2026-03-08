import Link from 'next/link';
import { useBilling } from '../lib/billing';
import { useTenantSettings } from '../lib/tenant-settings';

export function FeatureGate({
  featureKey,
  children,
}: {
  featureKey: 'bookings_enabled' | 'accounting_enabled' | 'payments_enabled' | 'social_enabled' | 'ai_enabled';
  children: React.ReactNode;
}) {
  const billingOff = (process.env.NEXT_PUBLIC_BILLING_MODE || '').toLowerCase() === 'off';
  const { features } = useBilling();
  const { settings } = useTenantSettings();

  const planAllows = Boolean(features?.[featureKey]);
  const tenantAllows = Boolean((settings as any)?.[toTenantFlag(featureKey)]);

  if (billingOff || (planAllows && tenantAllows)) {
    return <>{children}</>;
  }

  return (
    <div className="card">
      <h2>Workspace available</h2>
      <p className="muted">
        This feature is not available on your current plan or is disabled for this tenant.
      </p>
      <Link className="button" href="/dashboard/billing">
        View plans
      </Link>
    </div>
  );
}

function toTenantFlag(featureKey: string) {
  switch (featureKey) {
    case 'bookings_enabled':
      return 'bookingsEnabled';
    case 'accounting_enabled':
      return 'accountingEnabled';
    case 'payments_enabled':
      return 'paymentsEnabled';
    case 'social_enabled':
      return 'socialEnabled';
    case 'ai_enabled':
      return 'aiEnabled';
    default:
      return featureKey;
  }
}
