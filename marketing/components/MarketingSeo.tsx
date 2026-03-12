import Head from "next/head";

const DEFAULT_TITLE = "MyTitan | Enterprise Operations System for Service Businesses";
const DEFAULT_DESCRIPTION =
  "MyTitan unifies workflow control, scheduling, recurring service delivery, revenue operations, customer approvals, inventory, compliance, and executive visibility in one enterprise SaaS platform.";
const DEFAULT_OG = "/brand/mytitan-logo-light.svg";

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
      <meta name="description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={resolvedTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={DEFAULT_OG} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={resolvedTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={DEFAULT_OG} />
    </Head>
  );
}
