'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { installServerWakeInterceptor, subscribeServerWake } from '@/lib/serverWake';

/**
 * API 콜드스타트 시 상단에 '서버 깨우는 중' 배너를 띄운다.
 * min=1 warm 유지로 콜드스타트는 드물지만, 발생 시 죽은 화면 대신 상태를 알린다.
 */
export function ServerWakeBanner() {
  const t = useTranslations('Common');
  const [waking, setWaking] = useState(false);

  useEffect(() => {
    installServerWakeInterceptor();
    return subscribeServerWake(setWaking);
  }, []);

  if (!waking) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-zinc-950 px-4 py-2 text-center text-sm font-medium text-white shadow-md"
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span>{t('serverWaking')}</span>
    </div>
  );
}
