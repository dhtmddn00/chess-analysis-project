'use client';

import { FormEvent, useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '../../i18n/navigation';
import {
  ArrowRight,
  BarChart3,
  Gauge,
  GitBranch,
  Search,
  ShieldCheck,
  Swords,
  Clock,
  X,
  Trash2,
} from 'lucide-react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useLocalHistory } from '@/hooks/useLocalHistory';

const boardPieces = [
  '♜', '♞', '♝', '♛', '♚', '♝', '♞', '♜',
  '♟', '♟', '♟', '♟', '♟', '♟', '♟', '♟',
  '', '', '', '', '', '', '', '',
  '', '', '', '♙', '', '', '', '',
  '', '', '', '', '♘', '', '', '',
  '', '', '', '', '', '', '', '',
  '♙', '♙', '♙', '', '♙', '♙', '♙', '♙',
  '♖', '', '♗', '♕', '♔', '♗', '♘', '♖',
];

export default function Home() {
  const t = useTranslations('Home');
  const tNav = useTranslations('Nav');
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [gameCount, setGameCount] = useState(10);
  const [priority, setPriority] = useState<'fast' | 'balanced' | 'precise'>('fast');

  const { recentUsernames, recentAnalyses, addUsername, removeAnalysis, clearHistory } = useLocalHistory();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // 마지막으로 사용한 유저명 자동 채우기
  useEffect(() => {
    if (recentUsernames.length > 0 && !username) {
      setUsername(recentUsernames[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentUsernames]);

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        !inputRef.current?.contains(e.target as Node) &&
        !suggestionsRef.current?.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const MODE_MAX_GAMES = { fast: 50, balanced: 30, precise: 20 } as const;
  const availableGameCounts = ([10, 20, 30, 50] as const).filter(
    (n) => n <= MODE_MAX_GAMES[priority],
  );

  const featureRows = [
    { icon: Gauge, title: t('feature0Title'), description: t('feature0Desc') },
    { icon: GitBranch, title: t('feature1Title'), description: t('feature1Desc') },
    { icon: BarChart3, title: t('feature2Title'), description: t('feature2Desc') },
    { icon: ShieldCheck, title: t('feature3Title'), description: t('feature3Desc') },
  ];

  const startAnalysis = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = username.trim();
    if (trimmed) addUsername(trimmed);
    const params = new URLSearchParams();
    if (trimmed) params.set('username', trimmed);
    params.set('n', String(gameCount));
    params.set('priority', priority);
    router.push(`/analyze?${params.toString()}`);
  };

  return (
    <main className="chess-toss min-h-screen bg-gray-50">
      <header className="border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="flex items-center gap-3 text-left"
            aria-label="Chess Analysis home"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-black text-xl text-white">
              ♘
            </span>
            <span>
              <span className="block text-base font-bold text-zinc-950">Chess Analysis</span>
              <span className="block text-xs font-medium text-zinc-500">{tNav('logoSubtitle')}</span>
            </span>
          </button>

          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <button
              type="button"
              onClick={() => router.push('/analyze')}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              <Search className="h-4 w-4" />
              {tNav('analyzeScreen')}
            </button>
          </div>
        </div>
      </header>

      <section className="chess-hero">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-6 lg:grid-cols-[1fr_420px] lg:px-8 lg:py-16">
          <div className="flex flex-col justify-center">
            <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600">
              <Swords className="h-3.5 w-3.5" />
              {t('badge')}
            </div>

            <h1
              className="max-w-4xl text-4xl font-black leading-tight tracking-normal text-zinc-950 sm:text-5xl lg:text-5xl xl:text-6xl"
              style={{ wordBreak: 'keep-all' }}
            >
              {t('heroTitle').split('\n').map((line, i) => (
                <span key={i}>{line}{i === 0 && <br />}</span>
              ))}
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-600 sm:text-lg">
              {t('heroSubtitle')}
            </p>

            <form onSubmit={startAnalysis} className="mt-8 max-w-2xl rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
              <div className="grid gap-3 lg:grid-cols-[1fr_120px_126px_auto]">
                <label className="sr-only" htmlFor="home-username">
                  Chess.com username
                </label>
                {/* Username input + recent suggestions dropdown */}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    ref={inputRef}
                    id="home-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onFocus={() => recentUsernames.length > 0 && setShowSuggestions(true)}
                    placeholder="Chess.com username"
                    className="h-11 w-full rounded-lg border border-zinc-300 bg-zinc-50 pl-9 pr-3 text-sm font-medium text-zinc-950 outline-none focus:border-black focus:bg-white"
                    autoComplete="off"
                  />
                  {/* Recent username dropdown */}
                  {showSuggestions && recentUsernames.length > 0 && (
                    <div
                      ref={suggestionsRef}
                      className="absolute left-0 top-full z-20 mt-1 w-full rounded-lg border border-zinc-200 bg-white shadow-md"
                    >
                      <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        {t('recentSearches')}
                      </p>
                      {recentUsernames.map((u) => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => { setUsername(u); setShowSuggestions(false); }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                        >
                          <Clock className="h-3.5 w-3.5 flex-shrink-0 text-zinc-400" />
                          {u}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <select
                  value={gameCount}
                  onChange={(e) => setGameCount(Number(e.target.value))}
                  className="h-11 rounded-lg border border-zinc-300 bg-zinc-50 px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-black focus:bg-white"
                >
                  {availableGameCounts.map((n) => (
                    <option key={n} value={n}>{n} games</option>
                  ))}
                </select>

                <select
                  value={priority}
                  onChange={(e) => {
                    const next = e.target.value as 'fast' | 'balanced' | 'precise';
                    setPriority(next);
                    // 선택된 게임 수가 새 모드의 최대치를 초과하면 클램프
                    if (gameCount > MODE_MAX_GAMES[next]) {
                      setGameCount(MODE_MAX_GAMES[next]);
                    }
                  }}
                  className="h-11 rounded-lg border border-zinc-300 bg-zinc-50 px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-black focus:bg-white"
                >
                  <option value="fast">Fast</option>
                  <option value="balanced">Balanced</option>
                  <option value="precise">Precise</option>
                </select>

                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-black px-5 text-sm font-bold text-white hover:bg-zinc-800"
                >
                  {t('start')}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>

            {/* ── 최근 분석 기록 ───────────────────────────────────── */}
            {recentAnalyses.length > 0 && (
              <div className="mt-6 max-w-2xl">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    {t('recentAnalyses')}
                  </h2>
                  <button
                    type="button"
                    onClick={clearHistory}
                    className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-600"
                  >
                    <Trash2 className="h-3 w-3" />
                    {t('clearHistory')}
                  </button>
                </div>
                <div className="space-y-1.5">
                  {recentAnalyses.map((entry) => (
                    <div
                      key={entry.jobId}
                      className="group flex items-center gap-3 rounded-lg border border-zinc-100 bg-white px-3 py-2.5 shadow-sm"
                    >
                      {/* 유저명 + 스타일 */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-bold text-zinc-950 truncate">
                            {entry.username}
                          </span>
                          {entry.playingStyle && (
                            <span className="text-xs text-zinc-400 truncate">
                              {entry.playingStyle}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-400">
                          <span>{t('gamesCount', { count: entry.gameCount })}</span>
                          <span>·</span>
                          <span className="font-semibold text-blue-600">
                            {entry.accuracy.toFixed(1)}%
                          </span>
                          <span>·</span>
                          <span>
                            {new Date(entry.analyzedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {/* 재분석 버튼 */}
                      <button
                        type="button"
                        onClick={() => {
                          addUsername(entry.username);
                          const params = new URLSearchParams();
                          params.set('username', entry.username);
                          params.set('n', String(entry.gameCount));
                          params.set('priority', priority);
                          router.push(`/analyze?${params.toString()}`);
                        }}
                        className="flex-shrink-0 rounded-md bg-zinc-950 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-700 transition-colors"
                      >
                        {t('reanalyze')}
                      </button>

                      {/* 삭제 버튼 — hover 시 표시 */}
                      <button
                        type="button"
                        onClick={() => removeAnalysis(entry.jobId)}
                        className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label={t('removeEntry')}
                      >
                        <X className="h-4 w-4 text-zinc-400 hover:text-zinc-700" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="relative hidden lg:block">
            <div className="absolute -right-4 -top-4 text-8xl font-black text-black/[0.035]">♕</div>
            <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-zinc-400">Live board sample</p>
                  <h2 className="mt-1 text-lg font-black text-zinc-950">Position map</h2>
                </div>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600">depth 10</span>
              </div>
              <div className="grid aspect-square grid-cols-8 overflow-hidden rounded-lg border border-zinc-300">
                {boardPieces.map((piece, index) => {
                  const isDark = (Math.floor(index / 8) + index) % 2 === 1;
                  return (
                    <div
                      key={`${piece}-${index}`}
                      className={`flex items-center justify-center text-3xl ${
                        isDark ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-950'
                      }`}
                    >
                      {piece}
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-zinc-50 p-3">
                  <p className="text-xs font-semibold text-zinc-500">Accuracy</p>
                  <p className="mt-1 text-xl font-black text-zinc-950">82%</p>
                </div>
                <div className="rounded-lg bg-zinc-50 p-3">
                  <p className="text-xs font-semibold text-zinc-500">ACPL</p>
                  <p className="mt-1 text-xl font-black text-zinc-950">38</p>
                </div>
                <div className="rounded-lg bg-zinc-50 p-3">
                  <p className="text-xs font-semibold text-zinc-500">Style</p>
                  <p className="mt-1 text-xl font-black text-zinc-950">♞</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-end justify-between gap-6">
          <div>
            <p className="text-sm font-bold text-zinc-500">{t('analysisSurface')}</p>
            <h2 className="mt-2 text-2xl font-black text-zinc-950">{t('analysisSurfaceTitle')}</h2>
          </div>
          <button
            type="button"
            onClick={() => router.push('/analyze')}
            className="hidden h-10 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-900 hover:bg-zinc-50 sm:inline-flex"
          >
            {t('openFullAnalysis')}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {featureRows.map((feature) => {
            const Icon = feature.icon;
            return (
              <article key={feature.title} className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-950 text-white">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-black text-zinc-950">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{feature.description}</p>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
