'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { mutate } from 'swr';
import { useAuth } from '@/hooks/useAuth';
import { COUNTRIES } from '@/lib/countries';
import { TrendChart } from '@/components/TrendChart';
import { User, Settings, KeyRound, TrendingUp, History, Loader2, CheckCircle2 } from 'lucide-react';

interface HistoryItem {
  id: string;
  username: string;
  platform: string;
  gameCount: number;
  createdAt: string;
  avgAccuracy: number | null;
  avgAcpl: number | null;
  tacticalRating: number | null;
  positionalRating: number | null;
  endgameRating: number | null;
  timeManagementRating: number | null;
}

export default function MyPage() {
  const t = useTranslations('MyPage');
  const tAuth = useTranslations('Auth');
  const router = useRouter();
  const { user, isLoading, isAuthenticated } = useAuth();

  const [history, setHistory] = useState<HistoryItem[] | null>(null);

  // 프로필 수정 폼
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [profileMsg, setProfileMsg] = useState<'idle' | 'saving' | 'saved' | 'taken' | 'error'>('idle');

  // 비밀번호 변경 폼
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState<'idle' | 'saving' | 'saved' | 'wrong' | 'mismatch' | 'error'>('idle');

  // 미로그인 → 로그인 페이지로
  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push('/auth/login');
  }, [isLoading, isAuthenticated, router]);

  // 유저 정보로 폼 초기화
  useEffect(() => {
    if (user) {
      setName(user.name);
      setCountry(user.country ?? '');
    }
  }, [user]);

  // 분석 이력 로드
  useEffect(() => {
    if (!isAuthenticated) return;
    fetch('/api/v1/me/analyses', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : []))
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [isAuthenticated]);

  const handleProfileSave = async (e: FormEvent) => {
    e.preventDefault();
    setProfileMsg('saving');
    try {
      const res = await fetch('/api/v1/me/profile', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), country }),
      });
      if (res.status === 409) { setProfileMsg('taken'); return; }
      if (!res.ok) { setProfileMsg('error'); return; }
      await mutate('/api/v1/auth/me');
      setProfileMsg('saved');
      setTimeout(() => setProfileMsg('idle'), 2500);
    } catch {
      setProfileMsg('error');
    }
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    if (pwForm.next !== pwForm.confirm) { setPwMsg('mismatch'); return; }
    setPwMsg('saving');
    try {
      const res = await fetch('/api/v1/me/password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
      });
      if (res.status === 403) { setPwMsg('wrong'); return; }
      if (!res.ok) { setPwMsg('error'); return; }
      setPwForm({ current: '', next: '', confirm: '' });
      setPwMsg('saved');
      setTimeout(() => setPwMsg('idle'), 2500);
    } catch {
      setPwMsg('error');
    }
  };

  if (isLoading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-300" />
      </div>
    );
  }

  const completed = (history ?? []).filter(h => h.avgAccuracy != null);
  const xLabels = completed.map(h =>
    new Date(h.createdAt).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }));

  const inputCls = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {/* 프로필 카드 */}
      <div className="mb-6 flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-950 text-xl text-white">
          <User className="h-7 w-7" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold text-zinc-900">{user.name}</h1>
          <p className="truncate text-sm text-zinc-500">{user.email}</p>
          <p className="mt-0.5 text-xs text-zinc-400">
            {COUNTRIES.find(c => c.code === user.country)?.name ?? ''}
            {user.country ? ' · ' : ''}{t('joinedAt', { date: new Date(user.createdAt).toLocaleDateString() })}
          </p>
        </div>
      </div>

      {/* 지표 변화 그래프 */}
      <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-900">
          <TrendingUp className="h-4 w-4" /> {t('trendTitle')}
        </h2>
        {history === null ? (
          <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin text-zinc-300" />
        ) : completed.length < 2 ? (
          <p className="py-6 text-center text-sm text-zinc-400">{t('needMoreAnalyses')}</p>
        ) : (
          <div className="space-y-6">
            <div>
              <p className="mb-1 text-xs font-semibold text-zinc-500">{t('accuracyAcpl')}</p>
              <TrendChart
                xLabels={xLabels}
                series={[
                  { label: t('accuracy'), color: '#10b981', values: completed.map(h => h.avgAccuracy) },
                  { label: 'ACPL', color: '#f59e0b', values: completed.map(h => h.avgAcpl) },
                ]}
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-zinc-500">{t('styleDimensions')}</p>
              <TrendChart
                xLabels={xLabels}
                yMin={0} yMax={100}
                series={[
                  { label: t('tactical'), color: '#3b82f6', values: completed.map(h => h.tacticalRating) },
                  { label: t('positional'), color: '#8b5cf6', values: completed.map(h => h.positionalRating) },
                  { label: t('endgame'), color: '#ec4899', values: completed.map(h => h.endgameRating) },
                  { label: t('timeManagement'), color: '#14b8a6', values: completed.map(h => h.timeManagementRating) },
                ]}
              />
            </div>
          </div>
        )}
      </section>

      {/* 분석 이력 */}
      <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-900">
          <History className="h-4 w-4" /> {t('historyTitle')}
        </h2>
        {history === null ? (
          <Loader2 className="mx-auto my-8 h-6 w-6 animate-spin text-zinc-300" />
        ) : history.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-400">{t('noHistory')}</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {[...history].reverse().map(h => (
              <li key={h.id}>
                <Link href={`/analysis/${h.id}`}
                  className="flex items-center justify-between gap-3 py-3 hover:bg-zinc-50 -mx-2 px-2 rounded-lg">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-900">
                      {h.username} <span className="font-normal text-zinc-400">· {h.platform}</span>
                    </p>
                    <p className="text-xs text-zinc-400">
                      {new Date(h.createdAt).toLocaleDateString()} · {h.gameCount} {t('games')}
                    </p>
                  </div>
                  {h.avgAccuracy != null && (
                    <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-bold text-zinc-700">
                      {h.avgAccuracy.toFixed(1)}%
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 계정 설정 */}
      <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-900">
          <Settings className="h-4 w-4" /> {t('settingsTitle')}
        </h2>
        <form onSubmit={handleProfileSave} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">{tAuth('name')}</label>
            <input type="text" value={name} minLength={2} maxLength={30} required
              onChange={e => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">{tAuth('country')}</label>
            <select value={country} onChange={e => setCountry(e.target.value)}
              className={inputCls + ' bg-white'}>
              <option value="">{tAuth('countryPlaceholder')}</option>
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={profileMsg === 'saving'}
              className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50">
              {t('save')}
            </button>
            {profileMsg === 'saved' && <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />{t('saved')}</span>}
            {profileMsg === 'taken' && <span className="text-xs text-red-500">{tAuth('errorNameTaken')}</span>}
            {profileMsg === 'error' && <span className="text-xs text-red-500">{tAuth('errorGeneric')}</span>}
          </div>
        </form>
      </section>

      {/* 비밀번호 변경 */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-900">
          <KeyRound className="h-4 w-4" /> {t('passwordTitle')}
        </h2>
        <form onSubmit={handlePasswordChange} className="space-y-3">
          <input type="password" placeholder={t('currentPassword')} required autoComplete="current-password"
            value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
            className={inputCls} />
          <input type="password" placeholder={tAuth('newPassword')} required minLength={8} maxLength={72} autoComplete="new-password"
            value={pwForm.next} onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
            className={inputCls} />
          <input type="password" placeholder={tAuth('confirmPassword')} required autoComplete="new-password"
            value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
            className={inputCls} />
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pwMsg === 'saving'}
              className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50">
              {t('changePassword')}
            </button>
            {pwMsg === 'saved' && <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />{t('saved')}</span>}
            {pwMsg === 'wrong' && <span className="text-xs text-red-500">{t('wrongCurrentPassword')}</span>}
            {pwMsg === 'mismatch' && <span className="text-xs text-red-500">{tAuth('errorPasswordMismatch')}</span>}
            {pwMsg === 'error' && <span className="text-xs text-red-500">{tAuth('errorGeneric')}</span>}
          </div>
        </form>
      </section>
    </div>
  );
}
