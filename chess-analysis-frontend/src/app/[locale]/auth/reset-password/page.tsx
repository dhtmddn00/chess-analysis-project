'use client';

import { FormEvent, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { Eye, EyeOff, KeyRound, CheckCircle } from 'lucide-react';

function getPasswordStrength(pw: string): { level: 0 | 1 | 2 | 3; label: string; color: string } {
  if (pw.length === 0) return { level: 0, label: '', color: '' };
  let types = 0;
  if (/[a-zA-Z]/.test(pw)) types++;
  if (/[0-9]/.test(pw)) types++;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?`~]/.test(pw)) types++;
  if (pw.length < 8 || types < 2) return { level: 1, label: '약함', color: 'bg-red-400' };
  if (pw.length < 12 || types < 3) return { level: 2, label: '보통', color: 'bg-amber-400' };
  return { level: 3, label: '강함', color: 'bg-emerald-500' };
}

export default function ResetPasswordPage() {
  const t = useTranslations('Auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [form, setForm] = useState({ password: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const pwStrength = getPasswordStrength(form.password);
  const pwMatch = form.confirm.length === 0 ? null : form.password === form.confirm;
  const canSubmit = !!token && form.password.length >= 8 && pwStrength.level >= 2 && pwMatch === true && !loading;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (pwStrength.level < 2) { setError(t('errorPasswordWeak')); return; }
    if (form.password !== form.confirm) { setError(t('errorPasswordMismatch')); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: form.password }),
      });
      if (!res.ok) {
        if (res.status === 410) setError(t('verifyExpiredDesc'));
        else if (res.status === 400) setError(t('verifyInvalidDesc'));
        else setError(t('errorGeneric'));
        return;
      }
      setDone(true);
      setTimeout(() => router.push('/auth/login'), 2000);
    } catch {
      setError(t('errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-xl font-bold text-zinc-900">{t('verifyInvalid')}</h1>
          <p className="mt-2 text-sm text-zinc-500">{t('verifyInvalidDesc')}</p>
          <Link href="/auth/forgot-password"
            className="mt-4 inline-block rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
            {t('forgotTitle')}
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-sm text-center">
          <CheckCircle className="mx-auto mb-4 h-12 w-12 text-emerald-500" />
          <h1 className="text-xl font-bold text-zinc-900">{t('resetDone')}</h1>
          <p className="mt-2 text-sm text-zinc-500">{t('resetDoneDesc')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="mb-4 inline-block text-2xl font-black text-zinc-900">♟ ChessLab</Link>
          <h1 className="text-xl font-bold text-zinc-900">{t('resetTitle')}</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">
              {t('newPassword')} <span className="ml-1 text-xs text-zinc-400">({t('passwordHint')})</span>
            </label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} required autoComplete="new-password"
                minLength={8} maxLength={72}
                value={form.password}
                onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 pr-10 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                placeholder="••••••••" />
              <button type="button" onClick={() => setShowPw(v => !v)} tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {form.password.length > 0 && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex flex-1 gap-0.5">
                  {[1, 2, 3].map(i => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
                      i <= pwStrength.level ? pwStrength.color : 'bg-zinc-200'
                    }`} />
                  ))}
                </div>
                <span className={`text-xs font-medium ${
                  pwStrength.level === 1 ? 'text-red-500' :
                  pwStrength.level === 2 ? 'text-amber-500' : 'text-emerald-600'
                }`}>{pwStrength.label}</span>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">{t('confirmPassword')}</label>
            <input type={showPw ? 'text' : 'password'} required autoComplete="new-password"
              value={form.confirm}
              onChange={(e) => setForm(f => ({ ...f, confirm: e.target.value }))}
              className={`w-full rounded-lg border px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-1 ${
                pwMatch === false
                  ? 'border-red-300 focus:border-red-400 focus:ring-red-400'
                  : 'border-zinc-300 focus:border-zinc-500 focus:ring-zinc-500'
              }`}
              placeholder="••••••••" />
            {pwMatch === false && <p className="mt-1 text-xs text-red-500">{t('errorPasswordMismatch')}</p>}
          </div>

          <button type="submit" disabled={!canSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40">
            {loading
              ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              : <KeyRound className="h-4 w-4" />}
            {t('resetTitle')}
          </button>
        </form>
      </div>
    </div>
  );
}
