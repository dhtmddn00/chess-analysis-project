'use client';

import React from 'react';
import {
  Target, BarChart3, Brain, Zap, TrendingUp,
  BookOpen, ShieldCheck, Trophy,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AnalysisResult, PercentileMetric, STYLE_DIMENSIONS } from '@/types/analysis';
import { ShareResultCard } from '@/components/ShareResultCard';
import { StyleArchetypeCard } from '@/components/StyleArchetypeCard';

// ── Props ─────────────────────────────────────────────────────────────────────

interface AnalysisResultViewProps {
  result: AnalysisResult;
  /** winrate from player profile (only available on /analyze, optional) */
  winrate?: number;
  /** Short link from analysis creation (only available on /analyze, optional) */
  shortLink?: string | null;
  /** Analysis job / result ID — used to build the share URL */
  jobId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRatingColor(rating: number) {
  if (rating >= 80) return 'text-zinc-950 font-black';
  if (rating >= 60) return 'text-zinc-700 font-bold';
  if (rating >= 40) return 'text-zinc-500 font-semibold';
  return 'text-zinc-400 font-semibold';
}

function getBriefStyleAnalysis(analysis?: string) {
  if (!analysis) return '';
  const sentences = analysis.match(/[^.!?。]+[.!?。]/g);
  if (!sentences || sentences.length === 0) return analysis;
  return sentences.slice(0, 2).join(' ').trim();
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AnalysisResultView({ result, winrate, shortLink, jobId }: AnalysisResultViewProps) {
  const t = useTranslations('Analyze');

  const comparisonMetrics = result.comparativeInsights?.performancePercentiles
    ? [
        result.comparativeInsights.performancePercentiles.accuracy,
        result.comparativeInsights.performancePercentiles.centipawnLoss,
        result.comparativeInsights.performancePercentiles.tactical,
        result.comparativeInsights.performancePercentiles.consistency,
      ].filter((m): m is PercentileMetric => Boolean(m))
    : [];

  const learningCards = result.learningInsights?.cards ?? [];

  return (
    <div className="space-y-8">

      {/* ── Executive Summary ──────────────────────────────────────────────── */}
      <div className="rounded-xl bg-zinc-950 text-white shadow-lg p-4 sm:p-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-lg bg-white text-xl sm:text-2xl text-black">♔</div>
          <div>
            <h3 className="text-lg sm:text-2xl font-bold">{t('comprehensiveResult')}</h3>
            <p className="mt-0.5 text-sm text-zinc-400">{t('resultSummary', { username: result.username, count: result.totalGames })}</p>
          </div>
        </div>
      </div>

      {/* ── Review Order ───────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-950 text-white">
            <Target className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-lg font-black text-zinc-950">{t('reviewOrder')}</h4>
            <p className="text-sm text-zinc-500">{t('reviewOrderDesc')}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs font-black text-zinc-400 uppercase tracking-widest">{t('priority1')}</div>
            <div className="mt-1 text-base font-black text-zinc-950">{t('decisiveMoments', { count: result.decisiveMoments?.length || 0 })}</div>
            <p className="mt-2 text-sm leading-6 text-zinc-500">{t('decisiveMomentsDesc')}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs font-black text-zinc-400 uppercase tracking-widest">{t('priority2')}</div>
            <div className="mt-1 text-base font-black text-zinc-950">
              {result.advancedInsights?.openingHoles?.[0]?.name || t('checkOpenings')}
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-500">{t('checkOpeningsDesc')}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs font-black text-zinc-400 uppercase tracking-widest">{t('priority3')}</div>
            <div className="mt-1 text-base font-black text-zinc-950">
              {result.trainingRecommendations?.[0]?.title || t('customTraining')}
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-500">{t('customTrainingDesc')}</p>
          </div>
        </div>
      </div>

      {/* ── Performance Metrics ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 shadow-sm">
        <h4 className="mb-6 flex items-center gap-2 text-xl font-bold text-zinc-950">
          <BarChart3 className="h-5 w-5" />
          {t('performanceMetrics')}
        </h4>

        {/* 6 stat boxes — 2 cols on mobile, 3 on sm, 6 on md */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6 mb-6">
          <StatBox value={`${result.averageAccuracy?.toFixed(1) ?? '0.0'}%`} label={t('avgAccuracy')} icon="♕" color="blue" />
          <StatBox value={result.averageCentipawnLoss?.toFixed(1) ?? '0.0'} label={t('avgCpl')} icon="♙" color="green" />
          <StatBox value={result.tacticalOverview?.tacticalAccuracy ?? '0.0%'} label={t('tacticalAccuracy')} icon="♞" color="yellow" />
          <StatBox value={String(result.totalBlunders ?? 0)} label={t('blunders')} icon="✕" color="red" />
          <StatBox value={String(result.totalMistakes ?? 0)} label={t('mistakes')} icon="!" color="orange" />
          <StatBox value={String(result.totalInaccuracies ?? 0)} label={t('inaccuracies')} icon="?" color="purple" />
        </div>

        {/* Comparative Insights */}
        {result.comparativeInsights && (
          <div className="mb-6 rounded-xl border border-zinc-300 bg-zinc-950 p-5 text-white dark-surface">
            <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white px-3 py-1 text-xs font-bold text-zinc-950">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {t('cohortComparison')}
                </div>
                <h5 className="text-lg sm:text-2xl font-black text-white">{t('cohortQuestion')}</h5>
                <p className="mt-3 max-w-3xl text-sm sm:text-base font-medium leading-7 text-zinc-200">
                  {result.comparativeInsights.narrative}
                </p>
              </div>
              <div className="shrink-0 rounded-lg border border-white/20 bg-white px-4 py-3 text-sm text-zinc-950">
                <div className="text-zinc-500">{t('ratingBand')}</div>
                <div className="text-lg font-black">{result.comparativeInsights.ratingBand || t('analyzing')}</div>
              </div>
            </div>

            {comparisonMetrics.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
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
            )}

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* GM Match */}
              <div className="rounded-lg border border-white/15 bg-white p-4 text-zinc-950">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-zinc-700">
                  <Trophy className="h-4 w-4" />
                  {t('gmMatch')}
                </div>
                <div className="text-2xl font-black">{result.comparativeInsights.gmMatch?.name || t('analyzing')}</div>
                <div className="mt-1 text-sm font-semibold text-zinc-700">
                  {result.comparativeInsights.gmMatch?.styleLabel}{result.comparativeInsights.gmMatch?.styleLabel && ' · '}
                  {t('gmSimilarity', { similarity: result.comparativeInsights.gmMatch?.similarity ?? 0 })}
                </div>
                <p className="mt-3 text-sm font-medium leading-6 text-zinc-700">
                  {result.comparativeInsights.gmMatch?.reason}
                </p>
              </div>

              {/* Next Learning */}
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
                    <div key={`${card.title}-${card.value}`} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-bold text-zinc-500">{card.title}</div>
                        <div className="text-sm font-black text-zinc-950">{card.value}</div>
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
              <Brain className="h-5 w-5 text-zinc-700" />
              <h5 className="font-semibold text-zinc-900">{t('analysisStory')}</h5>
            </div>

            {result.advancedInsights.story && (
              <p className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium leading-6 text-zinc-700">
                {result.advancedInsights.story}
              </p>
            )}

            {(result.advancedInsights.styleAxes || []).length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                {(result.advancedInsights.styleAxes ?? []).map((axis) => (
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
            )}

            {(result.advancedInsights.confidenceBands ?? []).length > 0 && (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                {(result.advancedInsights.confidenceBands ?? []).map((band) => (
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
          <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-white dark-surface">
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
                  {(result.opponentExploitPlan.weaknesses ?? []).map((item) => (
                    <div key={`w-${item.title}`} className="rounded-lg border border-white/15 bg-white p-3 text-zinc-950">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-bold">{item.title}</div>
                        <div className="text-xs font-black text-zinc-500">{item.value}</div>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-zinc-600">{item.description}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-black uppercase tracking-wide text-zinc-400">{t('recommendedStrategy')}</div>
                <div className="space-y-2">
                  {(result.opponentExploitPlan.recommendations ?? []).map((item) => (
                    <div key={`r-${item.title}`} className="rounded-lg border border-white/15 bg-zinc-900 p-3">
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
              <BarChart3 className="h-5 w-5 text-zinc-700" />
              <h5 className="font-semibold text-zinc-900">{t('advancedPatterns')}</h5>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                      sample: result.advancedInsights.criticalMoveStats.sample ?? 0,
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

            {(result.advancedInsights.openingHoles ?? []).length > 0 && (
              <div className="mt-4">
                <div className="mb-2 text-sm font-bold text-zinc-800">{t('openingHoles')}</div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {(result.advancedInsights.openingHoles ?? []).map((opening) => (
                    <div key={`${opening.sideLabel}-${opening.name}`} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 text-sm font-bold text-zinc-950">{opening.sideLabel} · {opening.name}</div>
                        <div className="shrink-0 text-xs font-bold text-zinc-400">{opening.reason}</div>
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
        {(result.decisiveMoments ?? []).length > 0 && (
          <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-zinc-700" />
              <h5 className="font-semibold text-zinc-900">{t('decisiveMomentsSection')}</h5>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {(result.decisiveMoments ?? []).slice(0, 4).map((moment) => (
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
                      <span className="ml-2 text-sm font-semibold text-zinc-400">
                        {t('bestMoveSuggestion', { bestMove: moment.bestMove })}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 text-sm font-semibold text-zinc-600">
                    {moment.impactLabel} · {moment.classificationLabel}
                    {moment.winProbabilityLoss && moment.winProbabilityLoss >= 1 ? ` · ${moment.centipawnLoss}cp` : ''}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-500">{moment.explanation}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Opening Repertoire */}
        {result.openingStats && (
          <div className="mb-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <div className="mb-4 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-zinc-700" />
              <h5 className="font-semibold text-zinc-900">{t('openingRepertoire')}</h5>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {[
                { title: t('whiteGames'), total: result.openingStats.whiteTotal, rows: result.openingStats.white },
                { title: t('blackGames'), total: result.openingStats.blackTotal, rows: result.openingStats.black },
              ].map((section) => (
                <div key={section.title} className="rounded-lg border border-zinc-200 bg-white p-4">
                  <div className="mb-3 flex items-baseline justify-between">
                    <div className="text-sm font-semibold text-zinc-800">{section.title}</div>
                    <div className="text-xs text-zinc-400">{t('totalGamesCount', { total: section.total })}</div>
                  </div>

                  {section.rows.length > 0 ? (
                    <div className="space-y-3">
                      {section.rows.map((opening, index) => (
                        <div key={`${section.title}-${opening.name}`} className="space-y-1">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <div className="min-w-0 font-medium text-zinc-800">
                              {index + 1}. {opening.name}
                            </div>
                            <div className="shrink-0 text-zinc-500">
                              {t('openingCountPct', { count: opening.count, pct: opening.percentage.toFixed(1) })}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-400">
                            {typeof opening.scoreRate === 'number' && <span>{t('openingScoreRate', { scoreRate: opening.scoreRate.toFixed(1) })}</span>}
                            {typeof opening.averageCpl === 'number' && opening.averageCpl > 0 && <span>{t('openingAvgCpl', { cpl: opening.averageCpl.toFixed(1) })}</span>}
                            {typeof opening.firstIssueMove === 'number' && <span>{t('firstWavered', { move: opening.firstIssueMove.toFixed(1) })}</span>}
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-zinc-200">
                            <div className="h-1.5 rounded-full bg-zinc-700" style={{ width: `${Math.min(opening.percentage, 100)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-400">{t('noGamesForColor')}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Performance Explanations */}
        <div className="space-y-3">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <div className="mb-1 font-semibold text-zinc-950">{t('accuracySection')}</div>
            <p className="text-sm leading-6 text-zinc-600">{result.explanations?.accuracyExplanation}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <div className="mb-1 font-semibold text-zinc-950">{t('acplSection')}</div>
            <p className="text-sm leading-6 text-zinc-600">{result.explanations?.acplExplanation}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <div className="mb-1 font-semibold text-zinc-950">{t('mistakeSection')}</div>
            <p className="text-sm leading-6 text-zinc-600">{result.explanations?.errorAnalysis}</p>
          </div>
        </div>
      </div>

      {/* ── Style Profile ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 shadow-sm">
        <h4 className="mb-6 flex items-center gap-2 text-xl font-bold text-zinc-950">
          <Brain className="h-5 w-5" />
          {t('styleProfile')}
        </h4>

        {/* Main style banner */}
        <div className="mb-6 rounded-lg border border-zinc-200 bg-zinc-50 p-6">
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-zinc-950 text-2xl text-white">♚</div>
            <h5 className="mb-2 text-sm font-black uppercase tracking-widest text-zinc-500">{t('mainStyle')}</h5>
            <div className="text-2xl font-black text-zinc-950">
              {result.styleProfile?.playingStyle || t('analyzing')}
            </div>
            {result.styleProfile?.dimensionExplanations?.overallStyleAnalysis && (
              <p className="mx-auto mt-3 max-w-3xl text-sm leading-relaxed text-zinc-600">
                {getBriefStyleAnalysis(result.styleProfile.dimensionExplanations.overallStyleAnalysis)}
              </p>
            )}
          </div>
        </div>

        {/* 12 dimensions — 2 cols on mobile, 3 on xs, 4 on sm, 6 on lg */}
        <div className="grid grid-cols-2 gap-2 xs:grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 sm:gap-3">
          {STYLE_DIMENSIONS.map((dimension) => {
            const score = result.styleProfile?.[dimension.key] ?? 0;
            return (
              <div key={dimension.key} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-center hover:shadow-sm transition-shadow">
                <div className="text-lg mb-1">{dimension.icon}</div>
                <div className={`text-xl mb-1 ${getRatingColor(score)}`}>
                  {score.toFixed(0)}
                </div>
                <div className="text-xs text-zinc-500 leading-tight">{t(dimension.i18nKey as Parameters<typeof t>[0])}</div>
                <div className="mt-2 h-1.5 w-full rounded-full bg-zinc-200">
                  <div className="h-1.5 rounded-full bg-zinc-700" style={{ width: `${Math.min(score, 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Dimension explanations */}
        {result.styleProfile?.dimensionExplanations && (
          <div className="mt-6">
            <h5 className="mb-3 font-semibold text-zinc-900">📝 {t('dimensionDetail')}</h5>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {(Object.entries(result.styleProfile.dimensionExplanations) as [string, string | undefined][])
                .filter((entry): entry is [string, string] =>
                  entry[0] !== 'overallStyleAnalysis' && typeof entry[1] === 'string'
                )
                .map(([key, explanation]) => (
                  <div key={key} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
                    <div className="mb-1 font-semibold text-zinc-700">
                      {key.replace('Explanation', '').replace(/([A-Z])/g, ' $1').trim()}
                    </div>
                    <div className="leading-5 text-zinc-600">{explanation}</div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Tactical Analysis ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 shadow-sm">
        <h4 className="mb-6 flex items-center gap-2 text-xl font-bold text-zinc-950">
          <Zap className="h-5 w-5" />
          {t('tacticsSection')}
        </h4>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-4">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-center">
            <div className="text-3xl font-black text-zinc-950 mb-1">{result.tacticalOverview?.foundTactics ?? 0}</div>
            <div className="text-sm text-zinc-500">{t('tacticsConverted')}</div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-center">
            <div className="text-3xl font-black text-zinc-950 mb-1">{result.tacticalOverview?.missedTactics ?? 0}</div>
            <div className="text-sm text-zinc-500">{t('tacticsMissed')}</div>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-center">
            <div className="text-3xl font-black text-zinc-950 mb-1">{result.tacticalOverview?.totalOpportunities ?? 0}</div>
            <div className="text-sm text-zinc-500">{t('totalTactics')}</div>
          </div>
        </div>

        {result.tacticalOverview?.message && (
          <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-700">
            {result.tacticalOverview.message}
          </div>
        )}

        {(result.tacticalOpportunities ?? []).length > 0 && (
          <div>
            <h5 className="mb-3 font-semibold text-zinc-900">{t('tacticsPattern')}</h5>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {(result.tacticalOpportunities ?? []).map((opportunity, index) => (
                <div key={index} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  <div className="font-semibold text-zinc-950">{opportunity.pattern}</div>
                  <div className="mt-1 text-sm text-zinc-500">
                    {t('tacticsPatternStats', { accuracy: opportunity.accuracy, found: opportunity.found, missed: opportunity.missed })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Training Recommendations ───────────────────────────────────────── */}
      {(result.trainingRecommendations ?? []).length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 shadow-sm">
          <h4 className="mb-6 flex items-center gap-2 text-xl font-bold text-zinc-950">
            <Target className="h-5 w-5" />
            {t('trainingPlan')}
          </h4>
          <div className="space-y-3">
            {(result.trainingRecommendations ?? []).map((rec, index) => (
              <div key={index} className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <h5 className="font-bold text-zinc-950">{rec.title}</h5>
                  {rec.eloGain > 0 && (
                    <span className="shrink-0 rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs font-bold text-zinc-700">
                      {t('eloGain', { eloGain: rec.eloGain })}
                    </span>
                  )}
                </div>
                <p className="text-sm leading-6 text-zinc-600">{rec.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Player Metadata ────────────────────────────────────────────────── */}
      {result.playerMetadata && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 shadow-sm">
          <h4 className="mb-4 text-lg font-bold text-zinc-950">{t('playerInfo')}</h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {result.playerMetadata.country && (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-xs text-zinc-400 mb-1">{t('country')}</div>
                <div className="font-semibold text-zinc-950">{result.playerMetadata.country}</div>
              </div>
            )}
            {result.playerMetadata.title && (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-xs text-zinc-400 mb-1">{t('playerTitle')}</div>
                <div className="font-semibold text-zinc-950">{result.playerMetadata.title}</div>
              </div>
            )}
            {result.playerMetadata.followers > 0 && (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-xs text-zinc-400 mb-1">{t('followers')}</div>
                <div className="font-semibold text-zinc-950">{result.playerMetadata.followers.toLocaleString()}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Style Archetype Card ──────────────────────────────────────────── */}
      {result.styleProfile && (
        <StyleArchetypeCard result={result} shortLink={shortLink ?? null} jobId={jobId} />
      )}

      {/* ── Share Card ─────────────────────────────────────────────────────── */}
      <ShareResultCard
        username={result.username}
        gameCount={result.totalGames}
        averageAccuracy={result.averageAccuracy ?? 0}
        averageCentipawnLoss={result.averageCentipawnLoss ?? 0}
        totalBlunders={result.totalBlunders ?? 0}
        playingStyle={result.styleProfile?.playingStyle ?? ''}
        winrate={winrate}
        shortLink={shortLink ?? null}
        jobId={jobId}
      />

    </div>
  );
}

// ── StatBox sub-component ─────────────────────────────────────────────────────

type StatColor = 'blue' | 'green' | 'yellow' | 'red' | 'orange' | 'purple';

const statColorMap: Record<StatColor, string> = {
  blue:   'bg-blue-50 text-blue-700',
  green:  'bg-green-50 text-green-700',
  yellow: 'bg-yellow-50 text-yellow-700',
  red:    'bg-red-50 text-red-700',
  orange: 'bg-orange-50 text-orange-700',
  purple: 'bg-purple-50 text-purple-700',
};

function StatBox({ value, label, icon, color }: { value: string; label: string; icon: string; color: StatColor }) {
  return (
    <div className={`rounded-lg border p-3 text-center ${statColorMap[color]}`}>
      <div className="text-xl font-bold leading-none mb-1">
        {icon} {value}
      </div>
      <div className="text-xs opacity-80">{label}</div>
    </div>
  );
}
