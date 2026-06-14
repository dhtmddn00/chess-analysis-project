'use client';

import { FormEvent, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Mail, ArrowLeft } from 'lucide-react';

export default function ForgotPasswordPage() {
  const t = useTranslations('Auth');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // 이메일 열거 방어: 결과와 무관하게 항상 성공 화면 표시
    await fetch('/api/v1/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    setLoading(false);
    setSent(true);
  };

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100">
            <Mail className="h-8 w-8 text-zinc-700" />
          </div>
          <h1 className="text-xl font-bold text-zinc-900">{t('checkYourEmail')}</h1>
          <p className="mt-2 text-sm text-zinc-500">{t('resetLinkSent')}</p>
          <Link href="/auth/login"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-900 hover:underline">
            <ArrowLeft className="h-4 w-4" />
            {t('backToLogin')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="mb-4 inline-flex items-center justify-center gap-2 text-2xl font-black text-zinc-900"><img src="/logo.svg" alt="" className="h-7 w-7" />ChessLab</Link>
          <h1 className="text-xl font-bold text-zinc-900">{t('forgotTitle')}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t('forgotSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">{t('email')}</label>
            <input type="email" required autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              placeholder="you@example.com" />
          </div>

          <button type="submit" disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60">
            {loading
              ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              : <Mail className="h-4 w-4" />}
            {t('sendResetLink')}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-zinc-500">
          <Link href="/auth/login" className="font-semibold text-zinc-900 hover:underline">{t('backToLogin')}</Link>
        </p>
      </div>
    </div>
  );
}
