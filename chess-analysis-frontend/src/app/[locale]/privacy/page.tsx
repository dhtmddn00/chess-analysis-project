import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '개인정보처리방침 — ChessLab',
  description: 'ChessLab 개인정보처리방침',
};

const UPDATED = '2026년 6월 10일';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-12">
      <article className="mx-auto max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 sm:p-10 shadow-sm">
        <Link href="/" className="text-sm font-bold text-zinc-900 hover:underline">♟ ChessLab</Link>
        <h1 className="mt-4 text-2xl font-bold text-zinc-900">개인정보처리방침</h1>
        <p className="mt-1 text-sm text-zinc-500">시행일: {UPDATED}</p>

        <div className="mt-8 space-y-7 text-sm leading-relaxed text-zinc-700">
          <p>
            ChessLab(이하 &quot;서비스&quot;)은 「개인정보 보호법」 등 관련 법령을 준수하며, 이용자의 개인정보를
            보호하기 위해 다음과 같은 방침을 둡니다.
          </p>

          <section>
            <h2 className="mb-2 text-base font-bold text-zinc-900">1. 수집하는 개인정보 항목</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>회원가입 시</strong>: 이메일 주소, 비밀번호(암호화 저장), 표시 이름</li>
              <li><strong>서비스 이용 시</strong>: 분석 대상 체스 플랫폼 사용자명(Chess.com/Lichess), 분석 이력</li>
              <li><strong>자동 수집</strong>: 접속 IP, 접속 일시, 서비스 이용 기록(부정 이용 방지 및 통계 목적)</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-zinc-900">2. 개인정보의 수집 및 이용 목적</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>회원 식별 및 인증, 서비스 제공</li>
              <li>이메일 인증 및 비밀번호 재설정 등 계정 관리</li>
              <li>분석 결과 저장 및 이력 제공</li>
              <li>부정 이용 방지, 서비스 개선 및 통계 분석</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-zinc-900">3. 개인정보의 보유 및 이용 기간</h2>
            <p>
              회원의 개인정보는 회원 탈퇴 시 또는 수집·이용 목적 달성 시 지체 없이 파기합니다. 다만 관련 법령에 따라
              보존할 필요가 있는 경우 해당 기간 동안 보관합니다. 접속 기록은 통신비밀보호법 등에 따라 일정 기간 보관될 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-zinc-900">4. 개인정보의 제3자 제공 및 처리 위탁</h2>
            <p>
              서비스는 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만 서비스 운영을 위해 다음의 외부
              서비스를 이용하며, 이 과정에서 필요한 최소한의 정보가 처리될 수 있습니다.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><strong>이메일 발송</strong>: Resend (인증·비밀번호 재설정 메일 발송)</li>
              <li><strong>AI 분석</strong>: Groq (체스 통계 기반 코칭 텍스트 생성 — 개인 식별정보는 전송하지 않으며 게임 통계 수치만 사용)</li>
              <li><strong>인프라</strong>: Fly.io, Vercel, Neon (서비스 호스팅 및 데이터 저장)</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-zinc-900">5. 개인정보의 파기 절차 및 방법</h2>
            <p>
              파기 사유가 발생한 개인정보는 복구·재생이 불가능한 방법으로 즉시 삭제합니다. 전자적 파일은 기술적 방법을 사용하여
              영구 삭제합니다.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-zinc-900">6. 이용자의 권리</h2>
            <p>
              이용자는 언제든지 자신의 개인정보를 조회·수정할 수 있으며, 회원 탈퇴를 통해 개인정보 삭제를 요청할 수 있습니다.
              개인정보 관련 문의는 아래 연락처로 요청하실 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-bold text-zinc-900">7. 개인정보 보호책임자</h2>
            <p>
              개인정보 처리에 관한 문의·불만·피해구제는 아래로 연락 주시기 바랍니다.<br />
              이메일: <a href="mailto:dhtmddn00@gmail.com" className="font-semibold text-zinc-900 underline">dhtmddn00@gmail.com</a>
            </p>
          </section>

          <p className="border-t border-zinc-100 pt-6 text-xs text-zinc-400">
            본 방침은 서비스 운영 편의를 위해 제공되는 기본 양식이며, 실제 법적 효력 및 구체적 조항은 서비스 정식 운영 시
            법률 검토를 거쳐 확정됩니다.
          </p>
        </div>

        <div className="mt-8 flex gap-3">
          <Link href="/terms" className="text-sm font-semibold text-zinc-900 hover:underline">← 이용약관</Link>
        </div>
      </article>
    </div>
  );
}
