'use client';

import { useEffect, useState } from 'react';
import { Github, Mail, Eye, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface SiteStats {
  totalViews: number;
  todayUniqueViews: number;
  counted: boolean;
  date: string;
}

const VISITOR_ID_KEY = 'chess-analysis-visitor-id';

function getOrCreateVisitorId() {
  const existing = window.localStorage.getItem(VISITOR_ID_KEY);
  if (existing) return existing;
  const id = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(VISITOR_ID_KEY, id);
  return id;
}

export function SiteFooter() {
  const t = useTranslations('SiteFooter');
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [statsUnavailable, setStatsUnavailable] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const recordVisit = async () => {
      try {
        const visitorId = getOrCreateVisitorId();
        const response = await fetch('/api/v1/site/visit', {
          method: 'POST',
          headers: { 'X-Visitor-Id': visitorId },
        });
        if (!response.ok) {
          if (isMounted) setStatsUnavailable(true);
          return;
        }
        const data = await response.json();
        if (isMounted) { setStats(data); setStatsUnavailable(false); }
      } catch {
        if (isMounted) setStatsUnavailable(true);
      }
    };
    recordVisit();
    return () => { isMounted = false; };
  }, []);

  return (
    <footer className="border-t border-zinc-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-8 sm:px-6 lg:grid-cols-[1fr_auto] lg:px-8">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-bold text-zinc-600">
            <Sparkles className="h-3.5 w-3.5" />
            {t('builtBy')}
          </div>
          <p className="text-sm leading-6 text-zinc-600">{t('contactDesc')}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a
              href="https://github.com/dhtmddn00"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              <Github className="h-4 w-4" />
              GitHub
            </a>
            <a
              href="mailto:dhtmddn00@gmail.com"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
            >
              <Mail className="h-4 w-4" />
              dhtmddn00@gmail.com
            </a>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-zinc-950 p-5 text-white lg:min-w-72">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-300">
            <Eye className="h-4 w-4" />
            {t('visitors')}
          </div>
          <div className="text-3xl font-black">
            {stats ? stats.totalViews.toLocaleString() : statsUnavailable ? '-' : '...'}
          </div>
          <div className="mt-2 text-sm text-zinc-400">
            {stats
              ? t('todayVisits', { count: stats.todayUniqueViews.toLocaleString() })
              : statsUnavailable
                ? t('checkingServer')
                : t('recordingVisit')}
          </div>
          <div className="mt-3 text-xs leading-5 text-zinc-500">{t('oncePerDay')}</div>
        </div>
      </div>
    </footer>
  );
}
