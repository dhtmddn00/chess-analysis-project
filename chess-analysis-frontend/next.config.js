/** @type {import('next').NextConfig} */
const DEFAULT_API_ORIGIN =
  process.env.NODE_ENV === 'production'
    ? 'https://chess-analysis-api-prod.fly.dev'
    : 'http://localhost:8080';

function normalizeApiOrigin(value) {
  return (value || DEFAULT_API_ORIGIN)
    .replace(/\/api\/v1\/?$/, '')
    .replace(/\/$/, '');
}

const nextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '',
  },
  async rewrites() {
    const apiUrl = normalizeApiOrigin(process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL);
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiUrl}/api/v1/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
