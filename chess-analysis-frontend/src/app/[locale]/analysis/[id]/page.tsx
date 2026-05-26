'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '../../../../i18n/navigation';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { analysisApi, Analysis, AnalysisResult, AnalysisGame } from '@/lib/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import {
  ArrowLeft, Download, Share2, Clock, User, Trophy, Target, TrendingUp,
  AlertTriangle, CheckCircle, Brain, Zap, Shield, Crown, Globe, Users,
  BookOpen, Timer, Award, Star, ChevronRight, BarChart3, PieChart
} from 'lucide-react';

interface StyleDimension {
  name: string;
  score: number;
  percentile?: number;
  description: string;
  icon: React.ElementType;
}

export default function AdvancedAnalysisResultPage() {
  const t = useTranslations('AnalysisDetail');
  const tCommon = useTranslations('Common');
  const params = useParams();
  const router = useRouter();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [games, setGames] = useState<AnalysisGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  const analysisId = params.id as string;

  useEffect(() => {
    const loadAnalysisResult = async () => {
      try {
        setLoading(true);

        const analysisData = await analysisApi.getAnalysis(analysisId);
        setAnalysis(analysisData);

        if (analysisData.status === 'COMPLETED') {
          const resultData = await analysisApi.getAnalysisResult(analysisId);
          setResult(resultData);

          const gamesData = await analysisApi.getAnalysisGames(analysisId);
          setGames(gamesData);
        }
      } catch (err) {
        setError('분석 결과를 불러올 수 없습니다.');
        console.error('Error loading analysis:', err);
      } finally {
        setLoading(false);
      }
    };

    if (analysisId) {
      loadAnalysisResult();
    }
  }, [analysisId]);

  const getStyleDimensions = (styleProfile: NonNullable<AnalysisResult['styleProfile']>): StyleDimension[] => {
    return [
      { name: '전술적 감각', score: styleProfile.tacticalRating || 0, description: '전술 패턴 인식과 계산 능력', icon: Zap },
      { name: '포지셔널 이해', score: styleProfile.positionalRating || 0, description: '포지션 평가와 장기 계획', icon: Brain },
      { name: '엔드게임 기술', score: styleProfile.endgameRating || 0, description: '엔드게임 테크닉과 정확성', icon: Crown },
      { name: '시간 관리', score: styleProfile.timeManagementRating || 0, description: '효율적인 시간 배분', icon: Timer },
      { name: '실수 경향', score: 100 - (styleProfile.blunderTendency || 0), description: '블런더 방지 능력', icon: Shield },
      { name: '위험 감수', score: styleProfile.riskTolerance || 0, description: '복잡한 상황 선호도', icon: TrendingUp },
      { name: '공격성', score: styleProfile.aggressionRating || 0, description: '공격적 플레이 성향', icon: Target },
      { name: '교환 선호', score: styleProfile.exchangePreference || 0, description: '말 교환에 대한 선호도', icon: BarChart3 },
      { name: '오프닝 다양성', score: styleProfile.openingVariety || 0, description: '오프닝 레퍼토리의 다양성', icon: BookOpen },
      { name: '우세 변환', score: styleProfile.leadConversion || 0, description: '우세한 포지션 승리 변환', icon: Award },
      { name: '일관성', score: styleProfile.consistency || 0, description: '게임 간 성과 일관성', icon: CheckCircle },
      { name: '역전 저항', score: styleProfile.swindleResistance || 0, description: '불리한 상황에서의 저항력', icon: Shield }
    ];
  };

  const getPriorityLabel = (priority: number) => {
    switch (priority) {
      case 1: return '긴급';
      case 2: return '높음';
      default: return '보통';
    }
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return '우수';
    if (score >= 60) return '양호';
    if (score >= 40) return '보통';
    return '개선 필요';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
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

  return (
    <div className="chess-toss min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/')}
                className="flex items-center text-zinc-500 hover:text-zinc-900 text-sm font-medium"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                돌아가기
              </button>
              <div className="h-4 w-px bg-zinc-200" />
              <div>
                <h1 className="text-sm font-bold text-zinc-900">
                  {analysis.username}의 체스 분석
                </h1>
                <p className="text-xs text-zinc-400">
                  {analysis.gameCount}게임 · {new Date(analysis.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button className="bg-zinc-950 text-white px-3 py-1.5 rounded-lg hover:bg-zinc-800 flex items-center text-xs font-bold">
                <Download className="h-3.5 w-3.5 mr-1.5" />
                다운로드
              </button>
              <button className="border border-zinc-300 bg-white text-zinc-700 px-3 py-1.5 rounded-lg hover:border-zinc-600 flex items-center text-xs font-bold">
                <Share2 className="h-3.5 w-3.5 mr-1.5" />
                공유
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Player Info Banner */}
      {result?.styleProfile?.metadata && (
        <div className="bg-zinc-950 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-3">
                <div className="w-14 h-14 bg-white/10 border border-white/20 rounded-full flex items-center justify-center">
                  <span className="text-2xl">♟</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{analysis.username}</h2>
                  <div className="flex items-center space-x-4 text-zinc-400 text-xs mt-0.5">
                    {(() => {
                      try {
                        const metadata = JSON.parse(result.styleProfile.metadata);
                        return (
                          <>
                            <span className="flex items-center gap-1">
                              <Globe className="h-3.5 w-3.5" />
                              {metadata.country || 'KR'}
                            </span>
                            {metadata.title && (
                              <span className="flex items-center gap-1">
                                <Crown className="h-3.5 w-3.5" />
                                {metadata.title}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Users className="h-3.5 w-3.5" />
                              {metadata.followers || 0} 팔로워
                            </span>
                          </>
                        );
                      } catch {
                        return (
                          <span className="flex items-center gap-1">
                            <Globe className="h-3.5 w-3.5" />
                            chess.com
                          </span>
                        );
                      }
                    })()}
                  </div>
                </div>
              </div>

              <div className="flex space-x-6 ml-auto">
                {(() => {
                  try {
                    const metadata = JSON.parse(result.styleProfile.metadata);
                    const ratings = metadata.ratings_by_timecontrol || {};
                    return (
                      <>
                        {ratings.chess_blitz && (
                          <div className="text-center">
                            <div className="text-xl font-bold text-white">{ratings.chess_blitz.rating}</div>
                            <div className="text-xs text-zinc-500">Blitz</div>
                          </div>
                        )}
                        {ratings.chess_rapid && (
                          <div className="text-center">
                            <div className="text-xl font-bold text-white">{ratings.chess_rapid.rating}</div>
                            <div className="text-xs text-zinc-500">Rapid</div>
                          </div>
                        )}
                        {ratings.chess_bullet && (
                          <div className="text-center">
                            <div className="text-xl font-bold text-white">{ratings.chess_bullet.rating}</div>
                            <div className="text-xs text-zinc-500">Bullet</div>
                          </div>
                        )}
                      </>
                    );
                  } catch {
                    return null;
                  }
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-zinc-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-1 overflow-x-auto">
            {[
              { id: 'overview', label: '종합 분석', icon: BarChart3 },
              { id: 'style', label: '스타일', icon: Brain },
              { id: 'tactical', label: '전술', icon: Zap },
              { id: 'training', label: '훈련 플랜', icon: Target },
              { id: 'games', label: '게임별', icon: PieChart }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 py-4 px-3 border-b-2 font-semibold text-sm whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-zinc-950 text-zinc-950'
                    : 'border-transparent text-zinc-400 hover:text-zinc-700 hover:border-zinc-300'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && result && (
          <div className="space-y-6">
            {/* Performance Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-zinc-200 p-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-zinc-100 rounded-lg">
                    <Trophy className="h-5 w-5 text-zinc-700" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">평균 정확도</p>
                    <p className="text-2xl font-black text-zinc-950">{result.averageAccuracy.toFixed(1)}%</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-zinc-200 p-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-zinc-100 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-zinc-700" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">평균 ACPL</p>
                    <p className="text-2xl font-black text-zinc-950">{result.averageCentipawnLoss.toFixed(1)}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-zinc-200 p-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-zinc-100 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-zinc-700" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">총 실수</p>
                    <p className="text-2xl font-black text-zinc-950">{result.totalBlunders + result.totalMistakes}</p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-zinc-200 p-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-zinc-100 rounded-lg">
                    <Zap className="h-5 w-5 text-zinc-700" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">전술 정확도</p>
                    <p className="text-2xl font-black text-zinc-950">
                      {result.tacticalOverview?.tacticalAccuracy ||
                       ((() => {
                         try {
                           const tacticalStats = JSON.parse(result.styleProfile?.tacticalStats || '{}');
                           const total = tacticalStats.total_tactical_opportunities || 0;
                           return total > 0 ? `${((tacticalStats.tactical_accuracy || 0) * 100).toFixed(1)}%` : '—';
                         } catch {
                           return '—';
                         }
                       })())
                      }
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Analysis Explanations */}
            {result.explanations && (
              <div className="bg-white rounded-xl border border-zinc-200">
                <div className="px-6 py-4 border-b border-zinc-100">
                  <h3 className="text-base font-black text-zinc-950">분석 결과 해석</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">게임을 상세히 분석한 결과입니다</p>
                </div>
                <div className="p-6 space-y-4">
                  <div className="bg-zinc-50 border-l-4 border-zinc-900 p-4 rounded-r-lg">
                    <h4 className="text-sm font-black text-zinc-900 mb-1.5">정확도 분석</h4>
                    <p className="text-sm text-zinc-600 leading-relaxed">{result.explanations.accuracyExplanation}</p>
                  </div>

                  <div className="bg-zinc-50 border-l-4 border-zinc-600 p-4 rounded-r-lg">
                    <h4 className="text-sm font-black text-zinc-900 mb-1.5">센티폰 손실 분석</h4>
                    <p className="text-sm text-zinc-600 leading-relaxed">{result.explanations.acplExplanation}</p>
                  </div>

                  <div className="bg-zinc-50 border-l-4 border-zinc-400 p-4 rounded-r-lg">
                    <h4 className="text-sm font-black text-zinc-900 mb-1.5">실수 패턴 분석</h4>
                    <p className="text-sm text-zinc-600 leading-relaxed">{result.explanations.errorAnalysis}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Style Profile Overview */}
            {result.styleProfile && (
              <div className="bg-white rounded-xl border border-zinc-200">
                <div className="px-6 py-4 border-b border-zinc-100">
                  <h3 className="text-base font-black text-zinc-950">스타일 분석 요약</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">플레이 스타일: {result.styleProfile?.playingStyle}</p>
                </div>
                <div className="p-6">
                  {result.styleProfile.dimensionExplanations?.overallStyleAnalysis && (
                    <div className="bg-zinc-950 text-white p-5 rounded-xl mb-6">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">♟</span>
                        <h4 className="text-sm font-black">당신의 체스 스타일</h4>
                      </div>
                      <p className="text-sm text-zinc-300 leading-relaxed">{result.styleProfile.dimensionExplanations.overallStyleAnalysis}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {getStyleDimensions(result.styleProfile).map((dimension, index) => (
                      <div key={index} className="flex items-center space-x-3">
                        <div className="p-2 bg-zinc-100 rounded-lg flex-shrink-0">
                          <dimension.icon className="h-4 w-4 text-zinc-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-bold text-zinc-900 truncate">{dimension.name}</span>
                            <span className="text-xs font-black text-zinc-700 ml-2 flex-shrink-0">{dimension.score.toFixed(0)}</span>
                          </div>
                          <div className="w-full bg-zinc-100 rounded-full h-1.5">
                            <div
                              className="h-1.5 rounded-full bg-zinc-900 transition-all duration-300"
                              style={{ width: `${dimension.score}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'training' && result?.trainingRecommendations && (
          <div className="space-y-6">
            {/* Training Banner */}
            <div className="bg-zinc-950 text-white rounded-xl p-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-white/10 border border-white/20 rounded-lg flex items-center justify-center">
                  <Target className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black">100 Elo Up 개인 맞춤 훈련 플랜</h2>
                  <p className="text-sm text-zinc-400">데이터 기반 과학적 분석으로 체계적인 실력 향상을 지원합니다</p>
                </div>
              </div>
            </div>

            {result.trainingRecommendations && result.trainingRecommendations.length > 0 ? (
              <div className="grid gap-4">
                {result.trainingRecommendations.map((rec, index) => (
                  <div key={index} className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <span className="px-2.5 py-1 rounded-full text-xs font-black border border-zinc-300 bg-zinc-50 text-zinc-700">
                            {getPriorityLabel(rec.priority)}
                          </span>
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-600">
                            {rec.category}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1.5 text-zinc-700">
                          <TrendingUp className="h-4 w-4" />
                          <span className="text-sm font-black">+{rec.eloGain} Elo</span>
                        </div>
                      </div>

                      <h3 className="text-base font-black text-zinc-950 mb-1.5">{rec.title}</h3>
                      <p className="text-sm text-zinc-600 mb-4 leading-relaxed">{rec.description}</p>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4 text-xs text-zinc-400">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            예상 기간: 2-4주
                          </span>
                          <span className="flex items-center gap-1">
                            <BookOpen className="h-3.5 w-3.5" />
                            난이도: 중급
                          </span>
                        </div>
                        <button className="bg-zinc-950 text-white px-3 py-1.5 rounded-lg hover:bg-zinc-800 text-xs font-bold flex items-center gap-1">
                          세부 계획 보기
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-zinc-200 p-8 text-center">
                <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">♟</span>
                </div>
                <h3 className="text-base font-black text-zinc-900 mb-1">훈련 계획 생성 중</h3>
                <p className="text-sm text-zinc-500">개인 맞춤 훈련 계획이 준비되는 중입니다.</p>
              </div>
            )}

            {/* Strengths / Weaknesses */}
            <div className="bg-white rounded-xl border border-zinc-200">
              <div className="px-6 py-4 border-b border-zinc-100">
                <h3 className="text-base font-black text-zinc-950">개인별 학습 계획</h3>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">우선 개선 영역</h4>
                    <ul className="space-y-2 text-sm text-zinc-600">
                      {(() => {
                        try {
                          const weaknesses = JSON.parse(result.styleProfile?.weaknesses || '[]');
                          if (weaknesses.length > 0) {
                            return weaknesses.slice(0, 3).map((weakness: string, idx: number) => (
                              <li key={idx} className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 bg-zinc-800 rounded-full flex-shrink-0" />
                                {weakness} 개선 훈련
                              </li>
                            ));
                          } else {
                            const dimensions = [
                              { name: '전술적 감각', score: result.styleProfile?.tacticalRating || 0 },
                              { name: '포지셔널 이해', score: result.styleProfile?.positionalRating || 0 },
                              { name: '일관성', score: result.styleProfile?.consistency || 0 },
                            ];
                            return dimensions
                              .filter(d => d.score < 40)
                              .slice(0, 3)
                              .map((weakness, idx) => (
                                <li key={idx} className="flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 bg-zinc-800 rounded-full flex-shrink-0" />
                                  {weakness.name} 향상 훈련
                                </li>
                              ));
                          }
                        } catch {
                          return (
                            <li className="flex items-center gap-2 text-zinc-400">
                              <div className="w-1.5 h-1.5 bg-zinc-300 rounded-full" />
                              개인별 맞춤 분석 준비 중
                            </li>
                          );
                        }
                      })()}
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">강점 활용</h4>
                    <ul className="space-y-2 text-sm text-zinc-600">
                      {(() => {
                        try {
                          const strengths = JSON.parse(result.styleProfile?.strengths || '[]');
                          if (strengths.length > 0) {
                            return strengths.slice(0, 3).map((strength: string, idx: number) => (
                              <li key={idx} className="flex items-center gap-2">
                                <Star className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0" />
                                {strength} 더욱 발전시키기
                              </li>
                            ));
                          } else {
                            const dimensions = [
                              { name: '오프닝 다양성', score: result.styleProfile?.openingVariety || 0 },
                              { name: '엔드게임 기술', score: result.styleProfile?.endgameRating || 0 },
                              { name: '역전 저항력', score: result.styleProfile?.swindleResistance || 0 },
                            ];
                            return dimensions
                              .filter(d => d.score >= 60)
                              .slice(0, 3)
                              .map((strength, idx) => (
                                <li key={idx} className="flex items-center gap-2">
                                  <Star className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0" />
                                  {strength.name} 더욱 발전시키기
                                </li>
                              ));
                          }
                        } catch {
                          return (
                            <li className="flex items-center gap-2 text-zinc-400">
                              <Star className="h-3.5 w-3.5 text-zinc-300" />
                              강점 분석 준비 중
                            </li>
                          );
                        }
                      })()}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'style' && result?.styleProfile && (
          <div className="space-y-6">
            {/* Style Banner */}
            <div className="bg-zinc-950 text-white rounded-xl p-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-white/10 border border-white/20 rounded-lg flex items-center justify-center">
                  <Brain className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black">{result.styleProfile?.playingStyle}</h2>
                  <p className="text-sm text-zinc-400">12차원 스타일 벡터 분석 결과</p>
                </div>
              </div>
            </div>

            {/* 12-Dimensional Analysis */}
            <div className="bg-white rounded-xl border border-zinc-200">
              <div className="px-6 py-4 border-b border-zinc-100">
                <h3 className="text-base font-black text-zinc-950">12차원 스타일 분석</h3>
                <p className="text-xs text-zinc-400 mt-0.5">각 차원별 점수와 코호트 내 백분위</p>
              </div>
              <div className="p-6">
                {/* Dimension-specific explanations */}
                {result.styleProfile.dimensionExplanations && (
                  <div className="space-y-3 mb-8">
                    {[
                      { key: 'tacticalExplanation', label: '전술적 감각', icon: '⚡' },
                      { key: 'positionalExplanation', label: '포지셔널 이해', icon: '🧠' },
                      { key: 'endgameExplanation', label: '엔드게임 기술', icon: '♟' },
                      { key: 'timeManagementExplanation', label: '시간 관리', icon: '⏱' },
                      { key: 'aggressionExplanation', label: '공격성', icon: '⚔' },
                      { key: 'consistencyExplanation', label: '일관성', icon: '📊' },
                    ].map(({ key, label, icon }) => {
                      const text = (result.styleProfile.dimensionExplanations as Record<string, string | undefined>)?.[key];
                      if (!text) return null;
                      return (
                        <div key={key} className="bg-zinc-50 border-l-4 border-zinc-300 p-4 rounded-r-lg">
                          <h4 className="text-sm font-black text-zinc-900 mb-1">{icon} {label}</h4>
                          <p className="text-sm text-zinc-600 leading-relaxed">{text}</p>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {getStyleDimensions(result.styleProfile).map((dimension, index) => (
                    <div key={index}>
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-zinc-100 rounded-lg flex-shrink-0">
                          <dimension.icon className="h-4 w-4 text-zinc-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="text-sm font-bold text-zinc-900">{dimension.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black text-zinc-800">{dimension.score.toFixed(0)}</span>
                              {dimension.percentile && (
                                <span className="text-xs bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full font-semibold">
                                  상위 {(100 - dimension.percentile).toFixed(0)}%
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="w-full bg-zinc-100 rounded-full h-2">
                            <div
                              className="h-2 rounded-full bg-zinc-900 transition-all duration-500"
                              style={{ width: `${dimension.score}%` }}
                            />
                          </div>
                          <p className="text-xs text-zinc-400 mt-1">{dimension.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Strengths and Weaknesses */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl border border-zinc-200">
                <div className="px-6 py-4 border-b border-zinc-100">
                  <h3 className="text-base font-black text-zinc-950 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-zinc-600" />
                    주요 강점
                  </h3>
                </div>
                <div className="p-5">
                  <ul className="space-y-2.5">
                    {(() => {
                      try {
                        const strengths = JSON.parse(result.styleProfile?.strengths || '[]');
                        if (strengths.length > 0) {
                          return strengths.map((strength: string, idx: number) => (
                            <li key={idx} className="flex items-center gap-2.5">
                              <div className="w-1.5 h-1.5 bg-zinc-800 rounded-full flex-shrink-0" />
                              <span className="text-sm text-zinc-700">{strength}</span>
                            </li>
                          ));
                        } else {
                          const dimensions = [
                            { name: '오프닝 다양성', score: result.styleProfile?.openingVariety || 0 },
                            { name: '엔드게임 기술', score: result.styleProfile?.endgameRating || 0 },
                            { name: '역전 저항력', score: result.styleProfile?.swindleResistance || 0 },
                            { name: '교환 선호도', score: result.styleProfile?.exchangePreference || 0 },
                          ];
                          return dimensions
                            .filter(d => d.score >= 60)
                            .map((strength, idx) => (
                              <li key={idx} className="flex items-center gap-2.5">
                                <div className="w-1.5 h-1.5 bg-zinc-800 rounded-full flex-shrink-0" />
                                <span className="text-sm text-zinc-700">{strength.name} ({strength.score.toFixed(0)}점)</span>
                              </li>
                            ));
                        }
                      } catch {
                        return (
                          <li className="flex items-center gap-2.5 text-zinc-400 text-sm">
                            <div className="w-1.5 h-1.5 bg-zinc-200 rounded-full" />
                            강점 분석 중...
                          </li>
                        );
                      }
                    })()}
                  </ul>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-zinc-200">
                <div className="px-6 py-4 border-b border-zinc-100">
                  <h3 className="text-base font-black text-zinc-950 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-zinc-600" />
                    개선 영역
                  </h3>
                </div>
                <div className="p-5">
                  <ul className="space-y-2.5">
                    {(() => {
                      try {
                        const weaknesses = JSON.parse(result.styleProfile?.weaknesses || '[]');
                        if (weaknesses.length > 0) {
                          return weaknesses.map((weakness: string, idx: number) => (
                            <li key={idx} className="flex items-center gap-2.5">
                              <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full flex-shrink-0" />
                              <span className="text-sm text-zinc-700">{weakness}</span>
                            </li>
                          ));
                        } else {
                          const dimensions = [
                            { name: '전술적 감각', score: result.styleProfile?.tacticalRating || 0 },
                            { name: '포지셔널 이해', score: result.styleProfile?.positionalRating || 0 },
                            { name: '공격성', score: result.styleProfile?.aggressionRating || 0 },
                            { name: '일관성', score: result.styleProfile?.consistency || 0 },
                          ];
                          return dimensions
                            .filter(d => d.score < 40)
                            .map((weakness, idx) => (
                              <li key={idx} className="flex items-center gap-2.5">
                                <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full flex-shrink-0" />
                                <span className="text-sm text-zinc-700">{weakness.name} ({weakness.score.toFixed(0)}점)</span>
                              </li>
                            ));
                        }
                      } catch {
                        return (
                          <li className="flex items-center gap-2.5 text-zinc-400 text-sm">
                            <div className="w-1.5 h-1.5 bg-zinc-200 rounded-full" />
                            개선점 분석 중...
                          </li>
                        );
                      }
                    })()}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tactical' && result?.tacticalOpportunities && (
          <div className="space-y-6">
            {/* Tactical Banner */}
            <div className="bg-zinc-950 text-white rounded-xl p-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-white/10 border border-white/20 rounded-lg flex items-center justify-center">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black">전술 패턴 분석</h2>
                  <p className="text-sm text-zinc-400">
                    {(() => {
                      try {
                        const tacticalStats = JSON.parse(result.styleProfile?.tacticalStats || '{}');
                        return `총 ${tacticalStats.total_tactical_opportunities || 0}개의 전술 기회 발견`;
                      } catch {
                        return '전술 분석 진행 중';
                      }
                    })()}
                  </p>
                </div>
              </div>
            </div>

            {/* Tactical Overview Statistics */}
            {result.tacticalOverview && (
              <div className="bg-white rounded-xl border border-zinc-200">
                <div className="px-6 py-4 border-b border-zinc-100">
                  <h3 className="text-base font-black text-zinc-950">전술 성과 요약</h3>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: '총 전술 기회', value: result.tacticalOverview.totalOpportunities },
                      { label: '찾은 전술', value: result.tacticalOverview.foundTactics },
                      { label: '놓친 전술', value: result.tacticalOverview.missedTactics },
                      { label: '전술 정확도', value: result.tacticalOverview.tacticalAccuracy },
                    ].map(({ label, value }) => (
                      <div key={label} className="text-center p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                        <div className="text-2xl font-black text-zinc-950">{value}</div>
                        <div className="text-xs text-zinc-400 mt-1">{label}</div>
                      </div>
                    ))}
                  </div>
                  {result.tacticalOverview.message && (
                    <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                      {result.tacticalOverview.message}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tactical Analysis */}
            {result.tacticalAnalysis && (
              <div className="bg-white rounded-xl border border-zinc-200">
                <div className="px-6 py-4 border-b border-zinc-100">
                  <h3 className="text-base font-black text-zinc-950">전술 기회 분석</h3>
                </div>
                <div className="p-6">
                  <div className="bg-zinc-50 border-l-4 border-zinc-900 p-4 rounded-r-lg">
                    <h4 className="text-sm font-black text-zinc-900 mb-1.5">전술적 기회 평가</h4>
                    <p className="text-sm text-zinc-600 leading-relaxed">{result.tacticalAnalysis}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Tactical Patterns Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {result.tacticalOpportunities.map((pattern, index) => (
                <div key={index} className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
                  <div className="bg-zinc-950 text-white px-5 py-3.5">
                    <h3 className="text-sm font-black capitalize">{pattern.pattern}</h3>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-3 gap-3 text-center mb-4">
                      <div>
                        <div className="text-xl font-black text-zinc-950">{pattern.found || 0}</div>
                        <div className="text-xs text-zinc-400 mt-0.5">찾은 기회</div>
                      </div>
                      <div>
                        <div className="text-xl font-black text-zinc-500">{pattern.missed || 0}</div>
                        <div className="text-xs text-zinc-400 mt-0.5">놓친 기회</div>
                      </div>
                      <div>
                        <div className="text-xl font-black text-zinc-950">{pattern.accuracy || (pattern.count ? '100%' : '0%')}</div>
                        <div className="text-xs text-zinc-400 mt-0.5">정확도</div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs font-semibold text-zinc-500">난이도</span>
                        <span className="text-xs font-black text-zinc-700">{pattern.averageDifficulty.toFixed(1)}/5.0</span>
                      </div>
                      <div className="w-full bg-zinc-100 rounded-full h-1.5">
                        <div
                          className="bg-zinc-800 h-1.5 rounded-full"
                          style={{ width: `${(pattern.averageDifficulty / 5.0) * 100}%` }}
                        />
                      </div>
                    </div>
                    {pattern.description && (
                      <div className="mt-3 p-3 bg-zinc-50 rounded-lg">
                        <p className="text-xs text-zinc-600 leading-relaxed">{pattern.description}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Tactical Stats Summary */}
            <div className="bg-white rounded-xl border border-zinc-200">
              <div className="px-6 py-4 border-b border-zinc-100">
                <h3 className="text-base font-black text-zinc-950">전술 통계 요약</h3>
              </div>
              <div className="p-6">
                {(() => {
                  try {
                    const tacticalStats = JSON.parse(result.styleProfile?.tacticalStats || '{}');
                    const totalOpportunities = tacticalStats.total_tactical_opportunities || tacticalStats.totalTacticalOpportunities || 0;
                    const tacticalAccuracy = totalOpportunities > 0
                      ? `${(((tacticalStats.tactical_accuracy ?? tacticalStats.tacticalAccuracy) || 0) * 100).toFixed(0)}%`
                      : '표본 부족';
                    const patternsFound = tacticalStats.patterns_found || tacticalStats.patternsFound || {};
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[
                          { value: totalOpportunities, label: '총 전술 기회' },
                          { value: tacticalAccuracy, label: '전술 정확도' },
                          { value: Object.keys(patternsFound).length, label: '발견된 패턴 종류' },
                        ].map(({ value, label }) => (
                          <div key={label} className="text-center p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                            <div className="text-2xl font-black text-zinc-950">{value}</div>
                            <div className="text-xs text-zinc-400 mt-1">{label}</div>
                          </div>
                        ))}
                      </div>
                    );
                  } catch {
                    return (
                      <div className="text-center text-zinc-400 text-sm py-4">
                        전술 통계 분석 중...
                      </div>
                    );
                  }
                })()}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'games' && games.length > 0 && (
          <div className="space-y-4">
            {/* Games Banner */}
            <div className="bg-zinc-950 text-white rounded-xl p-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-white/10 border border-white/20 rounded-lg flex items-center justify-center">
                  <PieChart className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black">게임별 상세 분석</h2>
                  <p className="text-sm text-zinc-400">{games.length}개 게임의 개별 성과 분석</p>
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              {games.map((game, index) => (
                <div key={index} className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-zinc-100 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="text-sm font-black text-zinc-900">
                        게임 #{game.gameIndex + 1}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {game.whitePlayer} vs {game.blackPlayer}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-black border ${
                        game.result === '1-0' ? 'bg-zinc-950 text-white border-zinc-950' :
                        game.result === '0-1' ? 'bg-white text-zinc-900 border-zinc-300' :
                        'bg-zinc-100 text-zinc-600 border-zinc-200'
                      }`}>
                        {game.result}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-black text-zinc-950">
                        {game.accuracy.toFixed(1)}%
                      </div>
                      <div className="text-xs text-zinc-400">정확도</div>
                    </div>
                  </div>
                  <div className="px-5 py-3.5">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <div className="text-xs font-semibold text-zinc-400 mb-0.5">오프닝</div>
                        <div className="text-sm font-bold text-zinc-800 truncate">{game.opening}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-zinc-400 mb-0.5">블런더</div>
                        <div className="text-sm font-black text-zinc-950">{game.blunders}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-zinc-400 mb-0.5">실수</div>
                        <div className="text-sm font-black text-zinc-700">{game.mistakes}</div>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-zinc-400 mb-0.5">부정확</div>
                        <div className="text-sm font-black text-zinc-500">{game.inaccuracies}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
