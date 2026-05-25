import { NextRequest, NextResponse } from 'next/server';

const API_BASE =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8080';

/**
 * GET /s/[code]
 *
 * 단축 링크를 백엔드 API로 resolve한 뒤 프론트엔드 분석 결과 페이지로 리다이렉트.
 * 백엔드가 분석 ID를 포함한 JSON을 돌려주면 /{locale}/analysis/{id}로 이동.
 * 로케일은 Accept-Language 헤더에서 추론하며 ko/en만 지원, 기본값은 ko.
 * 실패 시 홈으로 fallback.
 */

function detectLocale(req: NextRequest): 'ko' | 'en' {
  const acceptLang = req.headers.get('accept-language') ?? '';
  // "en-US,en;q=0.9,ko;q=0.8" 형태에서 첫 번째 언어 코드 추출
  const primary = acceptLang.split(',')[0]?.split('-')[0]?.toLowerCase();
  return primary === 'en' ? 'en' : 'ko';
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const origin = req.nextUrl.origin;
  const locale = detectLocale(req);

  try {
    const res = await fetch(
      `${API_BASE}/api/v1/s/${encodeURIComponent(code)}`,
      { next: { revalidate: 0 } },
    );

    if (!res.ok) {
      return NextResponse.redirect(new URL(`/${locale}`, origin));
    }

    const data = (await res.json()) as { id?: string };
    if (data?.id) {
      return NextResponse.redirect(
        new URL(`/${locale}/analysis/${data.id}`, origin),
      );
    }
  } catch {
    // 백엔드 오류 시 홈으로 fallback
  }

  return NextResponse.redirect(new URL(`/${locale}`, origin));
}
