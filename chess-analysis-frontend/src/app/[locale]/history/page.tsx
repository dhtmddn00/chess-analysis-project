import type { Metadata } from 'next';
import HistoryPage from './_client';

const META: Record<string, { title: string; description: string }> = {
  ko: {
    title: '분석 기록 - Chess Analysis Pro',
    description: '이전에 분석한 체스 게임 기록과 결과를 확인하세요.',
  },
  en: {
    title: 'Analysis History - Chess Analysis Pro',
    description: 'View your previously analyzed chess games and their results.',
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const meta = META[locale] ?? META.ko;
  return {
    title: meta.title,
    description: meta.description,
    openGraph: {
      title: meta.title,
      description: meta.description,
    },
    twitter: {
      title: meta.title,
      description: meta.description,
    },
  };
}

export default function Page() {
  return <HistoryPage />;
}
