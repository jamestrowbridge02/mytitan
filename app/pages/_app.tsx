import type { AppProps } from 'next/app';
import { PageShell } from '../components/layout/page-shell';
import { BillingProvider } from '../lib/billing';
import { TenantSettingsProvider } from '../lib/tenant-settings';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <TenantSettingsProvider>
      <BillingProvider>
        <PageShell>
      <Component {...pageProps}  />
    </PageShell>
      </BillingProvider>
    </TenantSettingsProvider>
  );
}
