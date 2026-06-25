import type { GetServerSideProps } from "next";

function getTrackingApiBase() {
  const envBase = String(process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();
  if (envBase) return envBase.replace(/\/+$/, "");
  // Keep the localhost fallback scoped to explicit local development only.
  if (process.env.NODE_ENV !== "production") return "http://127.0.0.1:3000";
  return "https://api.mytitan.co.uk";
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const id = String(context.params?.id || "").trim();
  return {
    redirect: {
      destination: `${getTrackingApiBase()}/t/c/${encodeURIComponent(id)}`,
      permanent: false,
    },
  };
};

export default function EmailTrackingRedirectPage() {
  return null;
}
