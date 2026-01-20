import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    console.log(`API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error('API Response Error:', error.response?.status, error.response?.data);
    return Promise.reject(error);
  }
);

export interface AnalysisRequest {
  username: string;
  platform: string;
  gameCount: number;
}

export interface Analysis {
  id: string;
  username: string;
  platform: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  gameCount: number;
  gameCountAnalyzed?: number;
  progressPercent: number;
  currentStep: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  overallAcpl?: number;
  winRate?: number;
  totalMovesAnalyzed?: number;
  styleScores?: Record<string, any>;
  cohortComparison?: Record<string, any>;
  keyInsights?: Record<string, any>;
  quickTips?: string[];
  analysisDurationSeconds?: number;
}

export interface AnalysisStatus {
  id: string;
  status: string;
  progress: number;
  current_step: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  queue_info?: Record<string, any>;
}

export interface AnalysisStats {
  analysis_stats: {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
    failed: number;
  };
  queue_stats: {
    queue_size: number;
    status: string;
    redis_status: string;
    timestamp: string;
  };
}

export interface AnalysisResult {
  analysisId: string;
  username: string;
  platform: string;
  gameCount: number;
  status: string;
  totalGames: number;
  averageAccuracy: number;
  totalBlunders: number;
  totalMistakes: number;
  totalInaccuracies: number;
  averageCentipawnLoss: number;
  // Additional fields from backend response
  explanations?: {
    accuracyExplanation: string;
    acplExplanation: string;
    errorAnalysis: string;
  };
  tacticalAnalysis?: string;
  tacticalOverview?: {
    totalOpportunities: number;
    foundTactics: number;
    missedTactics: number;
    tacticalAccuracy: string;
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
    metadata: string;
    tacticalStats: string;
    dimensionExplanations?: {
      overallStyleAnalysis: string;
      tacticalExplanation: string;
      positionalExplanation: string;
      endgameExplanation: string;
      timeManagementExplanation: string;
      aggressionExplanation: string;
      consistencyExplanation: string;
    };
  };
  playerMetadata?: {
    country: string;
    title: string;
    followers: number;
    ratingsData: string;
  };
  tacticalOpportunities?: Array<{
    pattern: string;
    count?: number;
    found?: number;
    missed?: number;
    accuracy?: string;
    averageValue: number;
    averageDifficulty: number;
    description?: string;
  }>;
  trainingRecommendations?: Array<{
    category: string;
    priority: number;
    title: string;
    description: string;
    eloGain: number;
  }>;
}

export interface AnalysisGame {
  gameIndex: number;
  whitePlayer: string;
  blackPlayer: string;
  result: string;
  opening: string;
  accuracy: number;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
}

// Analysis API functions
export const analysisApi = {
  // Create new analysis
  async createAnalysis(request: AnalysisRequest): Promise<Analysis> {
    const response = await api.post('/analysis', request);
    return response.data;
  },

  // Get analysis by ID
  async getAnalysis(id: string): Promise<Analysis> {
    const response = await api.get(`/analysis/${id}`);
    return response.data;
  },

  // Get analysis status
  async getAnalysisStatus(id: string): Promise<AnalysisStatus> {
    const response = await api.get(`/analysis/${id}/status`);
    return response.data;
  },

  // Get player analyses
  async getPlayerAnalyses(
    username: string,
    platform: string,
    page = 0,
    size = 10
  ): Promise<{
    analyses: Analysis[];
    total_elements: number;
    total_pages: number;
    current_page: number;
    page_size: number;
  }> {
    const response = await api.get(`/analysis/player/${username}`, {
      params: { platform, page, size }
    });
    return response.data;
  },

  // Cancel analysis
  async cancelAnalysis(id: string): Promise<void> {
    await api.delete(`/analysis/${id}`);
  },

  // Get system statistics
  async getStats(): Promise<AnalysisStats> {
    const response = await api.get('/analysis/stats');
    return response.data;
  },

  // Get analysis result
  async getAnalysisResult(id: string): Promise<AnalysisResult> {
    const response = await api.get(`/analysis/${id}/result`);
    return response.data;
  },

  // Export analysis as PDF
  async exportAnalysisPDF(id: string): Promise<Blob> {
    const response = await api.get(`/analysis/${id}/export/pdf`, {
      responseType: 'blob'
    });
    return response.data;
  },

  // Get shareable link
  async getShareableLink(id: string): Promise<{ shareUrl: string; expiresAt: string }> {
    const response = await api.post(`/analysis/${id}/share`);
    return response.data;
  },

  // Get analysis games
  async getAnalysisGames(id: string): Promise<AnalysisGame[]> {
    const response = await api.get(`/analysis/${id}/games`);
    return response.data;
  }
};

// Health check - separate instance to avoid /api prefix
const healthApiInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 5000,
});

export const healthApi = {
  async getHealth(): Promise<{
    status: string;
    components: Record<string, any>;
  }> {
    const response = await healthApiInstance.get('/health/actuator/health');
    return response.data;
  }
};

export default api;