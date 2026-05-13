'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { analysisApi, AnalysisStatus } from '@/lib/api';

export interface ProgressState {
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | null;
  progress: number;
  currentStep: string;
  error?: string;
  isPolling: boolean;
}

export function useAnalysisProgress(analysisId: string | null) {
  const [progressState, setProgressState] = useState<ProgressState>({
    status: null,
    progress: 0,
    currentStep: '',
    isPolling: false
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const normalizeStatus = (status: string): ProgressState['status'] => {
    const normalized = status.toUpperCase();
    if (normalized === 'PENDING' || normalized === 'IN_PROGRESS' || normalized === 'COMPLETED' || normalized === 'FAILED' || normalized === 'CANCELLED') {
      return normalized;
    }
    return null;
  };

  const fetchProgress = useCallback(async () => {
    if (!analysisId) return;

    try {
      const statusData = await analysisApi.getAnalysisStatus(analysisId);
      const normalizedStatus = normalizeStatus(statusData.status);
      
      const newState: ProgressState = {
        status: normalizedStatus,
        progress: statusData.progress || 0,
        currentStep: statusData.currentStep || statusData.current_step || '',
        error: statusData.errorMessage || statusData.error_message,
        isPolling: progressState.isPolling
      };

      setProgressState(newState);

      // Stop polling if analysis is completed or failed
      if (normalizedStatus === 'COMPLETED' || normalizedStatus === 'FAILED') {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setProgressState(prev => ({ ...prev, isPolling: false }));
      }

    } catch (error) {
      console.error('Failed to fetch analysis progress:', error);
      setProgressState(prev => ({
        ...prev,
        error: 'Failed to fetch progress',
        isPolling: false
      }));
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
  }, [analysisId, progressState.isPolling]);

  const startPolling = useCallback(() => {
    if (!analysisId || intervalRef.current) return;

    setProgressState(prev => ({ ...prev, isPolling: true }));
    
    // Initial fetch
    fetchProgress();
    
    // Set up polling every 2 seconds
    intervalRef.current = setInterval(fetchProgress, 2000);
  }, [analysisId, fetchProgress]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setProgressState(prev => ({ ...prev, isPolling: false }));
  }, []);

  // Auto-start polling when analysisId is provided
  useEffect(() => {
    if (analysisId && !intervalRef.current) {
      startPolling();
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [analysisId, startPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  return {
    ...progressState,
    startPolling,
    stopPolling,
    refetch: fetchProgress
  };
}
