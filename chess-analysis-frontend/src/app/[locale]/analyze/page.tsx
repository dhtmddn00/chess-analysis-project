'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Search, Clock, Target, Zap, Brain, BarChart3, TrendingUp, ShieldCheck, ArrowLeft, ExternalLink, X, Trash2 } from 'lucide-react';
import { sendGAEvent } from '@next/third-parties/google';
import { useTranslations } from 'next-intl';
import { useRouter as useIntlRouter } from '../../../i18n/navigation';
import { usePlayerSummary } from '../../../hooks/usePlayerSummary';
import { useAnalysis } from '../../../hooks/useAnalysis';
import { useLocalHistory } from '../../../hooks/useLocalHistory';
import { PlayerProfileCard } from '../../../components/PlayerProfileCard';
import { AnalysisResultErrorBoundary } from '../../../components/AnalysisResultErrorBoundary';
import { AnalysisResultView } from '../../../components/AnalysisResultView';
import type { AnalysisResult } from '../../../types/analysis';

interface PlayerSummary {
  player: {
    username: string;
    country: string;
    avatar: string;
    ratings: Record<string, number>;
    record_all: {
      games: number;
      win: number;
      draw: number;
      loss: number;
      winrate: number;
    };
  };
  recent10: Array<{
    ended_at: string;
    result: 'W' | 'L' | 'D';
    opponent: string;
    opp_rating: number;
    time_control: string;
    color: 'white' | 'black';
    eco: string;
    termination: string;
    game_id: string;
  }>;
  cohort_hint: {
    band: string;
    note: string;
  };
}

// ── Static constants ──────────────────────────────────────────────────────────

/** maxGames per mode (pure data, no translations needed) */
const MODE_MAX_GAMES = { fast: 50, balanced: 30, precise: 20 } as const;

export default function UnifiedAnalyzePage() {
  const t = useTranslations('Analyze');
  const tCommon = useTranslations('Common');
  const tHome = useTranslations('Home');
  const router = useIntlRouter();
  const [searchForm, setSearchForm] = useState({
    platform: 'chess.com',
    username: '',
    n: 10,
    priority: 'fast' as 'fast' | 'balanced' | 'precise',
    timeControl: 'all' as 'all' | 'rapid' | 'blitz' | 'bullet',
  });
  
  const [hasSearched, setHasSearched] = useState(false);
  const [analysisStarted, setAnalysisStarted] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Player summary hook
  const { summary, isLoading: summaryLoading, error: summaryError, notFound: playerNotFound, refetch } = usePlayerSummary(
    hasSearched ? searchForm.platform : null,
    hasSearched ? searchForm.username : null,
    hasSearched
  );

  // Analysis job hook
  const {
    createJob,
    cancelJob,
    jobId,
    shortLink,
    status,
    isDone,
    isFailed,
    isRunning,
    isQueued,
    etaRemaining,
    tacticsReady,
    swingMomentsReady,
    endgameReady,
    timeMgmtReady,
  } = useAnalysis();

  const [detailedResult, setDetailedResult] = useState<AnalysisResult | null>(null);
  const [resultError, setResultError] = useState<string | null>(null);
  const { addUsername, addAnalysis, recentAnalyses, removeAnalysis, clearHistory } = useLocalHistory();

  // modeMeta 는 번역 함수(t)가 바뀔 때만 재생성 — 실제로는 거의 불변
  const modeMeta = useMemo(() => ({
    fast: {
      label: t('modeFastLabel'),
      maxGames: MODE_MAX_GAMES.fast,
      estimate: t('modeFastEstimate'),
      cost: t('modeFastCost'),
      description: t('modeFastDesc'),
    },
    balanced: {
      label: t('modeBalancedLabel'),
      maxGames: MODE_MAX_GAMES.balanced,
      estimate: t('modeBalancedEstimate'),
      cost: t('modeBalancedCost'),
      description: t('modeBalancedDesc'),
    },
    precise: {
      label: t('modePreciseLabel'),
      maxGames: MODE_MAX_GAMES.precise,
      estimate: t('modePreciseEstimate'),
      cost: t('modePreciseCost'),
      description: t('modePreciseDesc'),
    },
  }), [t]);

  const selectedMode = modeMeta[searchForm.priority];

  const trackEvent = (eventName: string, payload: Record<string, string | number | boolean>) => {
    if (!process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID) return;
    try {
      sendGAEvent('event', eventName, payload);
    } catch {
      // Analytics must never interfere with the analysis workflow.
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const username = params.get('username');
    const n = Number(params.get('n'));
    const priority = params.get('priority');

    if (!username && !Number.isFinite(n) && priority !== 'fast' && priority !== 'balanced' && priority !== 'precise') {
      return;
    }

    setSearchForm((previous) => ({
      ...previous,
      username: username ?? previous.username,
      n: Number.isFinite(n) && n > 0 ? n : previous.n,
      priority: priority === 'precise' ? 'precise' : priority === 'balanced' ? 'balanced' : priority === 'fast' ? 'fast' : previous.priority,
    }));
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchForm.username.trim()) return;
    
    setHasSearched(true);
    setAnalysisStarted(false);
    setAnalysisError(null);
    setResultError(null);
    setDetailedResult(null);
    trackEvent('player_search', {
      platform: searchForm.platform,
      game_count: searchForm.n,
      priority: searchForm.priority,
      time_control: searchForm.timeControl,
    });
  };

  const handleStartAnalysis = async () => {
    if (!summary) return;
    
    try {
      setAnalysisError(null);
      setResultError(null);
      await createJob({
        platform: searchForm.platform,
        username: searchForm.username,
        n: searchForm.n,
        priority: searchForm.priority,
        timeControl: searchForm.timeControl,
      });
      setAnalysisStarted(true);
      trackEvent('analysis_started', {
        platform: searchForm.platform,
        game_count: searchForm.n,
        priority: searchForm.priority,
        time_control: searchForm.timeControl,
      });
    } catch (error) {
      console.error('Failed to start analysis:', error);
      setAnalysisError(error instanceof Error ? error.message : t('startAnalysisError'));
    }
  };

  // Fetch detailed results when analysis is done
  useEffect(() => {
    const fetchDetailedResult = async () => {
      if (isDone && jobId) {
        try {
          setResultError(null);
          const response = await fetch(`/api/v1/analysis/${jobId}/result`);
          if (response.ok) {
            const data = await response.json();
            setDetailedResult(data);
            // 분석 완료 → 로컬 히스토리에 저장
            if (data && jobId) {
              addUsername(searchForm.username);
              addAnalysis({
                jobId,
                username: data.username ?? searchForm.username,
                gameCount: data.totalGames ?? searchForm.n,
                accuracy: data.averageAccuracy ?? 0,
                playingStyle: data.playingStyle ?? '',
                winrate: summary?.player?.record_all?.winrate ?? 0,
              });
            }
          } else {
            const body = await response.text();
            setResultError(body || t('resultLoadError'));
          }
        } catch (error) {
          console.error('Failed to fetch detailed results:', error);
          setResultError(error instanceof Error ? error.message : t('resultLoadError'));
        }
      }
    };

    fetchDetailedResult();
  }, [isDone, jobId]);

  useEffect(() => {
    const maxGames = MODE_MAX_GAMES[searchForm.priority];
    if (searchForm.n > maxGames) {
      setSearchForm((previous) => ({ ...previous, n: maxGames }));
    }
  }, [searchForm.priority, searchForm.n]);


  return (
    <div className="chess-toss min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm chess-hero">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* 홈 복귀 링크 */}
          <div className="pt-4 pb-1">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-700 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              홈으로
            </button>
          </div>
          <div className="flex items-center justify-between gap-6 py-4">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600">
                <span className="text-base leading-none">♟</span>
                Chess intelligence
              </div>
              <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
              <p className="text-gray-600 mt-1">{t('subtitle')}</p>
            </div>
            <div className="hidden sm:grid chess-board-mini" aria-hidden="true">
              {['♜', '♞', '♝', '♛', '♚', '♝', '♞', '♜', '♙', '♙', '♙', '♙', '♟', '♟', '♟', '♟'].map((piece, index) => (
                <span key={`${piece}-${index}`}>{piece}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search */}
        <div className="bg-white rounded-xl shadow-sm border border-zinc-200 p-4 mb-5">
          <form onSubmit={handleSearch} className="flex gap-2">
            <select
              value={searchForm.platform}
              onChange={(e) => setSearchForm({ ...searchForm, platform: e.target.value })}
              className="border border-zinc-300 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 bg-white"
            >
              <option value="chess.com">Chess.com</option>
            </select>
            <input
              type="text"
              value={searchForm.username}
              onChange={(e) => setSearchForm({ ...searchForm, username: e.target.value })}
              placeholder={tCommon('usernamePlaceholder')}
              className="flex-1 border border-zinc-300 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900"
              required
            />
            <button
              type="submit"
              disabled={summaryLoading}
              className="bg-zinc-950 hover:bg-zinc-800 disabled:bg-zinc-400 text-white font-semibold px-5 py-2.5 rounded-lg flex items-center gap-2 text-sm flex-shrink-0"
            >
              {summaryLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              {tCommon('search')}
            </button>
          </form>
        </div>

        {/* 최근 분석 기록 — 분석 시작 전에만 표시 */}
        {!analysisStarted && recentAnalyses.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-zinc-200 p-4 mb-5">
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-widest text-zinc-400">
                {tHome('recentAnalyses')}
              </h2>
              <button
                type="button"
                onClick={clearHistory}
                className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
                {tHome('clearHistory')}
              </button>
            </div>
            <div className="space-y-1.5">
              {recentAnalyses.map((entry) => (
                <div
                  key={entry.jobId}
                  className="group flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2.5"
                >
                  {/* 유저명 + 스타일 */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-bold text-zinc-950 truncate">
                        {entry.username}
                      </span>
                      {entry.playingStyle && (
                        <span className="text-xs text-zinc-400 truncate hidden sm:inline">
                          {entry.playingStyle}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-400">
                      <span>{tHome('gamesCount', { count: entry.gameCount })}</span>
                      <span>·</span>
                      <span className="font-bold text-zinc-700">{entry.accuracy.toFixed(1)}%</span>
                      <span>·</span>
                      <span>{new Date(entry.analyzedAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* 결과 보기 */}
                  <button
                    type="button"
                    onClick={() => router.push(`/analysis/${entry.jobId}`)}
                    className="flex-shrink-0 flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-100 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {tHome('viewResult')}
                  </button>

                  {/* 재분석 */}
                  <button
                    type="button"
                    onClick={() => {
                      setSearchForm((prev) => ({ ...prev, username: entry.username, n: entry.gameCount }));
                      setHasSearched(true);
                      setAnalysisStarted(false);
                    }}
                    className="flex-shrink-0 rounded-md bg-zinc-950 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-zinc-700 transition-colors"
                  >
                    {tHome('reanalyze')}
                  </button>

                  {/* 삭제 — hover 시 */}
                  <button
                    type="button"
                    onClick={() => removeAnalysis(entry.jobId)}
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label={tHome('removeEntry')}
                  >
                    <X className="h-4 w-4 text-zinc-400 hover:text-zinc-700" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {summaryLoading && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <div className="animate-pulse">
              <div className="flex items-center space-x-4 mb-6">
                <div className="w-20 h-20 bg-gray-300 rounded-full"></div>
                <div className="space-y-2">
                  <div className="h-6 bg-gray-300 rounded w-32"></div>
                  <div className="h-4 bg-gray-300 rounded w-24"></div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 bg-gray-300 rounded-lg"></div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Player not found */}
        {playerNotFound && (
          <div className="flex flex-col items-center justify-center py-16 mb-8">
            <div className="w-20 h-20 rounded-full bg-zinc-100 flex items-center justify-center mb-4">
              <span className="text-4xl">♟</span>
            </div>
            <h2 className="text-xl font-black text-zinc-800 mb-1">
              {t('playerNotFound', { username: searchForm.username })}
            </h2>
            <p className="text-sm text-zinc-400 mb-5">
              {t('playerNotFoundHint')}
            </p>
            <button
              onClick={() => setSearchForm({ ...searchForm, username: '' })}
              className="px-5 py-2 rounded-lg bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-700 transition"
            >
              {t('searchAgain')}
            </button>
          </div>
        )}

        {/* Generic error (non-404) */}
        {summaryError && !playerNotFound && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
            <div className="text-red-800 font-medium">{t('summaryFetchError')}</div>
            <div className="text-red-700 text-sm mt-1">{summaryError}</div>
            <button
              onClick={refetch}
              className="mt-3 text-red-800 hover:text-red-900 underline"
            >
              {tCommon('retry')}
            </button>
          </div>
        )}

        {/* Player Profile (op.gg style) + Analysis Config */}
        {summary && summary.player && !analysisStarted && (
          <>
            <PlayerProfileCard summary={summary} />

            {/* Analysis config panel */}
            <div className="bg-white rounded-xl shadow-sm border border-zinc-200 p-5 mb-6">
              <div className="mb-5">
                <h2 className="text-base font-black text-zinc-950">{t('deepAnalysisTitle')}</h2>
                <p className="text-xs text-zinc-500 mt-0.5">{t('deepAnalysisSubtitle')}</p>
              </div>

              {analysisError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {analysisError}
                </div>
              )}

              {/* Game count */}
              <div className="mb-5">
                <label className="text-xs font-black text-zinc-500 uppercase tracking-widest block mb-2">
                  {t('gamesLabel')}
                </label>
                <div className="flex gap-2 flex-wrap">
                  {[10, 20, 30, 50].map((n) => {
                    const max = modeMeta[searchForm.priority].maxGames;
                    const isDisabled = n > max;
                    const isActive = searchForm.n === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => !isDisabled && setSearchForm({ ...searchForm, n })}
                        disabled={isDisabled}
                        className={`px-4 py-2 rounded-lg text-sm font-bold border transition ${
                          isActive
                            ? 'bg-zinc-950 text-white border-zinc-950'
                            : isDisabled
                              ? 'bg-zinc-50 text-zinc-300 border-zinc-100 cursor-not-allowed'
                              : 'bg-white text-zinc-700 border-zinc-300 hover:border-zinc-700'
                        }`}
                      >
                        {t('gamesN', { n })}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mode */}
              <div className="mb-5">
                <label className="text-xs font-black text-zinc-500 uppercase tracking-widest block mb-2">
                  {t('modeLabel')}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(Object.keys(modeMeta) as Array<keyof typeof modeMeta>).map((mode) => {
                    const meta = modeMeta[mode];
                    const isActive = searchForm.priority === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() =>
                          setSearchForm((prev) => ({
                            ...prev,
                            priority: mode,
                            n: Math.min(prev.n, meta.maxGames),
                          }))
                        }
                        className={`rounded-lg border px-4 py-3 text-left transition ${
                          isActive
                            ? 'border-zinc-950 bg-zinc-950 text-white'
                            : 'border-zinc-200 bg-zinc-50 hover:border-zinc-400'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-black">{meta.label}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                              isActive ? 'bg-white text-zinc-950' : 'bg-white text-zinc-500'
                            }`}
                          >
                            {meta.cost}
                          </span>
                        </div>
                        <div
                          className={`mt-1 text-xs font-semibold ${
                            isActive ? 'text-zinc-300' : 'text-zinc-500'
                          }`}
                        >
                          {t('maxGamesEstimate', { maxGames: meta.maxGames, estimate: meta.estimate })}
                        </div>
                        <div
                          className={`mt-1 text-xs leading-relaxed ${
                            isActive ? 'text-zinc-400' : 'text-zinc-500'
                          }`}
                        >
                          {meta.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time control (compact) */}
              <div className="mb-5">
                <label className="text-xs font-black text-zinc-500 uppercase tracking-widest block mb-2">
                  {t('timeControlLabel')}
                </label>
                <div className="flex gap-2 flex-wrap">
                  {(['all', 'rapid', 'blitz', 'bullet'] as const).map((tc) => {
                    const labels = {
                      all: t('timeControlAll'),
                      rapid: t('timeControlRapid'),
                      blitz: t('timeControlBlitz'),
                      bullet: t('timeControlBullet'),
                    };
                    const isActive = searchForm.timeControl === tc;
                    return (
                      <button
                        key={tc}
                        type="button"
                        onClick={() => setSearchForm({ ...searchForm, timeControl: tc })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                          isActive
                            ? 'bg-zinc-950 text-white border-zinc-950'
                            : 'bg-white text-zinc-600 border-zinc-300 hover:border-zinc-600'
                        }`}
                      >
                        {labels[tc]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={handleStartAnalysis}
                className="w-full bg-zinc-950 hover:bg-zinc-800 text-white font-black py-3.5 px-6 rounded-lg flex items-center justify-center gap-2 transition"
              >
                <Zap className="w-4 h-4" />
                {t('startAnalysisN', { n: searchForm.n })}
              </button>
            </div>
          </>
        )}

        {/* Compact player header while analysis is running */}
        {summary && summary.player && analysisStarted && (
          <div className="bg-white rounded-xl border border-zinc-200 px-5 py-3 mb-5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full overflow-hidden bg-zinc-200 flex-shrink-0">
              {summary.player.avatar ? (
                <img src={summary.player.avatar} alt={summary.player.username} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm font-black text-zinc-500">
                  {summary.player.username.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <div className="font-bold text-sm text-zinc-950">{summary.player.username}</div>
              <div className="text-xs text-zinc-400">
                {t('analysisHeaderMeta', { n: searchForm.n, mode: modeMeta[searchForm.priority].label })}
              </div>
            </div>
          </div>
        )}

        {/* Analysis Progress and Results */}
        {analysisStarted && status && (
          <div className="space-y-8">
            {isFailed && (
              <div className="rounded-xl border border-zinc-300 bg-white p-6 shadow-lg chess-panel">
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-950 text-white">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-950">{t('analysisFailed')}</h3>
                    <p className="text-sm text-zinc-500">{t('analysisFailedDesc')}</p>
                  </div>
                </div>
                <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-700">
                  {status.errorMessage || status.currentStep || t('retryFastHint')}
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSearchForm((previous) => ({ ...previous, priority: 'fast', n: Math.min(previous.n, 10) }));
                      setAnalysisStarted(false);
                      setAnalysisError(null);
                      setResultError(null);
                    }}
                    className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-800"
                  >
                    {t('retryFast')}
                  </button>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-bold text-zinc-800 hover:bg-zinc-50"
                  >
                    {t('refreshStatus')}
                  </button>
                </div>
              </div>
            )}

            {/* Progress Indicator */}
            {!isDone && !isFailed && (
              <div className="bg-white rounded-xl shadow-lg p-6 chess-panel">
                <div className="flex items-center justify-between mb-4 gap-3">
                  <h3 className="text-xl font-bold text-gray-900">{t('analysisRunning')}</h3>
                  <button
                    type="button"
                    onClick={cancelJob}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-bold text-zinc-600 hover:border-red-400 hover:text-red-600 transition-colors flex-shrink-0"
                  >
                    {tCommon('cancel')}
                  </button>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">{t('overallProgress')}</span>
                  <span className="text-sm text-gray-600 tabular-nums">
                    {Math.round(status.progress || 0)}%
                    {isRunning && etaRemaining != null && (
                      <span className="ml-2 text-zinc-400">
                        · {etaRemaining < 60
                          ? t('etaSeconds', { n: etaRemaining })
                          : t('etaMinutes', { n: Math.round(etaRemaining / 60) })}
                      </span>
                    )}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-blue-600 h-3 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${Math.min(status.progress || 0, 100)}%` }}
                  />
                </div>

                {status.currentStep && (
                  <div className="mt-3 text-sm text-gray-600 bg-blue-50 px-3 py-2 rounded-lg">
                    <span className="font-medium">{t('currentStep')}</span> {status.currentStep}
                  </div>
                )}
                {isQueued && typeof status.queuePosition === 'number' && typeof status.queueSize === 'number' && (
                  <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                    {t('queueInfo', { position: status.queuePosition, size: status.queueSize })}
                  </div>
                )}

                {/* Partial Results Indicators */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                  {[
                    { key: 'tactics', title: t('tacticsPartial'), ready: tacticsReady, icon: Target },
                    { key: 'swing', title: t('swingPartial'), ready: swingMomentsReady, icon: TrendingUp },
                    { key: 'endgame', title: t('endgamePartial'), ready: endgameReady, icon: Brain },
                    { key: 'time', title: t('timeMgmtPartial'), ready: timeMgmtReady, icon: Clock }
                  ].map(({ key, title, ready, icon: Icon }) => (
                    <div
                      key={key}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        ready 
                          ? 'bg-green-50 border-green-200 text-green-800' 
                          : 'bg-gray-50 border-gray-200 text-gray-500'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <Icon className="w-5 h-5" />
                        <span className="text-sm font-medium">{title}</span>
                        {ready && <span className="text-xs">✓</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Comprehensive Analysis Results */}
            {detailedResult && (
              <AnalysisResultErrorBoundary>
                <AnalysisResultView
                  result={detailedResult}
                  winrate={summary?.player?.record_all?.winrate}
                  shortLink={shortLink}
                  jobId={jobId ?? ''}
                />
              </AnalysisResultErrorBoundary>
            )}
            {isDone && !detailedResult && resultError && (
              <div className="rounded-xl border border-zinc-300 bg-white p-6 shadow-lg chess-panel">
                <h3 className="text-xl font-bold text-zinc-950">{t('resultLoadError')}</h3>
                <p className="mt-2 text-sm text-zinc-600">{resultError}</p>
                <button
                  type="button"
                  onClick={() => jobId && fetch(`/api/v1/analysis/${jobId}/result`).then(async (response) => {
                    if (!response.ok) throw new Error(await response.text());
                    setDetailedResult(await response.json());
                    setResultError(null);
                  }).catch((error) => setResultError(error instanceof Error ? error.message : t('resultLoadError')))}
                  className="mt-4 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-800"
                >
                  {t('resultReload')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
