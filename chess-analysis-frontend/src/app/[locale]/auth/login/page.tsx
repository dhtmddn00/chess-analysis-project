'use client';

import { FormEvent, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Eye, EyeOff, LogIn } from 'lucide-react';

export default function LoginPage() {
  const t = useTranslations('Auth');
  const router = useRouter();
  const { login } = useAuth();

  const [form, setForm] = useState({ email: '', password: '' });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [notVerified, setNotVerified] = useState(false);
  const [resendDone, setResendDone] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setNotVerified(false);
    setLoading(true);
    try {
      await login(form.email, form.password);
      router.push('/');
    } catch (err: unknown) {
      const e = err as Error & { status?: number; message?: string };
      if (e.status === 429) {
        setError(t('errorTooManyAttempts'));
      } else if (e.status === 401) {
        setError(t('errorInvalidCredentials'));
      } else if (e.status === 403 && e.message === 'EMAIL_NOT_VERIFIED') {
        setNotVerified(true);
      } else {
        setError(t('errorGeneric'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      const res = await fetch('/api/v1/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email }),
      });
      // 서버는 이메일 존재 여부와 무관하게 200 반환 (열거 공격 방어)
      // 네트워크 레벨 실패 시에만 에러 표시
      if (res.ok) {
        setResendDone(true);
      } else {
        setError(t('errorGeneric'));
      }
    } catch {
      setError(t('errorGeneric'));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="mb-4 inline-block text-2xl font-black text-zinc-900">
            ♟ ChessLab
          </Link>
          <h1 className="text-xl font-bold text-zinc-900">{t('loginTitle')}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t('loginSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {notVerified && (
            <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="font-semibold">{t('errorNotVerified')}</p>
              <p className="mt-0.5">{t('errorNotVerifiedDesc')}</p>
              {!resendDone ? (
                <button onClick={handleResend}
                  className="mt-2 font-semibold underline hover:no-underline">
                  {t('resendEmail')}
                </button>
              ) : (
                <p className="mt-2 font-semibold">{t('resendDone')}</p>
              )}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">
              {t('email')}
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">
              {t('password')}
            </label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 pr-10 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                tabIndex={-1}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {loading ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            {loading ? t('loggingIn') : t('login')}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-zinc-500">
          {t('noAccount')}{' '}
          <Link href="/auth/signup" className="font-semibold text-zinc-900 hover:underline">
            {t('signup')}
          </Link>
        </p>
      </div>
    </div>
  );
}
