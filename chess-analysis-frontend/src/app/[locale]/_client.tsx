'use client';

import { FormEvent, useState, useRef, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '../../i18n/navigation';
import { translatePlayingStyle } from '@/lib/playingStyle';
import {
  ArrowRight,
  BarChart3,
  Gauge,
  GitBranch,
  Search,
  Sparkles,
  Swords,
  Clock,
  X,
  Trash2,
  ExternalLink,
} from 'lucide-react';
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
  const locale = useLocale();

  const router = useRouter();
  const [username, setUsername] = useState('');
  const [platform, setPlatform] = useState<'chess.com' | 'lichess'>('chess.com');
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
    { icon: Sparkles, title: t('feature3Title'), description: t('feature3Desc') },
  ];

  const startAnalysis = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = username.trim();
    if (trimmed) addUsername(trimmed);
    const params = new URLSearchParams();
    if (trimmed) params.set('username', trimmed);
    params.set('platform', platform);
    params.set('n', String(gameCount));
    params.set('priority', priority);
    router.push(`/analyze?${params.toString()}`);
  };

  // 상대 정찰: 동일한 분석 흐름을 쓰되 focus=scout로 결과에서 공략법 섹션으로 유도
  const startScout = () => {
    const trimmed = username.trim();
    if (!trimmed) return;
    addUsername(trimmed);
    const params = new URLSearchParams();
    params.set('username', trimmed);
    params.set('platform', platform);
    params.set('n', String(gameCount));
    params.set('priority', priority);
    params.set('focus', 'scout');
    router.push(`/analyze?${params.toString()}`);
  };

  return (
    <main className="chess-toss min-h-screen bg-gray-50">
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
              <div className="grid gap-2 sm:gap-3 sm:grid-cols-[1fr_auto] lg:grid-cols-[1fr_110px_120px_126px_auto]">
                <label className="sr-only" htmlFor="home-username">
                  {platform === 'lichess' ? 'Lichess' : 'Chess.com'} username
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
                    placeholder={platform === 'lichess' ? 'Lichess username' : 'Chess.com username'}
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

                {/* selects + button: 모바일에서 한 row, lg에서 각 셀 */}
                <div className="grid grid-cols-2 gap-2 sm:flex lg:contents">
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value as 'chess.com' | 'lichess')}
                    className="h-11 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-black focus:bg-white sm:flex-1 lg:w-[110px] lg:flex-none"
                  >
                    <option value="chess.com">Chess.com</option>
                    <option value="lichess">Lichess</option>
                  </select>

                  <select
                    value={gameCount}
                    onChange={(e) => setGameCount(Number(e.target.value))}
                    className="h-11 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-black focus:bg-white sm:flex-1 lg:w-[120px] lg:flex-none"
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
                      if (gameCount > MODE_MAX_GAMES[next]) {
                        setGameCount(MODE_MAX_GAMES[next]);
                      }
                    }}
                    className="h-11 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-black focus:bg-white sm:flex-1 lg:w-[126px] lg:flex-none"
                  >
                    <option value="fast">Fast</option>
                    <option value="balanced">Balanced</option>
                    <option value="precise">Precise</option>
                  </select>

                  <button
                    type="submit"
                    className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-black px-5 text-sm font-bold text-white hover:bg-zinc-800 sm:col-span-1 sm:flex-shrink-0"
                  >
                    {t('start')}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </form>

            {/* ── 상대 정찰 (같은 username으로 공략법 중심 진입) ────────── */}
            <button
              type="button"
              onClick={startScout}
              disabled={!username.trim()}
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-5 text-sm font-bold text-zinc-900 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              <Swords className="h-4 w-4" />
              {t('scoutButton')}
            </button>

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
                              {translatePlayingStyle(entry.playingStyle, locale)}
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

                      {/* 액션 버튼 묶음 */}
                      <div className="flex-shrink-0 flex items-center gap-1.5">
                        {/* 결과 보기 — 모바일에선 아이콘만, sm+ 에서 텍스트 포함 */}
                        <button
                          type="button"
                          onClick={() => router.push(`/analysis/${entry.jobId}`)}
                          className="flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition-colors"
                        >
                          <ExternalLink className="h-3 w-3 flex-shrink-0" />
                          <span className="hidden sm:inline">{t('viewResult')}</span>
                        </button>

                        {/* 재분석 — sm+ 에서만 표시 */}
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
                          className="hidden sm:block rounded-md bg-zinc-950 px-3 py-1.5 text-xs font-bold text-white hover:bg-zinc-700 transition-colors"
                        >
                          {t('reanalyze')}
                        </button>

                        {/* 삭제 — 모바일은 항상 표시, 데스크탑은 hover 시 */}
                        <button
                          type="button"
                          onClick={() => removeAnalysis(entry.jobId)}
                          className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity p-1"
                          aria-label={t('removeEntry')}
                        >
                          <X className="h-4 w-4 text-zinc-400 hover:text-zinc-700" />
                        </button>
                      </div>
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
