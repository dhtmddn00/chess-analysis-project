// ── Shared types for analysis result pages ────────────────────────────────────
// Used by: analyze/page.tsx, analysis/[id]/page.tsx, AnalysisResultView.tsx

export interface PercentileMetric {
  label: string;
  value: number;
  unit: string;
  betterThanPercent: number;
  topPercent: number;
  topPercentLabel: string;
  basis: string;
}

export interface OpponentBucket {
  label: string;
  games: number;
  scoreRate: number;
}

export interface AnalysisResult {
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

// ── Style dimensions ──────────────────────────────────────────────────────────

export type StyleNumericKey =
  | 'tacticalRating' | 'positionalRating' | 'endgameRating'
  | 'timeManagementRating' | 'aggressionRating' | 'consistency'
  | 'riskTolerance' | 'exchangePreference' | 'openingVariety'
  | 'leadConversion' | 'swindleResistance' | 'blunderTendency';

export const STYLE_DIMENSIONS: { i18nKey: string; key: StyleNumericKey; icon: string }[] = [
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
