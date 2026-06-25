import { createHash } from 'crypto';

const LOCK_NAMESPACE = 'mytitan.tenant';

const computeAdvisoryLockKeys = (...parts: string[]) => {
  const value = [LOCK_NAMESPACE, ...parts].join('|');
  const hash = createHash('sha256').update(value).digest();
  return [hash.readInt32BE(0), hash.readInt32BE(4)] as [number, number];
};

export const computeTechnicianLockKeys = (tenantId: string, technicianId: string) =>
  computeAdvisoryLockKeys('tech', tenantId, technicianId);

export const acquireTechnicianLock = async (
  tx: { $executeRaw: (query: TemplateStringsArray, ...params: any[]) => Promise<any> },
  tenantId: string,
  technicianId: string,
) => {
  if (!technicianId) return;
  const [first, second] = computeTechnicianLockKeys(tenantId, technicianId);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${first}::int, ${second}::int)`;
};
