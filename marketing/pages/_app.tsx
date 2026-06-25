import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { recordMarketingVisit } from '../lib/traffic';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  useEffect(() => {
    if (!router.isReady) return;
    recordMarketingVisit(router.asPath || router.pathname);
  }, [router.asPath, router.isReady, router.pathname]);
  return <Component {...pageProps} />;
}
