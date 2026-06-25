import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: "/dashboard/integrations",
      permanent: false,
    },
  };
};

export default function SettingsIntegrationsRedirectPage() {
  return null;
}
