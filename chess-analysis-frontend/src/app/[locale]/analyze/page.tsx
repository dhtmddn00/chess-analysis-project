import type { Metadata } from 'next';
import UnifiedAnalyzePage from './_client';

const META: Record<string, { title: string; description: string }> = {
  ko: {
    title: '체스 게임 분석 - Chess Analysis Pro',
    description: 'Chess.com, Lichess 유저네임을 입력하면 Stockfish 엔진으로 최근 게임을 분석해 플레이 스타일과 약점을 알려드립니다.',
  },
  en: {
    title: 'Chess Game Analysis - Chess Analysis Pro',
    description: 'Enter your Chess.com or Lichess username to analyze your recent games with the Stockfish engine and uncover your playing style and weaknesses.',
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
  return <UnifiedAnalyzePage />;
}
