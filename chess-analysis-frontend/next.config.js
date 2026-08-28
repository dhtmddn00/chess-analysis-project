const createNextIntlPlugin = require('next-intl/plugin');
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const DEFAULT_API_ORIGIN =
  process.env.NODE_ENV === 'production'
    ? 'https://chess-analysis-api-prod.fly.dev'
    : 'http://localhost:8080';

// Vercel 엣지에서 실제로 도달 가능한(공개 DNS로 해석되는) https 호스트인지 검사.
// Fly 사설망(.internal/.flycast), 도커 서비스명('chess-api'), localhost 등은
// Vercel에서 DNS_HOSTNAME_NOT_FOUND(502)를 유발하므로 production에서는 배제한다.
function isPublicHttpOrigin(origin) {
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return false;
    if (h.endsWith('.internal') || h.endsWith('.flycast')) return false;
    if (!h.includes('.')) return false; // 점 없는 bare 서비스명 (도커 네트워크 전용)
    return true;
  } catch {
    return false;
  }
}

function normalizeApiOrigin(value) {
  let origin = (value || DEFAULT_API_ORIGIN)
    .replace(/\/api\/v1\/?$/, '')
    .replace(/\/$/, '');
  // Next.js rewrite destination은 반드시 '/', 'http://', 'https://'로 시작해야 한다.
  // env 값이 스킴 없는 호스트(예: 'host.fly.dev')로 설정된 경우 https://를 보정.
  if (origin && !/^https?:\/\//.test(origin) && !origin.startsWith('/')) {
    origin = `https://${origin}`;
  }
  // production(Vercel) 빌드에서 대상이 공개 호스트가 아니면 공개 기본 API로 폴백.
  // (Vercel에 INTERNAL_API_URL이 사설망 주소로 잘못 설정돼도 프록시가 깨지지 않도록.)
  if (process.env.NODE_ENV === 'production' && !isPublicHttpOrigin(origin)) {
    return DEFAULT_API_ORIGIN;
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
