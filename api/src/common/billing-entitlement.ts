import type { PrismaService } from '../prisma/prisma.service';
import { isBillingAllowlisted } from './billing-allowlist';

/**
 * Tenant-level billing bypass for internal owner/dev:
 * returns true iff the tenant has an OWNER user whose email is allowlisted.
 *
 * This prevents tenantId/companyId-based bypass and keeps enforcement consistent
 * across background jobs/services that don't have a request user context.
 */
export async function isTenantOwnerAllowlisted(prisma: PrismaService, tenantId: string): Promise<boolean> {
  if (!tenantId) return false;
  const db = prisma as any;

  const owner = await db.user.findFirst({
    where: { companyId: tenantId, role: 'OWNER' },
    select: { email: true },
  });

  return isBillingAllowlisted({ email: owner?.email ?? null });
}
