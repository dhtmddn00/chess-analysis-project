'use client';

import React, { useState } from 'react';
import { Search, Settings, Sparkles } from 'lucide-react';
import { usePlayerSummary } from '../../hooks/usePlayerSummary';
import { useAnalysis } from '../../hooks/useAnalysis';
import { PlayerSummaryCard } from '../../components/PlayerSummaryCard';
import { JobProgress } from '../../components/JobProgress';

export default function QuickAnalyzePage() {
  const [searchForm, setSearchForm] = useState({
    platform: 'chesscom',
    username: '',
    n: 10,
    priority: 'fast' as 'fast' | 'precise',
  });
  
  const [hasSearched, setHasSearched] = useState(false);
  
  // Player summary hook
  const { summary, isLoading: summaryLoading, error: summaryError, refetch } = usePlayerSummary(
    hasSearched ? searchForm.platform : null,
    hasSearched ? searchForm.username : null,
    hasSearched
  );
  
  // Analysis job hook
  const {
    createJob,
    jobId,
    status,
    isPolling,
    isDone,
    isFailed,
    progress,
    etaRemaining,
    tacticsReady,
    swingMomentsReady,
    endgameReady,
    timeMgmtReady,
    summary: analysisSummary,
    profile,
    plan,
    reset
  } = useAnalysis();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchForm.username.trim()) return;
    
    setHasSearched(true);
  };

  const handleAnalyze = async () => {
    if (!summary) return;
    
    try {
      await createJob({
        platform: searchForm.platform,
        username: searchForm.username,
        n: searchForm.n,
        priority: searchForm.priority,
      });
    } catch (error) {
      console.error('Failed to start analysis:', error);
      // TODO: Show error toast
    }
  };

  const handleReset = () => {
    setSearchForm({ ...searchForm, username: '' });
    setHasSearched(false);
    reset();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">빠른 체스 분석</h1>
              <p className="text-gray-600 mt-1">플레이어 요약을 즉시 확인하고 심층 분석을 시작하세요</p>
            </div>
            
            <div className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              <span className="text-sm font-medium text-purple-700">Elite v2.0 엔진</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search form */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <form onSubmit={handleSearch}>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Platform select */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">플랫폼</label>
                <select
                  value={searchForm.platform}
                  onChange={(e) => setSearchForm({...searchForm, platform: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="chesscom">Chess.com</option>
                  <option value="lichess">Lichess</option>
                </select>
              </div>
              
              {/* Username input */}
              <div className="md:col-span-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">사용자명</label>
                <input
                  type="text"
                  value={searchForm.username}
                  onChange={(e) => setSearchForm({...searchForm, username: e.target.value})}
                  placeholder="예: hikaru, magnus"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              
              {/* Game count */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">게임 수</label>
                <select
                  value={searchForm.n}
                  onChange={(e) => setSearchForm({...searchForm, n: parseInt(e.target.value)})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value={5}>5게임</option>
                  <option value={10}>10게임</option>
                  <option value={20}>20게임</option>
                </select>
              </div>
              
              {/* Priority */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">분석 모드</label>
                <select
                  value={searchForm.priority}
                  onChange={(e) => setSearchForm({...searchForm, priority: e.target.value as 'fast' | 'precise'})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="fast">빠르게</option>
                  <option value="precise">정밀하게</option>
                </select>
              </div>
              
              {/* Search button */}
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
                      <span>검색</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Results */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Loading skeleton */}
            {summaryLoading && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="animate-pulse">
                  <div className="flex items-center space-x-4 mb-6">
                    <div className="w-16 h-16 bg-gray-300 rounded-full"></div>
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

            {/* Error */}
            {summaryError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="text-red-800 font-medium">요약을 가져올 수 없습니다</div>
                <div className="text-red-700 text-sm mt-1">{summaryError}</div>
                <button
                  onClick={refetch}
                  className="mt-3 text-red-800 hover:text-red-900 underline"
                >
                  다시 시도
                </button>
              </div>
            )}

            {/* Player summary */}
            {summary && (
              <PlayerSummaryCard 
                summary={summary}
                onAnalyzeClick={handleAnalyze}
                isAnalysisRunning={isPolling}
              />
            )}

            {/* Analysis sections (partial results) */}
            {tacticsReady && status?.partials?.tactics && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
                  <Sparkles className="w-6 h-6 text-yellow-500" />
                  <span>전술 분석 결과</span>
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {status.partials.tactics.converted || 0}
                    </div>
                    <div className="text-sm text-gray-600">성공한 전술</div>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded-lg">
                    <div className="text-2xl font-bold text-red-600">
                      {status.partials.tactics.missed || 0}
                    </div>
                    <div className="text-sm text-gray-600">놓친 기회</div>
                  </div>
                </div>
              </div>
            )}

            {/* More sections would appear as they become ready... */}

            {/* Final results */}
            {isDone && profile && (
              <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl shadow-lg p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">🎉 분석 완료!</h3>
                <p className="text-gray-700 mb-4">모든 분석이 완료되었습니다. 자세한 결과를 확인하세요.</p>
                <div className="flex space-x-4">
                  <button 
                    onClick={() => window.location.href = `/analysis/${jobId}`}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
                  >
                    상세 보고서 보기
                  </button>
                  <button
                    onClick={handleReset}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg"
                  >
                    새 분석 시작
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Analysis progress */}
            {status && (
              <JobProgress status={status} />
            )}
            
            {/* Tips */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="font-semibold text-gray-900 mb-3">💡 팁</h3>
              <div className="space-y-3 text-sm text-gray-600">
                <div>
                  <strong>빠른 모드:</strong> 30초 내 기본 분석
                </div>
                <div>
                  <strong>정밀 모드:</strong> 2-3분 소요, 상세 분석
                </div>
                <div>
                  <strong>Elite v2.0:</strong> 2900+ 선수들을 위한 특별 알고리즘
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}