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
  assertSafeSeedTarget,
};
