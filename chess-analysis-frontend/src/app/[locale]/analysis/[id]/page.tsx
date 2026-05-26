'use client';

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Target, BarChart3, Brain, Zap, TrendingUp,
  BookOpen, ShieldCheck, Trophy, Globe,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from '../../../../i18n/navigation';
import { useParams } from 'next/navigation';
import { ShareResultCard } from '@/components/ShareResultCard';
import { AnalysisResultErrorBoundary } from '@/components/AnalysisResultErrorBoundary';

// ── Types (mirrors analyze/page.tsx) ─────────────────────────────────────────

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

  styleProfile?: {
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

// ── Static constants ──────────────────────────────────────────────────────────

type StyleNumericKey =
  | 'tacticalRating' | 'positionalRating' | 'endgameRating'
  | 'timeManagementRating' | 'aggressionRating' | 'consistency'
  | 'riskTolerance' | 'exchangePreference' | 'openingVariety'
  | 'leadConversion' | 'swindleResistance' | 'blunderTendency';

const STYLE_DIMENSIONS: { i18nKey: string; key: StyleNumericKey; icon: string }[] = [
  { i18nKey: 'dimTactical',          key: 'tacticalRating',       icon: '♞' },
  { i18nKey: 'dimPositional',        key: 'positionalRating',     icon: '♗' },
  { i18nKey: 'dimEndgame',           key: 'endgameRating',        icon: '♔' },
  { i18nKey: 'dimTimeManagement',    key: 'timeManagementRating', icon: '♟' },
  { i18nKey: 'dimAggression',        key: 'aggressionRating',     icon: '♛' },
  { i18nKey: 'dimConsistency',       key: 'consistency',          icon: '♖' },
  { i18nKey: 'dimRisk',              key: 'riskTolerance',        icon: '♘' },
  { i18nKey: 'dimExchange',          key: 'exchangePreference',   icon: '♜' },
  { i18nKey: 'dimOpeningVariety',    key: 'openingVariety',       icon: '♙' },
  { i18nKey: 'dimLeadConversion',    key: 'leadConversion',       icon: '♕' },
  { i18nKey: 'dimSwindleResistance', key: 'swindleResistance',    icon: '♚' },
  { i18nKey: 'dimBlunderTendency',   key: 'blunderTendency',      icon: '♟' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function AnalysisResultPage() {
  const t = useTranslations('Analyze');
  const tCommon = useTranslations('Common');
  const params = useParams();
  const router = useRouter();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const analysisId = params.id as string;

  useEffect(() => {
    if (!analysisId) return;

    const load = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/v1/analysis/${analysisId}/result`);
        if (!response.ok) {
          const body = await response.text();
          throw new Error(body || '분석 결과를 불러올 수 없습니다.');
        }
        setResult(await response.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : '분석 결과를 불러올 수 없습니다.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [analysisId]);

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

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="chess-toss min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-zinc-200 border-t-zinc-950 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-zinc-500">분석 결과 불러오는 중…</p>
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
          <h1 className="text-xl font-bold text-zinc-900 mb-2">분석 결과를 찾을 수 없습니다</h1>
          <p className="text-zinc-500 mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="bg-zinc-950 text-white px-5 py-2.5 rounded-lg hover:bg-zinc-800 font-bold text-sm"
          >
            홈으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const comparisonMetrics = result.comparativeInsights?.performancePercentiles
    ? [
        result.comparativeInsights.performancePercentiles.accuracy,
        result.comparativeInsights.performancePercentiles.centipawnLoss,
        result.comparativeInsights.performancePercentiles.tactical,
        result.comparativeInsights.performancePercentiles.consistency,
      ].filter((m): m is PercentileMetric => Boolean(m))
    : [];

  const learningCards = result.learningInsights?.cards || [];

  // ── Render ───────────────────────────────────────────────────────────────────

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
              홈으로
            </button>
          </div>
          <div className="flex items-center justify-between gap-6 py-4">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600">
                <span className="text-base leading-none">♟</span>
                Chess intelligence
              </div>
              <h1 className="text-3xl font-bold text-gray-900">
                {result.username}의 분석 결과
              </h1>
              <p className="text-gray-600 mt-1">
                {result.totalGames}게임 · {result.platform}
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
          <div className="space-y-8">

            {/* Executive Summary */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl shadow-lg p-6 chess-result-hero">
              <div className="flex items-center mb-4">
                <div className="mr-3 flex h-12 w-12 items-center justify-center rounded-lg bg-white text-2xl text-black">♔</div>
                <div>
                  <h3 className="text-2xl font-bold">{t('comprehensiveResult')}</h3>
                  <p className="text-blue-100">{t('resultSummary', { username: result.username, count: result.totalGames })}</p>
                </div>
              </div>
            </div>

            {/* Review Order */}
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
                  <div className="mt-1 text-base font-black text-zinc-950">{t('decisiveMoments', { count: result.decisiveMoments?.length || 0 })}</div>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">{t('decisiveMomentsDesc')}</p>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-xs font-black text-zinc-500">{t('priority2')}</div>
                  <div className="mt-1 text-base font-black text-zinc-950">
                    {result.advancedInsights?.openingHoles?.[0]?.name || t('checkOpenings')}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">{t('checkOpeningsDesc')}</p>
                </div>
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-xs font-black text-zinc-500">{t('priority3')}</div>
                  <div className="mt-1 text-base font-black text-zinc-950">
                    {result.trainingRecommendations?.[0]?.title || t('customTraining')}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">{t('customTrainingDesc')}</p>
                </div>
              </div>
            </div>

            {/* Performance Metrics */}
            <div className="bg-white rounded-xl shadow-lg p-6 chess-panel">
              <h4 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                {t('performanceMetrics')}
              </h4>

              <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
                <div className="text-center p-4 bg-blue-50 rounded-lg border">
                  <div className="text-2xl font-bold text-blue-600">
                    ♕ {result.averageAccuracy?.toFixed(1) || '0.0'}%
                  </div>
                  <div className="text-xs text-gray-600">{t('avgAccuracy')}</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg border">
                  <div className="text-2xl font-bold text-green-600">
                    ♙ {result.averageCentipawnLoss?.toFixed(1) || '0.0'}
                  </div>
                  <div className="text-xs text-gray-600">{t('avgCpl')}</div>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-lg border">
                  <div className="text-2xl font-bold text-yellow-600">
                    ♞ {result.tacticalOverview?.tacticalAccuracy || '0.0%'}
                  </div>
                  <div className="text-xs text-gray-600">{t('tacticalAccuracy')}</div>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg border">
                  <div className="text-2xl font-bold text-red-600">{result.totalBlunders || 0}</div>
                  <div className="text-xs text-gray-600">{t('blunders')}</div>
                </div>
                <div className="text-center p-4 bg-orange-50 rounded-lg border">
                  <div className="text-2xl font-bold text-orange-600">{result.totalMistakes || 0}</div>
                  <div className="text-xs text-gray-600">{t('mistakes')}</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg border">
                  <div className="text-2xl font-bold text-purple-600">{result.totalInaccuracies || 0}</div>
                  <div className="text-xs text-gray-600">{t('inaccuracies')}</div>
                </div>
              </div>

              {/* Comparative Insights */}
              {result.comparativeInsights && (
                <div className="mb-6 rounded-xl border border-zinc-300 bg-zinc-950 p-5 text-white shadow-sm dark-surface">
                  <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white px-3 py-1 text-xs font-bold text-zinc-950">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {t('cohortComparison')}
                      </div>
                      <h5 className="text-2xl font-black text-white">{t('cohortQuestion')}</h5>
                      <p className="mt-3 max-w-3xl text-base font-medium leading-7 text-zinc-100">
                        {result.comparativeInsights.narrative}
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/20 bg-white px-4 py-3 text-sm text-zinc-950">
                      <div className="text-zinc-500">{t('ratingBand')}</div>
                      <div className="text-lg font-black">{result.comparativeInsights.ratingBand || t('analyzing')}</div>
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
                      <div className="text-2xl font-black">{result.comparativeInsights.gmMatch?.name || t('analyzing')}</div>
                      <div className="mt-1 text-sm font-semibold text-zinc-700">
                        {result.comparativeInsights.gmMatch?.styleLabel} · {t('gmSimilarity', { similarity: result.comparativeInsights.gmMatch?.similarity || 0 })}
                      </div>
                      <p className="mt-3 text-sm font-medium leading-6 text-zinc-700">
                        {result.comparativeInsights.gmMatch?.reason}
                      </p>
                    </div>

                    <div className="rounded-lg border border-white/15 bg-white p-4 text-zinc-950">
                      <div className="mb-2 flex items-center gap-2 text-sm font-bold text-zinc-700">
                        <Target className="h-4 w-4" />
                        {t('nextLearning')}
                      </div>
                      <p className="mb-3 text-sm font-medium leading-6 text-zinc-700">
                        {result.learningInsights?.headline || t('nextLearningDesc')}
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

                  {result.comparativeInsights.sampleReliability && (
                    <div className="mt-4 rounded-lg border border-white/20 bg-white px-4 py-3 text-sm font-semibold text-zinc-800">
                      {t('sampleReliability', {
                        label: result.comparativeInsights.sampleReliability.label,
                        message: result.comparativeInsights.sampleReliability.message,
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Advanced Insights: Story + Style Axes */}
              {result.advancedInsights && (
                <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <Brain className="h-5 w-5 text-zinc-800" />
                    <h5 className="font-semibold text-gray-900">{t('analysisStory')}</h5>
                  </div>

                  {result.advancedInsights.story && (
                    <p className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium leading-6 text-zinc-700">
                      {result.advancedInsights.story}
                    </p>
                  )}

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    {(result.advancedInsights.styleAxes || []).map((axis) => (
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

                  {(result.advancedInsights.confidenceBands || []).length > 0 && (
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                      {(result.advancedInsights.confidenceBands || []).map((band) => (
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

              {/* Opponent Exploit Plan */}
              {result.opponentExploitPlan && (
                <div className="mb-6 rounded-lg border border-zinc-950 bg-zinc-950 p-4 text-white dark-surface">
                  <div className="mb-2 flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5" />
                    <h5 className="font-semibold">{t('opponentPlanTitle')}</h5>
                  </div>
                  <p className="mb-4 text-sm font-medium leading-6 text-zinc-200">
                    {result.opponentExploitPlan.headline}
                    {result.opponentExploitPlan.confidence && (
                      <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-xs font-bold text-zinc-950">
                        {t('confidence', { confidence: result.opponentExploitPlan.confidence })}
                      </span>
                    )}
                  </p>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <div className="mb-2 text-xs font-black uppercase tracking-wide text-zinc-400">{t('weaknessCandidates')}</div>
                      <div className="space-y-2">
                        {(result.opponentExploitPlan.weaknesses || []).map((item) => (
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
                        {(result.opponentExploitPlan.recommendations || []).map((item) => (
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

                  {result.opponentExploitPlan.disclaimer && (
                    <div className="mt-4 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs leading-5 text-zinc-300">
                      {result.opponentExploitPlan.disclaimer}
                    </div>
                  )}
                </div>
              )}

              {/* Advanced Patterns */}
              {result.advancedInsights && (
                <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-zinc-800" />
                    <h5 className="font-semibold text-gray-900">{t('advancedPatterns')}</h5>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {result.advancedInsights.criticalMoveStats && (
                      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                        <div className="text-xs font-bold text-zinc-500">Critical Move Accuracy</div>
                        <div className="mt-1 text-xl font-black text-zinc-950">
                          {result.advancedInsights.criticalMoveStats.sample
                            ? `${result.advancedInsights.criticalMoveStats.accuracy?.toFixed(1)}%`
                            : t('sampleInsufficient')}
                        </div>
                        <div className="mt-1 text-xs text-zinc-600">
                          {t('criticalMoveSampleLabel', {
                            sample: result.advancedInsights.criticalMoveStats.sample || 0,
                            label: result.advancedInsights.criticalMoveStats.label ?? '',
                          })}
                        </div>
                      </div>
                    )}

                    {result.advancedInsights.complexityPreference && (
                      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                        <div className="text-xs font-bold text-zinc-500">{t('complexityResponse')}</div>
                        <div className="mt-1 text-xl font-black text-zinc-950">{result.advancedInsights.complexityPreference.label}</div>
                        <div className="mt-1 text-xs text-zinc-600">{result.advancedInsights.complexityPreference.value}</div>
                      </div>
                    )}

                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                      <div className="text-xs font-bold text-zinc-500">{t('timePattern')}</div>
                      <div className="mt-1 text-sm font-semibold leading-5 text-zinc-700">
                        {result.advancedInsights.timePatterns?.message || t('timePatternCollecting')}
                      </div>
                    </div>
                  </div>

                  {(result.advancedInsights.openingHoles || []).length > 0 && (
                    <div className="mt-4">
                      <div className="mb-2 text-sm font-bold text-zinc-800">{t('openingHoles')}</div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        {(result.advancedInsights.openingHoles || []).map((opening) => (
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

              {/* Decisive Moments */}
              {result.decisiveMoments && result.decisiveMoments.length > 0 && (
                <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-zinc-800" />
                    <h5 className="font-semibold text-gray-900">{t('decisiveMomentsSection')}</h5>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {result.decisiveMoments.slice(0, 4).map((moment) => (
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
              {result.openingStats && (
                <div className="mb-6 rounded-lg border bg-slate-50 p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <BookOpen className="h-5 w-5 text-slate-700" />
                    <h5 className="font-semibold text-gray-900">{t('openingRepertoire')}</h5>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {[
                      { title: t('whiteGames'), total: result.openingStats.whiteTotal, rows: result.openingStats.white },
                      { title: t('blackGames'), total: result.openingStats.blackTotal, rows: result.openingStats.black },
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

              {/* Performance Analysis (explanations) */}
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 border-l-4 border-blue-400 rounded-lg">
                  <div className="font-medium text-blue-900 mb-1">{t('accuracySection')}</div>
                  <p className="text-sm text-blue-800">{result.explanations?.accuracyExplanation}</p>
                </div>
                <div className="p-4 bg-green-50 border-l-4 border-green-400 rounded-lg">
                  <div className="font-medium text-green-900 mb-1">{t('acplSection')}</div>
                  <p className="text-sm text-green-800">{result.explanations?.acplExplanation}</p>
                </div>
                <div className="p-4 bg-orange-50 border-l-4 border-orange-400 rounded-lg">
                  <div className="font-medium text-orange-900 mb-1">{t('mistakeSection')}</div>
                  <p className="text-sm text-orange-800">{result.explanations?.errorAnalysis}</p>
                </div>
              </div>
            </div>

            {/* Style Profile */}
            <div className="bg-white rounded-xl shadow-lg p-6 chess-panel">
              <h4 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <Brain className="h-5 w-5" />
                {t('styleProfile')}
              </h4>

              <div className="bg-gradient-to-r from-purple-100 to-pink-100 p-6 rounded-lg mb-6 border chess-style-summary">
                <div className="text-center">
                  <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-black text-2xl text-white">♚</div>
                  <h5 className="text-lg font-bold text-purple-800 mb-2">{t('mainStyle')}</h5>
                  <div className="text-2xl font-bold text-purple-900">
                    {result.styleProfile?.playingStyle || t('analyzing')}
                  </div>
                  {result.styleProfile?.dimensionExplanations?.overallStyleAnalysis && (
                    <p className="mx-auto mt-3 max-w-3xl text-sm leading-relaxed text-purple-800">
                      {getBriefStyleAnalysis(result.styleProfile.dimensionExplanations.overallStyleAnalysis)}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {STYLE_DIMENSIONS.map((dimension) => {
                  const score = result.styleProfile?.[dimension.key] ?? 0;
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

              {result.styleProfile?.dimensionExplanations && (
                <div className="mt-6 space-y-3">
                  <h5 className="font-semibold text-gray-900 mb-3">📝 {t('dimensionDetail')}</h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(Object.entries(result.styleProfile.dimensionExplanations) as [string, string | undefined][])
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
                    {result.tacticalOverview?.foundTactics || 0}
                  </div>
                  <div className="text-sm text-gray-600">{t('tacticsConverted')}</div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg border">
                  <div className="text-2xl font-bold text-red-600 mb-2">
                    {result.tacticalOverview?.missedTactics || 0}
                  </div>
                  <div className="text-sm text-gray-600">{t('tacticsMissed')}</div>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg border">
                  <div className="text-2xl font-bold text-blue-600 mb-2">
                    {result.tacticalOverview?.totalOpportunities || 0}
                  </div>
                  <div className="text-sm text-gray-600">{t('totalTactics')}</div>
                </div>
              </div>

              {result.tacticalOverview?.message && (
                <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-700">
                  {result.tacticalOverview.message}
                </div>
              )}

              {result.tacticalOpportunities && result.tacticalOpportunities.length > 0 && (
                <div className="mt-6">
                  <h5 className="font-semibold text-gray-900 mb-3">{t('tacticsPattern')}</h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {result.tacticalOpportunities.map((opportunity, index) => (
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
            {result.trainingRecommendations && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h4 className="text-xl font-bold text-gray-900 mb-6">{t('trainingPlan')}</h4>
                <div className="space-y-4">
                  {result.trainingRecommendations.map((recommendation, index) => (
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
            {result.playerMetadata && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h4 className="text-xl font-bold text-gray-900 mb-6">{t('playerInfo')}</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {result.playerMetadata.country && (
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-sm text-gray-600">{t('country')}</div>
                      <div className="font-medium flex items-center gap-1">
                        <Globe className="h-3.5 w-3.5" />
                        {result.playerMetadata.country}
                      </div>
                    </div>
                  )}
                  {result.playerMetadata.title && (
                    <div className="p-3 bg-yellow-50 rounded-lg">
                      <div className="text-sm text-gray-600">{t('playerTitle')}</div>
                      <div className="font-medium text-yellow-700">{result.playerMetadata.title}</div>
                    </div>
                  )}
                  {result.playerMetadata.followers > 0 && (
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <div className="text-sm text-gray-600">{t('followers')}</div>
                      <div className="font-medium">{result.playerMetadata.followers.toLocaleString()}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Share */}
            <ShareResultCard
              username={result.username}
              gameCount={result.totalGames}
              averageAccuracy={result.averageAccuracy ?? 0}
              averageCentipawnLoss={result.averageCentipawnLoss ?? 0}
              totalBlunders={result.totalBlunders ?? 0}
              playingStyle={result.styleProfile?.playingStyle ?? ''}
              winrate={undefined}
              shortLink={null}
              jobId={analysisId}
            />

          </div>
        </AnalysisResultErrorBoundary>
      </div>
    </div>
  );
}
