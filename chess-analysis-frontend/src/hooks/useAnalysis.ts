import { useState, useEffect, useCallback } from 'react';
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
      examples?: any[] 
    };
    swing_moments?: { 
      ready: boolean; 
      top?: any[] 
    };
    endgame?: { 
      ready: boolean;
      score?: number;
      examples?: any[]
    };
    time_mgmt?: { 
      ready: boolean;
      score?: number;
      patterns?: any[]
    };
    style_profile?: {
      ready: boolean;
      scores?: Record<string, number>;
      style?: string;
    };
    training_plan?: {
      ready: boolean;
      recommendations?: any[];
    };
  };
  summary?: any;
  profile?: any;
  plan?: any;
}

interface UseAnalysisResult {
  // Job creation
  createJob: (request: CreateAnalysisRequest) => Promise<string>;
  
  // Current job status
  jobId: string | null;
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
  summary: any;
  profile: any;
  plan: any;
  
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
  const [isCreating, setIsCreating] = useState(false);
  
  // Poll job status when we have a jobId and job is not done
  const shouldPoll = jobId !== null; // will be refined based on status
  const { data: status, error, mutate } = useSWR<AnalysisJobStatus>(
    shouldPoll ? `/api/v1/analysis/${jobId}/status` : null,
    fetcher,
    {
      refreshInterval: (data) => {
        // Stop polling when done or failed
        if (data?.status === 'completed' || data?.status === 'failed') {
          return 0;
        }
        // Poll every 2 seconds for running jobs
        if (data?.status === 'in_progress') {
          return 2000;
        }
        // Poll every 3 seconds for pending jobs
        return 3000;
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

  const cancelJob = useCallback(() => {
    if (jobId) {
      // TODO: Implement API call to cancel job
      console.log('Cancelling job:', jobId);
    }
  }, [jobId]);

  const reset = useCallback(() => {
    setJobId(null);
    mutate(undefined, false); // Clear SWR cache
  }, [mutate]);

  // Computed values
  const isQueued = statusData?.status === 'pending';
  const isRunning = statusData?.status === 'in_progress';
  const isDone = statusData?.status === 'completed';
  const isFailed = statusData?.status === 'failed';
  const isPolling = shouldPoll && !isDone && !isFailed && !error;

  const progress = statusData?.progress || 0;
  const etaRemaining = null; // Not implemented in current backend

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
