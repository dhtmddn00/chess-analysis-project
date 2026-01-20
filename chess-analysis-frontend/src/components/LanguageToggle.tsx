'use client';

import { useTranslation } from '@/hooks/useTranslation';

export default function LanguageToggle() {
  const { language, toggleLanguage } = useTranslation();

  return (
    <button
      onClick={toggleLanguage}
      className="apple-button-secondary apple-fade-in"
      title={language === 'ko' ? '언어 변경' : 'Change Language'}
    >
      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
      </svg>
      <span className="font-semibold">{language === 'ko' ? '한국어' : 'English'}</span>
    </button>
  );
}