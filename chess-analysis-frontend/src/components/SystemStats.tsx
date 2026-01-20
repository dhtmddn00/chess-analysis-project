'use client';

import { useState, useEffect } from 'react';
import { analysisApi, AnalysisStats, healthApi } from '@/lib/api';
import { Activity, Database, Server, Clock } from 'lucide-react';

export default function SystemStats() {
  const [stats, setStats] = useState<AnalysisStats | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [statsResponse, healthResponse] = await Promise.all([
        analysisApi.getStats().catch(() => null),
        healthApi.getHealth().catch(() => null)
      ]);
      
      setStats(statsResponse);
      setHealth(healthResponse);
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch system stats:', err);
      setError('Unable to load system status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="apple-card apple-fade-in">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-100 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error && !stats && !health) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-red-700 dark:text-red-400 text-sm text-center">{error}</p>
      </div>
    );
  }

  const isHealthy = health?.status === 'UP';
  const dbHealthy = health?.components?.db?.status === 'UP';
  const redisHealthy = health?.components?.redis?.status === 'UP';

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <div className="w-4 h-4 border-2 border-gray-300 border-t-black rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error && !stats && !health) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-red-500">System offline</p>
      </div>
    );
  }

  return (
    <div className="apple-card apple-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Status Indicator */}
        <div className="text-center p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-xl">
          <div className="flex items-center justify-center mb-2">
            <div className={`w-3 h-3 rounded-full ${isHealthy ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></div>
            <span className="ml-2 font-semibold text-gray-800">
              {isHealthy ? '시스템 정상' : '시스템 오프라인'}
            </span>
          </div>
          <p className="text-xs text-gray-600">실시간 상태</p>
        </div>

        {/* Total Analyses */}
        {stats && (
          <div className="text-center p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl apple-slide-up">
            <div className="flex items-center justify-center mb-2">
              <Activity className="w-5 h-5 text-blue-600 mr-2" />
              <span className="text-2xl font-bold apple-gradient-text">
                {stats.analysis_stats.total.toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-gray-600">총 분석 완료</p>
          </div>
        )}

        {/* Queue Status */}
        <div className="text-center p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl apple-slide-up" style={{animationDelay: '0.1s'}}>
          <div className="flex items-center justify-center mb-2">
            <Clock className="w-5 h-5 text-purple-600 mr-2" />
            <span className="text-2xl font-bold apple-gradient-text">
              {stats?.queue_stats.queue_size || 0}
            </span>
          </div>
          <p className="text-xs text-gray-600">대기 중인 분석</p>
        </div>
      </div>
    </div>
  );
}