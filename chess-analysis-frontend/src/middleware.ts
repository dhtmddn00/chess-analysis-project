import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // s/ 는 로케일 prefix 없이 동작하는 단축 링크 route handler 이므로 제외
  matcher: ['/((?!api|s/|_next|_vercel|favicon|manifest|opengraph-image|robots|sitemap|.*\\..*).*)'],
};
