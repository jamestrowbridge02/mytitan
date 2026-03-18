import Head from "next/head";

const DEFAULT_TITLE = "MyTitan | Enterprise Operations System for Service Businesses";
const DEFAULT_DESCRIPTION =
  "MyTitan helps service businesses run bookings, jobs, customers, approvals, scheduling, and billing from one controlled workspace.";
const DEFAULT_OG = "https://www.mytitan.co.uk/brand/mytitan-logo-light.svg";

export default function MarketingSeo({
  title,
  description = DEFAULT_DESCRIPTION,
  path = "/",
}: {
  title?: string;
  description?: string;
  path?: string;
}) {
  const resolvedTitle = title ? `${title} | MyTitan` : DEFAULT_TITLE;
  const url = `https://www.mytitan.co.uk${path}`;

  return (
    <Head>
      <title>{resolvedTitle}</title>
      <link rel="canonical" href={url} />
      <meta name="description" content={description} />
      <meta name="application-name" content="MyTitan" />
      <meta name="theme-color" content="#2563EB" />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="MyTitan" />
      <meta property="og:title" content={resolvedTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={DEFAULT_OG} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={resolvedTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={DEFAULT_OG} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "MyTitan",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            url,
            image: DEFAULT_OG,
            logo: "https://www.mytitan.co.uk/brand/mytitan-mark.svg",
            description,
            brand: {
              "@type": "Brand",
              name: "MyTitan",
              logo: "https://www.mytitan.co.uk/brand/mytitan-mark.svg",
            },
          }),
        }}
      />
    </Head>
  );
}
