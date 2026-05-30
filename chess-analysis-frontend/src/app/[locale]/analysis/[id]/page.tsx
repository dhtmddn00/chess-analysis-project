import type { Metadata } from 'next';
import { AnalysisResultClient } from './_client';

interface Props {
  params: Promise<{ id: string; locale: string }>;
}

// ── P1-2: Dynamic OG metadata for social sharing ─────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    // Use the internal API URL if set, otherwise fall back to the same-origin path.
    // On Vercel / Fly.io the backend API proxy handles /api/v1/... so relative path works.
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    const res = await fetch(`${baseUrl}/api/v1/analysis/${id}/result`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error('not found');

    const data = await res.json();
    const username: string = data.username ?? 'Unknown';
    const totalGames: number = data.totalGames ?? 0;
    const accuracy: string = data.averageAccuracy != null
      ? `${Number(data.averageAccuracy).toFixed(1)}%`
      : '';
    const style: string = data.playingStyle ?? '';

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
        images: [
          {
            url: `/api/og?username=${encodeURIComponent(username)}&accuracy=${encodeURIComponent(accuracy)}&style=${encodeURIComponent(style)}&games=${totalGames}`,
            width: 1200,
            height: 630,
            alt: title,
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
      },
    };
  } catch {
    return {
      title: 'Chess Analysis Result',
      description: 'View detailed chess game analysis',
    };
  }
}

export default function AnalysisResultPage() {
  return <AnalysisResultClient />;
}
