import type { Metadata } from 'next';
import type { AnalysisResult } from '@/types/analysis';
import { AnalysisResultClient } from './_client';

interface Props {
  params: Promise<{ id: string; locale: string }>;
}

// ── Shared fetch helper (used for both metadata + page render) ────────────────
// Deduped by Next.js fetch cache — single network call per request lifecycle.

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

async function fetchResult(id: string): Promise<AnalysisResult | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/analysis/${id}/result`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return res.json() as Promise<AnalysisResult>;
  } catch {
    return null;
  }
}

// ── P1-2: Dynamic OG metadata for social sharing ─────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await fetchResult(id);

  if (!data) {
    return {
      title: 'Chess Analysis Result',
      description: 'View detailed chess game analysis',
    };
  }

  const username: string = data.username ?? 'Unknown';
  const totalGames: number = data.totalGames ?? 0;
  const accuracy: string =
    data.averageAccuracy != null
      ? `${Number(data.averageAccuracy).toFixed(1)}%`
      : '';
  // Fix: playingStyle lives inside styleProfile, not at the top level
  const style: string = data.styleProfile?.playingStyle ?? '';

  const title = `${username} — Chess Analysis`;
  const descParts = [
    `${totalGames}게임 분석`,
    accuracy ? `정확도 ${accuracy}` : '',
    style,
  ].filter(Boolean);
  const description = descParts.join(' · ');

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      // Note: /api/og image route is not yet implemented — omit images rather
      // than referencing a 404 URL that breaks social scrapers.
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────
// Pre-fetch the result on the server so _client.tsx can render immediately
// without a second round-trip (no loading spinner on the static result page).

export default async function AnalysisResultPage({ params }: Props) {
  const { id } = await params;
  const initialResult = await fetchResult(id);
  return <AnalysisResultClient initialResult={initialResult} />;
}
