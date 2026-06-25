import { Head, Html, Main, NextScript } from "next/document";

export default function Document() {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "MyTitan",
    logo: "/brand/mytitan-mark.svg",
    image: "/brand/mytitan-social-card.svg",
    brand: {
      "@type": "Brand",
      name: "MyTitan",
      logo: "/brand/mytitan-mark.svg",
    },
  };

  return (
    <Html lang="en">
      <Head>
        <meta name="description" content="MyTitan keeps jobs, bookings, customers, approvals, scheduling, and billing clear for service teams." />
        <meta name="theme-color" content="#2563EB" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="application-name" content="MyTitan" />
        <meta name="apple-mobile-web-app-title" content="MyTitan" />
        <meta name="msapplication-TileColor" content="#0F172A" />
        <meta property="og:site_name" content="MyTitan" />
        <meta property="og:title" content="MyTitan" />
        <meta property="og:description" content="MyTitan keeps jobs, bookings, customers, approvals, scheduling, and billing clear for service teams." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="/brand/mytitan-social-card.svg" />
        <meta property="og:image:alt" content="MyTitan brand mark and wordmark" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="MyTitan" />
        <meta name="twitter:description" content="MyTitan keeps jobs, bookings, customers, approvals, scheduling, and billing clear for service teams." />
        <meta name="twitter:image" content="/brand/mytitan-social-card.svg" />
        <meta itemProp="name" content="MyTitan" />
        <meta itemProp="description" content="MyTitan keeps jobs, bookings, customers, approvals, scheduling, and billing clear for service teams." />
        <meta itemProp="image" content="/brand/mytitan-mark.svg" />
        <link rel="icon" href="/favicon.svg" sizes="any" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="mask-icon" href="/favicon.svg" color="#2563EB" />
        <link rel="manifest" href="/site.webmanifest" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
      </Head>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var m=localStorage.getItem('mytitan_theme_mode');m=m==='dark'||m==='system'?m:'light';var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.dataset.themeMode=m;}catch(e){document.documentElement.dataset.theme='light';document.documentElement.dataset.themeMode='light';}",
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "window.addEventListener('keydown',function(e){if((e.metaKey||e.ctrlKey)&&String(e.key).toLowerCase()==='k'&&!window.__MYTITAN_COMMAND_PALETTE_READY__){e.preventDefault();window.__MYTITAN_COMMAND_PALETTE_PENDING__=true;}});",
          }}
        />
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
