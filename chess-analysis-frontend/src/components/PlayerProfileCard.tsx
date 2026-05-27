'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Globe, ExternalLink } from 'lucide-react';
import { PlayerSummary, TimeControlStats } from '../hooks/usePlayerSummary';

interface Props {
  summary: PlayerSummary;
}

type Tab = 'all' | 'rapid' | 'blitz' | 'bullet';

const TAB_META: { key: Tab; icon: string; label: string; i18nKey?: string }[] = [
  { key: 'all',    icon: '◈', label: 'All',    i18nKey: 'all' },
  { key: 'rapid',  icon: '♙', label: 'Rapid'  },
  { key: 'blitz',  icon: '♞', label: 'Blitz'  },
  { key: 'bullet', icon: '♜', label: 'Bullet' },
];

/**
 * chess.com time_control 초 값 → Tab 키 추론
 * chess.com 기준: Rapid ≥ 600s (10 min), Blitz 180-599s, Bullet < 180s
 */
function tcToTab(raw: string): Exclude<Tab, 'all'> {
  const secs = parseInt(raw.split('+')[0] ?? '0', 10);
  if (secs >= 600) return 'rapid';
  if (secs >= 180) return 'blitz';
  return 'bullet';
}

const TAB_CHIP: Record<Exclude<Tab, 'all'>, string> = {
  rapid:  'Rapid',
  blitz:  'Blitz',
  bullet: 'Bullet',
};

export function PlayerProfileCard({ summary }: Props) {
  const t = useTranslations('PlayerSummaryCard');
  const tCommon = useTranslations('Common');
  const { player, recent10, cohort_hint, openings } = summary;

  const [activeTab, setActiveTab] = useState<Tab>('all');

  /* ── active stats ──────────────────────────────── */
  const tc = player.time_controls;
  const statsMap: Record<Tab, { games: number; win: number; draw: number; loss: number; winrate: number } | null> = {
    all:    player.record_all,
    rapid:  tc?.rapid  ?? null,
    blitz:  tc?.blitz  ?? null,
    bullet: tc?.bullet ?? null,
  };
  const activeStats = statsMap[activeTab] ?? player.record_all;
  const { games, win, draw, loss, winrate } = activeStats;
  const winRate  = (winrate * 100).toFixed(1);
  const winPct   = games > 0 ? (win  / games) * 100 : 0;
  const drawPct  = games > 0 ? (draw / games) * 100 : 0;

  /* ── tabs that have data ──────────────────────── */
  const availableTabs = TAB_META.filter(
    ({ key }) => key === 'all' || statsMap[key] !== null,
  );

  /* ── filtered recent games ────────────────────── */
  const filteredGames = (recent10 || []).filter(
    (g) => activeTab === 'all' || tcToTab(g.time_control) === activeTab,
  );

  /* ── recent game helper ───────────────────────── */
  const resultStyle = (result: 'W' | 'L' | 'D') => {
    if (result === 'W') return { bg: 'bg-blue-500',  label: 'W' };
    if (result === 'L') return { bg: 'bg-red-400',   label: 'L' };
    return               { bg: 'bg-zinc-400',         label: 'D' };
  };

  /* ── rating columns ───────────────────────────── */
  const ratingColumns = [
    { key: 'rapid',  icon: '♙', label: 'Rapid'  },
    { key: 'blitz',  icon: '♞', label: 'Blitz'  },
    { key: 'bullet', icon: '♜', label: 'Bullet' },
  ] as const;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden mb-4">

      {/* ── Dark profile header ────────────────────── */}
      <div className="bg-zinc-950 text-white px-5 py-4 dark-surface">
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
          <div className="flex gap-3 sm:gap-5 flex-shrink-0">
            {ratingColumns.map(({ key, icon, label }) => {
              const rating = player.ratings?.[key]
                ?? (player.time_controls?.[key] as TimeControlStats | undefined)?.rating;
              const tcStat = player.time_controls?.[key] as TimeControlStats | undefined;
              return (
                <div key={key} className="text-center">
                  <div className="text-xl sm:text-2xl font-black tabular-nums">
                    {rating ?? <span className="text-zinc-500">—</span>}
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    {icon} {label}
                  </div>
                  {tcStat && (
                    <div className="hidden sm:block text-xs text-zinc-500 mt-0.5">
                      {(tcStat.winrate * 100).toFixed(0)}% W · {tcStat.games.toLocaleString()} {tCommon('games')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Stats tabs ─────────────────────────────── */}
      <div className="border-b border-zinc-100 bg-zinc-50">
        {/* Tab bar */}
        <div className="flex gap-0 px-5 pt-2">
          {availableTabs.map(({ key, icon, label, i18nKey }) => {
            const tabStats = statsMap[key];
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-2 text-xs font-bold border-b-2 transition-colors ${
                  isActive
                    ? 'border-zinc-900 text-zinc-900'
                    : 'border-transparent text-zinc-400 hover:text-zinc-600'
                }`}
              >
                <span>{icon}</span>
                <span>{i18nKey ? tCommon(i18nKey as Parameters<typeof tCommon>[0]) : label}</span>
                {tabStats && key !== 'all' && (
                  <span className="ml-1 text-[10px] text-zinc-400 tabular-nums font-normal">
                    {tabStats.games.toLocaleString()}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Stats strip */}
        <div className="px-5 py-2.5">
          <div className="flex items-center gap-4 text-sm flex-wrap">
            <span className="font-bold text-zinc-800">{games.toLocaleString()} {tCommon('games')}</span>
            <span className="font-black text-blue-600">{winRate}%</span>
            <span className="text-green-600 font-semibold">W {win.toLocaleString()}</span>
            <span className="text-zinc-400">D {draw.toLocaleString()}</span>
            <span className="text-red-500 font-semibold">L {loss.toLocaleString()}</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full overflow-hidden flex bg-zinc-200">
            <div className="bg-blue-500 h-full transition-all duration-300" style={{ width: `${winPct}%` }} />
            <div className="bg-zinc-300 h-full transition-all duration-300" style={{ width: `${drawPct}%` }} />
          </div>
        </div>
      </div>

      {/* ── Content ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-zinc-100">

        {/* Recent games (2/3) */}
        <div className="lg:col-span-2 p-4">
          <h3 className="text-[11px] font-black text-zinc-400 uppercase tracking-widest mb-3">
            {t('recentGames')}
          </h3>
          <div className="space-y-0.5">
            {filteredGames.slice(0, 10).map((game) => {
              const rs = resultStyle(game.result);
              const tcKey = tcToTab(game.time_control);
              // game_id에는 Chess.com 게임 전체 URL이 저장돼 있음
              const gameUrl = game.game_id || null;

              return (
                <a
                  key={game.game_id || `${game.opponent}-${game.ended_at}`}
                  href={gameUrl ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-3 px-2 py-2 rounded-lg transition-colors group ${
                    gameUrl
                      ? 'hover:bg-zinc-50 cursor-pointer'
                      : 'cursor-default'
                  }`}
                  onClick={gameUrl ? undefined : (e) => e.preventDefault()}
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

                  {/* Time control chip — hidden when already filtering by that TC */}
                  {activeTab === 'all' && (
                    <span className="text-[10px] font-semibold text-zinc-400 flex-shrink-0 bg-zinc-100 rounded px-1.5 py-0.5">
                      {TAB_CHIP[tcKey]}
                    </span>
                  )}

                  {/* Color indicator */}
                  <div
                    className={`w-4 h-4 rounded-sm border flex-shrink-0 ${
                      game.color === 'white'
                        ? 'bg-white border-zinc-300'
                        : 'bg-zinc-800 border-zinc-600'
                    }`}
                    title={game.color === 'white' ? '백' : '흑'}
                  />

                  {/* External link icon — only visible on hover */}
                  {gameUrl && (
                    <ExternalLink className="w-3 h-3 text-zinc-300 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </a>
              );
            })}
            {filteredGames.length === 0 && (
              <p className="text-center text-sm text-zinc-400 py-6">
                {activeTab === 'all'
                  ? t('noGames')
                  : t('noTCGames', { tc: TAB_CHIP[activeTab as Exclude<Tab, 'all'>] })}
              </p>
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
                    <p className="text-[10px] text-zinc-400">{op.count} {tCommon('games')}</p>
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
                    <p className="text-[10px] text-zinc-400">{op.count} {tCommon('games')}</p>
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
