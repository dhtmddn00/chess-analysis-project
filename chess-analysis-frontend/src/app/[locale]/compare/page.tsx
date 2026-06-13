import type { Metadata } from 'next';
import ComparePage from './_client';

const META: Record<string, { title: string; description: string }> = {
  ko: {
    title: '플레이어 비교 - Chess Analysis Pro',
    description: '두 플레이어의 분석 결과를 나란히 비교하고 스타일과 강점, 약점의 차이를 확인하세요.',
  },
  en: {
    title: 'Player Comparison - Chess Analysis Pro',
    description: 'Compare two players\' analysis results side by side and see the differences in style, strengths, and weaknesses.',
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
  return <ComparePage />;
}
