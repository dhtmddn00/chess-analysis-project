'use client';

import { useState, useEffect, useCallback } from 'react';
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

  const [intervalId, setIntervalId] = useState<NodeJS.Timeout | null>(null);

  const fetchProgress = useCallback(async () => {
    if (!analysisId) return;

    try {
      const statusData = await analysisApi.getAnalysisStatus(analysisId);
      
      const newState: ProgressState = {
        status: statusData.status as ProgressState['status'],
        progress: statusData.progress || 0,
        currentStep: statusData.current_step || '',
        error: statusData.error_message,
        isPolling: progressState.isPolling
      };

      setProgressState(newState);

      // Stop polling if analysis is completed or failed
      if (statusData.status === 'COMPLETED' || statusData.status === 'FAILED') {
        if (intervalId) {
          clearInterval(intervalId);
          setIntervalId(null);
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
      
      if (intervalId) {
        clearInterval(intervalId);
        setIntervalId(null);
      }
    }
  }, [analysisId, intervalId, progressState.isPolling]);

  const startPolling = useCallback(() => {
    if (!analysisId || intervalId) return;

    setProgressState(prev => ({ ...prev, isPolling: true }));
    
    // Initial fetch
    fetchProgress();
    
    // Set up polling every 2 seconds
    const id = setInterval(fetchProgress, 2000);
    setIntervalId(id);
  }, [analysisId, intervalId, fetchProgress]);

  const stopPolling = useCallback(() => {
    if (intervalId) {
      clearInterval(intervalId);
      setIntervalId(null);
    }
    setProgressState(prev => ({ ...prev, isPolling: false }));
  }, [intervalId]);

  // Auto-start polling when analysisId is provided
  useEffect(() => {
    if (analysisId && !intervalId) {
      startPolling();
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [analysisId, startPolling, intervalId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [intervalId]);

  return {
    ...progressState,
    startPolling,
    stopPolling,
    refetch: fetchProgress
  };
}