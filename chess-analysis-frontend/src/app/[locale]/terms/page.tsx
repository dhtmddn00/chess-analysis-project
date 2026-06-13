import type { Metadata } from 'next';
import Link from 'next/link';

const META: Record<string, { title: string; description: string }> = {
  ko: { title: '이용약관 — ChessLab', description: 'ChessLab 서비스 이용약관' },
  en: { title: 'Terms of Service — ChessLab', description: 'ChessLab Terms of Service' },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return META[locale] ?? META.ko;
}

const UPDATED = '2026년 6월 10일';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-12">
      <article className="mx-auto max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 sm:p-10 shadow-sm">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-bold text-zinc-900 hover:underline"><img src="/logo.svg" alt="" className="h-4 w-4" />ChessLab</Link>
        <h1 className="mt-4 text-2xl font-bold text-zinc-900">이용약관</h1>
        <p className="mt-1 text-sm text-zinc-500">시행일: {UPDATED}</p>

        <div className="mt-8 space-y-7 text-sm leading-relaxed text-zinc-700">
          <section>
            <h2 className="mb-2 text-base font-bold text-zinc-900">제1조 (목적)</h2>
            <p>
              본 약관은 ChessLab(이하 &quot;서비스&quot;)이 제공하는 체스 게임 분석 및 관련 제반 서비스의
              이용 조건과 절차, 이용자와 서비스 운영자의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-zinc-900">제2조 (정의)</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>&quot;서비스&quot;란 Chess.com, Lichess 등의 공개 데이터를 기반으로 체스 게임을 분석하고 결과를 제공하는 일체의 서비스를 의미합니다.</li>
              <li>&quot;이용자&quot;란 본 약관에 따라 서비스를 이용하는 회원 및 비회원을 말합니다.</li>
              <li>&quot;회원&quot;이란 이메일로 가입하여 계정을 보유한 이용자를 말합니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-zinc-900">제3조 (약관의 효력 및 변경)</h2>
            <p>
              본 약관은 서비스 화면에 게시함으로써 효력이 발생합니다. 운영자는 관련 법령을 위배하지 않는 범위에서
              약관을 변경할 수 있으며, 변경 시 적용일자 및 사유를 명시하여 사전에 공지합니다.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-zinc-900">제4조 (서비스의 제공)</h2>
            <p>
              서비스는 체스 게임 분석, 스타일 프로파일, AI 코칭 진단 등을 제공합니다. AI 코칭 진단은 계정 보유자에 한해
              제공되며, 운영 정책에 따라 이용 횟수가 제한될 수 있습니다. 일부 기능은 외부 분석 엔진 및 AI 모델을 활용하며,
              결과는 참고용으로 제공됩니다.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-zinc-900">제5조 (회원가입 및 계정)</h2>
            <p>
              이용자는 이메일 주소와 비밀번호, 표시 이름을 제공하여 회원가입할 수 있으며, 이메일 인증을 완료해야 서비스를
              정상 이용할 수 있습니다. 계정 정보의 관리 책임은 이용자에게 있으며, 타인에게 계정을 양도하거나 대여할 수 없습니다.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-zinc-900">제6조 (이용자의 의무)</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>타인의 정보를 도용하거나 허위 정보를 등록하는 행위 금지</li>
              <li>서비스의 정상적 운영을 방해하는 행위(과도한 자동화 요청 등) 금지</li>
              <li>서비스를 통해 얻은 정보를 운영자의 동의 없이 영리 목적으로 이용하는 행위 금지</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-zinc-900">제7조 (서비스 이용의 제한)</h2>
            <p>
              운영자는 이용자가 본 약관을 위반하거나 서비스의 정상적 운영을 방해한 경우, 사전 통지 후 또는 긴급한 경우
              통지 없이 서비스 이용을 제한하거나 계정을 정지·해지할 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-zinc-900">제8조 (면책조항)</h2>
            <p>
              서비스가 제공하는 분석 결과 및 AI 코칭은 통계적·기계적 추정에 기반한 참고 자료이며, 실력 향상이나 특정 결과를
              보장하지 않습니다. 외부 플랫폼(Chess.com, Lichess 등)의 데이터 정확성이나 가용성에 대해서는 책임지지 않습니다.
              천재지변, 외부 서비스 장애 등 운영자의 통제를 벗어난 사유로 인한 서비스 중단에 대해 책임을 지지 않습니다.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-zinc-900">제9조 (분쟁의 해결)</h2>
            <p>
              본 약관과 관련하여 분쟁이 발생한 경우 운영자와 이용자는 상호 협의하여 해결하며, 협의가 이루어지지 않을 경우
              관련 법령 및 상관례에 따릅니다.
            </p>
          </section>

          <p className="border-t border-zinc-100 pt-6 text-xs text-zinc-400">
            본 약관은 서비스 운영 편의를 위해 제공되는 기본 양식이며, 실제 법적 효력 및 구체적 조항은 서비스 정식 운영 시
            법률 검토를 거쳐 확정됩니다.
          </p>
        </div>

        <div className="mt-8 flex gap-3">
          <Link href="/privacy" className="text-sm font-semibold text-zinc-900 hover:underline">개인정보처리방침 →</Link>
        </div>
      </article>
    </div>
  );
}
