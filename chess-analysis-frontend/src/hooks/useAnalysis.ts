import { useState, useEffect, useCallback, useRef } from 'react';
import useSWR from 'swr';

export interface CreateAnalysisRequest {
  platform: string;
  username: string;
  n?: number;
  priority?: 'fast' | 'balanced' | 'precise';
  timeControl?: string;
}

export interface AnalysisJobStatus {
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number; // 0 to 100
  currentStep: string;
  errorMessage: string;
  error?: string;
  analysisVersion?: string;
  etaRemainingSec?: number;
  queuePosition?: number | null;
  queueSize?: number | null;
  partials?: {
    tactics?: {
      ready: boolean;
      missed?: number;
      converted?: number;
      examples?: unknown[];
    };
    swing_moments?: {
      ready: boolean;
      top?: unknown[];
    };
    endgame?: {
      ready: boolean;
      score?: number;
      examples?: unknown[];
    };
    time_mgmt?: {
      ready: boolean;
      score?: number;
      patterns?: unknown[];
    };
    style_profile?: {
      ready: boolean;
      scores?: Record<string, number>;
      style?: string;
    };
    training_plan?: {
      ready: boolean;
      recommendations?: unknown[];
    };
  };
  summary?: unknown;
  profile?: unknown;
  plan?: unknown;
}

interface UseAnalysisResult {
  // Job creation
  createJob: (request: CreateAnalysisRequest) => Promise<string>;

  // Current job status
  jobId: string | null;
  shortLink: string | null;
  status: AnalysisJobStatus | null;
  isPolling: boolean;

  // Computed states
  isQueued: boolean;
  isRunning: boolean;
  isDone: boolean;
  isFailed: boolean;

  // Progress and ETA
  progress: number;
  etaRemaining: number | null;

  // Partial results (available as they complete)
  tacticsReady: boolean;
  swingMomentsReady: boolean;
  endgameReady: boolean;
  timeMgmtReady: boolean;

  // Final results (when done)
  summary: unknown;
  profile: unknown;
  plan: unknown;

  // Actions
  cancelJob: () => void;
  reset: () => void;
}

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
});

export function useAnalysis(): UseAnalysisResult {
  const [jobId, setJobId] = useState<string | null>(null);
  const [shortLink, setShortLink] = useState<string | null>(null);
  const [cancelToken, setCancelToken] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Adaptive polling: track progress stalls to slow down when nothing is moving
  const prevProgressRef = useRef<number>(0);
  const stallCountRef   = useRef<number>(0);

  // ETA estimation: record when in_progress started and at what progress level
  const [etaRemaining, setEtaRemaining] = useState<number | null>(null);
  const etaTrackRef = useRef<{ startTime: number; startProgress: number } | null>(null);

  // Poll job status when we have a jobId and job is not done
  const shouldPoll = jobId !== null;
  const { data: status, error, mutate } = useSWR<AnalysisJobStatus>(
    shouldPoll ? `/api/v1/analysis/${jobId}/status` : null,
    fetcher,
    {
      /**
       * Adaptive refresh interval:
       *  - completed / failed  → stop (0)
       *  - pending             → 4 s  (job not started yet, no need to rush)
       *  - in_progress, moving → 2 s  (active progress, poll fast)
       *  - in_progress, stall ×2 → 5 s
       *  - in_progress, stall ×4 → 10 s (engine is busy, back off)
       */
      refreshInterval: (data) => {
        if (!data || data.status === 'completed' || data.status === 'failed') {
          stallCountRef.current = 0;
          return 0;
        }
        if (data.status === 'pending') {
          return 4000;
        }
        // in_progress — compare with previous progress value
        const current = data.progress ?? 0;
        if (current !== prevProgressRef.current) {
          prevProgressRef.current = current;
          stallCountRef.current   = 0;
        } else {
          stallCountRef.current += 1;
        }
        if (stallCountRef.current >= 4) return 10_000;
        if (stallCountRef.current >= 2) return 5_000;
        return 2_000;
      },
      revalidateOnFocus: false,
      dedupingInterval: 1000,
      errorRetryCount: 3,
      errorRetryInterval: 2000,
    }
  );
  const statusData = status ?? null;

  const createJob = useCallback(async (request: CreateAnalysisRequest): Promise<string> => {
    setIsCreating(true);
    
    try {
      // Transform frontend request to match backend DTO
      const backendRequest = {
        platform: request.platform,
        username: request.username,
        gameCount: request.n || 20,
        timeControl: request.timeControl || 'all',
        priority: request.priority || 'fast',
      };

      const response = await fetch('/api/v1/analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(backendRequest),
      });
      
      if (!response.ok) {
        const rawError = await response.text();
        let errorData: Record<string, any> = {};
        try {
          errorData = rawError ? JSON.parse(rawError) : {};
        } catch {
          errorData = {};
        }
        const message = errorData.error || errorData.message || errorData.details || rawError || `HTTP ${response.status}`;
        throw new Error(message);
      }
      
      const data = await response.json();
      setJobId(data.id);
      if (data.shortLink) setShortLink(data.shortLink);
      if (data.cancelToken) setCancelToken(data.cancelToken);
      
      // Force immediate poll
      mutate();
      
      return data.id;
    } catch (error) {
      console.error('Failed to create analysis job:', error);
      throw error;
    } finally {
      setIsCreating(false);
    }
  }, [mutate]);

  // ETA: update estimate each time status arrives
  useEffect(() => {
    if (!statusData) return;

    // Backend sends etaRemainingSec → use it directly
    if (statusData.etaRemainingSec != null) {
      setEtaRemaining(statusData.etaRemainingSec);
      return;
    }

    const progress = statusData.progress ?? 0;

    if (statusData.status === 'in_progress' && progress > 0) {
      if (!etaTrackRef.current) {
        // First in_progress tick — record baseline
        etaTrackRef.current = { startTime: Date.now(), startProgress: progress };
        return;
      }
      const elapsed = (Date.now() - etaTrackRef.current.startTime) / 1000; // seconds
      const progressDone = progress - etaTrackRef.current.startProgress;
      if (progressDone > 0 && elapsed > 0) {
        const rate = progressDone / elapsed; // % per second
        const eta = Math.round((100 - progress) / rate);
        setEtaRemaining(eta > 0 ? eta : null);
      }
    } else {
      // Reset when not running
      etaTrackRef.current = null;
      setEtaRemaining(null);
    }
  }, [statusData]);

  const cancelJob = useCallback(() => {
    if (!jobId) return;
    const headers: Record<string, string> = {};
    if (cancelToken) headers['X-Cancel-Token'] = cancelToken;
    fetch(`/api/v1/analysis/${jobId}`, { method: 'DELETE', headers })
      .then(() => mutate())
      .catch((err) => console.error('Failed to cancel job:', err));
  }, [jobId, cancelToken, mutate]);

  const reset = useCallback(() => {
    setJobId(null);
    setShortLink(null);
    setCancelToken(null);
    etaTrackRef.current = null;
    setEtaRemaining(null);
    mutate(undefined, false); // Clear SWR cache
  }, [mutate]);

  // Computed values
  const isQueued = statusData?.status === 'pending';
  const isRunning = statusData?.status === 'in_progress';
  const isDone = statusData?.status === 'completed';
  const isFailed = statusData?.status === 'failed';
  const isPolling = shouldPoll && !isDone && !isFailed && !error;

  const progress = statusData?.progress || 0;

  // Partial readiness flags
  const tacticsReady = statusData?.partials?.tactics?.ready || false;
  const swingMomentsReady = statusData?.partials?.swing_moments?.ready || false;
  const endgameReady = statusData?.partials?.endgame?.ready || false;
  const timeMgmtReady = statusData?.partials?.time_mgmt?.ready || false;

  return {
    // Job creation
    createJob,
    
    // Current job status
    jobId,
    shortLink,
    status: statusData,
    isPolling,
    
    // Computed states  
    isQueued,
    isRunning,
    isDone,
    isFailed,
    
    // Progress and ETA
    progress,
    etaRemaining,
    
    // Partial results
    tacticsReady,
    swingMomentsReady, 
    endgameReady,
    timeMgmtReady,
    
    // Final results
    summary: statusData?.summary,
    profile: statusData?.profile,
    plan: statusData?.plan,
    
    // Actions
    cancelJob,
    reset,
  };
}
