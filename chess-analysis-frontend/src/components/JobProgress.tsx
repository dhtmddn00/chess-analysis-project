import React from 'react';
import { AnalysisJobStatus } from '../hooks/useAnalysis';
import { CheckCircle, Circle, Clock, AlertTriangle, Zap, Brain, Target, Timer } from 'lucide-react';

interface JobProgressProps {
  status: AnalysisJobStatus;
  className?: string;
}

export function JobProgress({ status, className = '' }: JobProgressProps) {
  const getStatusColor = () => {
    switch (status.status) {
      case 'pending': return 'text-yellow-600 bg-yellow-100';
      case 'in_progress': return 'text-blue-600 bg-blue-100';
      case 'completed': return 'text-green-600 bg-green-100';
      case 'failed': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusText = () => {
    switch (status.status) {
      case 'pending': return '대기 중';
      case 'in_progress': return '분석 진행 중';
      case 'completed': return '분석 완료';
      case 'failed': return '분석 실패';
      default: return '알 수 없음';
    }
  };

  const sections = [
    {
      id: 'tactics',
      title: '전술 분석',
      icon: Zap,
      ready: status.partials?.tactics?.ready || false,
      data: status.partials?.tactics,
    },
    {
      id: 'swing_moments', 
      title: '승부 전환점',
      icon: Target,
      ready: status.partials?.swing_moments?.ready || false,
      data: status.partials?.swing_moments,
    },
    {
      id: 'endgame',
      title: '엔드게임 기술',
      icon: Brain,
      ready: status.partials?.endgame?.ready || false,
      data: status.partials?.endgame,
    },
    {
      id: 'time_mgmt',
      title: '시간 관리',
      icon: Timer,
      ready: status.partials?.time_mgmt?.ready || false,
      data: status.partials?.time_mgmt,
    },
  ];

  return (
    <div className={`bg-white rounded-xl shadow-lg p-6 ${className}`}>
      {/* Main status */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor()}`}>
            {getStatusText()}
          </div>
          {status.analysisVersion && (
            <div className="text-xs text-gray-500">
              v{status.analysisVersion}
            </div>
          )}
        </div>
        
        {status.etaRemainingSec && status.status === 'in_progress' && (
          <div className="flex items-center space-x-1 text-sm text-gray-600">
            <Clock className="w-4 h-4" />
            <span>약 {Math.ceil(status.etaRemainingSec / 60)}분 남음</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {(status.status === 'in_progress' || status.status === 'pending') && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">전체 진행률</span>
            <span className="text-sm text-gray-600">{Math.round((status.progress || 0) * 100)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${(status.progress || 0) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Error display */}
      {status.error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <span className="font-medium text-red-800">오류 발생</span>
          </div>
          <p className="text-sm text-red-700 mt-1">{status.error}</p>
        </div>
      )}

      {/* Section progress */}
      <div className="space-y-4">
        <h3 className="font-semibold text-gray-900 mb-3">분석 섹션</h3>
        
        {sections.map((section) => {
          const IconComponent = section.icon;
          
          return (
            <div 
              key={section.id} 
              className={`flex items-center justify-between p-3 rounded-lg transition-all ${
                section.ready ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'
              }`}
            >
              <div className="flex items-center space-x-3">
                <IconComponent className={`w-5 h-5 ${section.ready ? 'text-green-600' : 'text-gray-400'}`} />
                <span className={`font-medium ${section.ready ? 'text-green-900' : 'text-gray-700'}`}>
                  {section.title}
                </span>
              </div>
              
              <div className="flex items-center space-x-2">
                {/* Section-specific preview data */}
                {section.ready && section.data && (
                  <div className="text-sm text-gray-600">
                    {section.id === 'tactics' && section.data.missed !== undefined && (
                      <span>{section.data.converted || 0}/{(section.data.converted || 0) + (section.data.missed || 0)}</span>
                    )}
                    {section.id === 'endgame' && section.data.score !== undefined && (
                      <span>{section.data.score}점</span>
                    )}
                    {section.id === 'time_mgmt' && section.data.score !== undefined && (
                      <span>{section.data.score}점</span>
                    )}
                    {section.id === 'swing_moments' && section.data.top && (
                      <span>{section.data.top.length}개</span>
                    )}
                  </div>
                )}
                
                {section.ready ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <Circle className="w-5 h-5 text-gray-400" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Completion message */}
      {status.status === 'completed' && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="font-medium text-green-800">분석이 완료되었습니다!</span>
          </div>
          <p className="text-sm text-green-700 mt-1">
            모든 섹션이 준비되었습니다. 아래에서 자세한 결과를 확인하세요.
          </p>
        </div>
      )}
    </div>
  );
}

export default JobProgress;