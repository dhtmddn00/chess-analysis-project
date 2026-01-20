'use client';

import React, { useEffect } from 'react';
import { useAnalysisProgress } from '../hooks/useAnalysisProgress';
import LoadingSpinner from './LoadingSpinner';
import ProgressBar from './ProgressBar';

interface AnalysisProgressProps {
  analysisId: string;
  username: string;
  gameCount: number;
  onComplete?: () => void;
}

export default function AnalysisProgress({ 
  analysisId, 
  username, 
  gameCount, 
  onComplete 
}: AnalysisProgressProps) {
  const {
    status,
    progress,
    currentStep,
    error,
    isPolling,
    startPolling,
    stopPolling
  } = useAnalysisProgress(analysisId);

  useEffect(() => {
    if (status === 'COMPLETED' && onComplete) {
      onComplete();
    }
  }, [status, onComplete]);

  const getStatusText = () => {
    switch (status) {
      case 'PENDING': return '대기 중...';
      case 'IN_PROGRESS': return '분석 진행 중...';
      case 'COMPLETED': return '분석 완료!';
      case 'FAILED': return '분석 실패';
      case 'CANCELLED': return '분석 취소됨';
      default: return '상태 확인 중...';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'PENDING': return 'text-yellow-600';
      case 'IN_PROGRESS': return 'text-blue-600';
      case 'COMPLETED': return 'text-green-600';
      case 'FAILED': return 'text-red-600';
      case 'CANCELLED': return 'text-gray-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900">
            {username} 분석 진행상황
          </h3>
          <span className="text-sm text-gray-500">
            {gameCount}게임
          </span>
        </div>
        
        <div className={`text-sm font-medium ${getStatusColor()}`}>
          {getStatusText()}
        </div>
      </div>

      {/* Progress bar */}
      {status === 'IN_PROGRESS' && (
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-gray-600">
              {currentStep || '처리 중...'}
            </span>
            <span className="text-sm text-gray-600">
              {Math.round(progress)}%
            </span>
          </div>
          <ProgressBar progress={progress} />
        </div>
      )}

      {/* Loading spinner for pending/in-progress */}
      {(status === 'PENDING' || status === 'IN_PROGRESS') && (
        <div className="flex justify-center py-4">
          <LoadingSpinner />
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-sm text-red-700">
            {error}
          </div>
        </div>
      )}

      {/* Success message */}
      {status === 'COMPLETED' && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="text-sm text-green-700 mb-3">
            분석이 성공적으로 완료되었습니다!
          </div>
          <button
            onClick={() => window.location.href = `/analysis/${analysisId}`}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            상세 분석 결과 보기
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="mt-6 flex justify-between">
        <div className="text-xs text-gray-500">
          분석 ID: {analysisId}
        </div>
        
        {isPolling && (
          <button
            onClick={stopPolling}
            className="text-xs text-red-600 hover:text-red-700"
          >
            중지
          </button>
        )}
      </div>
    </div>
  );
}