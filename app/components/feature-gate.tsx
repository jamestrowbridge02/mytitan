import Link from 'next/link';
import { useEntitlements } from '../lib/entitlements';
import { getFeatureUnavailableCopy, type WorkspaceFeatureKey } from '../lib/feature-access';
import { useTenantSettings } from '../lib/tenant-settings';
import { resolveBookingsEnabled } from '../lib/workspace-features';

export function FeatureGate({
  featureKey,
  children,
}: {
  featureKey: WorkspaceFeatureKey;
  children: React.ReactNode;
}) {
  const billingOff = (process.env.NEXT_PUBLIC_BILLING_MODE || '').toLowerCase() === 'off';
  const { features } = useEntitlements();
  const { settings } = useTenantSettings();

  const planAllows = Boolean(features?.[featureKey]);
  const tenantAllows = resolveTenantFeature(featureKey, settings);

  if (billingOff || (planAllows && tenantAllows)) {
    return <>{children}</>;
  }

  const featureCopy = getFeatureUnavailableCopy(featureKey);

  return (
    <div className="card">
      <h2>{featureCopy.title}</h2>
      <p className="muted">{featureCopy.description}</p>
      <Link className="button" href={featureCopy.actionHref}>
        {featureCopy.actionLabel}
      </Link>
    </div>
  );
}

function resolveTenantFeature(featureKey: WorkspaceFeatureKey, settings: Record<string, any> | null | undefined) {
  switch (featureKey) {
    case 'bookings_enabled':
      return resolveBookingsEnabled(settings);
    case 'accounting_enabled':
      return Boolean(settings?.featureAccounting ?? settings?.accountingEnabled);
    case 'payments_enabled':
      return Boolean(settings?.featurePayments ?? settings?.paymentsEnabled);
    case 'social_enabled':
      return Boolean(settings?.featureSocial ?? settings?.socialEnabled);
    case 'ai_enabled':
      return Boolean(settings?.featureAI ?? settings?.aiEnabled);
    default:
      return false;
  }
}
