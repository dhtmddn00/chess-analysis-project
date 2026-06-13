import type { Metadata } from 'next';
import Home from './_client';

const META: Record<string, { title: string; description: string }> = {
  ko: {
    title: 'Chess Analysis Pro - Stockfish 기반 체스 분석',
    description: 'Chess.com, Lichess 게임을 Stockfish로 분석하고 플레이 스타일, 약점, 전술 기회를 확인하세요.',
  },
  en: {
    title: 'Chess Analysis Pro - Stockfish-Powered Chess Analysis',
    description: 'Analyze your Chess.com or Lichess games with Stockfish and discover your playing style, weaknesses, and tactical opportunities.',
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
  return <Home />;
}
