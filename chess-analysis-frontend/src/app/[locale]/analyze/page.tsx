'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Search, Globe, Trophy, TrendingUp, Clock, Target, Zap, Brain, BarChart3, BookOpen, ShieldCheck } from 'lucide-react';
import { sendGAEvent } from '@next/third-parties/google';
import { useTranslations } from 'next-intl';
import { useRouter as useIntlRouter } from '../../../i18n/navigation';
import { usePlayerSummary } from '../../../hooks/usePlayerSummary';
import { useAnalysis } from '../../../hooks/useAnalysis';
import { PlayerProfileCard } from '../../../components/PlayerProfileCard';
import { AnalysisResultErrorBoundary } from '../../../components/AnalysisResultErrorBoundary';

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

const STYLE_DIMENSIONS: { name: string; key: StyleNumericKey; icon: string }[] = [
  { name: '전술적 감각', key: 'tacticalRating',        icon: '♞' },
  { name: '포지셔널',    key: 'positionalRating',       icon: '♗' },
  { name: '엔드게임',   key: 'endgameRating',           icon: '♔' },
  { name: '시간 관리',  key: 'timeManagementRating',    icon: '♟' },
  { name: '공격성',     key: 'aggressionRating',        icon: '♛' },
  { name: '일관성',     key: 'consistency',             icon: '♖' },
  { name: '리스크 감수', key: 'riskTolerance',          icon: '♘' },
  { name: '교환 선호도', key: 'exchangePreference',     icon: '♜' },
  { name: '오프닝 다양성', key: 'openingVariety',       icon: '♙' },
  { name: '우세 변환력', key: 'leadConversion',         icon: '♕' },
  { name: '역전 저항력', key: 'swindleResistance',      icon: '♚' },
  { name: '블런더 경향', key: 'blunderTendency',        icon: '♟' },
];

/** Format seconds into a short Korean ETA string */
function formatEta(seconds: number): string {
  if (seconds < 60) return `약 ${seconds}초`;
  return `약 ${Math.round(seconds / 60)}분`;
}

export default function UnifiedAnalyzePage() {
  const t = useTranslations('Analyze');
  const tCommon = useTranslations('Common');
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
      setAnalysisError(error instanceof Error ? error.message : '상세 분석을 시작할 수 없습니다.');
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
          } else {
            const body = await response.text();
            setResultError(body || `결과를 가져오지 못했습니다. HTTP ${response.status}`);
          }
        } catch (error) {
          console.error('Failed to fetch detailed results:', error);
          setResultError(error instanceof Error ? error.message : '결과를 가져오지 못했습니다.');
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
          <div className="flex items-center justify-between gap-6 py-6">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600">
                <span className="text-base leading-none">♟</span>
                Chess intelligence
              </div>
              <h1 className="text-3xl font-bold text-gray-900">체스 플레이어 분석</h1>
              <p className="text-gray-600 mt-1">최근 게임을 읽고, 스타일과 약점을 빠르게 정리합니다</p>
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
              &ldquo;{searchForm.username}&rdquo; 플레이어를 찾을 수 없습니다
            </h2>
            <p className="text-sm text-zinc-400 mb-5">
              아이디를 다시 확인해주세요. 대소문자도 구분됩니다.
            </p>
            <button
              onClick={() => setSearchForm({ ...searchForm, username: '' })}
              className="px-5 py-2 rounded-lg bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-700 transition"
            >
              다시 검색
            </button>
          </div>
        )}

        {/* Generic error (non-404) */}
        {summaryError && !playerNotFound && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
            <div className="text-red-800 font-medium">플레이어 정보를 가져올 수 없습니다</div>
            <div className="text-red-700 text-sm mt-1">{summaryError}</div>
            <button
              onClick={refetch}
              className="mt-3 text-red-800 hover:text-red-900 underline"
            >
              다시 시도
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
                <h2 className="text-base font-black text-zinc-950">심층 Stockfish 분석</h2>
                <p className="text-xs text-zinc-500 mt-0.5">게임 수와 분석 모드를 선택하고 시작하세요</p>
              </div>

              {analysisError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {analysisError}
                </div>
              )}

              {/* Game count */}
              <div className="mb-5">
                <label className="text-xs font-black text-zinc-500 uppercase tracking-widest block mb-2">
                  게임 수
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
                        {n}게임
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mode */}
              <div className="mb-5">
                <label className="text-xs font-black text-zinc-500 uppercase tracking-widest block mb-2">
                  분석 모드
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
                          최대 {meta.maxGames}게임 · {meta.estimate}
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
                  시간 제어
                </label>
                <div className="flex gap-2 flex-wrap">
                  {(['all', 'rapid', 'blitz', 'bullet'] as const).map((tc) => {
                    const labels = { all: '전체', rapid: '래피드', blitz: '블리츠', bullet: '불릿' };
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
                {searchForm.n}게임 심층 분석 시작
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
                {searchForm.n}게임 · {modeMeta[searchForm.priority].label} 모드
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
                    <h3 className="text-xl font-bold text-zinc-950">분석이 중단되었습니다</h3>
                    <p className="text-sm text-zinc-500">대기열, 외부 Chess.com 응답, 엔진 작업 중 하나에서 실패했을 수 있습니다.</p>
                  </div>
                </div>
                <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-700">
                  {status.errorMessage || status.currentStep || '잠시 후 빠르게 모드로 다시 시도해주세요.'}
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
                    빠르게 모드로 다시 준비
                  </button>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-bold text-zinc-800 hover:bg-zinc-50"
                  >
                    상태 새로고침
                  </button>
                </div>
              </div>
            )}

            {/* Progress Indicator */}
            {!isDone && !isFailed && (
              <div className="bg-white rounded-xl shadow-lg p-6 chess-panel">
                <div className="flex items-center justify-between mb-4 gap-3">
                  <h3 className="text-xl font-bold text-gray-900">분석 진행 중...</h3>
                  <button
                    type="button"
                    onClick={cancelJob}
                    className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-bold text-zinc-600 hover:border-red-400 hover:text-red-600 transition-colors flex-shrink-0"
                  >
                    취소
                  </button>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">전체 진행률</span>
                  <span className="text-sm text-gray-600 tabular-nums">
                    {Math.round(status.progress || 0)}%
                    {isRunning && etaRemaining != null && (
                      <span className="ml-2 text-zinc-400">· {formatEta(etaRemaining)} 남음</span>
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
                    <span className="font-medium">현재 단계:</span> {status.currentStep}
                  </div>
                )}
                {isQueued && typeof status.queuePosition === 'number' && typeof status.queueSize === 'number' && (
                  <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                    대기열 {status.queuePosition}번째 · 총 {status.queueSize}개 대기 중입니다. 오래 걸리면 빠르게 모드와 5-10게임이 가장 안정적입니다.
                  </div>
                )}

                {/* Partial Results Indicators */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                  {[
                    { key: 'tactics', title: '전술 분석', ready: tacticsReady, icon: Target },
                    { key: 'swing', title: '승부 전환점', ready: swingMomentsReady, icon: TrendingUp },
                    { key: 'endgame', title: '엔드게임', ready: endgameReady, icon: Brain },
                    { key: 'time', title: '시간 관리', ready: timeMgmtReady, icon: Clock }
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
                      <h3 className="text-2xl font-bold">종합 분석 결과</h3>
                      <p className="text-blue-100">플레이어: {detailedResult.username} • 분석 게임: {detailedResult.totalGames}개</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-lg chess-panel">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-950 text-white">
                      <Target className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-lg font-black text-zinc-950">오늘 바로 볼 복기 순서</h4>
                      <p className="text-sm text-zinc-500">사용자가 실제로 고칠 가능성이 높은 순서로 압축했습니다</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                      <div className="text-xs font-black text-zinc-500">1순위</div>
                      <div className="mt-1 text-base font-black text-zinc-950">결정적 순간 {detailedResult.decisiveMoments?.length || 0}개</div>
                      <p className="mt-2 text-sm leading-6 text-zinc-600">
                        승패가 크게 흔들린 수부터 보면 복기 시간이 가장 효율적입니다.
                      </p>
                    </div>
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                      <div className="text-xs font-black text-zinc-500">2순위</div>
                      <div className="mt-1 text-base font-black text-zinc-950">
                        {detailedResult.advancedInsights?.openingHoles?.[0]?.name || '반복 오프닝 확인'}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-zinc-600">
                        자주 두면서 점수율이나 CPL이 나쁜 레퍼토리를 먼저 손보세요.
                      </p>
                    </div>
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                      <div className="text-xs font-black text-zinc-500">3순위</div>
                      <div className="mt-1 text-base font-black text-zinc-950">
                        {detailedResult.trainingRecommendations?.[0]?.title || '맞춤 훈련'}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-zinc-600">
                        한 번에 많이 고치기보다 이번 주 하나만 반복하는 쪽이 점수에 잘 남습니다.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Performance Metrics Dashboard */}
                <div className="bg-white rounded-xl shadow-lg p-6 chess-panel">
                  <h4 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    성과 지표
                  </h4>
                  
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
                    <div className="text-center p-4 bg-blue-50 rounded-lg border">
                      <div className="text-2xl font-bold text-blue-600">
                        ♕ {detailedResult.averageAccuracy?.toFixed(1) || '0.0'}%
                      </div>
                      <div className="text-xs text-gray-600">평균 정확도</div>
                    </div>
                    
                    <div className="text-center p-4 bg-green-50 rounded-lg border">
                      <div className="text-2xl font-bold text-green-600">
                        ♙ {detailedResult.averageCentipawnLoss?.toFixed(1) || '0.0'}
                      </div>
                      <div className="text-xs text-gray-600">평균 CPL</div>
                    </div>
                    
                    <div className="text-center p-4 bg-yellow-50 rounded-lg border">
                      <div className="text-2xl font-bold text-yellow-600">
                        ♞ {detailedResult.tacticalOverview?.tacticalAccuracy || '0.0%'}
                      </div>
                      <div className="text-xs text-gray-600">전술 정확도</div>
                    </div>
                    
                    <div className="text-center p-4 bg-red-50 rounded-lg border">
                      <div className="text-2xl font-bold text-red-600">
                        {detailedResult.totalBlunders || 0}
                      </div>
                      <div className="text-xs text-gray-600">블런더</div>
                    </div>

                    <div className="text-center p-4 bg-orange-50 rounded-lg border">
                      <div className="text-2xl font-bold text-orange-600">
                        {detailedResult.totalMistakes || 0}
                      </div>
                      <div className="text-xs text-gray-600">실수</div>
                    </div>

                    <div className="text-center p-4 bg-purple-50 rounded-lg border">
                      <div className="text-2xl font-bold text-purple-600">
                        {detailedResult.totalInaccuracies || 0}
                      </div>
                      <div className="text-xs text-gray-600">부정확</div>
                    </div>
                  </div>

                  {detailedResult.comparativeInsights && (
                    <div className="mb-6 rounded-xl border border-zinc-300 bg-zinc-950 p-5 text-white shadow-sm dark-surface">
                      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white px-3 py-1 text-xs font-bold text-zinc-950">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            같은 레이팅대 비교
                          </div>
                          <h5 className="text-2xl font-black text-white">내 플레이는 어느 정도인가?</h5>
                          <p className="mt-3 max-w-3xl text-base font-medium leading-7 text-zinc-100">
                            {detailedResult.comparativeInsights.narrative}
                          </p>
                        </div>
                        <div className="rounded-lg border border-white/20 bg-white px-4 py-3 text-sm text-zinc-950">
                          <div className="text-zinc-500">레이팅 밴드</div>
                          <div className="text-lg font-black">{detailedResult.comparativeInsights.ratingBand || '분석 중'}</div>
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
                            닮은 체스 거장
                          </div>
                          <div className="text-2xl font-black">{detailedResult.comparativeInsights.gmMatch?.name || '분석 중'}</div>
                          <div className="mt-1 text-sm font-semibold text-zinc-700">
                            {detailedResult.comparativeInsights.gmMatch?.styleLabel} · 유사도 {detailedResult.comparativeInsights.gmMatch?.similarity || 0}%
                          </div>
                          <p className="mt-3 text-sm font-medium leading-6 text-zinc-700">
                            {detailedResult.comparativeInsights.gmMatch?.reason}
                          </p>
                        </div>

                        <div className="rounded-lg border border-white/15 bg-white p-4 text-zinc-950">
                          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-zinc-700">
                            <Target className="h-4 w-4" />
                            다음 학습 포인트
                          </div>
                          <p className="mb-3 text-sm font-medium leading-6 text-zinc-700">
                            {detailedResult.learningInsights?.headline || '결정적 순간과 반복되는 실수부터 복기해보세요.'}
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
                          표본 신뢰도 {detailedResult.comparativeInsights.sampleReliability.label}: {detailedResult.comparativeInsights.sampleReliability.message}
                        </div>
                      )}
                    </div>
                  )}

                  {detailedResult.advancedInsights && (
                    <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4">
                      <div className="mb-4 flex items-center gap-2">
                        <Brain className="h-5 w-5 text-zinc-800" />
                        <h5 className="font-semibold text-gray-900">분석 스토리와 신뢰도</h5>
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
                              <div className="mt-1 text-xs text-zinc-600">예상 범위 {band.range}</div>
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
                        <h5 className="font-semibold">상대로 만났을 때 공략법</h5>
                      </div>
                      <p className="mb-4 text-sm font-medium leading-6 text-zinc-200">
                        {detailedResult.opponentExploitPlan.headline}
                        {detailedResult.opponentExploitPlan.confidence && (
                          <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs font-bold text-zinc-950">
                            신뢰도 {detailedResult.opponentExploitPlan.confidence}
                          </span>
                        )}
                      </p>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <div className="mb-2 text-xs font-black uppercase tracking-wide text-zinc-400">약점 후보</div>
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
                          <div className="mb-2 text-xs font-black uppercase tracking-wide text-zinc-400">추천 전략</div>
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
                        <h5 className="font-semibold text-gray-900">고급 패턴</h5>
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        {detailedResult.advancedInsights.criticalMoveStats && (
                          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                            <div className="text-xs font-bold text-zinc-500">Critical Move Accuracy</div>
                            <div className="mt-1 text-xl font-black text-zinc-950">
                              {detailedResult.advancedInsights.criticalMoveStats.sample
                                ? `${detailedResult.advancedInsights.criticalMoveStats.accuracy?.toFixed(1)}%`
                                : '표본 부족'}
                            </div>
                            <div className="mt-1 text-xs text-zinc-600">
                              표본 {detailedResult.advancedInsights.criticalMoveStats.sample || 0}개 · {detailedResult.advancedInsights.criticalMoveStats.label}
                            </div>
                          </div>
                        )}

                        {detailedResult.advancedInsights.complexityPreference && (
                          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                            <div className="text-xs font-bold text-zinc-500">복잡도 대응</div>
                            <div className="mt-1 text-xl font-black text-zinc-950">{detailedResult.advancedInsights.complexityPreference.label}</div>
                            <div className="mt-1 text-xs text-zinc-600">{detailedResult.advancedInsights.complexityPreference.value}</div>
                          </div>
                        )}

                        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                          <div className="text-xs font-bold text-zinc-500">시간대 패턴</div>
                          <div className="mt-1 text-sm font-semibold leading-5 text-zinc-700">
                            {detailedResult.advancedInsights.timePatterns?.message || '시간대 표본 수집 중'}
                          </div>
                        </div>
                      </div>

                      {(detailedResult.advancedInsights.openingHoles || []).length > 0 && (
                        <div className="mt-4">
                          <div className="mb-2 text-sm font-bold text-zinc-800">오프닝 hole 후보</div>
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            {(detailedResult.advancedInsights.openingHoles || []).map((opening) => (
                              <div key={`${opening.sideLabel}-${opening.name}`} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 text-sm font-bold text-zinc-950">{opening.sideLabel} · {opening.name}</div>
                                  <div className="shrink-0 text-xs font-bold text-zinc-500">{opening.reason}</div>
                                </div>
                                <div className="mt-1 text-xs text-zinc-600">
                                  {opening.count}판 · 점수율 {opening.scoreRate?.toFixed(1) || '0.0'}% · CPL {opening.averageCpl?.toFixed(1) || '0.0'}
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
                        <h5 className="font-semibold text-gray-900">승부를 흔든 결정적 순간</h5>
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {detailedResult.decisiveMoments.slice(0, 4).map((moment) => (
                          <div
                            key={`${moment.gameIndex}-${moment.moveNumber}-${moment.move}`}
                            className="rounded-lg border border-zinc-200 bg-zinc-50 p-4"
                          >
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <div className="text-sm font-bold text-zinc-950">
                                {moment.gameIndex + 1}번째 게임 · {moment.moveNumber}수 {moment.sideLabel}
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
                                  대신 {moment.bestMove}
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
                        <h5 className="font-semibold text-gray-900">주요 오프닝 레퍼토리</h5>
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {[
                          { title: '백으로 시작한 게임', total: detailedResult.openingStats.whiteTotal, rows: detailedResult.openingStats.white },
                          { title: '흑으로 시작한 게임', total: detailedResult.openingStats.blackTotal, rows: detailedResult.openingStats.black },
                        ].map((section) => (
                          <div key={section.title} className="rounded-lg border bg-white p-4">
                            <div className="mb-3 flex items-baseline justify-between">
                              <div className="text-sm font-semibold text-gray-800">{section.title}</div>
                              <div className="text-xs text-gray-500">총 {section.total}판</div>
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
                                        {opening.count}판 · {opening.percentage.toFixed(1)}%
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                                      {typeof opening.scoreRate === 'number' && <span>점수율 {opening.scoreRate.toFixed(1)}%</span>}
                                      {typeof opening.averageCpl === 'number' && opening.averageCpl > 0 && <span>평균 CPL {opening.averageCpl.toFixed(1)}</span>}
                                      {typeof opening.firstIssueMove === 'number' && <span>첫 흔들림 {opening.firstIssueMove.toFixed(1)}수 전후</span>}
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
                              <div className="text-sm text-gray-500">해당 색으로 분석된 게임이 없습니다.</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Performance Analysis */}
                  <div className="space-y-4">
                    <div className="p-4 bg-blue-50 border-l-4 border-blue-400 rounded-lg">
                      <div className="font-medium text-blue-900 mb-1">♕ 정확도 분석</div>
                      <p className="text-sm text-blue-800">{detailedResult.explanations?.accuracyExplanation}</p>
                    </div>
                    
                    <div className="p-4 bg-green-50 border-l-4 border-green-400 rounded-lg">
                      <div className="font-medium text-green-900 mb-1">♙ 센티폰 손실 분석</div>
                      <p className="text-sm text-green-800">{detailedResult.explanations?.acplExplanation}</p>
                    </div>
                    
                    <div className="p-4 bg-orange-50 border-l-4 border-orange-400 rounded-lg">
                      <div className="font-medium text-orange-900 mb-1">♟ 실수 패턴 분석</div>
                      <p className="text-sm text-orange-800">{detailedResult.explanations?.errorAnalysis}</p>
                    </div>
                  </div>
                </div>

                {/* Comprehensive Style Profile */}
                <div className="bg-white rounded-xl shadow-lg p-6 chess-panel">
                  <h4 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                    <Brain className="h-5 w-5" />
                    12차원 스타일 프로파일링
                  </h4>
                  
                  {/* Main Playing Style */}
                  <div className="bg-gradient-to-r from-purple-100 to-pink-100 p-6 rounded-lg mb-6 border chess-style-summary">
                    <div className="text-center">
                      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-black text-2xl text-white">♚</div>
                      <h5 className="text-lg font-bold text-purple-800 mb-2">주요 플레이 스타일</h5>
                      <div className="text-2xl font-bold text-purple-900">
                        {detailedResult.styleProfile?.playingStyle || '분석 중'}
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
                          <div className="text-xs text-gray-600 leading-tight">{dimension.name}</div>
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
                      <h5 className="font-semibold text-gray-900 mb-3">📝 차원별 상세 분석</h5>
                      
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
                  <h4 className="text-xl font-bold text-gray-900 mb-6">♞ 전술 분석</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-green-50 p-4 rounded-lg border">
                      <div className="text-2xl font-bold text-green-600 mb-2">
                        {detailedResult.tacticalOverview?.foundTactics || 0}
                      </div>
                      <div className="text-sm text-gray-600">전술 기회 활용</div>
                    </div>
                    
                    <div className="bg-red-50 p-4 rounded-lg border">
                      <div className="text-2xl font-bold text-red-600 mb-2">
                        {detailedResult.tacticalOverview?.missedTactics || 0}
                      </div>
                      <div className="text-sm text-gray-600">전술 기회 놓침</div>
                    </div>
                    
                    <div className="bg-blue-50 p-4 rounded-lg border">
                      <div className="text-2xl font-bold text-blue-600 mb-2">
                        {detailedResult.tacticalOverview?.totalOpportunities || 0}
                      </div>
                      <div className="text-sm text-gray-600">총 전술 기회</div>
                    </div>
                  </div>

                  {detailedResult.tacticalOverview?.message && (
                    <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-700">
                      {detailedResult.tacticalOverview.message}
                    </div>
                  )}

                  {detailedResult.tacticalOpportunities && detailedResult.tacticalOpportunities.length > 0 && (
                    <div className="mt-6">
                      <h5 className="font-semibold text-gray-900 mb-3">전술 패턴 분석</h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {detailedResult.tacticalOpportunities.map((opportunity, index) => (
                          <div key={index} className="p-4 bg-gray-50 rounded-lg border">
                            <div className="font-medium text-gray-800">{opportunity.pattern}</div>
                            <div className="text-sm text-gray-600 mt-1">
                              정확도: {opportunity.accuracy} | 찾음: {opportunity.found} | 놓침: {opportunity.missed}
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
                    <h4 className="text-xl font-bold text-gray-900 mb-6">♙ 맞춤형 훈련 계획</h4>
                    
                    <div className="space-y-4">
                      {detailedResult.trainingRecommendations.map((recommendation, index) => (
                        <div key={index} className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="font-semibold text-blue-900">{recommendation.title}</h5>
                            {recommendation.eloGain > 0 && (
                              <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                                +{recommendation.eloGain} Elo 예상
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
                    <h4 className="text-xl font-bold text-gray-900 mb-6">♔ 플레이어 정보</h4>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {detailedResult.playerMetadata.country && (
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <div className="text-sm text-gray-600">국가</div>
                          <div className="font-medium">{detailedResult.playerMetadata.country}</div>
                        </div>
                      )}
                      
                      {detailedResult.playerMetadata.title && (
                        <div className="p-3 bg-yellow-50 rounded-lg">
                          <div className="text-sm text-gray-600">타이틀</div>
                          <div className="font-medium text-yellow-700">{detailedResult.playerMetadata.title}</div>
                        </div>
                      )}
                      
                      {detailedResult.playerMetadata.followers > 0 && (
                        <div className="p-3 bg-blue-50 rounded-lg">
                          <div className="text-sm text-gray-600">팔로워</div>
                          <div className="font-medium">{detailedResult.playerMetadata.followers.toLocaleString()}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="text-center space-y-4">
                  <button
                    onClick={() => window.location.href = `/analysis/${detailedResult.analysisId}`}
                    className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-8 py-3 rounded-lg font-medium text-lg shadow-lg"
                  >
                    📋 전체 상세 보고서 보기
                  </button>
                  
                  <div className="text-sm text-gray-500">
                    분석 ID: {detailedResult.analysisId}
                  </div>
                </div>
              </div>
              </AnalysisResultErrorBoundary>
            )}
            {isDone && !detailedResult && resultError && (
              <div className="rounded-xl border border-zinc-300 bg-white p-6 shadow-lg chess-panel">
                <h3 className="text-xl font-bold text-zinc-950">분석은 완료됐지만 결과를 불러오지 못했습니다</h3>
                <p className="mt-2 text-sm text-zinc-600">{resultError}</p>
                <button
                  type="button"
                  onClick={() => jobId && fetch(`/api/v1/analysis/${jobId}/result`).then(async (response) => {
                    if (!response.ok) throw new Error(await response.text());
                    setDetailedResult(await response.json());
                    setResultError(null);
                  }).catch((error) => setResultError(error instanceof Error ? error.message : '결과를 다시 가져오지 못했습니다.'))}
                  className="mt-4 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-800"
                >
                  결과 다시 불러오기
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
