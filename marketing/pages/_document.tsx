import { Head, Html, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta name="description" content="MyTitan keeps jobs, bookings, customers, approvals, scheduling, and billing clear for service teams." />
        <meta name="theme-color" content="#2563EB" />
        <meta property="og:site_name" content="MyTitan" />
        <meta property="og:title" content="MyTitan" />
        <meta property="og:description" content="MyTitan keeps jobs, bookings, customers, approvals, scheduling, and billing clear for service teams." />
        <meta property="og:type" content="website" />
        <link rel="icon" href="/favicon.svg" sizes="any" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
