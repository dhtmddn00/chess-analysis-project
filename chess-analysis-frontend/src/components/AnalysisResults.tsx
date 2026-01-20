'use client';

import { useState, useEffect } from 'react';
import { analysisApi, Analysis, AnalysisStatus } from '@/lib/api';
import { 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  XCircle,
  Loader,
  Target,
  TrendingUp,
  Trophy,
  Brain,
  ChevronRight
} from 'lucide-react';
import ProgressBar from './ProgressBar';
import StyleScoresChart from './StyleScoresChart';

interface AnalysisResultsProps {
  analysisId: string;
}

export default function AnalysisResults({ analysisId }: AnalysisResultsProps) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [status, setStatus] = useState<AnalysisStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysisData = async () => {
    try {
      const [analysisData, statusData] = await Promise.all([
        analysisApi.getAnalysis(analysisId).catch(() => null),
        analysisApi.getAnalysisStatus(analysisId).catch(() => null)
      ]);

      setAnalysis(analysisData);
      setStatus(statusData);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch analysis data:', err);
      setError('Failed to load analysis data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalysisData();

    // Poll for updates if analysis is in progress
    let interval: NodeJS.Timeout | null = null;
    
    const shouldPoll = (status: string) => 
      status === 'PENDING' || status === 'IN_PROGRESS' || status === 'queued' || status === 'processing';

    if (analysis?.status && shouldPoll(analysis.status) || 
        status?.status && shouldPoll(status.status)) {
      interval = setInterval(fetchAnalysisData, 2000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [analysisId, analysis?.status, status?.status]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-gray-300 border-t-black rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading analysis...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  const currentStatus = analysis?.status || status?.status || 'unknown';
  const progressPercent = analysis?.progressPercent || status?.progress || 0;
  const currentStep = analysis?.currentStep || status?.current_step || '';

  const getStatusIcon = () => {
    switch (currentStatus.toLowerCase()) {
      case 'completed':
        return <CheckCircle className="text-green-500" size={24} />;
      case 'failed':
        return <XCircle className="text-red-500" size={24} />;
      case 'cancelled':
        return <XCircle className="text-gray-500" size={24} />;
      case 'pending':
      case 'queued':
        return <Clock className="text-orange-500" size={24} />;
      case 'in_progress':
      case 'processing':
        return <Loader className="text-blue-500 animate-spin" size={24} />;
      default:
        return <AlertCircle className="text-gray-500" size={24} />;
    }
  };

  const getStatusColor = () => {
    switch (currentStatus.toLowerCase()) {
      case 'completed':
        return 'text-green-600 dark:text-green-400';
      case 'failed':
        return 'text-red-600 dark:text-red-400';
      case 'cancelled':
        return 'text-gray-600 dark:text-gray-400';
      case 'pending':
      case 'queued':
        return 'text-orange-600 dark:text-orange-400';
      case 'in_progress':
      case 'processing':
        return 'text-blue-600 dark:text-blue-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const isCompleted = currentStatus.toLowerCase() === 'completed';

  return (
    <div className="space-y-8">
      {/* Enhanced Status with Progress */}
      <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-800 dark:via-blue-900 dark:to-purple-900 rounded-2xl p-8 border border-blue-100 dark:border-blue-800">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center space-x-4 mb-4">
            {getStatusIcon()}
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                {analysis?.username || 'Chess Player'}
              </h2>
              <p className="text-gray-600 dark:text-gray-300">Analysis in Progress</p>
            </div>
          </div>
        </div>
        
        {/* Progress Section */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Progress</span>
            <span className="text-sm font-bold text-gray-900 dark:text-white">{Math.round(progressPercent)}%</span>
          </div>
          
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-4">
            <div 
              className="bg-gradient-to-r from-blue-500 to-purple-600 h-3 rounded-full transition-all duration-500 ease-out relative overflow-hidden"
              style={{ width: `${progressPercent}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-30 animate-pulse"></div>
            </div>
          </div>
          
          <div className="text-center">
            <p className={`text-lg font-semibold ${getStatusColor()}`}>
              {currentStep || `Status: ${currentStatus}`}
            </p>
          </div>
        </div>

        {/* Analysis Steps Visualization */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className={`text-center p-4 rounded-lg ${progressPercent > 10 ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
            <div className="text-2xl mb-2">📥</div>
            <div className="text-sm font-medium">Collecting Games</div>
          </div>
          <div className={`text-center p-4 rounded-lg ${progressPercent > 30 ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
            <div className="text-2xl mb-2">⚔️</div>
            <div className="text-sm font-medium">Stockfish Analysis</div>
          </div>
          <div className={`text-center p-4 rounded-lg ${progressPercent > 70 ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
            <div className="text-2xl mb-2">🧠</div>
            <div className="text-sm font-medium">Style Profiling</div>
          </div>
          <div className={`text-center p-4 rounded-lg ${progressPercent >= 100 ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
            <div className="text-2xl mb-2">📊</div>
            <div className="text-sm font-medium">Generating Results</div>
          </div>
        </div>

        {/* Real-time Stats */}
        {(analysis?.gameCountAnalyzed || status) && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {analysis?.gameCountAnalyzed || analysis?.gameCount || 0}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Games</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {analysis?.totalMovesAnalyzed || '—'}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Moves</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {analysis?.analysisDurationSeconds ? `${Math.round(analysis.analysisDurationSeconds)}s` : '—'}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Time</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results Section */}
      {isCompleted && analysis && (
        <div className="space-y-8">
          {/* Key Metrics - Simplified */}
          <div className="text-center space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              <div>
                <div className="text-2xl font-light text-black dark:text-white">
                  {analysis.gameCountAnalyzed || analysis.gameCount}
                </div>
                <p className="text-xs text-gray-500 mt-1">games</p>
              </div>
              
              {analysis.overallAcpl !== undefined && (
                <div>
                  <div className="text-2xl font-light text-black dark:text-white">
                    {Math.round(analysis.overallAcpl)}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">avg acpl</p>
                </div>
              )}
              
              {analysis.winRate !== undefined && (
                <div>
                  <div className="text-2xl font-light text-black dark:text-white">
                    {Math.round((analysis.winRate || 0) * 100)}%
                  </div>
                  <p className="text-xs text-gray-500 mt-1">win rate</p>
                </div>
              )}
              
              {analysis.analysisDurationSeconds !== undefined && (
                <div>
                  <div className="text-2xl font-light text-black dark:text-white">
                    {Math.round(analysis.analysisDurationSeconds / 60)}m
                  </div>
                  <p className="text-xs text-gray-500 mt-1">analysis time</p>
                </div>
              )}
            </div>
          </div>

          {/* Style Scores - Simplified */}
          {analysis.styleScores && (
            <div className="space-y-4">
              <h3 className="text-center text-lg font-light text-black dark:text-white">
                Playing Style
              </h3>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-6">
                <StyleScoresChart styleScores={analysis.styleScores} />
              </div>
            </div>
          )}

          {/* Key Insights - Simplified */}
          {analysis.keyInsights && Object.keys(analysis.keyInsights).length > 0 && (
            <div className="space-y-4">
              <h3 className="text-center text-lg font-light text-black dark:text-white">
                Insights
              </h3>
              <div className="space-y-3">
                {Object.entries(analysis.keyInsights).map(([key, value]) => (
                  <div key={key} className="border-l-2 border-gray-200 dark:border-gray-700 pl-4 py-2">
                    <h4 className="text-sm font-medium text-black dark:text-white capitalize mb-1">
                      {key.replace(/_/g, ' ')}
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {typeof value === 'string' ? value : JSON.stringify(value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Tips - Simplified */}
          {analysis.quickTips && analysis.quickTips.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-center text-lg font-light text-black dark:text-white">
                Tips
              </h3>
              <div className="space-y-3">
                {analysis.quickTips.map((tip, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center text-xs text-gray-500 flex-shrink-0 mt-0.5">
                      {index + 1}
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{tip}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}