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
        
        // Load analysis details
        const analysisData = await analysisApi.getAnalysis(analysisId);
        setAnalysis(analysisData);

        // Load analysis result if completed
        if (analysisData.status === 'COMPLETED') {
          const resultData = await analysisApi.getAnalysisResult(analysisId);
          setResult(resultData);
          
          // Load games data
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

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 1: return 'bg-red-100 text-red-800 border-red-200';
      case 2: return 'bg-orange-100 text-orange-800 border-orange-200';
      case 3: return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50';
    if (score >= 60) return 'text-blue-600 bg-blue-50';
    if (score >= 40) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">분석 결과를 찾을 수 없습니다</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            홈으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => router.push('/')}
                className="flex items-center text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="h-5 w-5 mr-1" />
                돌아가기
              </button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  {analysis.username}의 고급 체스 분석
                </h1>
                <p className="text-sm text-gray-500">
                  {analysis.gameCount}게임 분석 완료 • {new Date(analysis.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center">
                <Download className="h-4 w-4 mr-2" />
                보고서 다운로드
              </button>
              <button className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 flex items-center">
                <Share2 className="h-4 w-4 mr-2" />
                공유하기
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Player Info Banner */}
      {result?.styleProfile?.metadata && (
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-3">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                  <User className="h-8 w-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">{analysis.username}</h2>
                  <div className="flex items-center space-x-4 text-blue-100">
                    {(() => {
                      try {
                        const metadata = JSON.parse(result.styleProfile.metadata);
                        return (
                          <>
                            <span className="flex items-center">
                              <Globe className="h-4 w-4 mr-1" />
                              {metadata.country || 'KR'}
                            </span>
                            {metadata.title && (
                              <span className="flex items-center">
                                <Crown className="h-4 w-4 mr-1" />
                                {metadata.title}
                              </span>
                            )}
                            <span className="flex items-center">
                              <Users className="h-4 w-4 mr-1" />
                              {metadata.followers || 0} 팔로워
                            </span>
                            {metadata.league && (
                              <span className="flex items-center">
                                <Trophy className="h-4 w-4 mr-1" />
                                {metadata.league}
                              </span>
                            )}
                          </>
                        );
                      } catch {
                        return (
                          <span className="flex items-center">
                            <Globe className="h-4 w-4 mr-1" />
                            Unknown
                          </span>
                        );
                      }
                    })()}
                  </div>
                </div>
              </div>
              
              {/* Ratings */}
              <div className="flex space-x-6 ml-auto">
                {(() => {
                  try {
                    const metadata = JSON.parse(result.styleProfile.metadata);
                    const ratings = metadata.ratings_by_timecontrol || {};
                    return (
                      <>
                        {ratings.chess_blitz && (
                          <div className="text-center">
                            <div className="text-2xl font-bold">{ratings.chess_blitz.rating}</div>
                            <div className="text-sm text-blue-200">Blitz</div>
                          </div>
                        )}
                        {ratings.chess_rapid && (
                          <div className="text-center">
                            <div className="text-2xl font-bold">{ratings.chess_rapid.rating}</div>
                            <div className="text-sm text-blue-200">Rapid</div>
                          </div>
                        )}
                        {ratings.chess_bullet && (
                          <div className="text-center">
                            <div className="text-2xl font-bold">{ratings.chess_bullet.rating}</div>
                            <div className="text-sm text-blue-200">Bullet</div>
                          </div>
                        )}
                      </>
                    );
                  } catch {
                    return (
                      <div className="text-center">
                        <div className="text-2xl font-bold">--</div>
                        <div className="text-sm text-blue-200">Rating</div>
                      </div>
                    );
                  }
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="border-b border-gray-200 bg-white">
          <nav className="flex space-x-8">
            {[
              { id: 'overview', label: '종합 분석', icon: BarChart3 },
              { id: 'style', label: '스타일 프로파일', icon: Brain },
              { id: 'tactical', label: '전술 분석', icon: Zap },
              { id: 'training', label: '100 Elo Up 플랜', icon: Target },
              { id: 'games', label: '게임별 분석', icon: PieChart }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="h-5 w-5 mr-2" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && result && (
          <div className="space-y-8">
            {/* Performance Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Trophy className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">평균 정확도</p>
                    <p className="text-2xl font-semibold text-gray-900">{result.averageAccuracy.toFixed(1)}%</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">평균 ACPL</p>
                    <p className="text-2xl font-semibold text-gray-900">{result.averageCentipawnLoss.toFixed(1)}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <AlertTriangle className="h-6 w-6 text-orange-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">총 실수</p>
                    <p className="text-2xl font-semibold text-gray-900">{result.totalBlunders + result.totalMistakes}</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Zap className="h-6 w-6 text-purple-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">전술 정확도</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      {result.tacticalOverview?.tacticalAccuracy || 
                       ((() => {
                         try {
                           const tacticalStats = JSON.parse(result.styleProfile?.tacticalStats || '{}');
                           const total = tacticalStats.total_tactical_opportunities || 0;
                           return total > 0 ? `${((tacticalStats.tactical_accuracy || 0) * 100).toFixed(1)}%` : '표본 부족';
                         } catch {
                           return '표본 부족';
                         }
                       })())
                      }
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed Explanations */}
            {result.explanations && (
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">분석 결과 해석</h3>
                  <p className="text-sm text-gray-600">당신의 게임을 상세히 분석한 결과입니다</p>
                </div>
                <div className="p-6 space-y-6">
                  <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
                    <h4 className="text-lg font-semibold text-blue-900 mb-2">🎯 정확도 분석</h4>
                    <p className="text-blue-800 leading-relaxed">{result.explanations.accuracyExplanation}</p>
                  </div>
                  
                  <div className="bg-green-50 border-l-4 border-green-400 p-4">
                    <h4 className="text-lg font-semibold text-green-900 mb-2">📊 센티폰 손실 분석</h4>
                    <p className="text-green-800 leading-relaxed">{result.explanations.acplExplanation}</p>
                  </div>
                  
                  <div className="bg-orange-50 border-l-4 border-orange-400 p-4">
                    <h4 className="text-lg font-semibold text-orange-900 mb-2">⚠️ 실수 패턴 분석</h4>
                    <p className="text-orange-800 leading-relaxed">{result.explanations.errorAnalysis}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Style Profile Overview */}
            {result.styleProfile && (
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">스타일 분석 요약</h3>
                  <p className="text-sm text-gray-600">플레이 스타일: {result.styleProfile?.playingStyle}</p>
                </div>
                <div className="p-6">
                  {/* Overall Style Analysis */}
                  {result.styleProfile.dimensionExplanations?.overallStyleAnalysis && (
                    <div className="bg-purple-50 border-l-4 border-purple-400 p-4 mb-6">
                      <h4 className="text-lg font-semibold text-purple-900 mb-2">🎨 당신의 체스 스타일</h4>
                      <p className="text-purple-800 leading-relaxed">{result.styleProfile.dimensionExplanations.overallStyleAnalysis}</p>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {getStyleDimensions(result.styleProfile).map((dimension, index) => (
                      <div key={index} className="flex items-center space-x-3">
                        <div className={`p-2 rounded-lg ${getScoreColor(dimension.score)}`}>
                          <dimension.icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-medium text-gray-900">{dimension.name}</span>
                            <span className="text-sm font-semibold text-gray-700">{dimension.score.toFixed(0)}</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all duration-300 ${
                                dimension.score >= 80 ? 'bg-green-500' :
                                dimension.score >= 60 ? 'bg-blue-500' :
                                dimension.score >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                              }`}
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
            <div className="bg-gradient-to-r from-green-500 to-blue-600 text-white rounded-lg p-6">
              <div className="flex items-center space-x-3">
                <Target className="h-8 w-8" />
                <div>
                  <h2 className="text-2xl font-bold">100 Elo Up 개인 맞춤 훈련 플랜</h2>
                  <p className="text-green-100">데이터 기반 과학적 분석으로 체계적인 실력 향상을 지원합니다</p>
                </div>
              </div>
            </div>

            {result.trainingRecommendations && result.trainingRecommendations.length > 0 ? (
              <div className="grid gap-6">
                {result.trainingRecommendations.map((rec, index) => (
                  <div key={index} className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityColor(rec.priority)}`}>
                            {rec.priority === 1 ? '긴급' : rec.priority === 2 ? '높음' : '보통'}
                          </span>
                          <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                            {rec.category}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 text-green-600">
                          <TrendingUp className="h-4 w-4" />
                          <span className="font-semibold">+{rec.eloGain} Elo</span>
                        </div>
                      </div>
                      
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">{rec.title}</h3>
                      <p className="text-gray-600 mb-4">{rec.description}</p>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <span className="flex items-center">
                            <Clock className="h-4 w-4 mr-1" />
                            예상 기간: 2-4주
                          </span>
                          <span className="flex items-center">
                            <BookOpen className="h-4 w-4 mr-1" />
                            난이도: 중급
                          </span>
                        </div>
                        <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm flex items-center">
                          세부 계획 보기
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow p-6 text-center">
                <Target className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">훈련 계획 생성 중</h3>
                <p className="text-gray-600">개인 맞춤 훈련 계획이 준비되는 중입니다.</p>
              </div>
            )}

            {/* Dynamic Study Plan based on actual weaknesses */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">개인별 학습 계획</h3>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">우선 개선 영역</h4>
                    <ul className="space-y-2 text-sm text-gray-600">
                      {(() => {
                        try {
                          const weaknesses = JSON.parse(result.styleProfile?.weaknesses || '[]');
                          if (weaknesses.length > 0) {
                            return weaknesses.slice(0, 3).map((weakness: string, idx: number) => (
                              <li key={idx} className="flex items-center">
                                <AlertTriangle className="h-4 w-4 text-orange-500 mr-2" />
                                {weakness} 개선 훈련
                              </li>
                            ));
                          } else {
                            // Get low-scoring dimensions as weaknesses
                            const dimensions = [
                              { name: '전술적 감각', score: result.styleProfile?.tacticalRating || 0 },
                              { name: '포지셔널 이해', score: result.styleProfile?.positionalRating || 0 },
                              { name: '일관성', score: result.styleProfile?.consistency || 0 },
                            ];
                            return dimensions
                              .filter(d => d.score < 40)
                              .slice(0, 3)
                              .map((weakness, idx) => (
                                <li key={idx} className="flex items-center">
                                  <AlertTriangle className="h-4 w-4 text-orange-500 mr-2" />
                                  {weakness.name} 향상 훈련
                                </li>
                              ));
                          }
                        } catch {
                          return (
                            <li className="flex items-center">
                              <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                              개인별 맞춤 분석 준비 중
                            </li>
                          );
                        }
                      })()}
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">강점 활용</h4>
                    <ul className="space-y-2 text-sm text-gray-600">
                      {(() => {
                        try {
                          const strengths = JSON.parse(result.styleProfile?.strengths || '[]');
                          if (strengths.length > 0) {
                            return strengths.slice(0, 3).map((strength: string, idx: number) => (
                              <li key={idx} className="flex items-center">
                                <Star className="h-4 w-4 text-yellow-500 mr-2" />
                                {strength} 더욱 발전시키기
                              </li>
                            ));
                          } else {
                            // Get high-scoring dimensions as strengths
                            const dimensions = [
                              { name: '오프닝 다양성', score: result.styleProfile?.openingVariety || 0 },
                              { name: '엔드게임 기술', score: result.styleProfile?.endgameRating || 0 },
                              { name: '역전 저항력', score: result.styleProfile?.swindleResistance || 0 },
                            ];
                            return dimensions
                              .filter(d => d.score >= 60)
                              .slice(0, 3)
                              .map((strength, idx) => (
                                <li key={idx} className="flex items-center">
                                  <Star className="h-4 w-4 text-yellow-500 mr-2" />
                                  {strength.name} 더욱 발전시키기
                                </li>
                              ));
                          }
                        } catch {
                          return (
                            <li className="flex items-center">
                              <Star className="h-4 w-4 text-yellow-500 mr-2" />
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
          <div className="space-y-8">
            {/* Playing Style Summary */}
            <div className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg p-6">
              <div className="flex items-center space-x-3">
                <Brain className="h-8 w-8" />
                <div>
                  <h2 className="text-2xl font-bold">{result.styleProfile?.playingStyle}</h2>
                  <p className="text-purple-100">12차원 스타일 벡터 분석 결과</p>
                </div>
              </div>
            </div>

            {/* 12-Dimensional Style Analysis */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">12차원 스타일 분석</h3>
                <p className="text-sm text-gray-600">각 차원별 점수와 코호트 내 백분위</p>
              </div>
              <div className="p-6">
                <div className="space-y-6">
                  {/* Dimension-specific explanations */}
                  {result.styleProfile.dimensionExplanations && (
                    <div className="space-y-4">
                      <div className="bg-indigo-50 border-l-4 border-indigo-400 p-4">
                        <h4 className="text-lg font-semibold text-indigo-900 mb-2">⚡ 전술적 감각</h4>
                        <p className="text-indigo-800">{result.styleProfile.dimensionExplanations.tacticalExplanation}</p>
                      </div>
                      
                      <div className="bg-teal-50 border-l-4 border-teal-400 p-4">
                        <h4 className="text-lg font-semibold text-teal-900 mb-2">🧠 포지셔널 이해</h4>
                        <p className="text-teal-800">{result.styleProfile.dimensionExplanations.positionalExplanation}</p>
                      </div>
                      
                      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                        <h4 className="text-lg font-semibold text-yellow-900 mb-2">👑 엔드게임 기술</h4>
                        <p className="text-yellow-800">{result.styleProfile.dimensionExplanations.endgameExplanation}</p>
                      </div>
                      
                      <div className="bg-red-50 border-l-4 border-red-400 p-4">
                        <h4 className="text-lg font-semibold text-red-900 mb-2">⏰ 시간 관리</h4>
                        <p className="text-red-800">{result.styleProfile.dimensionExplanations.timeManagementExplanation}</p>
                      </div>
                      
                      <div className="bg-orange-50 border-l-4 border-orange-400 p-4">
                        <h4 className="text-lg font-semibold text-orange-900 mb-2">🎯 공격성</h4>
                        <p className="text-orange-800">{result.styleProfile.dimensionExplanations.aggressionExplanation}</p>
                      </div>
                      
                      <div className="bg-green-50 border-l-4 border-green-400 p-4">
                        <h4 className="text-lg font-semibold text-green-900 mb-2">📈 일관성</h4>
                        <p className="text-green-800">{result.styleProfile.dimensionExplanations.consistencyExplanation}</p>
                      </div>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {getStyleDimensions(result.styleProfile).map((dimension, index) => (
                      <div key={index} className="space-y-3">
                        <div className="flex items-center space-x-3">
                          <div className={`p-2 rounded-lg ${getScoreColor(dimension.score)}`}>
                            <dimension.icon className="h-5 w-5" />
                          </div>
                          <div className="flex-1">
                            <div className="flex justify-between items-center mb-1">
                              <span className="font-medium text-gray-900">{dimension.name}</span>
                              <div className="flex items-center space-x-2">
                                <span className="font-semibold text-gray-700">{dimension.score.toFixed(0)}</span>
                                {dimension.percentile && (
                                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                                    상위 {(100 - dimension.percentile).toFixed(0)}%
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-3 relative">
                              <div
                                className={`h-3 rounded-full transition-all duration-500 ${
                                  dimension.score >= 80 ? 'bg-green-500' :
                                  dimension.score >= 60 ? 'bg-blue-500' :
                                  dimension.score >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${dimension.score}%` }}
                              />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">{dimension.description}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Strengths and Weaknesses */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-green-800 flex items-center">
                    <CheckCircle className="h-5 w-5 mr-2" />
                    주요 강점
                  </h3>
                </div>
                <div className="p-6">
                  <ul className="space-y-3">
                    {(() => {
                      try {
                        const strengths = JSON.parse(result.styleProfile?.strengths || '[]');
                        if (strengths.length > 0) {
                          return strengths.map((strength: string, idx: number) => (
                            <li key={idx} className="flex items-center space-x-3">
                              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                              <span className="text-gray-700">{strength}</span>
                            </li>
                          ));
                        } else {
                          // Show high-scoring dimensions as strengths
                          const dimensions = [
                            { name: '오프닝 다양성', score: result.styleProfile?.openingVariety || 0 },
                            { name: '엔드게임 기술', score: result.styleProfile?.endgameRating || 0 },
                            { name: '역전 저항력', score: result.styleProfile?.swindleResistance || 0 },
                            { name: '교환 선호도', score: result.styleProfile?.exchangePreference || 0 },
                          ];
                          return dimensions
                            .filter(d => d.score >= 60)
                            .map((strength, idx) => (
                              <li key={idx} className="flex items-center space-x-3">
                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                <span className="text-gray-700">{strength.name} ({strength.score.toFixed(0)}점)</span>
                              </li>
                            ));
                        }
                      } catch {
                        return (
                          <li className="flex items-center space-x-3 text-gray-500">
                            <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                            <span>강점 분석 중...</span>
                          </li>
                        );
                      }
                    })()}
                  </ul>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-orange-800 flex items-center">
                    <AlertTriangle className="h-5 w-5 mr-2" />
                    개선 영역
                  </h3>
                </div>
                <div className="p-6">
                  <ul className="space-y-3">
                    {(() => {
                      try {
                        const weaknesses = JSON.parse(result.styleProfile?.weaknesses || '[]');
                        if (weaknesses.length > 0) {
                          return weaknesses.map((weakness: string, idx: number) => (
                            <li key={idx} className="flex items-center space-x-3">
                              <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                              <span className="text-gray-700">{weakness}</span>
                            </li>
                          ));
                        } else {
                          // Show low-scoring dimensions as weaknesses
                          const dimensions = [
                            { name: '전술적 감각', score: result.styleProfile?.tacticalRating || 0 },
                            { name: '포지셔널 이해', score: result.styleProfile?.positionalRating || 0 },
                            { name: '공격성', score: result.styleProfile?.aggressionRating || 0 },
                            { name: '일관성', score: result.styleProfile?.consistency || 0 },
                          ];
                          return dimensions
                            .filter(d => d.score < 40)
                            .map((weakness, idx) => (
                              <li key={idx} className="flex items-center space-x-3">
                                <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                                <span className="text-gray-700">{weakness.name} ({weakness.score.toFixed(0)}점)</span>
                              </li>
                            ));
                        }
                      } catch {
                        return (
                          <li className="flex items-center space-x-3 text-gray-500">
                            <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                            <span>개선점 분석 중...</span>
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
          <div className="space-y-8">
            {/* Tactical Overview */}
            <div className="bg-gradient-to-r from-yellow-500 to-orange-600 text-white rounded-lg p-6">
              <div className="flex items-center space-x-3">
                <Zap className="h-8 w-8" />
                <div>
                  <h2 className="text-2xl font-bold">전술 패턴 분석</h2>
                  <p className="text-yellow-100">
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
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">전술 성과 요약</h3>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-blue-600">
                        {result.tacticalOverview.totalOpportunities}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">총 전술 기회</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-green-600">
                        {result.tacticalOverview.foundTactics}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">찾은 전술</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-red-600">
                        {result.tacticalOverview.missedTactics}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">놓친 전술</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-purple-600">
                        {result.tacticalOverview.tacticalAccuracy}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">전술 정확도</div>
                    </div>
                  </div>
                  {result.tacticalOverview.message && (
                    <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                      {result.tacticalOverview.message}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tactical Analysis */}
            {result.tacticalAnalysis && (
              <div className="bg-white rounded-lg shadow">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">전술 기회 분석</h3>
                </div>
                <div className="p-6">
                  <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                    <h4 className="text-lg font-semibold text-yellow-900 mb-2">⚡ 전술적 기회 평가</h4>
                    <p className="text-yellow-800 leading-relaxed">{result.tacticalAnalysis}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Tactical Patterns Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {result.tacticalOpportunities.map((pattern, index) => (
                <div key={index} className="bg-white rounded-lg shadow overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-4">
                    <h3 className="text-lg font-semibold capitalize">{pattern.pattern}</h3>
                  </div>
                  <div className="p-6">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-green-600">{pattern.found || 0}</div>
                        <div className="text-sm text-gray-600">찾은 기회</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-red-600">{pattern.missed || 0}</div>
                        <div className="text-sm text-gray-600">놓친 기회</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-blue-600">{pattern.accuracy || (pattern.count ? '100%' : '0%')}</div>
                        <div className="text-sm text-gray-600">정확도</div>
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-gray-700">난이도</span>
                        <span className="text-sm font-semibold">{pattern.averageDifficulty.toFixed(1)}/5.0</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-green-400 to-red-500 h-2 rounded-full"
                          style={{ width: `${(pattern.averageDifficulty / 5.0) * 100}%` }}
                        />
                      </div>
                    </div>
                    {/* Pattern Description */}
                    {pattern.description && (
                      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-700 leading-relaxed">{pattern.description}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Tactical Stats Summary */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">전술 통계 요약</h3>
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
                        <div className="text-center">
                          <div className="text-3xl font-bold text-purple-600">
                            {totalOpportunities}
                          </div>
                          <div className="text-sm text-gray-600">총 전술 기회</div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-blue-600">
                            {tacticalAccuracy}
                          </div>
                          <div className="text-sm text-gray-600">전술 정확도</div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-green-600">
                            {Object.keys(patternsFound).length}
                          </div>
                          <div className="text-sm text-gray-600">발견된 패턴 종류</div>
                        </div>
                      </div>
                    );
                  } catch {
                    return (
                      <div className="text-center text-gray-500">
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
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg p-6">
              <div className="flex items-center space-x-3">
                <PieChart className="h-8 w-8" />
                <div>
                  <h2 className="text-2xl font-bold">게임별 상세 분석</h2>
                  <p className="text-indigo-100">{games.length}개 게임의 개별 성과 분석</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              {games.map((game, index) => (
                <div key={index} className="bg-white rounded-lg shadow overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <span className="text-lg font-semibold text-gray-900">
                        게임 #{game.gameIndex + 1}
                      </span>
                      <span className="text-sm text-gray-600">
                        {game.whitePlayer} vs {game.blackPlayer}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        game.result === '1-0' ? 'bg-green-100 text-green-800' :
                        game.result === '0-1' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {game.result}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-blue-600">
                        {game.accuracy.toFixed(1)}%
                      </div>
                      <div className="text-sm text-gray-500">정확도</div>
                    </div>
                  </div>
                  <div className="px-6 py-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <div className="text-sm font-medium text-gray-500">오프닝</div>
                        <div className="text-lg font-medium">{game.opening}</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-red-500">블런더</div>
                        <div className="text-lg font-medium">{game.blunders}</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-orange-500">실수</div>
                        <div className="text-lg font-medium">{game.mistakes}</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-yellow-500">부정확</div>
                        <div className="text-lg font-medium">{game.inaccuracies}</div>
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
