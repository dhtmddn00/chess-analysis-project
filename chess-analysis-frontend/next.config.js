const createNextIntlPlugin = require('next-intl/plugin');
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const DEFAULT_API_ORIGIN =
  process.env.NODE_ENV === 'production'
    ? 'https://chess-analysis-api-prod.fly.dev'
    : 'http://localhost:8080';

function normalizeApiOrigin(value) {
  let origin = (value || DEFAULT_API_ORIGIN)
    .replace(/\/api\/v1\/?$/, '')
    .replace(/\/$/, '');
  // Next.js rewrite destination은 반드시 '/', 'http://', 'https://'로 시작해야 한다.
  // env 값이 스킴 없는 호스트(예: 'host.fly.dev')로 설정된 경우 https://를 보정해
  // 'Invalid rewrite found' 빌드 실패를 방지한다.
  if (origin && !/^https?:\/\//.test(origin) && !origin.startsWith('/')) {
    origin = `https://${origin}`;
  }
  return origin;
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

module.exports = withNextIntl(nextConfig);
