'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BarChart3,
  Gauge,
  GitBranch,
  Search,
  ShieldCheck,
  Swords,
} from 'lucide-react';

const featureRows = [
  {
    icon: Gauge,
    title: '성과 지표',
    description: '정확도, 평균 손실, 실수 패턴을 한 화면에서 확인합니다.',
  },
  {
    icon: GitBranch,
    title: '오프닝 레퍼토리',
    description: '백/흑으로 자주 쓰는 오프닝과 최근 게임 내 비율을 분리해 보여줍니다.',
  },
  {
    icon: BarChart3,
    title: '12차원 스타일',
    description: '공격성, 포지셔널, 엔드게임, 시간관리까지 플레이 성향을 수치화합니다.',
  },
  {
    icon: ShieldCheck,
    title: '비용 보호 베타',
    description: 'Redis 기반 일일 제한과 대기열 제한으로 공개 테스트 비용을 통제합니다.',
  },
];

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
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [gameCount, setGameCount] = useState(10);
  const [priority, setPriority] = useState<'fast' | 'balanced' | 'precise'>('fast');

  const startAnalysis = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (username.trim()) {
      params.set('username', username.trim());
    }
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
              <span className="block text-xs font-medium text-zinc-500">Stockfish profile lab</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => router.push('/analyze')}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            <Search className="h-4 w-4" />
            분석 화면
          </button>
        </div>
      </header>

      <section className="chess-hero">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-6 lg:grid-cols-[1fr_420px] lg:px-8 lg:py-16">
          <div className="flex flex-col justify-center">
            <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-600">
              <Swords className="h-3.5 w-3.5" />
              Chess.com recent-game analysis
            </div>

            <h1
              className="max-w-4xl text-4xl font-black leading-tight tracking-normal text-zinc-950 sm:text-5xl lg:text-5xl xl:text-6xl"
              style={{ wordBreak: 'keep-all' }}
            >
              최근 게임을 읽고
              <br />
              체스 스타일을 숫자로 정리합니다
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-600 sm:text-lg">
              Stockfish 분석 결과를 성과 지표, 오프닝 레퍼토리, 12차원 스타일 프로파일로 압축해 보여줍니다.
              지금은 Chess.com 사용자 분석에 집중한 공개 베타입니다.
            </p>

            <form onSubmit={startAnalysis} className="mt-8 max-w-2xl rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
              <div className="grid gap-3 lg:grid-cols-[1fr_120px_126px_auto]">
                <label className="sr-only" htmlFor="home-username">
                  Chess.com username
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    id="home-username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Chess.com username"
                    className="h-11 w-full rounded-lg border border-zinc-300 bg-zinc-50 pl-9 pr-3 text-sm font-medium text-zinc-950 outline-none focus:border-black focus:bg-white"
                  />
                </div>

                <select
                  value={gameCount}
                  onChange={(event) => setGameCount(Number(event.target.value))}
                  className="h-11 rounded-lg border border-zinc-300 bg-zinc-50 px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-black focus:bg-white"
                  aria-label="분석 게임 수"
                >
                  <option value={5}>5 games</option>
                  <option value={10}>10 games</option>
                  <option value={20}>20 games</option>
                </select>

                <select
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as 'fast' | 'balanced' | 'precise')}
                  className="h-11 rounded-lg border border-zinc-300 bg-zinc-50 px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-black focus:bg-white"
                  aria-label="분석 모드"
                >
                  <option value="fast">Fast</option>
                  <option value="balanced">Balanced</option>
                  <option value="precise">Precise</option>
                </select>

                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-black px-5 text-sm font-bold text-white hover:bg-zinc-800"
                >
                  시작
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>
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
            <p className="text-sm font-bold text-zinc-500">Analysis surface</p>
            <h2 className="mt-2 text-2xl font-black text-zinc-950">첫 화면에서 바로 이어지는 분석 흐름</h2>
          </div>
          <button
            type="button"
            onClick={() => router.push('/analyze')}
            className="hidden h-10 items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-900 hover:bg-zinc-50 sm:inline-flex"
          >
            전체 분석 화면 열기
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
