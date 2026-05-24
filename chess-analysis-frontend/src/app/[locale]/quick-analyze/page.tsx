'use client';

import React, { useState } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from '../../../i18n/navigation';
import { usePlayerSummary } from '../../../hooks/usePlayerSummary';
import { useAnalysis } from '../../../hooks/useAnalysis';
import { PlayerSummaryCard } from '../../../components/PlayerSummaryCard';
import { JobProgress } from '../../../components/JobProgress';

export default function QuickAnalyzePage() {
  const t = useTranslations('QuickAnalyze');
  const tCommon = useTranslations('Common');
  const router = useRouter();

  const [searchForm, setSearchForm] = useState({
    platform: 'chess.com',
    username: '',
    n: 10,
    priority: 'fast' as 'fast' | 'balanced' | 'precise',
  });
  const [hasSearched, setHasSearched] = useState(false);

  const { summary, isLoading: summaryLoading, error: summaryError, refetch } = usePlayerSummary(
    hasSearched ? searchForm.platform : null,
    hasSearched ? searchForm.username : null,
    hasSearched
  );

  const { createJob, jobId, status, isPolling, isDone, tacticsReady, profile, reset } = useAnalysis();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchForm.username.trim()) return;
    setHasSearched(true);
  };

  const handleAnalyze = async () => {
    if (!summary) return;
    try {
      await createJob({ platform: searchForm.platform, username: searchForm.username, n: searchForm.n, priority: searchForm.priority });
    } catch (error) {
      console.error('Failed to start analysis:', error);
    }
  };

  const handleReset = () => {
    setSearchForm({ ...searchForm, username: '', platform: 'chess.com' });
    setHasSearched(false);
    reset();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{t('title')}</h1>
              <p className="text-gray-600 mt-1">{t('subtitle')}</p>
            </div>
            <div className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              <span className="text-sm font-medium text-purple-700">{t('engineBadge')}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <form onSubmit={handleSearch}>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">{tCommon('platform')}</label>
                <select
                  value={searchForm.platform}
                  onChange={(e) => setSearchForm({ ...searchForm, platform: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="chess.com">Chess.com</option>
                  <option value="lichess" disabled>Lichess</option>
                </select>
              </div>

              <div className="md:col-span-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">{tCommon('username')}</label>
                <input
                  type="text"
                  value={searchForm.username}
                  onChange={(e) => setSearchForm({ ...searchForm, username: e.target.value })}
                  placeholder={tCommon('usernamePlaceholder')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">{tCommon('games')}</label>
                <select
                  value={searchForm.n}
                  onChange={(e) => setSearchForm({ ...searchForm, n: parseInt(e.target.value) })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value={5}>{t('games5')}</option>
                  <option value={10}>{t('games10')}</option>
                  <option value={20}>{t('games20')}</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">{tCommon('analysis')}</label>
                <select
                  value={searchForm.priority}
                  onChange={(e) => setSearchForm({ ...searchForm, priority: e.target.value as 'fast' | 'balanced' | 'precise' })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="fast">Fast</option>
                  <option value="balanced">Balanced</option>
                  <option value="precise">Precise</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">&nbsp;</label>
                <button
                  type="submit"
                  disabled={summaryLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center space-x-2"
                >
                  {summaryLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Search className="w-5 h-5" />
                      <span>{tCommon('search')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {summaryLoading && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="animate-pulse">
                  <div className="flex items-center space-x-4 mb-6">
                    <div className="w-16 h-16 bg-gray-300 rounded-full" />
                    <div className="space-y-2">
                      <div className="h-6 bg-gray-300 rounded w-32" />
                      <div className="h-4 bg-gray-300 rounded w-24" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="h-24 bg-gray-300 rounded-lg" />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {summaryError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="text-red-800 font-medium">{t('summaryError')}</div>
                <div className="text-red-700 text-sm mt-1">{summaryError}</div>
                <button onClick={refetch} className="mt-3 text-red-800 hover:text-red-900 underline">
                  {tCommon('retry')}
                </button>
              </div>
            )}

            {summary && (
              <PlayerSummaryCard summary={summary} onAnalyzeClick={handleAnalyze} isAnalysisRunning={isPolling} />
            )}

            {tacticsReady && status?.partials?.tactics && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
                  <Sparkles className="w-6 h-6 text-yellow-500" />
                  <span>{t('tacticsResult')}</span>
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{status.partials.tactics.converted || 0}</div>
                    <div className="text-sm text-gray-600">{t('convertedTactics')}</div>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded-lg">
                    <div className="text-2xl font-bold text-red-600">{status.partials.tactics.missed || 0}</div>
                    <div className="text-sm text-gray-600">{t('missedOpportunities')}</div>
                  </div>
                </div>
              </div>
            )}

            {isDone && Boolean(profile) && (
              <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl shadow-lg p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">{t('analysisComplete')}</h3>
                <p className="text-gray-700 mb-4">{t('analysisCompleteDesc')}</p>
                <div className="flex space-x-4">
                  <button
                    onClick={() => router.push(`/analysis/${jobId}`)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
                  >
                    {t('viewReport')}
                  </button>
                  <button onClick={handleReset} className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg">
                    {t('newAnalysis')}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            {status && <JobProgress status={status} />}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="font-semibold text-gray-900 mb-3">{t('tipsTitle')}</h3>
              <div className="space-y-3 text-sm text-gray-600">
                <div><strong>{t('tipFastMode')}</strong> {t('tipFastDesc')}</div>
                <div><strong>{t('tipPreciseMode')}</strong> {t('tipPreciseDesc')}</div>
                <div><strong>{t('tipElite')}</strong> {t('tipEliteDesc')}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
