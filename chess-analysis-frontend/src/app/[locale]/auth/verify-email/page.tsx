'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { mutate } from 'swr';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

type State = 'loading' | 'success' | 'invalid' | 'expired';

export default function VerifyEmailPage() {
  const t = useTranslations('Auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<State>('loading');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) { setState('invalid'); return; }

    fetch(`/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`, {
      credentials: 'include',
    })
      .then(async (res) => {
        if (res.ok) {
          await mutate('/api/v1/auth/me');   // useAuth 캐시 갱신
          setState('success');
          setTimeout(() => router.push('/'), 2000);
        } else if (res.status === 410) {
          setState('expired');
        } else {
          setState('invalid');
        }
      })
      .catch(() => setState('invalid'));
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm text-center">
        {state === 'loading' && (
          <>
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-zinc-400" />
            <p className="text-sm text-zinc-500">{t('verifying')}</p>
          </>
        )}

        {state === 'success' && (
          <>
            <CheckCircle className="mx-auto mb-4 h-12 w-12 text-emerald-500" />
            <h1 className="text-xl font-bold text-zinc-900">{t('verifySuccess')}</h1>
            <p className="mt-2 text-sm text-zinc-500">{t('verifySuccessDesc')}</p>
          </>
        )}

        {state === 'expired' && (
          <>
            <XCircle className="mx-auto mb-4 h-12 w-12 text-amber-500" />
            <h1 className="text-xl font-bold text-zinc-900">{t('verifyExpired')}</h1>
            <p className="mt-2 text-sm text-zinc-500">{t('verifyExpiredDesc')}</p>
            <Link href="/auth/login"
              className="mt-4 inline-block rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
              {t('resendEmail')}
            </Link>
          </>
        )}

        {state === 'invalid' && (
          <>
            <XCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
            <h1 className="text-xl font-bold text-zinc-900">{t('verifyInvalid')}</h1>
            <p className="mt-2 text-sm text-zinc-500">{t('verifyInvalidDesc')}</p>
            <Link href="/"
              className="mt-4 inline-block rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
              {t('goHome')}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
