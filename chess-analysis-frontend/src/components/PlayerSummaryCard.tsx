import React from 'react';
import { useTranslations } from 'next-intl';
import { PlayerSummary } from '../hooks/usePlayerSummary';
import { Trophy, Target, Clock, TrendingUp, User, Flag } from 'lucide-react';

interface PlayerSummaryCardProps {
  summary: PlayerSummary;
  onAnalyzeClick?: () => void;
  isAnalysisRunning?: boolean;
}

export function PlayerSummaryCard({
  summary,
  onAnalyzeClick,
  isAnalysisRunning = false,
}: PlayerSummaryCardProps) {
  const t = useTranslations('PlayerSummaryCard');
  const { player, openings, recent10, cohort_hint, cache_status } = summary;

  const getResultColor = (result: 'W' | 'L' | 'D') => {
    switch (result) {
      case 'W': return 'text-green-600 bg-green-100';
      case 'L': return 'text-red-600 bg-red-100';
      case 'D': return 'text-yellow-600 bg-yellow-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getCohortBadgeColor = (band: string) => {
    if (band.includes('super_elite') || band.includes('2900')) return 'bg-purple-100 text-purple-800 border-purple-200';
    if (band.includes('grandmaster') || band.includes('2600')) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (band.includes('master') || band.includes('2200')) return 'bg-blue-100 text-blue-800 border-blue-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const ratingValues = Object.values(player.ratings);
  const maxRating = ratingValues.length > 0 ? Math.max(...ratingValues) : null;

  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden">
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {player.avatar ? (
              <img src={player.avatar} alt={player.username} className="w-16 h-16 rounded-full border-2 border-white/20" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
                <User className="w-8 h-8 text-white/80" />
              </div>
            )}
            <div>
              <h2 className="text-2xl font-bold">{player.username}</h2>
              <div className="flex items-center space-x-2 mt-1">
                {player.country && (
                  <>
                    <Flag className="w-4 h-4" />
                    <span className="text-blue-200">{player.country}</span>
                  </>
                )}
                <span className="text-blue-200 text-sm">•</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getCohortBadgeColor(cohort_hint.band)}`}>
                  {cohort_hint.note}
                </span>
              </div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-sm text-blue-200 mb-1">{t('highestRating')}</div>
            <div className="text-2xl font-bold">{maxRating ?? '-'}</div>
            {cache_status === 'cached' && <div className="text-xs text-blue-200 mt-1">{t('cached')}</div>}
          </div>
        </div>

        <div className="flex space-x-6 mt-4">
          {Object.entries(player.ratings).map(([format, rating]) => (
            <div key={format} className="text-center">
              <div className="text-xl font-bold">{rating}</div>
              <div className="text-sm text-blue-200 capitalize">{format}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            <h3 className="font-semibold text-gray-900">{t('overallRecord')}</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{player.record_all.games}</div>
              <div className="text-sm text-gray-600">{t('totalGames')}</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{(player.record_all.winrate * 100).toFixed(1)}%</div>
              <div className="text-sm text-gray-600">{t('winRate')}</div>
            </div>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-green-600">{t('wins')} {player.record_all.win}</span>
            <span className="text-yellow-600">{t('draws')} {player.record_all.draw}</span>
            <span className="text-red-600">{t('losses')} {player.record_all.loss}</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Target className="w-5 h-5 text-blue-500" />
            <h3 className="font-semibold text-gray-900">{t('topOpenings')}</h3>
          </div>
          <div className="space-y-2">
            <div>
              <div className="text-sm font-medium text-gray-700 mb-1">{t('whiteLabel')}</div>
              {openings.white_top.slice(0, 2).map((opening, index) => (
                <div key={index} className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">{opening.eco} {opening.name.slice(0, 20)}...</span>
                  <span className="text-green-600 font-medium">{(opening.winrate * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-sm font-medium text-gray-700 mb-1">{t('blackLabel')}</div>
              {openings.black_top.slice(0, 2).map((opening, index) => (
                <div key={index} className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">{opening.eco} {opening.name.slice(0, 20)}...</span>
                  <span className="text-green-600 font-medium">{(opening.winrate * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Clock className="w-5 h-5 text-purple-500" />
            <h3 className="font-semibold text-gray-900">{t('recentGames')}</h3>
          </div>
          <div className="space-y-2">
            {recent10.slice(0, 5).map((game, index) => (
              <div key={index} className="flex items-center justify-between text-sm">
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getResultColor(game.result)}`}>
                    {game.result}
                  </span>
                  <span className="text-gray-600">vs {game.opponent}</span>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <div>{game.opp_rating}</div>
                  <div>{game.eco}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {onAnalyzeClick && (
        <div className="px-6 pb-6">
          <button
            onClick={onAnalyzeClick}
            disabled={isAnalysisRunning}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold py-3 px-6 rounded-lg transition-all flex items-center justify-center space-x-2"
          >
            {isAnalysisRunning ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{t('deepAnalysisRunning')}</span>
              </>
            ) : (
              <>
                <TrendingUp className="w-5 h-5" />
                <span>{t('startDeepAnalysis')}</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
