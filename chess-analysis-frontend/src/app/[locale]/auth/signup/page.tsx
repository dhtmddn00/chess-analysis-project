'use client';

import { FormEvent, useState, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Eye, EyeOff, UserPlus, Mail, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { COUNTRIES } from '@/lib/countries';

// ── API 헬퍼 ────────────────────────────────────────────────────────────────

async function requestSignup(data: {
  email: string; password: string; name: string;
  country: string | null;
  termsAgreed: boolean; privacyAgreed: boolean;
}) {
  const res = await fetch('/api/v1/auth/signup', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.detail || body.message || res.statusText) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
}

async function checkEmailAvailable(email: string): Promise<boolean> {
  const res = await fetch(`/api/v1/auth/check-email?email=${encodeURIComponent(email)}`);
  if (!res.ok) return true;
  const data = await res.json();
  return data.available === true;
}

async function checkNameAvailable(name: string): Promise<boolean> {
  const res = await fetch(`/api/v1/auth/check-name?name=${encodeURIComponent(name)}`);
  if (!res.ok) return true;
  const data = await res.json();
  return data.available === true;
}

async function resendVerification(email: string) {
  await fetch('/api/v1/auth/resend-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

// ── 비밀번호 강도 ─────────────────────────────────────────────────────────────

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

// ── 이름 검증 ────────────────────────────────────────────────────────────────

function isValidName(name: string): boolean {
  return /^[가-힣a-zA-Z0-9][가-힣a-zA-Z0-9\s._-]*$/.test(name.trim()) && name.trim().length >= 2;
}

// ── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function SignupPage() {
  const t = useTranslations('Auth');

  const [form, setForm] = useState({
    name: '', email: '', password: '', confirm: '', country: '',
    termsAgreed: false, privacyAgreed: false,
  });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(false);

  // 이름 중복 검사 상태
  const [nameStatus, setNameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const nameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 이메일 중복 검사 상태
  const [emailStatus, setEmailStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const emailCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 언마운트 시 진행 중인 debounce 타이머 정리 (setState on unmounted component 방지)
  useEffect(() => {
    return () => {
      if (nameCheckTimer.current) clearTimeout(nameCheckTimer.current);
      if (emailCheckTimer.current) clearTimeout(emailCheckTimer.current);
    };
  }, []);

  const pwStrength = getPasswordStrength(form.password);
  const nameValid = form.name.length === 0 ? null : isValidName(form.name);
  const pwMatch = form.confirm.length === 0 ? null : form.password === form.confirm;

  const canSubmit =
    form.name.length >= 2 && nameValid && nameStatus === 'available' &&
    emailStatus === 'available' &&
    form.password.length >= 8 && pwStrength.level >= 2 &&
    pwMatch === true &&
    form.termsAgreed && form.privacyAgreed &&
    !loading;

  // 이름 입력 시 중복 검사 (debounce 600ms)
  const handleNameChange = useCallback((value: string) => {
    setForm(f => ({ ...f, name: value }));
    setNameStatus('idle');
    if (nameCheckTimer.current) clearTimeout(nameCheckTimer.current);
    if (!isValidName(value)) return;

    setNameStatus('checking');
    nameCheckTimer.current = setTimeout(async () => {
      const available = await checkNameAvailable(value.trim());
      setNameStatus(available ? 'available' : 'taken');
    }, 600);
  }, []);

  // 이메일 입력 시 중복 검사 (debounce 600ms)
  const handleEmailChange = useCallback((value: string) => {
    setForm(f => ({ ...f, email: value }));
    setEmailStatus('idle');
    if (emailCheckTimer.current) clearTimeout(emailCheckTimer.current);
    if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return;

    setEmailStatus('checking');
    emailCheckTimer.current = setTimeout(async () => {
      const available = await checkEmailAvailable(value);
      setEmailStatus(available ? 'available' : 'taken');
    }, 600);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isValidName(form.name)) { setError(t('errorInvalidName')); return; }
    if (nameStatus !== 'available') { setError(t('errorCheckName')); return; }
    if (emailStatus !== 'available') { setError(t('errorCheckEmail')); return; }
    if (pwStrength.level < 2) { setError(t('errorPasswordWeak')); return; }
    if (form.password !== form.confirm) { setError(t('errorPasswordMismatch')); return; }

    setLoading(true);
    try {
      await requestSignup({
        email: form.email,
        password: form.password,
        name: form.name.trim(),
        country: form.country || null,
        termsAgreed: form.termsAgreed,
        privacyAgreed: form.privacyAgreed,
      });
      setSent(true);
    } catch (err: unknown) {
      const e = err as Error & { status?: number };
      if (e.status === 409) setError(t('errorEmailTaken'));
      else if (e.status === 429) setError(t('errorTooManyAttempts'));
      else setError(t('errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendCooldown(true);
    await resendVerification(form.email).catch(() => {});
    setTimeout(() => setResendCooldown(false), 60000);
  };

  // ── 인증 메일 발송 완료 화면 ──────────────────────────────────────────────
  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100">
            <Mail className="h-8 w-8 text-zinc-700" />
          </div>
          <h1 className="text-xl font-bold text-zinc-900">{t('checkYourEmail')}</h1>
          <p className="mt-2 text-sm text-zinc-500">
            {t('verificationSentTo')} <span className="font-semibold text-zinc-900">{form.email}</span>
          </p>
          <p className="mt-1 text-sm text-zinc-400">{t('verificationExpiry')}</p>
          <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
            <p className="text-sm text-zinc-600">{t('didntReceive')}</p>
            <button onClick={handleResend} disabled={resendCooldown}
              className="mt-2 text-sm font-semibold text-zinc-900 hover:underline disabled:text-zinc-400">
              {resendCooldown ? t('resendCooldown') : t('resendEmail')}
            </button>
          </div>
          <p className="mt-4 text-sm text-zinc-400">{t('wrongEmail')}{' '}
            <button onClick={() => setSent(false)} className="font-semibold text-zinc-900 hover:underline">
              {t('goBack')}
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ── 회원가입 폼 ──────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="mb-4 inline-flex items-center justify-center gap-2 text-2xl font-black text-zinc-900"><img src="/logo.svg" alt="" className="h-7 w-7" />ChessLab</Link>
          <h1 className="text-xl font-bold text-zinc-900">{t('signupTitle')}</h1>
          <p className="mt-1 text-sm text-zinc-500">{t('signupSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          {/* 표시 이름 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">{t('name')}</label>
            <div className="relative">
              <input type="text" required autoComplete="name" minLength={2} maxLength={30}
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 pr-8 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-1 ${
                  nameValid === false || nameStatus === 'taken'
                    ? 'border-red-300 focus:border-red-400 focus:ring-red-400'
                    : nameStatus === 'available'
                    ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500'
                    : 'border-zinc-300 focus:border-zinc-500 focus:ring-zinc-500'
                }`}
                placeholder={t('namePlaceholder')} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                {nameStatus === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
                {nameStatus === 'available' && nameValid && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                {nameStatus === 'taken' && <XCircle className="h-4 w-4 text-red-400" />}
              </span>
            </div>
            {nameValid === false && (
              <p className="mt-1 text-xs text-red-500">{t('errorInvalidName')}</p>
            )}
            {nameStatus === 'taken' && nameValid && (
              <p className="mt-1 text-xs text-red-500">{t('errorNameTaken')}</p>
            )}
            {nameStatus === 'available' && nameValid && (
              <p className="mt-1 text-xs text-emerald-600">{t('nameAvailable')}</p>
            )}
          </div>

          {/* 이메일 + 실시간 중복 검사 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">{t('email')}</label>
            <div className="relative">
              <input type="email" required autoComplete="email"
                value={form.email}
                onChange={(e) => handleEmailChange(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 pr-8 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-1 ${
                  emailStatus === 'taken'
                    ? 'border-red-300 focus:border-red-400 focus:ring-red-400'
                    : emailStatus === 'available'
                    ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500'
                    : 'border-zinc-300 focus:border-zinc-500 focus:ring-zinc-500'
                }`}
                placeholder="you@example.com" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                {emailStatus === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
                {emailStatus === 'available' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                {emailStatus === 'taken' && <XCircle className="h-4 w-4 text-red-400" />}
              </span>
            </div>
            {emailStatus === 'taken' && (
              <p className="mt-1 text-xs text-red-500">{t('errorEmailTaken')}</p>
            )}
            {emailStatus === 'available' && (
              <p className="mt-1 text-xs text-emerald-600">{t('emailAvailable')}</p>
            )}
          </div>

          {/* 국가 (선택) */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">
              {t('country')} <span className="ml-1 text-xs text-zinc-400">({t('optional')})</span>
            </label>
            <select
              value={form.country}
              onChange={(e) => setForm(f => ({ ...f, country: e.target.value }))}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            >
              <option value="">{t('countryPlaceholder')}</option>
              {COUNTRIES.map(c => (
                <option key={c.code} value={c.code}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* 비밀번호 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">
              {t('password')} <span className="ml-1 text-xs text-zinc-400">({t('passwordHint')})</span>
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
            {/* 비밀번호 강도 표시 */}
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

          {/* 비밀번호 확인 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">{t('confirmPassword')}</label>
            <input type={showPw ? 'text' : 'password'} required autoComplete="new-password"
              value={form.confirm}
              onChange={(e) => setForm(f => ({ ...f, confirm: e.target.value }))}
              className={`w-full rounded-lg border px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-1 ${
                pwMatch === false
                  ? 'border-red-300 focus:border-red-400 focus:ring-red-400'
                  : pwMatch === true
                  ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-500'
                  : 'border-zinc-300 focus:border-zinc-500 focus:ring-zinc-500'
              }`}
              placeholder="••••••••" />
            {pwMatch === false && (
              <p className="mt-1 text-xs text-red-500">{t('errorPasswordMismatch')}</p>
            )}
          </div>

          {/* 약관 동의 — PIPA 필수 */}
          <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-xs font-semibold text-zinc-600">{t('consentRequired')}</p>

            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" required
                checked={form.termsAgreed}
                onChange={(e) => setForm(f => ({ ...f, termsAgreed: e.target.checked }))}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-zinc-900" />
              <span className="text-xs text-zinc-700">
                {t('agreeTermsPrefix')}{' '}
                <a href="/terms" target="_blank" className="font-semibold underline hover:no-underline">
                  {t('termsLink')}
                </a>
                {t('agreeTermsSuffix')}
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-2.5">
              <input type="checkbox" required
                checked={form.privacyAgreed}
                onChange={(e) => setForm(f => ({ ...f, privacyAgreed: e.target.checked }))}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-zinc-900" />
              <span className="text-xs text-zinc-700">
                {t('agreePrivacyPrefix')}{' '}
                <a href="/privacy" target="_blank" className="font-semibold underline hover:no-underline">
                  {t('privacyLink')}
                </a>
                {t('agreePrivacySuffix')}
              </span>
            </label>
          </div>

          <button type="submit" disabled={!canSubmit}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40">
            {loading
              ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              : <UserPlus className="h-4 w-4" />}
            {loading ? t('signingUp') : t('signup')}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-zinc-500">
          {t('hasAccount')}{' '}
          <Link href="/auth/login" className="font-semibold text-zinc-900 hover:underline">{t('login')}</Link>
        </p>
      </div>
    </div>
  );
}
