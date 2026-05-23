'use client';

import { useTranslations } from 'next-intl';
import { Globe } from 'lucide-react';
import { PlayerSummary } from '../hooks/usePlayerSummary';

interface Props {
  summary: PlayerSummary;
}

export function PlayerProfileCard({ summary }: Props) {
  const t = useTranslations('PlayerSummaryCard');
  const { player, recent10, cohort_hint, openings } = summary;

  const wins = player.record_all.win;
  const draws = player.record_all.draw;
  const losses = player.record_all.loss;
  const total = player.record_all.games || 1;
  const winRate = (player.record_all.winrate * 100).toFixed(1);
  const winPct = (wins / total) * 100;
  const drawPct = (draws / total) * 100;

  const resultStyle = (result: 'W' | 'L' | 'D') => {
    if (result === 'W') return { bg: 'bg-blue-500', label: 'W' };
    if (result === 'L') return { bg: 'bg-red-400', label: 'L' };
    return { bg: 'bg-zinc-400', label: 'D' };
  };

  const ratingColumns = [
    { key: 'rapid', icon: '♙', label: 'Rapid' },
    { key: 'blitz', icon: '♞', label: 'Blitz' },
    { key: 'bullet', icon: '♜', label: 'Bullet' },
  ] as const;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden mb-4">
      {/* ── Dark profile header ──────────────────────────────── */}
      <div className="bg-zinc-950 text-white px-5 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Avatar + meta */}
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full overflow-hidden bg-zinc-700 flex-shrink-0 border-2 border-zinc-600">
              {player.avatar ? (
                <img src={player.avatar} alt={player.username} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xl font-black text-zinc-300">
                  {player.username.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">{player.username}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {player.country && (
                  <span className="flex items-center gap-1 text-zinc-400 text-xs">
                    <Globe className="w-3 h-3" />
                    {player.country}
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-semibold">
                  {cohort_hint.note}
                </span>
              </div>
            </div>
          </div>

          {/* Ratings */}
          <div className="flex gap-5 flex-shrink-0">
            {ratingColumns.map(({ key, icon, label }) => {
              const rating = player.ratings?.[key]
                ?? (player.time_controls?.[key] as { rating?: number } | undefined)?.rating;
              const tc = player.time_controls?.[key] as
                | { rating: number; winrate: number; games: number }
                | undefined;
              return (
                <div key={key} className="text-center">
                  <div className="text-2xl font-black tabular-nums">
                    {rating ?? <span className="text-zinc-500">—</span>}
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    {icon} {label}
                  </div>
                  {tc && (
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {(tc.winrate * 100).toFixed(0)}% W · {tc.games.toLocaleString()}판
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Stats strip ──────────────────────────────────────── */}
      <div className="border-b border-zinc-100 bg-zinc-50 px-5 py-2.5">
        <div className="flex items-center gap-4 text-sm flex-wrap">
          <span className="font-bold text-zinc-800">{player.record_all.games.toLocaleString()}게임</span>
          <span className="font-black text-blue-600">{winRate}%</span>
          <span className="text-green-600 font-semibold">W {wins.toLocaleString()}</span>
          <span className="text-zinc-400">D {draws.toLocaleString()}</span>
          <span className="text-red-500 font-semibold">L {losses.toLocaleString()}</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full overflow-hidden flex bg-zinc-200">
          <div className="bg-blue-500 h-full" style={{ width: `${winPct}%` }} />
          <div className="bg-zinc-300 h-full" style={{ width: `${drawPct}%` }} />
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-zinc-100">
        {/* Recent games (2/3) */}
        <div className="lg:col-span-2 p-4">
          <h3 className="text-[11px] font-black text-zinc-400 uppercase tracking-widest mb-3">
            {t('recentGames')}
          </h3>
          <div className="space-y-0.5">
            {(recent10 || []).slice(0, 10).map((game, i) => {
              const rs = resultStyle(game.result);
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-zinc-50 transition-colors group"
                >
                  {/* W/L/D badge */}
                  <span
                    className={`${rs.bg} text-white text-[11px] font-black w-6 h-6 rounded flex items-center justify-center flex-shrink-0`}
                  >
                    {rs.label}
                  </span>

                  {/* Opponent */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 min-w-0">
                      <span className="font-semibold text-zinc-900 text-sm truncate">
                        {game.opponent}
                      </span>
                      {game.opp_rating > 0 && (
                        <span className="text-xs text-zinc-400 flex-shrink-0 tabular-nums">
                          {game.opp_rating}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate">
                      {game.eco && game.eco !== '---' && (
                        <span className="font-mono mr-1">{game.eco}</span>
                      )}
                      {game.opening_name
                        ? <span>{game.opening_name}</span>
                        : <span>{game.time_control}</span>
                      }
                    </div>
                  </div>

                  {/* Color indicator */}
                  <div
                    className={`w-4 h-4 rounded-sm border flex-shrink-0 ${
                      game.color === 'white'
                        ? 'bg-white border-zinc-300'
                        : 'bg-zinc-800 border-zinc-600'
                    }`}
                    title={game.color === 'white' ? '백' : '흑'}
                  />
                </div>
              );
            })}
            {(!recent10 || recent10.length === 0) && (
              <p className="text-center text-sm text-zinc-400 py-6">최근 게임 없음</p>
            )}
          </div>
        </div>

        {/* Openings (1/3) */}
        <div className="p-4 space-y-5">
          {/* White openings */}
          <div>
            <h3 className="text-[11px] font-black text-zinc-400 uppercase tracking-widest mb-3">
              {t('whiteLabel')}
            </h3>
            <div className="space-y-2.5">
              {(openings.white_top || []).slice(0, 3).map((op, i) => (
                <div key={i} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-zinc-400">{op.eco}</p>
                    <p className="text-xs text-zinc-700 truncate leading-tight">{op.name}</p>
                    <p className="text-[10px] text-zinc-400">{op.count}판</p>
                  </div>
                  <span className="text-sm font-black text-blue-600 flex-shrink-0 tabular-nums">
                    {(op.winrate * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Black openings */}
          <div>
            <h3 className="text-[11px] font-black text-zinc-400 uppercase tracking-widest mb-3">
              {t('blackLabel')}
            </h3>
            <div className="space-y-2.5">
              {(openings.black_top || []).slice(0, 3).map((op, i) => (
                <div key={i} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-zinc-400">{op.eco}</p>
                    <p className="text-xs text-zinc-700 truncate leading-tight">{op.name}</p>
                    <p className="text-[10px] text-zinc-400">{op.count}판</p>
                  </div>
                  <span className="text-sm font-black text-blue-600 flex-shrink-0 tabular-nums">
                    {(op.winrate * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
