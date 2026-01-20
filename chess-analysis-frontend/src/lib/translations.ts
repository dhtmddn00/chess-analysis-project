export const translations = {
  ko: {
    // Navigation
    language: '한국어',
    switchToEnglish: '영어로 변경',
    
    // Hero Section
    heroTitle: '♛ 당신의 체스 실력을<br/>그랜드마스터 수준으로 ♛',
    heroSubtitle: '🏆 세계 최강 Stockfish 엔진으로 모든 수를 완벽 분석하고 실력 향상의 지름길을 찾아드립니다.',
    startAnalysis: '분석 시작하기',
    learnMore: '자세히 알아보기',
    
    // Features Section
    featuresTitle: '♗ 체스 분석의 새로운 차원 ♗',
    featuresSubtitle: '프로 선수들이 사용하는 최첨단 분석 도구로 당신의 게임을 완전히 해부합니다',
    
    // Feature Cards
    stockfishTitle: '♜ Stockfish 엔진',
    stockfishDesc: '세계 챔피언도 인정한 최강 체스 AI가 모든 포지션을 정밀 분석합니다',
    styleAnalysisTitle: '♝ 플레이 스타일 분석',
    styleAnalysisDesc: '공격형? 수비형? 포지션형? 당신만의 체스 DNA를 발견하세요',
    mistakeDetectionTitle: '♞ 실수 패턴 발견',
    mistakeDetectionDesc: '블런더, 미스, 부정확한 수를 찾아내고 개선 방안을 제시합니다',
    progressTrackingTitle: '♛ 실력 성장 추적',
    progressTrackingDesc: '게임별 정확도와 레이팅 변화를 시각적으로 확인하세요',
    
    // System Status
    systemStatusTitle: '⚡ 시스템 상태 ⚡',
    systemStatusDesc: '모든 시스템이 최적의 성능으로 가동 중입니다',
    springBootStatus: 'Port 8080 ✅ 완벽 가동',
    nextjsStatus: 'Port 3000 ✅ 완벽 가동',
    architectureComplete: '🏁 원래 아키텍처대로 성공적으로 구성완료! 이제 체스 분석을 시작하세요! 🏁',
    
    // Analysis Form
    analysisFormTitle: '♔ 체스 게임 분석 시작',
    analysisFormDesc: 'Chess.com 계정의 게임을 분석해드립니다',
    usernameLabel: '♞ Chess.com 사용자명',
    usernamePlaceholder: '예: Magnus_Carlsen',
    usernameTip: '💡 팁: 동일한 사용자의 분석이 이미 진행 중인 경우, 기존 분석 상태를 확인할 수 있습니다.',
    platformLabel: '♝ 플랫폼 선택',
    gameCountLabel: '♜ 분석할 게임 수',
    gameCount10: '10게임 (빠른 분석)',
    gameCount25: '25게임 (균형 분석)',
    gameCount50: '50게임 (심층 분석)',
    estimatedTime: '예상 분석 시간: 3-8분',
    stockfishAnalysis: 'Stockfish 엔진이 모든 수를 정밀 분석합니다',
    backButton: '돌아가기',
    startAnalysisButton: '🚀 분석 시작',
    
    // Analysis Results
    analysisComplete: '🎉 분석 완료!',
    analysisStartedDesc: '체스 게임 분석이 성공적으로 시작되었습니다',
    analysisInfo: '📊 분석 정보',
    progressStatus: '⚡ 진행 상태',
    username: '사용자',
    platform: '플랫폼',
    gameCount: '게임 수',
    analysisId: '분석 ID',
    status: '상태',
    statusPending: '대기중',
    statusInProgress: '분석중',
    statusCompleted: '완료',
    statusError: '오류',
    shareLink: '🔗 공유 링크',
    copyButton: '복사',
    copySuccess: '링크가 복사되었습니다!',
    shareDesc: '이 링크를 통해 분석 결과를 다른 사람과 공유할 수 있습니다',
    analysisWaitDesc: '분석이 완료되면 상세한 결과를 확인할 수 있습니다. 보통 3-8분 정도 소요됩니다.',
    refreshButton: '🔄 새로고침',
    newAnalysisButton: '← 새 분석 시작',
    
    // Alerts and Messages
    networkError: '🔌 네트워크 연결 오류: Spring Boot API 서버(http://localhost:8080)에 접근할 수 없습니다.\n\n서버가 실행 중인지 확인해주세요.',
    unexpectedError: '⚠️ 예상치 못한 오류가 발생했습니다:\n{error}\n\n잠시 후 다시 시도해주세요.',
    analysisInProgress: '⏳ "{username}" 사용자의 분석이 이미 진행 중입니다.\n\n현재 진행 중인 분석 상태를 확인하시겠습니까?\n\n(다른 사용자명으로 새 분석을 시작할 수도 있습니다)',
    analysisRequestFailed: '분석 요청에 실패했습니다: {status} {statusText}',
    learnMoreAlert: '자세한 기능 설명이 곧 추가될 예정입니다!',
    lichessComingSoon: 'Lichess (곧 지원예정)'
  },
  en: {
    // Navigation
    language: 'English',
    switchToEnglish: 'Switch to Korean',
    
    // Hero Section
    heroTitle: '♛ Elevate Your Chess Skills<br/>to Grandmaster Level ♛',
    heroSubtitle: '🏆 Perfect analysis of every move with the world\'s strongest Stockfish engine to find your path to improvement.',
    startAnalysis: 'Start Analysis',
    learnMore: 'Learn More',
    
    // Features Section
    featuresTitle: '♗ A New Dimension of Chess Analysis ♗',
    featuresSubtitle: 'Completely dissect your games with cutting-edge analysis tools used by professional players',
    
    // Feature Cards
    stockfishTitle: '♜ Stockfish Engine',
    stockfishDesc: 'The world\'s strongest chess AI, recognized by world champions, precisely analyzes every position',
    styleAnalysisTitle: '♝ Playing Style Analysis',
    styleAnalysisDesc: 'Aggressive? Defensive? Positional? Discover your unique chess DNA',
    mistakeDetectionTitle: '♞ Mistake Pattern Detection',
    mistakeDetectionDesc: 'Identify blunders, mistakes, and inaccuracies, and receive improvement suggestions',
    progressTrackingTitle: '♛ Progress Tracking',
    progressTrackingDesc: 'Visualize game-by-game accuracy and rating changes',
    
    // System Status
    systemStatusTitle: '⚡ System Status ⚡',
    systemStatusDesc: 'All systems are running at optimal performance',
    springBootStatus: 'Port 8080 ✅ Fully Operational',
    nextjsStatus: 'Port 3000 ✅ Fully Operational',
    architectureComplete: '🏁 Successfully configured according to original architecture! Start your chess analysis now! 🏁',
    
    // Analysis Form
    analysisFormTitle: '♔ Start Chess Game Analysis',
    analysisFormDesc: 'We\'ll analyze games from your Chess.com account',
    usernameLabel: '♞ Chess.com Username',
    usernamePlaceholder: 'e.g.: Magnus_Carlsen',
    usernameTip: '💡 Tip: If analysis is already in progress for the same user, you can check the existing analysis status.',
    platformLabel: '♝ Platform Selection',
    gameCountLabel: '♜ Number of Games to Analyze',
    gameCount10: '10 games (Quick Analysis)',
    gameCount25: '25 games (Balanced Analysis)',
    gameCount50: '50 games (Deep Analysis)',
    estimatedTime: 'Estimated Analysis Time: 3-8 minutes',
    stockfishAnalysis: 'Stockfish engine will precisely analyze every move',
    backButton: 'Go Back',
    startAnalysisButton: '🚀 Start Analysis',
    
    // Analysis Results
    analysisComplete: '🎉 Analysis Complete!',
    analysisStartedDesc: 'Chess game analysis has been successfully started',
    analysisInfo: '📊 Analysis Information',
    progressStatus: '⚡ Progress Status',
    username: 'User',
    platform: 'Platform',
    gameCount: 'Game Count',
    analysisId: 'Analysis ID',
    status: 'Status',
    statusPending: 'Pending',
    statusInProgress: 'In Progress',
    statusCompleted: 'Completed',
    statusError: 'Error',
    shareLink: '🔗 Share Link',
    copyButton: 'Copy',
    copySuccess: 'Link copied to clipboard!',
    shareDesc: 'You can share analysis results with others using this link',
    analysisWaitDesc: 'You can view detailed results once the analysis is complete. Usually takes 3-8 minutes.',
    refreshButton: '🔄 Refresh',
    newAnalysisButton: '← Start New Analysis',
    
    // Alerts and Messages
    networkError: '🔌 Network Connection Error: Cannot access Spring Boot API server (http://localhost:8080).\n\nPlease check if the server is running.',
    unexpectedError: '⚠️ An unexpected error occurred:\n{error}\n\nPlease try again in a moment.',
    analysisInProgress: '⏳ Analysis for user "{username}" is already in progress.\n\nWould you like to check the current analysis status?\n\n(You can also start a new analysis with a different username)',
    analysisRequestFailed: 'Analysis request failed: {status} {statusText}',
    learnMoreAlert: 'Detailed feature description will be added soon!',
    lichessComingSoon: 'Lichess (Coming Soon)'
  }
};

export type Language = keyof typeof translations;
export type TranslationKey = keyof typeof translations.ko;