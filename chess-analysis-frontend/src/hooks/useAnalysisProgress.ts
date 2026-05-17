'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { analysisApi } from '@/lib/api';

export interface ProgressState {
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | null;
  progress: number;
  currentStep: string;
  error?: string;
  isPolling: boolean;
}

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

function normalizeStatus(status: string): ProgressState['status'] {
  const normalized = status.toUpperCase();
  if (
    normalized === 'PENDING' || normalized === 'IN_PROGRESS' ||
    normalized === 'COMPLETED' || normalized === 'FAILED' || normalized === 'CANCELLED'
  ) {
    return normalized;
  }
  return null;
}

export function useAnalysisProgress(analysisId: string | null) {
  const [progressState, setProgressState] = useState<ProgressState>({
    status: null,
    progress: 0,
    currentStep: '',
    isPolling: false,
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  // Track polling state in a ref so fetchProgress never captures a stale value
  // and doesn't need to be listed as a dependency.
  const isPollingRef = useRef(false);

  const clearPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    isPollingRef.current = false;
    setProgressState(prev => ({ ...prev, isPolling: false }));
  }, []);

  const fetchProgress = useCallback(async () => {
    if (!analysisId) return;

    try {
      const statusData = await analysisApi.getAnalysisStatus(analysisId);
      const normalizedStatus = normalizeStatus(statusData.status);

      setProgressState({
        status: normalizedStatus,
        progress: statusData.progress || 0,
        currentStep: statusData.currentStep || statusData.current_step || '',
        error: statusData.errorMessage || statusData.error_message,
        isPolling: isPollingRef.current,
      });

      if (normalizedStatus && TERMINAL_STATUSES.has(normalizedStatus)) {
        clearPolling();
      }
    } catch (error) {
      console.error('Failed to fetch analysis progress:', error);
      setProgressState(prev => ({ ...prev, error: 'Failed to fetch progress' }));
      clearPolling();
    }
  }, [analysisId, clearPolling]);

  const startPolling = useCallback(() => {
    if (!analysisId || intervalRef.current) return;

    isPollingRef.current = true;
    setProgressState(prev => ({ ...prev, isPolling: true }));

    fetchProgress();
    intervalRef.current = setInterval(fetchProgress, 2000);
  }, [analysisId, fetchProgress]);

  const stopPolling = clearPolling;

  useEffect(() => {
    if (analysisId && !intervalRef.current) {
      startPolling();
    }
    return clearPolling;
  }, [analysisId, startPolling, clearPolling]);

  return {
    ...progressState,
    startPolling,
    stopPolling,
    refetch: fetchProgress,
  };
}
