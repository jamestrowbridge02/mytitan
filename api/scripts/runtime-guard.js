function normalizeHost(value) {
  try {
    const host = new URL(String(value || '')).hostname;
    return host.trim().toLowerCase();
  } catch {
    return String(value || '').trim().toLowerCase().replace(/:\d+$/, '');
  }
}

function isPublicMyTitanHost(host) {
  return host === 'mytitan.co.uk' || host.endsWith('.mytitan.co.uk');
}

function configuredPublicHosts() {
  return [process.env.APP_PUBLIC_URL, process.env.API_PUBLIC_URL]
    .map((value) => normalizeHost(value))
    .filter((host) => host && isPublicMyTitanHost(host));
}

function runtimeEnv() {
  return String(process.env.MYTITAN_RUNTIME_ENV || process.env.MYTITAN_ENV || process.env.NODE_ENV || '')
    .trim()
    .toLowerCase();
}

function databaseUrlParts() {
  try {
    const url = new URL(String(process.env.DATABASE_URL || ''));
    return {
      host: url.hostname.toLowerCase(),
      database: url.pathname.replace(/^\//, '').toLowerCase(),
      raw: String(process.env.DATABASE_URL || ''),
    };
  } catch {
    return { host: '', database: '', raw: String(process.env.DATABASE_URL || '') };
  }
}

function looksDedicatedAutomationDatabase() {
  const { host, database, raw } = databaseUrlParts();
  const value = `${host} ${database} ${raw}`.toLowerCase();
  return /(e2e|test|validation|staging|dev|local)/.test(value);
}

function assertAutomationBoundary({ scriptName, operation = 'automation mutation' } = {}) {
  const env = runtimeEnv();
  const allowedEnvs = new Set(['e2e', 'test', 'validation', 'development', 'dev', 'local']);
  if (!allowedEnvs.has(env)) {
    throw new Error(
      `${scriptName || operation} refused: MYTITAN_RUNTIME_ENV must be e2e, test, validation, development, dev, or local for ${operation}.`,
    );
  }
  if (!looksDedicatedAutomationDatabase()) {
    const { host, database } = databaseUrlParts();
    throw new Error(
      `${scriptName || operation} refused: DATABASE_URL must identify a dedicated non-production database for ${operation}. ` +
        `Current target host=${host || 'unknown'} database=${database || 'unknown'}.`,
    );
  }
  const publicHosts = configuredPublicHosts();
  if (publicHosts.length) {
    throw new Error(
      `${scriptName || operation} refused: public MyTitan hosts are configured (${publicHosts.join(', ')}). ` +
        `Automation must run with isolated validation/local URLs.`,
    );
  }
}

async function readDatabaseEnvironmentMarker(prisma) {
  if (!prisma?.databaseEnvironmentMarker?.findUnique) {
    throw new Error('Database environment marker model is unavailable. Run migrations before automation writes.');
  }
  const marker = await prisma.databaseEnvironmentMarker.findUnique({ where: { id: 'default' } });
  if (!marker) {
    throw new Error('Database environment marker is missing. Run migrations and explicitly mark the environment before automation writes.');
  }
  return marker;
}

async function assertDatabaseEnvironment(prisma, { scriptName, allowed = ['e2e', 'validation', 'test', 'development', 'dev', 'local'] } = {}) {
  const marker = await readDatabaseEnvironmentMarker(prisma);
  const environment = String(marker.environment || '').trim().toLowerCase();
  if (!allowed.includes(environment)) {
    throw new Error(
      `${scriptName || 'automation'} refused: database environment marker is ${environment || 'unknown'}, ` +
        `allowed=${allowed.join(',')}, guardVersion=${marker.guardVersion || 'unknown'}.`,
    );
  }
  return marker;
}

function assertSafeSeedTarget({ scriptName, overrideEnv }) {
  if (process.env[overrideEnv] === '1') {
    return;
  }
  const publicHosts = configuredPublicHosts();
  if (!publicHosts.length) {
    return;
  }
  throw new Error(
    `${scriptName} refused because public MyTitan URLs are configured (${publicHosts.join(', ')}). ` +
      `Run this only against a confirmed non-production environment or set ${overrideEnv}=1 after review.`,
  );
}

module.exports = {
  assertAutomationBoundary,
  assertDatabaseEnvironment,
  readDatabaseEnvironmentMarker,
  assertSafeSeedTarget,
};
