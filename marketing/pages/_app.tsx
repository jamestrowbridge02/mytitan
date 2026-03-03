import type { AppProps } from 'next/app';
import MarketingShell from "../components/layout/MarketingShell";
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return <MarketingShell><Component {...pageProps} /></MarketingShell>;
}
