import type { Metadata } from 'next';
import CommunityPage from './_client';

const META: Record<string, { title: string; description: string }> = {
  ko: {
    title: '커뮤니티 - Chess Analysis Pro',
    description: '다른 체스 플레이어들과 분석 결과를 공유하고 실시간 채팅으로 소통하세요.',
  },
  en: {
    title: 'Community - Chess Analysis Pro',
    description: 'Share your analysis results with other chess players and chat in real time.',
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
  return <CommunityPage />;
}
