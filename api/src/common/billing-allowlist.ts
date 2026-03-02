export type BillingUserLike = { email?: string | null; companyId?: string | null };

function parseCsvEnv(name: string): string[] {
  const raw = (process.env[name] || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Allowlist ONLY for internal owner/dev accounts to bypass billing checks.
 * This keeps production billing enforced for everyone else.
 *
 * Configure:
 *   MYTITAN_BILLING_ALLOWLIST_EMAILS="you@domain.com,other@domain.com"
 *
 * Optional future extension:
 *   MYTITAN_BILLING_ALLOWLIST_COMPANY_IDS="cuid1,cuid2"
 */
export function isBillingAllowlisted(user?: BillingUserLike | null): boolean {
  if (!user) return false;

  const emails = parseCsvEnv("MYTITAN_BILLING_ALLOWLIST_EMAILS");
  const companyIds = parseCsvEnv("MYTITAN_BILLING_ALLOWLIST_COMPANY_IDS");

  const email = (user.email || "").trim().toLowerCase();
  const companyId = (user.companyId || "").trim().toLowerCase();

  if (email && emails.includes(email)) return true;
  if (companyId && companyIds.includes(companyId)) return true;

  return false;
}
