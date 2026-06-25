/** @type {import('next').NextConfig} */
function normalizeProxyTarget(value) {
  const normalized = String(value || '').trim();
  return normalized.replace(/\/+$/, '');
}

const apiProxyTarget = normalizeProxyTarget(
  process.env.MYTITAN_API_PROXY_TARGET || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:3000',
);

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiProxyTarget}/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
