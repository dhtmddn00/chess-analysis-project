'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Search, Globe, Trophy, TrendingUp, Clock, Target, Zap, Brain, BarChart3, BookOpen, ShieldCheck, ArrowLeft, ExternalLink, X, Trash2 } from 'lucide-react';
import { sendGAEvent } from '@next/third-parties/google';
import { useTranslations } from 'next-intl';
import { useRouter as useIntlRouter } from '../../../i18n/navigation';
import { usePlayerSummary } from '../../../hooks/usePlayerSummary';
import { useAnalysis } from '../../../hooks/useAnalysis';
import { useLocalHistory } from '../../../hooks/useLocalHistory';
import { PlayerProfileCard } from '../../../components/PlayerProfileCard';
import { AnalysisResultErrorBoundary } from '../../../components/AnalysisResultErrorBoundary';
import { ShareResultCard } from '../../../components/ShareResultCard';

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

interface AnalysisResult {
  analysisId: string;
  username: string;
  platform: string;
  gameCount: number;
  status: string;
  totalGames: number;
  averageAccuracy: number;
  averageCentipawnLoss: number;
  totalBlunders: number;
  totalMistakes: number;
  totalInaccuracies: number;

  openingStats?: {
    whiteTotal: number;
    blackTotal: number;
    white: Array<{
      name: string;
      count: number;
      percentage: number;
      scoreRate?: number;
      averageCpl?: number;
      firstIssueMove?: number | null;
    }>;
    black: Array<{
      name: string;
      count: number;
      percentage: number;
      scoreRate?: number;
      averageCpl?: number;
      firstIssueMove?: number | null;
    }>;
  };
  
  explanations: {
    accuracyExplanation: string;
    acplExplanation: string;
    errorAnalysis: string;
  };
  
  styleProfile: {
    playingStyle: string;
    tacticalRating: number;
    positionalRating: number;
    endgameRating: number;
    timeManagementRating: number;
    blunderTendency: number;
    riskTolerance: number;
    pieceActivityPreference: number;
    aggressionRating: number;
    exchangePreference: number;
    openingVariety: number;
    leadConversion: number;
    consistency: number;
    swindleResistance: number;
    strengths: string;
    weaknesses: string;
    summaryData?: string;
    metadata: string;
    tacticalStats: string;
    dimensionExplanations?: {
      tacticalExplanation?: string;
      positionalExplanation?: string;
      endgameExplanation?: string;
      timeManagementExplanation?: string;
      aggressionExplanation?: string;
      consistencyExplanation?: string;
      overallStyleAnalysis?: string;
    };
  };

  comparativeInsights?: {
    ratingBand?: string;
    disclaimer?: string;
    narrative?: string;
    sampleReliability?: {
      label: string;
      message: string;
      games: number;
    };
    performancePercentiles?: {
      accuracy?: PercentileMetric;
      centipawnLoss?: PercentileMetric;
      tactical?: PercentileMetric;
      consistency?: PercentileMetric;
      leadConversion?: PercentileMetric;
    };
    gmMatch?: {
      name: string;
      similarity: number;
      styleLabel: string;
      reason: string;
    };
    opponentProfile?: {
      averagePlayerRating?: number;
      averageOpponentRating?: number;
      gamesWithRating?: number;
      headline?: string;
      buckets?: Record<'stronger' | 'similar' | 'weaker', OpponentBucket>;
    };
  };

  decisiveMoments?: Array<{
    gameIndex: number;
    moveNumber: number;
    sideLabel: string;
    move: string;
    bestMove?: string;
    classificationLabel: string;
    centipawnLoss: number;
    winProbabilityLoss?: number;
    impactLabel: string;
    opening?: string;
    explanation: string;
  }>;

  learningInsights?: {
    headline?: string;
    note?: string;
    cards?: Array<{
      title: string;
      value: string;
      description: string;
    }>;
  };

  advancedInsights?: {
    story?: string;
    styleAxes?: Array<{
      label: string;
      value: number;
      band: string;
      description: string;
    }>;
    confidenceBands?: Array<{
      label: string;
      value: number;
      margin: number;
      range: string;
      basis: string;
    }>;
    criticalMoveStats?: {
      sample?: number;
      solved?: number;
      accuracy?: number;
      label?: string;
      averageGap?: number;
    };
    complexityPreference?: {
      label?: string;
      value?: string;
      description?: string;
      complexCpl?: number;
      simpleCpl?: number;
    };
    timePatterns?: {
      message?: string;
      buckets?: Array<{
        label: string;
        games: number;
        scoreRate: number;
        averageCpl: number;
      }>;
    };
    openingHoles?: Array<{
      name: string;
      sideLabel: string;
      count: number;
      scoreRate?: number;
      averageCpl?: number;
      firstIssueMove?: number;
      reason?: string;
    }>;
  };

  opponentExploitPlan?: {
    headline?: string;
    confidence?: string;
    disclaimer?: string;
    weaknesses?: Array<{
      title: string;
      value: string;
      description: string;
    }>;
    recommendations?: Array<{
      title: string;
      value: string;
      description: string;
    }>;
  };
  
  tacticalOverview?: {
    totalOpportunities: number;
    foundTactics: number;
    missedTactics: number;
    tacticalAccuracy: string;
    sampleAvailable?: boolean;
    confidence?: string;
    message?: string;
  };
  
  tacticalOpportunities?: Array<{
    pattern: string;
    accuracy: string;
    found: number;
    missed: number;
    averageValue: number;
    description: string;
  }>;
  
  trainingRecommendations?: Array<{
    title: string;
    description: string;
    category: string;
    priority: number;
    eloGain: number;
  }>;
  
  playerMetadata?: {
    country: string;
    title: string;
    followers: number;
    ratingsData: string;
  };
}

interface PercentileMetric {
  label: string;
  value: number;
  unit: string;
  betterThanPercent: number;
  topPercent: number;
  topPercentLabel: string;
  basis: string;
}

interface OpponentBucket {
  label: string;
  games: number;
  scoreRate: number;
}

// ── Static constants — defined outside the component so they are never re-created ──

/** maxGames per mode (pure data, no translations needed) */
const MODE_MAX_GAMES = { fast: 50, balanced: 30, precise: 20 } as const;

/** Keys of AnalysisResult['styleProfile'] that hold numeric scores */
type StyleNumericKey =
  | 'tacticalRating' | 'positionalRating' | 'endgameRating'
  | 'timeManagementRating' | 'aggressionRating' | 'consistency'
  | 'riskTolerance' | 'exchangePreference' | 'openingVariety'
  | 'leadConversion' | 'swindleResistance' | 'blunderTendency';

const STYLE_DIMENSIONS: { i18nKey: string; key: StyleNumericKey; icon: string }[] = [
  { i18nKey: 'dimTactical',         key: 'tacticalRating',        icon: '♞' },
  { i18nKey: 'dimPositional',       key: 'positionalRating',      icon: '♗' },
  { i18nKey: 'dimEndgame',          key: 'endgameRating',         icon: '♔' },
  { i18nKey: 'dimTimeManagement',   key: 'timeManagementRating',  icon: '♟' },
  { i18nKey: 'dimAggression',       key: 'aggressionRating',      icon: '♛' },
  { i18nKey: 'dimConsistency',      key: 'consistency',           icon: '♖' },
  { i18nKey: 'dimRisk',             key: 'riskTolerance',         icon: '♘' },
  { i18nKey: 'dimExchange',         key: 'exchangePreference',    icon: '♜' },
  { i18nKey: 'dimOpeningVariety',   key: 'openingVariety',        icon: '♙' },
  { i18nKey: 'dimLeadConversion',   key: 'leadConversion',        icon: '♕' },
  { i18nKey: 'dimSwindleResistance',key: 'swindleResistance',     icon: '♚' },
  { i18nKey: 'dimBlunderTendency',  key: 'blunderTendency',       icon: '♟' },
];

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

  const getResultColor = (result: string) => {
    if (result === 'W') return 'text-white bg-black';
    if (result === 'L') return 'text-black bg-white border border-black/20';
    return 'text-zinc-700 bg-zinc-200';
  };

  const getResultText = (result: string) => {
    if (result === 'W') return '승';
    if (result === 'L') return '패';
    return '무';
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 80) return 'text-black bg-zinc-100';
    if (rating >= 60) return 'text-zinc-800 bg-zinc-100';
    if (rating >= 40) return 'text-zinc-600 bg-zinc-100';
    return 'text-zinc-500 bg-zinc-100';
  };

  const getBriefStyleAnalysis = (analysis?: string) => {
    if (!analysis) return '';
    const sentences = analysis.match(/[^.!?。]+[.!?。]/g);
    if (!sentences || sentences.length === 0) return analysis;
    return sentences.slice(0, 2).join(' ').trim();
  };

  const comparisonMetrics = detailedResult?.comparativeInsights?.performancePercentiles
    ? [
        detailedResult.comparativeInsights.performancePercentiles.accuracy,
        detailedResult.comparativeInsights.performancePercentiles.centipawnLoss,
        detailedResult.comparativeInsights.performancePercentiles.tactical,
        detailedResult.comparativeInsights.performancePercentiles.consistency,
      ].filter((metric): metric is PercentileMetric => Boolean(metric))
    : [];

  const learningCards = detailedResult?.learningInsights?.cards || [];

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
              <div className="space-y-8">
                {/* Executive Summary */}
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl shadow-lg p-6 chess-result-hero">
                  <div className="flex items-center mb-4">
                    <div className="mr-3 flex h-12 w-12 items-center justify-center rounded-lg bg-white text-2xl text-black">♔</div>
                    <div>
                      <h3 className="text-2xl font-bold">{t('comprehensiveResult')}</h3>
                      <p className="text-blue-100">{t('resultSummary', { username: detailedResult.username, count: detailedResult.totalGames })}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-lg chess-panel">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-950 text-white">
                      <Target className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-lg font-black text-zinc-950">{t('reviewOrder')}</h4>
                      <p className="text-sm text-zinc-500">{t('reviewOrderDesc')}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                      <div className="text-xs font-black text-zinc-500">{t('priority1')}</div>
                      <div className="mt-1 text-base font-black text-zinc-950">{t('decisiveMoments', { count: detailedResult.decisiveMoments?.length || 0 })}</div>
                      <p className="mt-2 text-sm leading-6 text-zinc-600">
                        {t('decisiveMomentsDesc')}
                      </p>
                    </div>
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                      <div className="text-xs font-black text-zinc-500">{t('priority2')}</div>
                      <div className="mt-1 text-base font-black text-zinc-950">
                        {detailedResult.advancedInsights?.openingHoles?.[0]?.name || t('checkOpenings')}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-zinc-600">
                        {t('checkOpeningsDesc')}
                      </p>
                    </div>
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                      <div className="text-xs font-black text-zinc-500">{t('priority3')}</div>
                      <div className="mt-1 text-base font-black text-zinc-950">
                        {detailedResult.trainingRecommendations?.[0]?.title || t('customTraining')}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-zinc-600">
                        {t('customTrainingDesc')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Performance Metrics Dashboard */}
                <div className="bg-white rounded-xl shadow-lg p-6 chess-panel">
                  <h4 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    {t('performanceMetrics')}
                  </h4>

                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
                    <div className="text-center p-4 bg-blue-50 rounded-lg border">
                      <div className="text-2xl font-bold text-blue-600">
                        ♕ {detailedResult.averageAccuracy?.toFixed(1) || '0.0'}%
                      </div>
                      <div className="text-xs text-gray-600">{t('avgAccuracy')}</div>
                    </div>

                    <div className="text-center p-4 bg-green-50 rounded-lg border">
                      <div className="text-2xl font-bold text-green-600">
                        ♙ {detailedResult.averageCentipawnLoss?.toFixed(1) || '0.0'}
                      </div>
                      <div className="text-xs text-gray-600">{t('avgCpl')}</div>
                    </div>

                    <div className="text-center p-4 bg-yellow-50 rounded-lg border">
                      <div className="text-2xl font-bold text-yellow-600">
                        ♞ {detailedResult.tacticalOverview?.tacticalAccuracy || '0.0%'}
                      </div>
                      <div className="text-xs text-gray-600">{t('tacticalAccuracy')}</div>
                    </div>

                    <div className="text-center p-4 bg-red-50 rounded-lg border">
                      <div className="text-2xl font-bold text-red-600">
                        {detailedResult.totalBlunders || 0}
                      </div>
                      <div className="text-xs text-gray-600">{t('blunders')}</div>
                    </div>

                    <div className="text-center p-4 bg-orange-50 rounded-lg border">
                      <div className="text-2xl font-bold text-orange-600">
                        {detailedResult.totalMistakes || 0}
                      </div>
                      <div className="text-xs text-gray-600">{t('mistakes')}</div>
                    </div>

                    <div className="text-center p-4 bg-purple-50 rounded-lg border">
                      <div className="text-2xl font-bold text-purple-600">
                        {detailedResult.totalInaccuracies || 0}
                      </div>
                      <div className="text-xs text-gray-600">{t('inaccuracies')}</div>
                    </div>
                  </div>

                  {detailedResult.comparativeInsights && (
                    <div className="mb-6 rounded-xl border border-zinc-300 bg-zinc-950 p-5 text-white shadow-sm dark-surface">
                      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white px-3 py-1 text-xs font-bold text-zinc-950">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            {t('cohortComparison')}
                          </div>
                          <h5 className="text-2xl font-black text-white">{t('cohortQuestion')}</h5>
                          <p className="mt-3 max-w-3xl text-base font-medium leading-7 text-zinc-100">
                            {detailedResult.comparativeInsights.narrative}
                          </p>
                        </div>
                        <div className="rounded-lg border border-white/20 bg-white px-4 py-3 text-sm text-zinc-950">
                          <div className="text-zinc-500">{t('ratingBand')}</div>
                          <div className="text-lg font-black">{detailedResult.comparativeInsights.ratingBand || t('analyzing')}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                        {comparisonMetrics.map((metric) => (
                          <div key={metric.label} className="rounded-lg border border-white/10 bg-white p-4 text-zinc-950">
                            <div className="text-xs font-semibold text-zinc-500">{metric.label}</div>
                            <div className="mt-2 text-2xl font-bold">{metric.topPercentLabel}</div>
                            <div className="mt-1 text-xs text-zinc-500">
                              {metric.value}{metric.unit} · {metric.basis}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="rounded-lg border border-white/15 bg-white p-4 text-zinc-950">
                          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-zinc-700">
                            <Trophy className="h-4 w-4" />
                            {t('gmMatch')}
                          </div>
                          <div className="text-2xl font-black">{detailedResult.comparativeInsights.gmMatch?.name || t('analyzing')}</div>
                          <div className="mt-1 text-sm font-semibold text-zinc-700">
                            {detailedResult.comparativeInsights.gmMatch?.styleLabel} · {t('gmSimilarity', { similarity: detailedResult.comparativeInsights.gmMatch?.similarity || 0 })}
                          </div>
                          <p className="mt-3 text-sm font-medium leading-6 text-zinc-700">
                            {detailedResult.comparativeInsights.gmMatch?.reason}
                          </p>
                        </div>

                        <div className="rounded-lg border border-white/15 bg-white p-4 text-zinc-950">
                          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-zinc-700">
                            <Target className="h-4 w-4" />
                            {t('nextLearning')}
                          </div>
                          <p className="mb-3 text-sm font-medium leading-6 text-zinc-700">
                            {detailedResult.learningInsights?.headline || t('nextLearningDesc')}
                          </p>
                          <div className="space-y-2">
                            {learningCards.slice(0, 3).map((card) => (
                              <div key={`${card.title}-${card.value}`} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-zinc-950">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-xs font-bold text-zinc-500">{card.title}</div>
                                  <div className="text-sm font-black">{card.value}</div>
                                </div>
                                <div className="mt-1 text-xs leading-5 text-zinc-600">{card.description}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {detailedResult.comparativeInsights.sampleReliability && (
                        <div className="mt-4 rounded-lg border border-white/20 bg-white px-4 py-3 text-sm font-semibold text-zinc-800">
                          {t('sampleReliability', {
                            label: detailedResult.comparativeInsights.sampleReliability.label,
                            message: detailedResult.comparativeInsights.sampleReliability.message,
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {detailedResult.advancedInsights && (
                    <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4">
                      <div className="mb-4 flex items-center gap-2">
                        <Brain className="h-5 w-5 text-zinc-800" />
                        <h5 className="font-semibold text-gray-900">{t('analysisStory')}</h5>
                      </div>

                      {detailedResult.advancedInsights.story && (
                        <p className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium leading-6 text-zinc-700">
                          {detailedResult.advancedInsights.story}
                        </p>
                      )}

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                        {(detailedResult.advancedInsights.styleAxes || []).map((axis) => (
                          <div key={axis.label} className="rounded-lg border border-zinc-200 bg-white p-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs font-bold text-zinc-500">{axis.label}</div>
                              <div className="rounded-full bg-zinc-950 px-2 py-0.5 text-[11px] font-bold text-white">{axis.band}</div>
                            </div>
                            <div className="mt-2 text-2xl font-black text-zinc-950">{axis.value.toFixed(1)}</div>
                            <div className="mt-1 h-1.5 rounded-full bg-zinc-200">
                              <div className="h-1.5 rounded-full bg-zinc-950" style={{ width: `${Math.min(axis.value, 100)}%` }} />
                            </div>
                            <p className="mt-2 text-xs leading-5 text-zinc-600">{axis.description}</p>
                          </div>
                        ))}
                      </div>

                      {(detailedResult.advancedInsights.confidenceBands || []).length > 0 && (
                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                          {(detailedResult.advancedInsights.confidenceBands || []).map((band) => (
                            <div key={band.label} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                              <div className="text-xs font-bold text-zinc-500">{band.label}</div>
                              <div className="mt-1 text-lg font-black text-zinc-950">{band.value.toFixed(1)} ± {band.margin}</div>
                              <div className="mt-1 text-xs text-zinc-600">{t('expectedRange', { range: band.range })}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {detailedResult.opponentExploitPlan && (
                    <div className="mb-6 rounded-lg border border-zinc-950 bg-zinc-950 p-4 text-white dark-surface">
                      <div className="mb-2 flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5" />
                        <h5 className="font-semibold">{t('opponentPlanTitle')}</h5>
                      </div>
                      <p className="mb-4 text-sm font-medium leading-6 text-zinc-200">
                        {detailedResult.opponentExploitPlan.headline}
                        {detailedResult.opponentExploitPlan.confidence && (
                          <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs font-bold text-zinc-950">
                            {t('confidence', { confidence: detailedResult.opponentExploitPlan.confidence })}
                          </span>
                        )}
                      </p>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <div className="mb-2 text-xs font-black uppercase tracking-wide text-zinc-400">{t('weaknessCandidates')}</div>
                          <div className="space-y-2">
                            {(detailedResult.opponentExploitPlan.weaknesses || []).map((item) => (
                              <div key={`${item.title}-${item.value}`} className="rounded-lg border border-white/15 bg-white p-3 text-zinc-950">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-sm font-bold">{item.title}</div>
                                  <div className="text-xs font-black text-zinc-600">{item.value}</div>
                                </div>
                                <p className="mt-1 text-xs leading-5 text-zinc-600">{item.description}</p>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="mb-2 text-xs font-black uppercase tracking-wide text-zinc-400">{t('recommendedStrategy')}</div>
                          <div className="space-y-2">
                            {(detailedResult.opponentExploitPlan.recommendations || []).map((item) => (
                              <div key={`${item.title}-${item.value}`} className="rounded-lg border border-white/15 bg-zinc-900 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-sm font-bold text-white">{item.title}</div>
                                  <div className="text-xs font-black text-zinc-300">{item.value}</div>
                                </div>
                                <p className="mt-1 text-xs leading-5 text-zinc-300">{item.description}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {detailedResult.opponentExploitPlan.disclaimer && (
                        <div className="mt-4 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs leading-5 text-zinc-300">
                          {detailedResult.opponentExploitPlan.disclaimer}
                        </div>
                      )}
                    </div>
                  )}

                  {detailedResult.advancedInsights && (
                    <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4">
                      <div className="mb-4 flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-zinc-800" />
                        <h5 className="font-semibold text-gray-900">{t('advancedPatterns')}</h5>
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        {detailedResult.advancedInsights.criticalMoveStats && (
                          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                            <div className="text-xs font-bold text-zinc-500">Critical Move Accuracy</div>
                            <div className="mt-1 text-xl font-black text-zinc-950">
                              {detailedResult.advancedInsights.criticalMoveStats.sample
                                ? `${detailedResult.advancedInsights.criticalMoveStats.accuracy?.toFixed(1)}%`
                                : t('sampleInsufficient')}
                            </div>
                            <div className="mt-1 text-xs text-zinc-600">
                              {t('criticalMoveSampleLabel', {
                                sample: detailedResult.advancedInsights.criticalMoveStats.sample || 0,
                                label: detailedResult.advancedInsights.criticalMoveStats.label ?? '',
                              })}
                            </div>
                          </div>
                        )}

                        {detailedResult.advancedInsights.complexityPreference && (
                          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                            <div className="text-xs font-bold text-zinc-500">{t('complexityResponse')}</div>
                            <div className="mt-1 text-xl font-black text-zinc-950">{detailedResult.advancedInsights.complexityPreference.label}</div>
                            <div className="mt-1 text-xs text-zinc-600">{detailedResult.advancedInsights.complexityPreference.value}</div>
                          </div>
                        )}

                        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                          <div className="text-xs font-bold text-zinc-500">{t('timePattern')}</div>
                          <div className="mt-1 text-sm font-semibold leading-5 text-zinc-700">
                            {detailedResult.advancedInsights.timePatterns?.message || t('timePatternCollecting')}
                          </div>
                        </div>
                      </div>

                      {(detailedResult.advancedInsights.openingHoles || []).length > 0 && (
                        <div className="mt-4">
                          <div className="mb-2 text-sm font-bold text-zinc-800">{t('openingHoles')}</div>
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            {(detailedResult.advancedInsights.openingHoles || []).map((opening) => (
                              <div key={`${opening.sideLabel}-${opening.name}`} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 text-sm font-bold text-zinc-950">{opening.sideLabel} · {opening.name}</div>
                                  <div className="shrink-0 text-xs font-bold text-zinc-500">{opening.reason}</div>
                                </div>
                                <div className="mt-1 text-xs text-zinc-600">
                                  {t('openingHoleStats', {
                                    count: opening.count,
                                    scoreRate: opening.scoreRate?.toFixed(1) ?? '0.0',
                                    cpl: opening.averageCpl?.toFixed(1) ?? '0.0',
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {detailedResult.decisiveMoments && detailedResult.decisiveMoments.length > 0 && (
                    <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4">
                      <div className="mb-4 flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-zinc-800" />
                        <h5 className="font-semibold text-gray-900">{t('decisiveMomentsSection')}</h5>
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {detailedResult.decisiveMoments.slice(0, 4).map((moment) => (
                          <div
                            key={`${moment.gameIndex}-${moment.moveNumber}-${moment.move}`}
                            className="rounded-lg border border-zinc-200 bg-zinc-50 p-4"
                          >
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <div className="text-sm font-bold text-zinc-950">
                                {t('gameMoveSide', { gameIndex: moment.gameIndex + 1, moveNumber: moment.moveNumber, side: moment.sideLabel })}
                              </div>
                              <div className="rounded-full bg-zinc-950 px-2.5 py-1 text-xs font-bold text-white">
                                {moment.winProbabilityLoss && moment.winProbabilityLoss >= 1
                                  ? `${moment.winProbabilityLoss}%p`
                                  : `${moment.centipawnLoss}cp`}
                              </div>
                            </div>

                            <div className="text-lg font-black text-zinc-950">
                              {moment.move}
                              {moment.bestMove && (
                                <span className="ml-2 text-sm font-semibold text-zinc-500">
                                  {t('bestMoveSuggestion', { bestMove: moment.bestMove })}
                                </span>
                              )}
                            </div>

                            <div className="mt-2 text-sm font-semibold text-zinc-700">
                              {moment.impactLabel} · {moment.classificationLabel}
                              {moment.winProbabilityLoss && moment.winProbabilityLoss >= 1
                                ? ` · ${moment.centipawnLoss}cp`
                                : ''}
                            </div>
                            <p className="mt-2 text-sm leading-6 text-zinc-600">
                              {moment.explanation}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Opening Repertoire */}
                  {detailedResult.openingStats && (
                    <div className="mb-6 rounded-lg border bg-slate-50 p-4">
                      <div className="mb-4 flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-slate-700" />
                        <h5 className="font-semibold text-gray-900">{t('openingRepertoire')}</h5>
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {[
                          { title: t('whiteGames'), total: detailedResult.openingStats.whiteTotal, rows: detailedResult.openingStats.white },
                          { title: t('blackGames'), total: detailedResult.openingStats.blackTotal, rows: detailedResult.openingStats.black },
                        ].map((section) => (
                          <div key={section.title} className="rounded-lg border bg-white p-4">
                            <div className="mb-3 flex items-baseline justify-between">
                              <div className="text-sm font-semibold text-gray-800">{section.title}</div>
                              <div className="text-xs text-gray-500">{t('totalGamesCount', { total: section.total })}</div>
                            </div>

                            {section.rows.length > 0 ? (
                              <div className="space-y-3">
                                {section.rows.map((opening, index) => (
                                  <div key={`${section.title}-${opening.name}`} className="space-y-1">
                                    <div className="flex items-center justify-between gap-3 text-sm">
                                      <div className="min-w-0 font-medium text-gray-800">
                                        {index + 1}. {opening.name}
                                      </div>
                                      <div className="shrink-0 text-gray-600">
                                        {t('openingCountPct', { count: opening.count, pct: opening.percentage.toFixed(1) })}
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                                      {typeof opening.scoreRate === 'number' && <span>{t('openingScoreRate', { scoreRate: opening.scoreRate.toFixed(1) })}</span>}
                                      {typeof opening.averageCpl === 'number' && opening.averageCpl > 0 && <span>{t('openingAvgCpl', { cpl: opening.averageCpl.toFixed(1) })}</span>}
                                      {typeof opening.firstIssueMove === 'number' && <span>{t('firstWavered', { move: opening.firstIssueMove.toFixed(1) })}</span>}
                                    </div>
                                    <div className="h-1.5 w-full rounded-full bg-gray-200">
                                      <div
                                        className="h-1.5 rounded-full bg-slate-700"
                                        style={{ width: `${Math.min(opening.percentage, 100)}%` }}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500">{t('noGamesForColor')}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Performance Analysis */}
                  <div className="space-y-4">
                    <div className="p-4 bg-blue-50 border-l-4 border-blue-400 rounded-lg">
                      <div className="font-medium text-blue-900 mb-1">{t('accuracySection')}</div>
                      <p className="text-sm text-blue-800">{detailedResult.explanations?.accuracyExplanation}</p>
                    </div>
                    
                    <div className="p-4 bg-green-50 border-l-4 border-green-400 rounded-lg">
                      <div className="font-medium text-green-900 mb-1">{t('acplSection')}</div>
                      <p className="text-sm text-green-800">{detailedResult.explanations?.acplExplanation}</p>
                    </div>
                    
                    <div className="p-4 bg-orange-50 border-l-4 border-orange-400 rounded-lg">
                      <div className="font-medium text-orange-900 mb-1">{t('mistakeSection')}</div>
                      <p className="text-sm text-orange-800">{detailedResult.explanations?.errorAnalysis}</p>
                    </div>
                  </div>
                </div>

                {/* Comprehensive Style Profile */}
                <div className="bg-white rounded-xl shadow-lg p-6 chess-panel">
                  <h4 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                    <Brain className="h-5 w-5" />
                    {t('styleProfile')}
                  </h4>
                  
                  {/* Main Playing Style */}
                  <div className="bg-gradient-to-r from-purple-100 to-pink-100 p-6 rounded-lg mb-6 border chess-style-summary">
                    <div className="text-center">
                      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-black text-2xl text-white">♚</div>
                      <h5 className="text-lg font-bold text-purple-800 mb-2">{t('mainStyle')}</h5>
                      <div className="text-2xl font-bold text-purple-900">
                        {detailedResult.styleProfile?.playingStyle || t('analyzing')}
                      </div>
                      {detailedResult.styleProfile?.dimensionExplanations?.overallStyleAnalysis && (
                        <p className="mx-auto mt-3 max-w-3xl text-sm leading-relaxed text-purple-800">
                          {getBriefStyleAnalysis(detailedResult.styleProfile.dimensionExplanations.overallStyleAnalysis)}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* All 12 Dimensions */}
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {STYLE_DIMENSIONS.map((dimension) => {
                      const score = detailedResult.styleProfile?.[dimension.key] ?? 0;
                      return (
                        <div key={dimension.key} className="text-center p-3 bg-gray-50 rounded-lg border hover:shadow-md transition-shadow">
                          <div className="text-lg mb-1">{dimension.icon}</div>
                          <div className={`text-xl font-bold mb-1 ${getRatingColor(score)}`}>
                            {score.toFixed(0)}
                          </div>
                          <div className="text-xs text-gray-600 leading-tight">{t(dimension.i18nKey as Parameters<typeof t>[0])}</div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                            <div 
                              className="bg-blue-500 h-1.5 rounded-full" 
                              style={{ width: `${Math.min(score, 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Style Dimension Explanations */}
                  {detailedResult.styleProfile?.dimensionExplanations && (
                    <div className="mt-6 space-y-3">
                      <h5 className="font-semibold text-gray-900 mb-3">📝 {t('dimensionDetail')}</h5>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(Object.entries(detailedResult.styleProfile.dimensionExplanations) as [string, string | undefined][])
                          .filter((entry): entry is [string, string] =>
                            entry[0] !== 'overallStyleAnalysis' && typeof entry[1] === 'string'
                          )
                          .map(([key, explanation]) => (
                            <div key={key} className="p-3 bg-gray-50 rounded-lg border text-sm">
                              <div className="font-medium text-gray-800 mb-1">
                                {key.replace('Explanation', '').replace(/([A-Z])/g, ' $1').trim()}
                              </div>
                              <div className="text-gray-600">{explanation}</div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Tactical Analysis */}
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h4 className="text-xl font-bold text-gray-900 mb-6">{t('tacticsSection')}</h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-green-50 p-4 rounded-lg border">
                      <div className="text-2xl font-bold text-green-600 mb-2">
                        {detailedResult.tacticalOverview?.foundTactics || 0}
                      </div>
                      <div className="text-sm text-gray-600">{t('tacticsConverted')}</div>
                    </div>

                    <div className="bg-red-50 p-4 rounded-lg border">
                      <div className="text-2xl font-bold text-red-600 mb-2">
                        {detailedResult.tacticalOverview?.missedTactics || 0}
                      </div>
                      <div className="text-sm text-gray-600">{t('tacticsMissed')}</div>
                    </div>

                    <div className="bg-blue-50 p-4 rounded-lg border">
                      <div className="text-2xl font-bold text-blue-600 mb-2">
                        {detailedResult.tacticalOverview?.totalOpportunities || 0}
                      </div>
                      <div className="text-sm text-gray-600">{t('totalTactics')}</div>
                    </div>
                  </div>

                  {detailedResult.tacticalOverview?.message && (
                    <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-700">
                      {detailedResult.tacticalOverview.message}
                    </div>
                  )}

                  {detailedResult.tacticalOpportunities && detailedResult.tacticalOpportunities.length > 0 && (
                    <div className="mt-6">
                      <h5 className="font-semibold text-gray-900 mb-3">{t('tacticsPattern')}</h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {detailedResult.tacticalOpportunities.map((opportunity, index) => (
                          <div key={index} className="p-4 bg-gray-50 rounded-lg border">
                            <div className="font-medium text-gray-800">{opportunity.pattern}</div>
                            <div className="text-sm text-gray-600 mt-1">
                              {t('tacticsPatternStats', { accuracy: opportunity.accuracy, found: opportunity.found, missed: opportunity.missed })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Training Recommendations */}
                {detailedResult.trainingRecommendations && (
                  <div className="bg-white rounded-xl shadow-lg p-6">
                    <h4 className="text-xl font-bold text-gray-900 mb-6">{t('trainingPlan')}</h4>
                    
                    <div className="space-y-4">
                      {detailedResult.trainingRecommendations.map((recommendation, index) => (
                        <div key={index} className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="font-semibold text-blue-900">{recommendation.title}</h5>
                            {recommendation.eloGain > 0 && (
                              <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                                {t('eloGain', { eloGain: recommendation.eloGain })}
                              </span>
                            )}
                          </div>
                          <p className="text-blue-800 text-sm">{recommendation.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Player Metadata */}
                {detailedResult.playerMetadata && (
                  <div className="bg-white rounded-xl shadow-lg p-6">
                    <h4 className="text-xl font-bold text-gray-900 mb-6">{t('playerInfo')}</h4>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {detailedResult.playerMetadata.country && (
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <div className="text-sm text-gray-600">{t('country')}</div>
                          <div className="font-medium">{detailedResult.playerMetadata.country}</div>
                        </div>
                      )}
                      
                      {detailedResult.playerMetadata.title && (
                        <div className="p-3 bg-yellow-50 rounded-lg">
                          <div className="text-sm text-gray-600">{t('playerTitle')}</div>
                          <div className="font-medium text-yellow-700">{detailedResult.playerMetadata.title}</div>
                        </div>
                      )}
                      
                      {detailedResult.playerMetadata.followers > 0 && (
                        <div className="p-3 bg-blue-50 rounded-lg">
                          <div className="text-sm text-gray-600">{t('followers')}</div>
                          <div className="font-medium">{detailedResult.playerMetadata.followers.toLocaleString()}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Share */}
                <ShareResultCard
                  username={detailedResult.username}
                  gameCount={detailedResult.totalGames}
                  averageAccuracy={detailedResult.averageAccuracy ?? 0}
                  averageCentipawnLoss={detailedResult.averageCentipawnLoss ?? 0}
                  totalBlunders={detailedResult.totalBlunders ?? 0}
                  playingStyle={detailedResult.styleProfile?.playingStyle ?? ''}
                  winrate={summary?.player?.record_all?.winrate}
                  shortLink={shortLink}
                  jobId={jobId}
                />
              </div>
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
