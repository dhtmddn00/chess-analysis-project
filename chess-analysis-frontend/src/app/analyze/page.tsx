'use client';

import React, { useState, useEffect } from 'react';
import { Search, Globe, Trophy, TrendingUp, Clock, Target, Zap, Brain, BarChart3 } from 'lucide-react';
import { usePlayerSummary } from '../../hooks/usePlayerSummary';
import { useAnalysis } from '../../hooks/useAnalysis';

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
  
  tacticalOverview?: {
    totalOpportunities: number;
    foundTactics: number;
    missedTactics: number;
    tacticalAccuracy: string;
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

export default function UnifiedAnalyzePage() {
  const [searchForm, setSearchForm] = useState({
    platform: 'chess.com',
    username: '',
    n: 10,
    priority: 'fast' as 'fast' | 'precise',
    timeControl: 'all' as 'all' | 'rapid' | 'blitz' | 'bullet',
  });
  
  const [hasSearched, setHasSearched] = useState(false);
  const [analysisStarted, setAnalysisStarted] = useState(false);

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
    isDone,
    tacticsReady,
    swingMomentsReady,
    endgameReady,
    timeMgmtReady,
  } = useAnalysis();

  const [detailedResult, setDetailedResult] = useState<AnalysisResult | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchForm.username.trim()) return;
    
    setHasSearched(true);
    setAnalysisStarted(false);
    setDetailedResult(null);
  };

  const handleStartAnalysis = async () => {
    if (!summary) return;
    
    try {
      await createJob({
        platform: searchForm.platform,
        username: searchForm.username,
        n: searchForm.n,
        priority: searchForm.priority,
        timeControl: searchForm.timeControl,
      });
      setAnalysisStarted(true);
    } catch (error) {
      console.error('Failed to start analysis:', error);
    }
  };

  // Fetch detailed results when analysis is done
  useEffect(() => {
    const fetchDetailedResult = async () => {
      if (isDone && jobId) {
        try {
          const response = await fetch(`/api/v1/analysis/${jobId}/result`);
          if (response.ok) {
            const data = await response.json();
            setDetailedResult(data);
          }
        } catch (error) {
          console.error('Failed to fetch detailed results:', error);
        }
      }
    };

    fetchDetailedResult();
  }, [isDone, jobId]);

  const getResultColor = (result: string) => {
    if (result === 'W') return 'text-green-600 bg-green-100';
    if (result === 'L') return 'text-red-600 bg-red-100';
    return 'text-yellow-600 bg-yellow-100';
  };

  const getResultText = (result: string) => {
    if (result === 'W') return '승';
    if (result === 'L') return '패';
    return '무';
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 80) return 'text-green-600 bg-green-50';
    if (rating >= 60) return 'text-blue-600 bg-blue-50';
    if (rating >= 40) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">체스 플레이어 분석</h1>
              <p className="text-gray-600 mt-1">즉시 요약 확인 → 자동 상세 분석 업데이트</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search form */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <form onSubmit={handleSearch}>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">플랫폼</label>
                <select
                  value={searchForm.platform}
                  onChange={(e) => setSearchForm({...searchForm, platform: e.target.value})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="chess.com">Chess.com</option>
                  <option value="lichess">Lichess</option>
                </select>
              </div>
              
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
              
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">시간 제어</label>
                <select
                  value={searchForm.timeControl}
                  onChange={(e) => setSearchForm({...searchForm, timeControl: e.target.value as 'all' | 'rapid' | 'blitz' | 'bullet'})}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">모든 게임</option>
                  <option value="rapid">래피드</option>
                  <option value="blitz">블리츠</option>
                  <option value="bullet">불릿</option>
                </select>
              </div>
              
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

        {/* Error */}
        {summaryError && (
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

        {/* Instant Summary */}
        {summary && summary.player && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-4">
                {/* Avatar */}
                <div className="w-20 h-20 rounded-full overflow-hidden bg-gray-200">
                  {summary.player.avatar ? (
                    <img 
                      src={summary.player.avatar} 
                      alt={summary.player.username}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-gray-500">
                      {summary.player?.username?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                  )}
                </div>
                
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{summary.player.username}</h2>
                  <div className="flex items-center space-x-3 text-gray-600">
                    <div className="flex items-center">
                      <Globe className="w-4 h-4 mr-1" />
                      {summary.player.country || 'Unknown'}
                    </div>
                    <div className="flex items-center">
                      <Trophy className="w-4 h-4 mr-1" />
                      {((summary.player.record_all?.winrate || 0) * 100).toFixed(1)}% 승률
                    </div>
                  </div>
                </div>
              </div>
              
              {!analysisStarted && (
                <button
                  onClick={handleStartAnalysis}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium flex items-center space-x-2"
                >
                  <Zap className="w-5 h-5" />
                  <span>상세 분석 시작</span>
                </button>
              )}
            </div>

            {/* Ratings by Time Control */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="text-center p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <div className="text-2xl font-bold text-yellow-600">
                  {summary.player.ratings?.rapid || summary.player.time_controls?.rapid?.rating || 'N/A'}
                </div>
                <div className="text-sm text-gray-600">래피드</div>
                {summary.player.time_controls?.rapid && (
                  <div className="text-xs text-gray-500 mt-1">
                    {((summary.player.time_controls.rapid.winrate || 0) * 100).toFixed(1)}% 승률
                  </div>
                )}
              </div>
              
              <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="text-2xl font-bold text-green-600">
                  {summary.player.ratings?.blitz || summary.player.time_controls?.blitz?.rating || 'N/A'}
                </div>
                <div className="text-sm text-gray-600">블리츠</div>
                {summary.player.time_controls?.blitz && (
                  <div className="text-xs text-gray-500 mt-1">
                    {((summary.player.time_controls.blitz.winrate || 0) * 100).toFixed(1)}% 승률
                  </div>
                )}
              </div>
              
              <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
                <div className="text-2xl font-bold text-red-600">
                  {summary.player.ratings?.bullet || summary.player.time_controls?.bullet?.rating || 'N/A'}
                </div>
                <div className="text-sm text-gray-600">불릿</div>
                {summary.player.time_controls?.bullet && (
                  <div className="text-xs text-gray-500 mt-1">
                    {((summary.player.time_controls.bullet.winrate || 0) * 100).toFixed(1)}% 승률
                  </div>
                )}
              </div>
            </div>

            {/* Overall Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900">
                  {summary.player.record_all?.games?.toLocaleString() || '0'}
                </div>
                <div className="text-sm text-gray-600">총 게임 수</div>
              </div>
              
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {summary.player.record_all?.win || '0'}
                </div>
                <div className="text-sm text-gray-600">승리</div>
              </div>
              
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">
                  {summary.player.record_all?.loss || '0'}
                </div>
                <div className="text-sm text-gray-600">패배</div>
              </div>
              
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {((summary.player.record_all?.winrate || 0) * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-gray-600">전체 승률</div>
              </div>
            </div>

            {/* Recent 10 Games */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">최근 10게임 전적</h3>
              <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
                {(summary.recent10 || []).map((game, index) => (
                  <div
                    key={index}
                    className={`w-12 h-12 rounded-lg flex items-center justify-center text-sm font-bold ${getResultColor(game.result)}`}
                    title={`vs ${game.opponent} (${game.opp_rating}) - ${game.time_control}`}
                  >
                    {getResultText(game.result)}
                  </div>
                ))}
                {(!summary.recent10 || summary.recent10.length === 0) && (
                  <div className="col-span-full text-center text-gray-500 py-4">
                    최근 게임 정보가 없습니다
                  </div>
                )}
              </div>
            </div>

            {/* Cohort Info */}
            {summary.cohort_hint && (
              <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="text-sm font-medium text-purple-800">
                  코호트: {summary.cohort_hint.band}
                </div>
                <div className="text-xs text-purple-700 mt-1">
                  {summary.cohort_hint.note}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Analysis Progress and Results */}
        {analysisStarted && status && (
          <div className="space-y-8">
            {/* Progress Indicator */}
            {!isDone && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">분석 진행 중...</h3>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700">전체 진행률</span>
                  <span className="text-sm text-gray-600">{Math.round(status.progress || 0)}%</span>
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
              <div className="space-y-8">
                {/* Executive Summary */}
                <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl shadow-lg p-6">
                  <div className="flex items-center mb-4">
                    <BarChart3 className="w-8 h-8 mr-3" />
                    <div>
                      <h3 className="text-2xl font-bold">종합 분석 결과</h3>
                      <p className="text-blue-100">플레이어: {detailedResult.username} • 분석 게임: {detailedResult.totalGames}개</p>
                    </div>
                  </div>
                </div>

                {/* Performance Metrics Dashboard */}
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h4 className="text-xl font-bold text-gray-900 mb-6">📊 성과 지표</h4>
                  
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
                    <div className="text-center p-4 bg-blue-50 rounded-lg border">
                      <div className="text-2xl font-bold text-blue-600">
                        {detailedResult.averageAccuracy?.toFixed(1) || '0.0'}%
                      </div>
                      <div className="text-xs text-gray-600">평균 정확도</div>
                    </div>
                    
                    <div className="text-center p-4 bg-green-50 rounded-lg border">
                      <div className="text-2xl font-bold text-green-600">
                        {detailedResult.averageCentipawnLoss?.toFixed(1) || '0.0'}
                      </div>
                      <div className="text-xs text-gray-600">평균 CPL</div>
                    </div>
                    
                    <div className="text-center p-4 bg-yellow-50 rounded-lg border">
                      <div className="text-2xl font-bold text-yellow-600">
                        {detailedResult.tacticalOverview?.tacticalAccuracy || '0.0%'}
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

                  {/* Performance Analysis */}
                  <div className="space-y-4">
                    <div className="p-4 bg-blue-50 border-l-4 border-blue-400 rounded-lg">
                      <div className="font-medium text-blue-900 mb-1">📈 정확도 분석</div>
                      <p className="text-sm text-blue-800">{detailedResult.explanations?.accuracyExplanation}</p>
                    </div>
                    
                    <div className="p-4 bg-green-50 border-l-4 border-green-400 rounded-lg">
                      <div className="font-medium text-green-900 mb-1">⚖️ 센티폰 손실 분석</div>
                      <p className="text-sm text-green-800">{detailedResult.explanations?.acplExplanation}</p>
                    </div>
                    
                    <div className="p-4 bg-orange-50 border-l-4 border-orange-400 rounded-lg">
                      <div className="font-medium text-orange-900 mb-1">🎯 실수 패턴 분석</div>
                      <p className="text-sm text-orange-800">{detailedResult.explanations?.errorAnalysis}</p>
                    </div>
                  </div>
                </div>

                {/* Comprehensive Style Profile */}
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h4 className="text-xl font-bold text-gray-900 mb-6">🎭 12차원 스타일 프로파일링</h4>
                  
                  {/* Main Playing Style */}
                  <div className="bg-gradient-to-r from-purple-100 to-pink-100 p-6 rounded-lg mb-6 border">
                    <div className="text-center">
                      <h5 className="text-lg font-bold text-purple-800 mb-2">주요 플레이 스타일</h5>
                      <div className="text-2xl font-bold text-purple-900">
                        {detailedResult.styleProfile?.playingStyle || '분석 중'}
                      </div>
                    </div>
                  </div>
                  
                  {/* All 12 Dimensions */}
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {[
                      { name: '전술적 감각', key: 'tacticalRating', icon: '⚔️' },
                      { name: '포지셔널', key: 'positionalRating', icon: '🏛️' },
                      { name: '엔드게임', key: 'endgameRating', icon: '♔' },
                      { name: '시간 관리', key: 'timeManagementRating', icon: '⏰' },
                      { name: '공격성', key: 'aggressionRating', icon: '🔥' },
                      { name: '일관성', key: 'consistency', icon: '📊' },
                      { name: '리스크 감수', key: 'riskTolerance', icon: '🎲' },
                      { name: '교환 선호도', key: 'exchangePreference', icon: '↔️' },
                      { name: '오프닝 다양성', key: 'openingVariety', icon: '📚' },
                      { name: '우세 변환력', key: 'leadConversion', icon: '🏆' },
                      { name: '역전 저항력', key: 'swindleResistance', icon: '🛡️' },
                      { name: '블런더 경향', key: 'blunderTendency', icon: '⚠️' }
                    ].map((dimension) => {
                      const score = detailedResult.styleProfile?.[dimension.key as keyof typeof detailedResult.styleProfile] as number || 0;
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
                        {Object.entries(detailedResult.styleProfile.dimensionExplanations).map(([key, explanation]) => (
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
                  <h4 className="text-xl font-bold text-gray-900 mb-6">⚔️ 전술 분석</h4>
                  
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
                    <h4 className="text-xl font-bold text-gray-900 mb-6">🎯 맞춤형 훈련 계획</h4>
                    
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
                    <h4 className="text-xl font-bold text-gray-900 mb-6">👤 플레이어 정보</h4>
                    
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
            )}
          </div>
        )}
      </div>
    </div>
  );
}