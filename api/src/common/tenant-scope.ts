/**
 * Tenant scoping helper.
 *
 * Use this to enforce companyId scoping in Prisma where clauses.
 * If a caller passes companyId in , we override it with the trusted one.
 */
export function withCompanyId<T extends Record<string, any>>(companyId: string, where: T): T & { companyId: string } {
  return { ...where, companyId };
}

/**
 * Safer variant when  may be undefined.
 */
export function withCompanyIdOptional<T extends Record<string, any> | undefined>(
  companyId: string,
  where: T
): (T extends undefined ? { companyId: string } : T & { companyId: string }) {
  return ({ ...(where ?? {}), companyId } as any);
}
