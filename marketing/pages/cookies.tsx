import { GovernancePage } from "../components/governance/GovernancePage";
import { governancePages } from "../lib/site-content";

export default function CookiesPage() {
  return <GovernancePage content={governancePages.find((page) => page.slug === "cookies")!} />;
}
