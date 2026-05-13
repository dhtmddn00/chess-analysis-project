'use client';

import { useState, useEffect } from 'react';

type Language = 'ko' | 'en';

const translations = {
  ko: {
    // Navigation
    'language': '한국어',
    'switch.language': '영어로 변경',
    
    // Header
    'chess.analysis': '♔ Chess Analysis',
    'powered.by.stockfish': '체스 실력 향상을 위한 AI 기반 게임 분석 서비스',
    'hero.title': '♛ 당신의 체스 실력을<br/>그랜드마스터 수준으로 ♛',
    'hero.subtitle': '🏆 세계 최강 Stockfish 엔진으로 모든 수를 완벽 분석하고 실력 향상의 지름길을 찾아드립니다.',
    'get.started': '분석 시작하기',
    'learn.more': '자세히 알아보기',
    
    // Features
    'features.title': '♗ 체스 분석의 새로운 차원 ♗',
    'features.subtitle': '프로 선수들이 사용하는 최첨단 분석 도구로 당신의 게임을 완전히 해부합니다',
    
    // System Status
    'system.status.title': '⚡ 시스템 상태 ⚡',
    'system.status.desc': '모든 시스템이 최적의 성능으로 가동 중입니다',
    'spring.boot.status': 'Port 8080 ✅ 완벽 가동',
    'nextjs.status': 'Port 3000 ✅ 완벽 가동',
    'architecture.complete': '🏁 원래 아키텍처대로 성공적으로 구성완료! 이제 체스 분석을 시작하세요! 🏁',
    
    // Analysis Form
    'analysis.form.title': '♔ 체스 게임 분석 시작',
    'analysis.form.desc': 'Chess.com 계정의 게임을 분석해드립니다',
    'username.tip': '💡 팁: 동일한 사용자의 분석이 이미 진행 중인 경우, 기존 분석 상태를 확인할 수 있습니다.',
    'platform.label': '♝ 플랫폼 선택',
    'game.count.label': '♜ 분석할 게임 수',
    'game.count.10': '10게임 (빠른 분석)',
    'game.count.25': '25게임 (균형 분석)', 
    'game.count.50': '50게임 (심층 분석)',
    'estimated.time': '예상 분석 시간: 3-8분',
    'stockfish.analysis.desc': 'Stockfish 엔진이 모든 수를 정밀 분석합니다',
    'back.button': '← 돌아가기',
    'start.analysis.button': '🚀 분석 시작',
    'lichess.coming.soon': 'Lichess (곧 지원예정)',
    
    // Analysis Results
    'analysis.complete': '🎉 분석 완료!',
    'analysis.started.desc': '체스 게임 분석이 성공적으로 시작되었습니다',
    'new.analysis.button': '← 새 분석 시작',
    'analysis.info': '📊 분석 정보',
    'progress.status': '⚡진행 상태',
    'username.label': '사용자',
    'platform.result': '플랫폼',
    'game.count.result': '게임 수',
    'analysis.id': '분석 ID',
    'status.label': '상태',
    'status.pending': '대기중',
    'status.in.progress': '분석중',
    'status.completed': '완료',
    'status.error': '오류',
    'share.link': '🔗 공유 링크',
    'copy.button': '복사',
    'copy.success': '링크가 복사되었습니다!',
    'share.desc': '이 링크를 통해 분석 결과를 다른 사람과 공유할 수 있습니다',
    'analysis.wait.desc': '분석이 완료되면 상세한 결과를 확인할 수 있습니다. 보통 3-8분 정도 소요됩니다.',
    'refresh.button': '🔄 새로고침',
    
    'feature.engine.title': '강력한 Stockfish 엔진',
    'feature.engine.desc': '세계 최고 수준의 체스 엔진을 사용하여 모든 수를 정밀하게 분석합니다.',
    
    'feature.insights.title': '맞춤형 인사이트',
    'feature.insights.desc': '당신만의 플레이 스타일을 분석하고 개선점을 구체적으로 제시합니다.',
    
    'feature.reports.title': '상세한 분석 리포트',
    'feature.reports.desc': '게임별 상세 분석부터 전반적인 실력 평가까지 종합적인 리포트를 제공합니다.',
    
    'feature.tracking.title': '진행 상황 추적',
    'feature.tracking.desc': '시간이 지남에 따른 실력 변화를 시각적으로 확인하고 성장을 실감하세요.',
    
    // How it works
    'how.it.works': '어떻게 작동하나요?',
    'how.it.works.subtitle': '간단한 3단계로 전문가 수준의 체스 분석을 받아보세요.',
    
    'step.1.title': 'Chess.com 계정 연결',
    'step.1.desc': 'Chess.com 사용자명만 입력하면 자동으로 최근 게임 데이터를 가져옵니다.',
    
    'step.2.title': 'AI 분석 진행',
    'step.2.desc': 'Stockfish 엔진이 각 수를 정밀하게 분석하고 최적의 대안을 찾아냅니다.',
    
    'step.3.title': '맞춤형 리포트 제공',
    'step.3.desc': '개인화된 분석 결과와 구체적인 개선 방안을 상세한 리포트로 제공합니다.',
    
    // Form
    'start.analysis': '분석 시작하기',
    'chess.com.username': 'Chess.com 사용자명',
    'enter.username': '사용자명을 입력하세요',
    'platform': '플랫폼',
    'games.to.analyze': '분석할 게임 수',
    'quick': '빠른 분석',
    'balanced': '균형 분석',
    'deep': '심층 분석',
    'minutes': '분',
    'username.required': '사용자명은 필수입니다',
    'game.count.range': '게임 수는 5~50 사이여야 합니다',
    'analyzing': '분석 중...',
    'analysis.started': '분석이 성공적으로 시작되었습니다!',
    'analysis.for.user': '님의 분석이 성공적으로 대기열에 등록되었습니다.',
    'analysis.failed': '분석 실패',
    'analysis.in.progress': '이미 진행 중인 분석이 있습니다. 완료를 기다려주세요.',
    'invalid.request': '잘못된 요청입니다. 입력값을 확인해주세요.',
    'analysis.failed.retry': '분석 시작에 실패했습니다. 다시 시도해주세요.',
    'clean.analysis.info': '전문가 수준의 Stockfish 분석 • 12차원 스타일 평가 • 맞춤형 개선 방안',
    'analysis.time.info': '분석 시간 2-8분 • 세계 최고 수준의 체스 엔진 활용',
    
    // Why choose us
    'why.choose.title': '다른 분석 도구와 무엇이 다른가요?',
    'trusted.by': '전 세계 체스 플레이어들이 신뢰하는 서비스',
    'accurate.analysis': '정확한 분석',
    'detailed.reports': '상세한 리포트',
    'easy.to.use': '사용하기 쉬운 인터페이스',
    
    // Results
    'new.analysis': '새 분석',
    'analysis.results': '분석 결과',
    'clean.insights.recommendations': '맞춤형 인사이트와 개선 방안',
    'analysis.in.progress.status': '분석 진행 중',
    'progress': '진행률',
    'status': '상태',
    'collecting.games': '게임 수집',
    'stockfish.analysis': 'Stockfish 분석',
    'style.profiling': '스타일 프로파일링',
    'generating.results': '결과 생성',
    'games': '게임',
    'moves': '수',
    'time': '시간',
    'avg.acpl': '평균 acpl',
    'win.rate': '승률',
    'analysis.time': '분석 시간',
    'playing.style': '플레이 스타일',
    'insights': '인사이트',
    'tips': '개선 팁',
    
    // Footer
    'simple.clean.effective': '간단하고, 정확하고, 효과적',
    'fast.analysis': '빠른 분석',
    'clean.results': '명확한 결과',
    
    // Status
    'completed': '완료',
    'failed': '실패',
    'cancelled': '취소',
    'pending': '대기 중',
    'queued': '대기열',
    'in.progress': '진행 중',
    'processing': '처리 중',
    'loading.analysis': '분석을 불러오는 중...',
    'try.again': '다시 시도'
  },
  en: {
    // Navigation
    'language': 'English',
    'switch.language': 'Switch to Korean',
    
    // Header
    'chess.analysis': '♔ Chess Analysis',
    'powered.by.stockfish': 'AI-powered chess game analysis for skill improvement',
    'hero.title': '♛ Elevate Your Chess Skills<br/>to Grandmaster Level ♛',
    'hero.subtitle': '🏆 Perfect analysis of every move with the world\'s strongest Stockfish engine to find your path to improvement.',
    'get.started': 'Start Analysis',
    'learn.more': 'Learn More',
    
    // Features
    'features.title': '♗ A New Dimension of Chess Analysis ♗',
    'features.subtitle': 'Completely dissect your games with cutting-edge analysis tools used by professional players',
    
    // System Status
    'system.status.title': '⚡ System Status ⚡',
    'system.status.desc': 'All systems are running at optimal performance',
    'spring.boot.status': 'Port 8080 ✅ Fully Operational',
    'nextjs.status': 'Port 3000 ✅ Fully Operational',
    'architecture.complete': '🏁 Successfully configured according to original architecture! Start your chess analysis now! 🏁',
    
    // Analysis Form
    'analysis.form.title': '♔ Start Chess Game Analysis',
    'analysis.form.desc': 'We\'ll analyze games from your Chess.com account',
    'username.tip': '💡 Tip: If analysis is already in progress for the same user, you can check the existing analysis status.',
    'platform.label': '♝ Platform Selection',
    'game.count.label': '♜ Number of Games to Analyze',
    'game.count.10': '10 games (Quick Analysis)',
    'game.count.25': '25 games (Balanced Analysis)',
    'game.count.50': '50 games (Deep Analysis)',
    'estimated.time': 'Estimated Analysis Time: 3-8 minutes',
    'stockfish.analysis.desc': 'Stockfish engine will precisely analyze every move',
    'back.button': '← Go Back',
    'lichess.coming.soon': 'Lichess (Coming Soon)',
    
    // Analysis Results
    'analysis.complete': '🎉 Analysis Complete!',
    'analysis.started.desc': 'Chess game analysis has been successfully started',
    'new.analysis.button': '← Start New Analysis',
    'analysis.info': '📊 Analysis Information',
    'progress.status': '⚡ Progress Status',
    'username.label': 'User',
    'platform.result': 'Platform',
    'game.count.result': 'Game Count',
    'analysis.id': 'Analysis ID',
    'status.label': 'Status',
    'status.pending': 'Pending',
    'status.in.progress': 'In Progress',
    'status.completed': 'Completed',
    'status.error': 'Error',
    'share.link': '🔗 Share Link',
    'copy.button': 'Copy',
    'copy.success': 'Link copied to clipboard!',
    'share.desc': 'You can share analysis results with others using this link',
    'analysis.wait.desc': 'You can view detailed results once the analysis is complete. Usually takes 3-8 minutes.',
    'refresh.button': '🔄 Refresh',
    
    'feature.engine.title': 'Powerful Stockfish Engine',
    'feature.engine.desc': 'Precisely analyze every move using the world\'s strongest chess engine.',
    
    'feature.insights.title': 'Personalized Insights',
    'feature.insights.desc': 'Analyze your unique playing style and receive specific improvement suggestions.',
    
    'feature.reports.title': 'Detailed Analysis Reports',
    'feature.reports.desc': 'Get comprehensive reports from individual game analysis to overall skill assessment.',
    
    'feature.tracking.title': 'Progress Tracking',
    'feature.tracking.desc': 'Visualize your skill improvement over time and see your growth.',
    
    // How it works
    'how.it.works': 'How does it work?',
    'how.it.works.subtitle': 'Get expert-level chess analysis in 3 simple steps.',
    
    'step.1.title': 'Connect Chess.com Account',
    'step.1.desc': 'Simply enter your Chess.com username to automatically fetch your recent game data.',
    
    'step.2.title': 'AI Analysis in Progress',
    'step.2.desc': 'The Stockfish engine precisely analyzes each move and finds optimal alternatives.',
    
    'step.3.title': 'Personalized Report Delivery',
    'step.3.desc': 'Receive detailed personalized analysis results and specific improvement recommendations.',
    
    // Form
    'start.analysis': 'Start Analysis',
    'chess.com.username': 'Chess.com Username',
    'enter.username': 'Enter your username',
    'platform': 'Platform',
    'games.to.analyze': 'Games to Analyze',
    'quick': 'Quick Analysis',
    'balanced': 'Balanced Analysis',
    'deep': 'Deep Analysis',
    'minutes': 'minutes',
    'username.required': 'Username is required',
    'game.count.range': 'Game count must be between 5 and 50',
    'analyzing': 'Analyzing...',
    'analysis.started': 'Analysis started successfully!',
    'analysis.for.user': 'Analysis for {username} has been queued successfully.',
    'analysis.failed': 'Analysis Failed',
    'analysis.in.progress': 'You already have an analysis in progress. Please wait for it to complete.',
    'invalid.request': 'Invalid request. Please check your input values.',
    'analysis.failed.retry': 'Failed to start analysis. Please try again.',
    'clean.analysis.info': 'Expert-level Stockfish analysis • 12-dimensional style evaluation • Personalized improvement plans',
    'analysis.time.info': 'Analysis takes 2-8 minutes • Powered by world-class chess engine',
    
    // Why choose us
    'why.choose.title': 'What makes us different from other analysis tools?',
    'trusted.by': 'Trusted by chess players worldwide',
    'accurate.analysis': 'Accurate Analysis',
    'detailed.reports': 'Detailed Reports',
    'easy.to.use': 'Easy-to-use Interface',
    
    // Results
    'new.analysis': 'New Analysis',
    'analysis.results': 'Analysis Results',
    'clean.insights.recommendations': 'Personalized insights and improvement suggestions',
    'analysis.in.progress.status': 'Analysis in Progress',
    'progress': 'Progress',
    'status': 'Status',
    'collecting.games': 'Collecting Games',
    'stockfish.analysis': 'Stockfish Analysis',
    'style.profiling': 'Style Profiling',
    'generating.results': 'Generating Results',
    'games': 'games',
    'moves': 'moves',
    'time': 'time',
    'avg.acpl': 'avg acpl',
    'win.rate': 'win rate',
    'analysis.time': 'analysis time',
    'playing.style': 'Playing Style',
    'insights': 'Insights',
    'tips': 'Improvement Tips',
    
    // Footer
    'simple.clean.effective': 'Simple, accurate, effective',
    'fast.analysis': 'Fast Analysis',
    'clean.results': 'Clear Results',
    
    // Status
    'completed': 'Completed',
    'failed': 'Failed',
    'cancelled': 'Cancelled',
    'pending': 'Pending',
    'queued': 'Queued',
    'in.progress': 'In Progress',
    'processing': 'Processing',
    'loading.analysis': 'Loading analysis...',
    'try.again': 'Try again'
  }
};

export function useTranslation() {
  const [language, setLanguage] = useState<Language>('ko');
  
  useEffect(() => {
    // 클라이언트 사이드에서만 실행
    if (typeof window !== 'undefined') {
      // 로컬 스토리지에서 저장된 언어 설정 확인
      const savedLanguage = localStorage.getItem('chess-analysis-language') as Language;
      if (savedLanguage && (savedLanguage === 'ko' || savedLanguage === 'en')) {
        setLanguage(savedLanguage);
      } else {
        // 브라우저 언어 감지
        const browserLang = navigator.language.toLowerCase();
        const defaultLang = browserLang.startsWith('en') ? 'en' : 'ko';
        setLanguage(defaultLang);
        localStorage.setItem('chess-analysis-language', defaultLang);
      }
    }
  }, []);
  
  const t = (key: keyof typeof translations.ko, params?: Record<string, string>) => {
    const currentTranslations = translations[language] as Partial<Record<keyof typeof translations.ko, string>>;
    let text = currentTranslations[key] ?? translations.ko[key] ?? key;
    
    // 파라미터 치환
    if (params) {
      Object.entries(params).forEach(([param, value]) => {
        text = text.replace(`{${param}}`, value);
      });
    }
    
    return text;
  };
  
  const toggleLanguage = () => {
    setLanguage(prev => {
      const newLang = prev === 'ko' ? 'en' : 'ko';
      if (typeof window !== 'undefined') {
        localStorage.setItem('chess-analysis-language', newLang);
      }
      return newLang;
    });
  };
  
  return { t, language, toggleLanguage };
}
