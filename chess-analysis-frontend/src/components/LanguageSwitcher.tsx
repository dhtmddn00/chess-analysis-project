'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '../i18n/navigation';
import { Globe } from 'lucide-react';

export function LanguageSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('Nav');

  const toggleLocale = () => {
    router.replace(pathname, { locale: locale === 'ko' ? 'en' : 'ko' });
  };

  return (
    <button
      type="button"
      onClick={toggleLocale}
      className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
      aria-label="Switch language"
    >
      <Globe className="h-4 w-4" />
      {t('switchLanguage')}
    </button>
  );
}
