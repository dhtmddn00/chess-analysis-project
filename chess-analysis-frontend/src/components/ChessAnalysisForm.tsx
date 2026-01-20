'use client';

import { useState } from 'react';
import { analysisApi, Analysis, AnalysisRequest } from '@/lib/api';
import { Play, AlertCircle, CheckCircle } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { LoadingButton } from '@/components/LoadingSpinner';
import { useTranslation } from '@/hooks/useTranslation';

interface ChessAnalysisFormProps {
  onAnalysisStarted: (analysis: Analysis) => void;
  onShowProgress?: (analysisId: string, username: string, gameCount: number) => void;
}

export default function ChessAnalysisForm({ onAnalysisStarted, onShowProgress }: ChessAnalysisFormProps) {
  const [formData, setFormData] = useState<AnalysisRequest>({
    username: '',
    platform: 'chess.com',
    gameCount: 20
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { showToast } = useToast();
  const { t } = useTranslation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      // Validate form data
      if (!formData.username.trim()) {
        throw new Error(t('username.required'));
      }

      if (formData.gameCount < 1 || formData.gameCount > 100) {
        throw new Error(t('game.count.range'));
      }

      // Submit analysis request
      const analysis = await analysisApi.createAnalysis(formData);
      setSuccess(t('analysis.started'));
      
      // Show success toast
      showToast({
        type: 'success',
        title: t('analysis.started'),
        message: t('analysis.for.user', { username: formData.username }),
        duration: 5000
      });
      
      // Pass the analysis to parent component
      onAnalysisStarted(analysis);
      
      // Show progress tracking if callback is provided
      if (onShowProgress) {
        onShowProgress(analysis.id, formData.username, formData.gameCount);
      }

    } catch (err: any) {
      console.error('Analysis creation failed:', err);
      
      let errorMessage = t('analysis.failed.retry');
      
      if (err.response?.status === 409) {
        errorMessage = t('analysis.in.progress');
      } else if (err.response?.status === 400) {
        errorMessage = t('invalid.request');
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      
      // Show error toast
      showToast({
        type: 'error',
        title: t('analysis.failed'),
        message: errorMessage,
        duration: 8000
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'gameCount' ? parseInt(value) || 0 : value
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Apple-style Username Input */}
      <div className="space-y-2">
        <label htmlFor="username" className="block text-sm font-medium text-gray-900">
          {t('chess.com.username')}
        </label>
        <input
          type="text"
          id="username"
          name="username"
          value={formData.username}
          onChange={handleInputChange}
          placeholder={t('enter.username')}
          className="apple-input"
          required
          disabled={loading}
          autoComplete="off"
        />
      </div>

      {/* Apple-style Platform Selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-900">
          {t('platform')}
        </label>
        <div className="flex space-x-4">
          <div className="flex items-center">
            <input
              type="radio"
              id="chess-com"
              name="platform"
              value="chess.com"
              checked={formData.platform === 'chess.com'}
              onChange={handleInputChange}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
              disabled={loading}
            />
            <label htmlFor="chess-com" className="ml-2 text-sm text-gray-900">
              Chess.com
            </label>
          </div>
          <div className="flex items-center opacity-50">
            <input
              type="radio"
              id="lichess"
              name="platform"
              value="lichess"
              disabled
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
            />
            <label htmlFor="lichess" className="ml-2 text-sm text-gray-500">
              Lichess (Soon)
            </label>
          </div>
        </div>
      </div>

      {/* Apple-style Game Count Slider */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <label className="text-sm font-medium text-gray-900">
            {t('games.to.analyze')}
          </label>
          <span className="text-lg font-semibold text-blue-600 bg-blue-50 px-3 py-1 rounded-lg">
            {formData.gameCount}
          </span>
        </div>
        
        <div className="relative">
          <input
            type="range"
            id="gameCount"
            name="gameCount"
            value={formData.gameCount}
            onChange={handleInputChange}
            min="5"
            max="50"
            step="5"
            className="w-full h-3 bg-gray-200 rounded-full appearance-none cursor-pointer transition-all duration-200 hover:bg-gray-300"
            style={{
              background: `linear-gradient(to right, #007AFF 0%, #007AFF ${((formData.gameCount - 5) / (50 - 5)) * 100}%, #e5e7eb ${((formData.gameCount - 5) / (50 - 5)) * 100}%, #e5e7eb 100%)`
            }}
            disabled={loading}
          />
          <div className="flex justify-between text-xs text-gray-600 mt-3">
            <span>5 ({t('quick')})</span>
            <span>25 ({t('balanced')})</span>
            <span>50 ({t('deep')})</span>
          </div>
        </div>
        
        {/* Apple-style Time Estimate */}
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4 border border-blue-100 apple-fade-in">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <span className="text-lg font-semibold apple-gradient-text">
                ~{Math.ceil(formData.gameCount * 0.4)} {t('minutes')}
              </span>
              <p className="text-xs text-gray-600 mt-1">예상 분석 시간</p>
            </div>
          </div>
        </div>
      </div>

      {/* Apple-style Error Message */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
          <div className="flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="text-red-700 text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* Apple-style Success Message */}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
          <div className="flex items-center space-x-3">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className="text-green-700 text-sm">{success}</span>
          </div>
        </div>
      )}

      {/* Apple-style Submit Button */}
      <button
        type="submit"
        disabled={!formData.username.trim() || loading}
        className="apple-button w-full py-4 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ padding: '16px 24px' }}
      >
        {loading ? (
          <div className="flex items-center justify-center space-x-3">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            <span>{t('analyzing')}</span>
          </div>
        ) : (
          <div className="flex items-center justify-center space-x-2">
            <Play className="w-5 h-5" />
            <span>{t('start.analysis.button')}</span>
          </div>
        )}
      </button>

      {/* Apple-style Info */}
      <div className="apple-glass rounded-xl p-6 apple-fade-in">
        <div className="text-center">
          <div className="flex justify-center mb-3">
            <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-blue-500 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <p className="text-sm font-medium text-gray-800 mb-2">
            {t('clean.analysis.info')}
          </p>
          <p className="text-xs text-gray-600">
            {t('analysis.time.info')}
          </p>
        </div>
      </div>
    </form>
  );
}