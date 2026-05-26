'use client';

import { useState, useEffect } from 'react';
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
              <h1 className="text-3xl font-bold text-gray-900">
                {t('resultPageTitle', { username: result.username })}
              </h1>
              <p className="text-gray-600 mt-1">
                {t('resultPageSubtitle', { count: result.totalGames, platform: result.platform })}
              </p>
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
