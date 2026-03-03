export type BillingUserLike = { email?: string | null };

function parseCsvEnv(name: string): string[] {
  const raw = (process.env[name] || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Owner billing allowlist: bypass billing enforcement ONLY for internal owner/dev emails.
 *
 * Configure:
 *   MYTITAN_BILLING_ALLOWLIST_EMAILS="you@domain.com,other@domain.com"
 *
 * Notes:
 * - Email-only by design to prevent tenant/companyId-based bypass.
 * - Must be checked using the authenticated user payload (not user input).
 */
export function isBillingAllowlisted(user?: BillingUserLike | null): boolean {
  if (!user) return false;
  const emails = parseCsvEnv("MYTITAN_BILLING_ALLOWLIST_EMAILS");
  if (emails.length === 0) return false;
  const email = (user.email || "").trim().toLowerCase();
  return Boolean(email) && emails.includes(email);
}
