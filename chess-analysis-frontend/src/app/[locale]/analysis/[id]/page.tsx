'use client';

import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from '../../../../i18n/navigation';
import { useParams } from 'next/navigation';
import type { AnalysisResult } from '@/types/analysis';
import { AnalysisResultView } from '@/components/AnalysisResultView';
import { AnalysisResultErrorBoundary } from '@/components/AnalysisResultErrorBoundary';

export default function AnalysisResultPage() {
  const t = useTranslations('AnalysisDetail');
  const tCommon = useTranslations('Common');
  const params = useParams();
  const router = useRouter();

  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const analysisId = params.id as string;

  useEffect(() => {
    if (!analysisId) return;
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/v1/analysis/${analysisId}/result`);
        if (!response.ok) {
          const body = await response.text();
          throw new Error(body || t('notFound'));
        }
        if (!cancelled) setResult(await response.json());
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('notFound'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [analysisId, t]);

  // ── Derived player profile (must be above all early returns — Rules of Hooks) ─
  const playerProfile = useMemo(() => {
    if (!result) return { meta: null, stylePlay: null, ratings: {} as { blitz?: number; rapid?: number; bullet?: number } };
    const meta = result.playerMetadata;
    const stylePlay = result.styleProfile?.playingStyle ?? null;

    let ratings: { blitz?: number; rapid?: number; bullet?: number } = {};
    try {
      if (meta?.ratingsData) {
        const parsed = JSON.parse(meta.ratingsData as string);
        ratings = {
          rapid:  parsed?.chess_rapid?.last?.rating  ?? parsed?.chess_rapid?.rating,
          blitz:  parsed?.chess_blitz?.last?.rating  ?? parsed?.chess_blitz?.rating,
          bullet: parsed?.chess_bullet?.last?.rating ?? parsed?.chess_bullet?.rating,
        };
      }
    } catch { /* ignore */ }

    return { meta, stylePlay, ratings };
  }, [result]);

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="chess-toss min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-zinc-200 border-t-zinc-950 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-zinc-500">{t('loadingResult')}</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error || !result) {
    return (
      <div className="chess-toss min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">♟</span>
          </div>
          <h1 className="text-xl font-bold text-zinc-900 mb-2">{t('notFound')}</h1>
          <p className="text-zinc-500 mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="bg-zinc-950 text-white px-5 py-2.5 rounded-lg hover:bg-zinc-800 font-bold text-sm"
          >
            {t('goHome')}
          </button>
        </div>
      </div>
    );
  }

  // ── Page ─────────────────────────────────────────────────────────────────────
  return (
    <div className="chess-toss min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm chess-hero">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="pt-4 pb-1">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-700 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {tCommon('home')}
            </button>
          </div>
          <div className="flex items-center justify-between gap-6 py-4">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600">
                <span className="text-base leading-none">♟</span>
                Chess intelligence
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {playerProfile.meta?.title && (
                  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold bg-zinc-900 text-yellow-400 border border-zinc-700 uppercase tracking-wide">
                    {playerProfile.meta.title}
                  </span>
                )}
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                  {result.username}
                </h1>
                {playerProfile.meta?.country && (
                  <span className="text-base" title={playerProfile.meta.country as string}>
                    {countryToFlag(playerProfile.meta.country as string)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-2 flex-wrap">
                {playerProfile.stylePlay && (
                  <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-700">
                    {playerProfile.stylePlay}
                  </span>
                )}
                {playerProfile.ratings.rapid && (
                  <span className="text-xs text-zinc-500 font-medium">Rapid <span className="text-zinc-900 font-bold">{playerProfile.ratings.rapid}</span></span>
                )}
                {playerProfile.ratings.blitz && (
                  <span className="text-xs text-zinc-500 font-medium">Blitz <span className="text-zinc-900 font-bold">{playerProfile.ratings.blitz}</span></span>
                )}
                {playerProfile.ratings.bullet && (
                  <span className="text-xs text-zinc-500 font-medium">Bullet <span className="text-zinc-900 font-bold">{playerProfile.ratings.bullet}</span></span>
                )}
                <span className="text-xs text-zinc-400">
                  {t('resultPageSubtitle', { count: result.totalGames, platform: result.platform })}
                </span>
              </div>
            </div>
            <div className="hidden sm:grid chess-board-mini" aria-hidden="true">
              {['♜', '♞', '♝', '♛', '♚', '♝', '♞', '♜', '♙', '♙', '♙', '♙', '♟', '♟', '♟', '♟'].map((piece, index) => (
                <span key={`${piece}-${index}`}>{piece}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Result Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnalysisResultErrorBoundary>
          <AnalysisResultView
            result={result}
            shortLink={null}
            jobId={analysisId}
          />
        </AnalysisResultErrorBoundary>
      </div>
    </div>
  );
}

/** Convert ISO 3166-1 alpha-2/alpha-3 country code to flag emoji. Falls back to empty. */
function countryToFlag(country: string): string {
  if (!country || country.length < 2) return '';
  // Some platforms store full names; skip those
  if (country.length > 3) return '';
  const code = country.toUpperCase().slice(0, 2);
  return code
    .split('')
    .map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65))
    .join('');
}
