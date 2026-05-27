'use client';

import { useState, useCallback } from 'react';
import { ArrowLeft, ArrowLeftRight, Loader2, AlertCircle, GitCompare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from '../../../i18n/navigation';
import type { AnalysisResult, StyleNumericKey } from '@/types/analysis';
import { STYLE_DIMENSIONS } from '@/types/analysis';

// ── SVG Radar Chart ───────────────────────────────────────────────────────────

interface RadarPoint { x: number; y: number }

function polarToXY(angle: number, r: number, cx: number, cy: number): RadarPoint {
  const a = (angle - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function radarPath(values: number[], cx: number, cy: number, maxR: number, maxVal: number): string {
  return values
    .map((v, i) => {
      const angle = (i / values.length) * 360;
      const r = (v / maxVal) * maxR;
      const p = polarToXY(angle, r, cx, cy);
      return `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    })
    .join(' ') + ' Z';
}

function RadarChart({
  a, b, labels, username1, username2,
}: {
  a: number[]; b: number[]; labels: string[];
  username1: string; username2: string;
}) {
  const SIZE = 260, CX = SIZE / 2, CY = SIZE / 2, MAX_R = 100;
  const N = labels.length;
  const MAX_VAL = 10;
  const rings = [2, 4, 6, 8, 10];

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-xs mx-auto">
      {/* Ring guides */}
      {rings.map(ring => {
        const pts = Array.from({ length: N }, (_, i) => {
          const p = polarToXY((i / N) * 360, (ring / MAX_VAL) * MAX_R, CX, CY);
          return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        });
        return <polygon key={ring} points={pts.join(' ')} fill="none" stroke="#e4e4e7" strokeWidth="1" />;
      })}

      {/* Axis lines */}
      {Array.from({ length: N }, (_, i) => {
        const p = polarToXY((i / N) * 360, MAX_R, CX, CY);
        return <line key={i} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke="#d4d4d8" strokeWidth="1" />;
      })}

      {/* Player A polygon */}
      <path d={radarPath(a, CX, CY, MAX_R, MAX_VAL)} fill="#18181b" fillOpacity="0.15" stroke="#18181b" strokeWidth="2" />
      {/* Player B polygon */}
      <path d={radarPath(b, CX, CY, MAX_R, MAX_VAL)} fill="#3b82f6" fillOpacity="0.15" stroke="#3b82f6" strokeWidth="2" />

      {/* Axis labels */}
      {labels.map((label, i) => {
        const angle = (i / N) * 360;
        const p = polarToXY(angle, MAX_R + 16, CX, CY);
        return (
          <text
            key={i}
            x={p.x} y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="7"
            fill="#71717a"
            fontWeight="600"
          >
            {label.length > 6 ? label.slice(0, 6) : label}
          </text>
        );
      })}
    </svg>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlayerData {
  result: AnalysisResult | null;
  loading: boolean;
  error: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchLatestCompletedResult(username: string, platform: string): Promise<AnalysisResult> {
  // 1. Get list of analyses for this user
  const listRes = await fetch(
    `/api/v1/analysis/user/${encodeURIComponent(username)}?platform=${encodeURIComponent(platform)}`
  );
  if (!listRes.ok) throw new Error(`HTTP ${listRes.status}`);
  const list: Array<{ id: string; status: string; createdAt: string }> = await listRes.json();

  // 2. Find latest COMPLETED
  const completed = list
    .filter(e => e.status === 'COMPLETED')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (completed.length === 0) throw new Error('NO_ANALYSIS');

  // 3. Fetch result
  const resultRes = await fetch(`/api/v1/analysis/${completed[0].id}/result`);
  if (!resultRes.ok) throw new Error(`HTTP ${resultRes.status}`);
  return resultRes.json();
}

// ── Stat comparison row ───────────────────────────────────────────────────────

function StatRow({
  label, a, b, higherBetter = true,
}: { label: string; a: number | null; b: number | null; higherBetter?: boolean }) {
  if (a == null && b == null) return null;
  const av = a ?? 0, bv = b ?? 0;
  const aBetter = higherBetter ? av >= bv : av <= bv;
  const fmt = (v: number) => v.toFixed(1);

  return (
    <div className="grid grid-cols-3 gap-2 py-2 border-b border-zinc-100 last:border-0 items-center">
      <div className={`text-sm font-bold text-right ${aBetter && av !== bv ? 'text-zinc-900' : 'text-zinc-400'}`}>
        {a != null ? fmt(a) : '—'}
      </div>
      <div className="text-xs text-zinc-500 text-center font-semibold">{label}</div>
      <div className={`text-sm font-bold text-left ${!aBetter && av !== bv ? 'text-zinc-900' : 'text-zinc-400'}`}>
        {b != null ? fmt(b) : '—'}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ComparePage() {
  const t  = useTranslations('Compare');
  const tA = useTranslations('Analyze');
  const tCommon = useTranslations('Common');
  const router  = useRouter();

  const [u1, setU1] = useState('');
  const [u2, setU2] = useState('');
  const [platform, setPlatform] = useState('chess.com');
  const [p1, setP1] = useState<PlayerData>({ result: null, loading: false, error: null });
  const [p2, setP2] = useState<PlayerData>({ result: null, loading: false, error: null });

  const loadPlayer = useCallback(async (
    username: string,
    setter: React.Dispatch<React.SetStateAction<PlayerData>>,
  ) => {
    if (!username.trim()) return;
    setter({ result: null, loading: true, error: null });
    try {
      const result = await fetchLatestCompletedResult(username.trim(), platform);
      setter({ result, loading: false, error: null });
    } catch (err) {
      const msg = err instanceof Error && err.message === 'NO_ANALYSIS'
        ? t('noAnalysisHint')
        : t('errorFetch');
      setter({ result: null, loading: false, error: msg });
    }
  }, [platform, t]);

  const handleCompare = (e: React.FormEvent) => {
    e.preventDefault();
    loadPlayer(u1, setP1);
    loadPlayer(u2, setP2);
  };

  const handleSwap = () => {
    setU1(u2);
    setU2(u1);
    setP1(p2);
    setP2(p1);
  };

  // Radar data
  const dimKeys = STYLE_DIMENSIONS.map(d => d.key);
  const dimLabels = STYLE_DIMENSIONS.map(d => tA(d.i18nKey as Parameters<typeof tA>[0]));
  const valuesA = dimKeys.map(k => (p1.result?.styleProfile?.[k] as number | undefined) ?? 0);
  const valuesB = dimKeys.map(k => (p2.result?.styleProfile?.[k] as number | undefined) ?? 0);

  const showRadar = p1.result?.styleProfile && p2.result?.styleProfile;

  return (
    <div className="chess-toss min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="pt-4 pb-1">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-700 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {tCommon('home')}
            </button>
          </div>
          <div className="py-5">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600">
              <GitCompare className="h-3.5 w-3.5" />
              {t('title')}
            </div>
            <h1 className="text-2xl font-bold text-zinc-900">{t('title')}</h1>
            <p className="mt-1 text-sm text-zinc-500">{t('subtitle')}</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Search form */}
        <form onSubmit={handleCompare} className="bg-white rounded-xl border border-zinc-200 p-4 sm:p-5 shadow-sm">
          {/* Platform + swap — 상단 바 */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <select
              value={platform}
              onChange={e => setPlatform(e.target.value)}
              className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-medium focus:border-zinc-500 focus:outline-none bg-white"
            >
              <option value="chess.com">Chess.com</option>
              <option value="lichess">Lichess</option>
            </select>
            <button
              type="button"
              onClick={handleSwap}
              title={t('swapPlayers')}
              className="rounded-full border border-zinc-200 p-2 hover:bg-zinc-100 transition"
            >
              <ArrowLeftRight className="h-4 w-4 text-zinc-500" />
            </button>
          </div>

          {/* Inputs + compare button */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2.5 sm:gap-3">
            {/* Player 1 */}
            <div>
              <label className="block text-xs font-bold text-zinc-500 mb-1">{t('player1')}</label>
              <input
                type="text"
                value={u1}
                onChange={e => setU1(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm font-medium placeholder-zinc-400 focus:border-zinc-500 focus:outline-none"
              />
            </div>

            {/* Player 2 */}
            <div>
              <label className="block text-xs font-bold text-zinc-500 mb-1">{t('player2')}</label>
              <input
                type="text"
                value={u2}
                onChange={e => setU2(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm font-medium placeholder-zinc-400 focus:border-zinc-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={!u1.trim() || !u2.trim()}
              className="sm:self-end w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              {t('compareButton')}
            </button>
          </div>
        </form>

        {/* Player cards + radar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Player 1 card */}
          <PlayerCard data={p1} label={t('player1')} color="zinc" t={tCommon as TFunc} tH={t as TFunc} />

          {/* Player 2 card — 모바일에서는 player1 바로 옆/아래 */}
          <div className="order-2 lg:order-3">
            <PlayerCard data={p2} label={t('player2')} color="blue" t={tCommon as TFunc} tH={t as TFunc} />
          </div>

          {/* Radar chart — 모바일에서는 두 카드 아래 (order-last), lg에서는 중앙 */}
          <div className="order-last sm:col-span-2 lg:col-span-1 lg:order-2 bg-white rounded-xl border border-zinc-200 p-5 shadow-sm flex flex-col items-center justify-center gap-4">
            {showRadar ? (
              <>
                <h3 className="text-xs font-black text-zinc-500 uppercase tracking-widest">{t('radarTitle')}</h3>
                <RadarChart
                  a={valuesA}
                  b={valuesB}
                  labels={dimLabels}
                  username1={p1.result?.username ?? ''}
                  username2={p2.result?.username ?? ''}
                />
                {/* Legend */}
                <div className="flex gap-4 text-xs font-semibold">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-zinc-900 inline-block rounded" />
                    {p1.result?.username}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 bg-blue-500 inline-block rounded" />
                    {p2.result?.username}
                  </span>
                </div>
              </>
            ) : (
              <div className="text-center text-zinc-400">
                <GitCompare className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-xs">{t('radarTitle')}</p>
              </div>
            )}
          </div>

        </div>

        {/* Stats comparison table */}
        {(p1.result || p2.result) && (
          <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm">
            <h3 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-4">{t('statsTitle')}</h3>
            <div className="grid grid-cols-3 gap-2 pb-2 border-b border-zinc-200 mb-1">
              <div className="text-xs font-black text-zinc-900 text-right">{p1.result?.username ?? t('player1')}</div>
              <div className="text-xs text-zinc-400 text-center">{t('metricsLabel')}</div>
              <div className="text-xs font-black text-zinc-900 text-left">{p2.result?.username ?? t('player2')}</div>
            </div>
            <StatRow
              label={t('accuracy')}
              a={p1.result?.averageAccuracy ?? null}
              b={p2.result?.averageAccuracy ?? null}
              higherBetter
            />
            <StatRow
              label={t('avgCpl')}
              a={p1.result?.averageCentipawnLoss ?? null}
              b={p2.result?.averageCentipawnLoss ?? null}
              higherBetter={false}
            />
            <StatRow
              label={t('blunders')}
              a={p1.result ? (p1.result.totalBlunders / Math.max(p1.result.totalGames, 1)) : null}
              b={p2.result ? (p2.result.totalBlunders / Math.max(p2.result.totalGames, 1)) : null}
              higherBetter={false}
            />
            {/* Style dimensions side-by-side */}
            {showRadar && STYLE_DIMENSIONS.map(dim => (
              <StatRow
                key={dim.key}
                label={tA(dim.i18nKey as Parameters<typeof tA>[0])}
                a={(p1.result?.styleProfile?.[dim.key] as number | undefined) ?? null}
                b={(p2.result?.styleProfile?.[dim.key] as number | undefined) ?? null}
                higherBetter={dim.key !== 'blunderTendency'}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── PlayerCard ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TFunc = (k: any, v?: any) => string;

function PlayerCard({
  data, label, color, t, tH,
}: {
  data: PlayerData;
  label: string;
  color: 'zinc' | 'blue';
  t: TFunc;
  tH: TFunc;
}) {
  const accent = color === 'blue' ? 'text-blue-600 bg-blue-50 border-blue-200' : 'text-zinc-900 bg-zinc-100 border-zinc-200';

  if (data.loading) {
    return (
      <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm flex items-center justify-center gap-2 text-zinc-400 min-h-40">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">{tH('loadingAnalysis')}</span>
      </div>
    );
  }
  if (data.error) {
    return (
      <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm flex flex-col items-center justify-center gap-2 min-h-40">
        <AlertCircle className="h-7 w-7 text-zinc-300" />
        <p className="text-sm text-zinc-500 text-center">{data.error}</p>
      </div>
    );
  }
  if (!data.result) {
    return (
      <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm flex flex-col items-center justify-center gap-2 min-h-40">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{label}</p>
        <p className="text-sm text-zinc-400">{tH('noAnalysis')}</p>
      </div>
    );
  }

  const r = data.result;
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm">
      <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">{label}</p>
      <div className="mb-3">
        <p className="text-xl font-black text-zinc-900">{r.username}</p>
        {r.styleProfile?.playingStyle && (
          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold mt-1 ${accent}`}>
            {r.styleProfile.playingStyle}
          </span>
        )}
      </div>
      <div className="space-y-2">
        <Stat label={tH('accuracy')} value={`${(r.averageAccuracy ?? 0).toFixed(1)}%`} />
        <Stat label={tH('avgCpl')} value={(r.averageCentipawnLoss ?? 0).toFixed(1)} />
        <Stat label={tH('gamesAnalyzed')} value={String(r.totalGames)} />
        {r.playerMetadata && (
          <Stat label={t('country')} value={r.playerMetadata.country ?? '—'} />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-sm font-bold text-zinc-900">{value}</span>
    </div>
  );
}
