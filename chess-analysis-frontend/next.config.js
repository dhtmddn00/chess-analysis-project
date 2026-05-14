/** @type {import('next').NextConfig} */
function normalizeApiOrigin(value) {
  return (value || 'http://localhost:8080')
    .replace(/\/api\/v1\/?$/, '')
    .replace(/\/$/, '');
}

const nextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080'
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
