import type { AppProps } from 'next/app';
import { BillingProvider } from '../lib/billing';
import { TenantSettingsProvider } from '../lib/tenant-settings';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <TenantSettingsProvider>
      <BillingProvider>
        <Component {...pageProps} />
      </BillingProvider>
    </TenantSettingsProvider>
  );
}
