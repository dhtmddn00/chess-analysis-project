'use client';

import { useState } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import ChessAnalysisForm from '../components/ChessAnalysisForm';
import AnalysisProgress from '../components/AnalysisProgress';
import { Analysis } from '@/lib/api';

export default function Home() {
  const { t, toggleLanguage, language } = useTranslation();
  const [currentView, setCurrentView] = useState<'home' | 'form' | 'progress'>('home');
  const [currentAnalysis, setCurrentAnalysis] = useState<{
    id: string;
    username: string;
    gameCount: number;
  } | null>(null);

  const handleAnalysisStarted = (analysis: Analysis) => {
    setCurrentAnalysis({
      id: analysis.id,
      username: analysis.username,
      gameCount: analysis.gameCount
    });
    setCurrentView('progress');
  };

  const handleShowProgress = (analysisId: string, username: string, gameCount: number) => {
    setCurrentAnalysis({ id: analysisId, username, gameCount });
    setCurrentView('progress');
  };

  const handleBackToHome = () => {
    setCurrentView('home');
    setCurrentAnalysis(null);
  };

  const handleStartNewAnalysis = () => {
    setCurrentView('form');
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-md border-b border-gray-200 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-gradient-to-br from-amber-600 to-amber-800 rounded-lg flex items-center justify-center mr-3 shadow-md">
                <svg className="w-5 h-5 text-amber-100" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L13.5 6H16L14 8H10L8 6H10.5L12 2ZM5 20V18H19V20H5ZM6 16V14H18V16H6ZM7 12V10H17V12H7ZM8.5 8V6H15.5V8H8.5Z"/>
                </svg>
              </div>
              <span className="text-xl font-semibold text-gray-900">{t('chess.analysis')}</span>
            </div>
            <div className="flex items-center space-x-4">
              {currentView !== 'home' && (
                <button 
                  onClick={handleBackToHome}
                  className="apple-button-secondary apple-fade-in"
                >
                  <span className="mr-2">←</span>홈으로
                </button>
              )}
              <button 
                onClick={toggleLanguage}
                className="apple-button-secondary apple-fade-in" 
                title={t('switch.language')}
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                </svg>
                <span className="font-semibold">{t('language')}</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="pt-16">
        {currentView === 'home' && (
          <>
            {/* Hero Section */}
            <section className="pt-16 pb-20 px-4">
              <div className="max-w-4xl mx-auto text-center">
                <div className="mb-8">
                  <div className="w-20 h-20 mx-auto bg-gradient-to-br from-slate-800 via-slate-600 to-slate-400 rounded-3xl flex items-center justify-center shadow-xl border-2 border-amber-400">
                    <div className="relative">
                      <svg className="w-12 h-12 text-amber-100" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="4" y="4" width="16" height="16" fill="currentColor" opacity="0.2"/>
                        <rect x="4" y="4" width="4" height="4" fill="currentColor"/>
                        <rect x="12" y="4" width="4" height="4" fill="currentColor"/>
                        <rect x="8" y="8" width="4" height="4" fill="currentColor"/>
                        <rect x="16" y="8" width="4" height="4" fill="currentColor"/>
                        <rect x="4" y="12" width="4" height="4" fill="currentColor"/>
                        <rect x="12" y="12" width="4" height="4" fill="currentColor"/>
                        <rect x="8" y="16" width="4" height="4" fill="currentColor"/>
                        <rect x="16" y="16" width="4" height="4" fill="currentColor"/>
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-2xl text-amber-200">♔</span>
                      </div>
                    </div>
                  </div>
                </div>
                <h1 
                  className="text-5xl font-bold bg-gradient-to-r from-slate-800 to-amber-600 bg-clip-text text-transparent mb-6"
                  dangerouslySetInnerHTML={{ __html: t('hero.title') }}
                />
                <p className="text-xl text-gray-600 mb-12 max-w-2xl mx-auto">
                  {t('hero.subtitle')}
                </p>
                <div className="flex flex-col sm:flex-row justify-center gap-4">
                  <button 
                    onClick={() => window.location.href = '/analyze'}
                    className="px-8 py-4 bg-gradient-to-r from-slate-700 to-slate-800 text-white rounded-xl font-semibold hover:from-slate-800 hover:to-slate-900 transition-all shadow-lg transform hover:scale-105"
                  >
                    <span className="text-lg mr-2">♟️➜♕</span>
                    분석 시작하기
                  </button>
                  <button 
                    onClick={() => alert('자세한 기능 설명이 곧 추가될 예정입니다!')}
                    className="px-8 py-4 bg-white border-2 border-amber-500 text-slate-700 rounded-xl font-semibold hover:bg-amber-50 transition-colors shadow-lg transform hover:scale-105"
                  >
                    <span className="text-lg mr-2">♞</span>
                    자세히 알아보기
                  </button>
                </div>
              </div>
            </section>

            {/* Features Section */}
            <section className="py-20 bg-gradient-to-br from-slate-50 to-amber-50">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-16">
                  <h2 className="text-4xl font-bold text-slate-800 mb-4">
                    ♗ 체스 분석의 새로운 차원 ♗
                  </h2>
                  <p className="text-xl text-gray-600 max-w-3xl mx-auto">
                    프로 선수들이 사용하는 최첨단 분석 도구로 당신의 게임을 완전히 해부합니다
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                  <div className="bg-white rounded-2xl p-8 shadow-lg border-2 border-slate-200 hover:border-amber-400 transition-all">
                    <div className="w-16 h-16 bg-gradient-to-br from-slate-700 to-slate-900 rounded-xl flex items-center justify-center mx-auto mb-6">
                      <span className="text-3xl">🤖</span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-3">♜ Stockfish 엔진</h3>
                    <p className="text-gray-600">세계 챔피언도 인정한 최강 체스 AI가 모든 포지션을 정밀 분석합니다</p>
                  </div>

                  <div className="bg-white rounded-2xl p-8 shadow-lg border-2 border-slate-200 hover:border-amber-400 transition-all">
                    <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-amber-700 rounded-xl flex items-center justify-center mx-auto mb-6">
                      <span className="text-3xl">📊</span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-3">♝ 플레이 스타일 분석</h3>
                    <p className="text-gray-600">공격형? 수비형? 포지션형? 당신만의 체스 DNA를 발견하세요</p>
                  </div>

                  <div className="bg-white rounded-2xl p-8 shadow-lg border-2 border-slate-200 hover:border-amber-400 transition-all">
                    <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-red-700 rounded-xl flex items-center justify-center mx-auto mb-6">
                      <span className="text-3xl">🎯</span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-3">♞ 실수 패턴 발견</h3>
                    <p className="text-gray-600">블런더, 미스, 부정확한 수를 찾아내고 개선 방안을 제시합니다</p>
                  </div>

                  <div className="bg-white rounded-2xl p-8 shadow-lg border-2 border-slate-200 hover:border-amber-400 transition-all">
                    <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-700 rounded-xl flex items-center justify-center mx-auto mb-6">
                      <span className="text-3xl">📈</span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-3">♛ 실시간 진행 상황</h3>
                    <p className="text-gray-600">분석 과정을 실시간으로 확인하고 예상 시간을 제공합니다</p>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {currentView === 'form' && (
          <div className="pt-8 pb-20 px-4">
            <div className="max-w-2xl mx-auto">
              <div className="mb-6">
                <button
                  onClick={handleBackToHome}
                  className="inline-flex items-center px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-colors"
                >
                  <span className="mr-2">←</span>뒤로 가기
                </button>
              </div>
              <ChessAnalysisForm 
                onAnalysisStarted={handleAnalysisStarted}
                onShowProgress={handleShowProgress}
              />
            </div>
          </div>
        )}

        {currentView === 'progress' && currentAnalysis && (
          <div className="pt-8 pb-20 px-4">
            <div className="max-w-4xl mx-auto">
              <div className="mb-6">
                <button
                  onClick={handleBackToHome}
                  className="inline-flex items-center px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-medium hover:bg-slate-200 transition-colors"
                >
                  <span className="mr-2">←</span>새 분석하기
                </button>
              </div>
              <AnalysisProgress
                analysisId={currentAnalysis.id}
                username={currentAnalysis.username}
                gameCount={currentAnalysis.gameCount}
                onComplete={() => {
                  // Automatically navigate to results page when analysis is completed
                  window.location.href = `/analysis/${currentAnalysis.id}`;
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}