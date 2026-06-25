import { TopLoader } from "../components/ui/TopLoader";
import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { PageShell } from '../components/layout/page-shell';
import { BillingProvider } from '../lib/billing';
import { EntitlementsProvider } from '../lib/entitlements';
import { TenantSettingsProvider } from '../lib/tenant-settings';
import { recordTrafficVisit } from '../lib/traffic';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const billingContextNeeded = router.pathname.startsWith('/dashboard/billing');
  useEffect(() => {
    if (!router.isReady) return;
    recordTrafficVisit(router.asPath || router.pathname, 'app');
  }, [router.asPath, router.isReady, router.pathname]);
  const page = (
    <PageShell>
      <Component {...pageProps} />
    </PageShell>
  );

  return (
    <div
      data-ui-luxury={String(process.env.NEXT_PUBLIC_MYTITAN_UI_LUXURY_V1 || '').toLowerCase()}
      data-ui-motion={String(process.env.NEXT_PUBLIC_MYTITAN_UI_MOTION_V1 || '').toLowerCase()}
      data-ui-coherence={String(process.env.NEXT_PUBLIC_MYTITAN_UI_COHERENCE_V1 || '').toLowerCase()}
      data-ui-perf={String(process.env.NEXT_PUBLIC_MYTITAN_UI_PERF_V1 || '').toLowerCase()}
    >
      <TopLoader />
      <TenantSettingsProvider>
        <EntitlementsProvider>
          {billingContextNeeded ? <BillingProvider>{page}</BillingProvider> : page}
        </EntitlementsProvider>
      </TenantSettingsProvider>
    </div>
  );
}
