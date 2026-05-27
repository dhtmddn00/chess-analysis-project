'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, TrendingUp, RefreshCw, Clock, CheckCircle, XCircle, Loader2, BarChart2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter, Link } from '../../../i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { useLocalHistory } from '@/hooks/useLocalHistory';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnalysisEntry {
  id: string;
  username: string;
  platform: string;
  gameCount: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  progress: number;
  createdAt: string;
  updatedAt: string;
  shortLink?: string | null;
  // merged from localStorage
  accuracy?: number;
  playingStyle?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

// Simple SVG sparkline for accuracy trend
function AccuracySparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const W = 120, H = 36, PAD = 4;
  const min = Math.min(...values) - 2;
  const max = Math.max(...values) + 2;
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
    const y = PAD + ((max - v) / range) * (H - PAD * 2);
    return `${x},${y}`;
  });
  const polyline = pts.join(' ');
  const last = pts[pts.length - 1].split(',');
  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline points={polyline} fill="none" stroke="#18181b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill="#18181b" />
    </svg>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status, t }: { status: AnalysisEntry['status']; t: (k: string) => string }) {
  const map = {
    COMPLETED:   { label: t('statusCompleted'),   cls: 'bg-green-50 text-green-700 border-green-200',   icon: <CheckCircle className="h-3 w-3" /> },
    PENDING:     { label: t('statusPending'),      cls: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: <Clock className="h-3 w-3" /> },
    IN_PROGRESS: { label: t('statusInProgress'),   cls: 'bg-blue-50 text-blue-700 border-blue-200',      icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    FAILED:      { label: t('statusFailed'),       cls: 'bg-red-50 text-red-700 border-red-200',         icon: <XCircle className="h-3 w-3" /> },
  } as const;
  const { label, cls, icon } = map[status] ?? map.PENDING;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {icon}{label}
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const t = useTranslations('History');
  const tCommon = useTranslations('Common');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { recentAnalyses } = useLocalHistory();

  const [username, setUsername] = useState(searchParams.get('u') ?? '');
  const [platform, setPlatform] = useState(searchParams.get('p') ?? 'chess.com');
  const [entries, setEntries] = useState<AnalysisEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Merge localStorage accuracy data into server entries
  const merged = useMemo<AnalysisEntry[]>(() => {
    const localMap = new Map(recentAnalyses.map(r => [r.jobId, r]));
    return entries.map(e => {
      const local = localMap.get(e.id);
      return {
        ...e,
        accuracy: local?.accuracy,
        playingStyle: local?.playingStyle,
      };
    });
  }, [entries, recentAnalyses]);

  const completedAccuracies = useMemo(
    () => merged.filter(e => e.status === 'COMPLETED' && e.accuracy != null).map(e => e.accuracy as number).reverse(),
    [merged]
  );

  const fetchHistory = useCallback(async (u: string, p: string) => {
    if (!u.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/analysis/user/${encodeURIComponent(u.trim())}?platform=${encodeURIComponent(p)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: AnalysisEntry[] = await res.json();
      // Sort newest first
      data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setEntries(data);
      setHasSearched(true);
    } catch {
      setError(t('error'));
      setEntries([]);
      setHasSearched(true);
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Auto-load if username provided via URL
  useEffect(() => {
    const u = searchParams.get('u');
    const p = searchParams.get('p') ?? 'chess.com';
    if (u) fetchHistory(u, p);
  }, [searchParams, fetchHistory]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchHistory(username, platform);
  };

  return (
    <div className="chess-toss min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
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
              <BarChart2 className="h-3.5 w-3.5" />
              {t('title')}
            </div>
            <h1 className="text-2xl font-bold text-zinc-900">{t('title')}</h1>
            <p className="mt-1 text-sm text-zinc-500">{t('subtitle')}</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Search form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder={t('searchPlaceholder')}
                className="w-full rounded-lg border border-zinc-300 px-3.5 py-2.5 text-sm font-medium placeholder-zinc-400 focus:border-zinc-500 focus:outline-none"
              />
            </div>
            <select
              value={platform}
              onChange={e => setPlatform(e.target.value)}
              className="rounded-lg border border-zinc-300 px-3 py-2.5 text-sm font-medium focus:border-zinc-500 focus:outline-none bg-white"
            >
              <option value="chess.com">Chess.com</option>
              <option value="lichess">Lichess</option>
            </select>
            <button
              type="submit"
              disabled={loading || !username.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t('searchButton')}
            </button>
          </div>
        </form>

        {/* Accuracy trend */}
        {completedAccuracies.length >= 2 && (
          <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-zinc-500" />
              <h3 className="text-sm font-bold text-zinc-700">{t('trendTitle')}</h3>
            </div>
            <div className="flex items-end gap-6">
              <AccuracySparkline values={completedAccuracies} />
              <div className="text-sm text-zinc-500 space-y-0.5">
                <div>
                  <span className="font-semibold text-zinc-900">{completedAccuracies[completedAccuracies.length - 1].toFixed(1)}%</span>
                  <span className="ml-1.5 text-xs">최근</span>
                </div>
                {completedAccuracies.length >= 2 && (() => {
                  const diff = completedAccuracies[completedAccuracies.length - 1] - completedAccuracies[0];
                  return (
                    <div className={`text-xs font-semibold ${diff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {diff >= 0 ? '+' : ''}{diff.toFixed(1)}% ({completedAccuracies.length}회)
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {loading && (
          <div className="flex items-center justify-center py-16 gap-3 text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">{t('loading')}</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600 font-medium">
            {error}
          </div>
        )}

        {!loading && hasSearched && merged.length === 0 && !error && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">♟</span>
            </div>
            <h3 className="font-bold text-zinc-900 mb-1">{t('noHistory')}</h3>
            <p className="text-sm text-zinc-500">{t('noHistoryHint')}</p>
          </div>
        )}

        {!loading && merged.length > 0 && (
          <div className="space-y-3">
            {merged.map((entry) => (
              <div
                key={entry.id}
                className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm hover:border-zinc-300 transition-colors"
              >
                <div className="flex flex-col gap-3">
                  {/* 상단: 메타 정보 */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <StatusBadge status={entry.status} t={t} />
                        <span className="text-xs text-zinc-400">
                          {t('gamesCount', { count: entry.gameCount })}
                        </span>
                        <span className="text-xs text-zinc-400 hidden sm:inline">
                          {t('createdAt', { date: formatDate(entry.createdAt) })}
                        </span>
                      </div>
                      {entry.playingStyle && (
                        <span className="inline-block text-xs text-zinc-600 bg-zinc-100 rounded-full px-2 py-0.5 font-semibold mb-1.5">
                          {entry.playingStyle}
                        </span>
                      )}
                      {entry.accuracy != null && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-xs text-zinc-500">{t('accuracyLabel')}</span>
                          <span className="text-sm font-bold text-zinc-900">{entry.accuracy.toFixed(1)}%</span>
                          <div className="flex-1 max-w-24 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                            <div className="h-full bg-zinc-900 rounded-full" style={{ width: `${Math.min(entry.accuracy, 100)}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                    {/* 날짜 — 모바일에선 우측 상단에 작게 */}
                    <span className="text-[11px] text-zinc-400 flex-shrink-0 sm:hidden">
                      {formatDate(entry.createdAt)}
                    </span>
                  </div>

                  {/* 하단: 액션 버튼 */}
                  <div className="flex items-center gap-2">
                    {entry.status === 'COMPLETED' && (
                      <Link
                        href={`/analysis/${entry.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-950 px-3 py-2 text-xs font-bold text-white hover:bg-zinc-800 transition-colors"
                      >
                        {t('viewResult')}
                      </Link>
                    )}
                    <Link
                      href={`/analyze?username=${encodeURIComponent(entry.username)}&platform=${encodeURIComponent(entry.platform)}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:border-zinc-400 transition-colors"
                    >
                      <RefreshCw className="h-3 w-3" />
                      {t('reanalyze')}
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
