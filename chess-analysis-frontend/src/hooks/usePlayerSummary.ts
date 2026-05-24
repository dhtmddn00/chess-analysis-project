import { useRef, useEffect } from 'react';
import useSWR from 'swr';

export interface TimeControlStats {
  rating: number;
  games: number;
  win: number;
  draw: number;
  loss: number;
  winrate: number;
}

export interface PlayerSummary {
  player: {
    username: string;
    country: string;
    avatar: string;
    ratings: Record<string, number>;
    record_all: {
      games: number;
      win: number;
      draw: number;
      loss: number;
      winrate: number;
    };
    time_controls?: {
      rapid?: TimeControlStats;
      blitz?: TimeControlStats;
      bullet?: TimeControlStats;
    };
  };
  openings: {
    white_top: Array<{
      eco: string;
      name: string;
      count: number;
      winrate: number;
    }>;
    black_top: Array<{
      eco: string;
      name: string;
      count: number;
      winrate: number;
    }>;
  };
  recent10: Array<{
    ended_at: string;
    result: 'W' | 'L' | 'D';
    opponent: string;
    opp_rating: number;
    time_control: string;
    color: 'white' | 'black';
    eco: string;
    opening_name?: string;
    termination: string;
    game_id: string;
  }>;
  cohort_hint: {
    band: string;
    note: string;
  };
  cache_status: 'fresh' | 'cached' | 'partial';
}

interface UsePlayerSummaryResult {
  summary: PlayerSummary | null;
  isLoading: boolean;
  error: string | null;
  notFound: boolean;
  refetch: () => void;
}

/**
 * SWR fetcher with AbortController support.
 * An AbortController is attached to the returned promise so that SWR (and our
 * own cleanup hook) can cancel the in-flight request when the key changes or
 * the component unmounts — preventing stale responses from overwriting fresh data.
 */
function makeFetcher(signal: AbortSignal) {
  return async (url: string) => {
    const res = await fetch(url, { signal });
    if (res.status === 404) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.error || '플레이어를 찾을 수 없습니다');
      (err as any).status = 404;
      throw err;
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    return res.json();
  };
}

export function usePlayerSummary(
  platform: string | null,
  username: string | null,
  enabled: boolean = true,
): UsePlayerSummaryResult {
  const shouldFetch = enabled && platform && username;
  const url = shouldFetch
    ? `/api/v1/player/summary?platform=${platform}&username=${encodeURIComponent(username)}`
    : null;

  // Keep an AbortController that we replace each time the URL (= username) changes.
  // When the key changes SWR will call the new fetcher, and we abort the old request
  // so stale responses never land in the wrong cache slot.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // New URL → abort any previous in-flight request and create a fresh controller
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    return () => {
      abortRef.current?.abort();
    };
  }, [url]);

  const { data, error, isLoading, mutate } = useSWR<PlayerSummary>(
    url,
    (u: string) => {
      // If the controller was already aborted before SWR fires (e.g., key changed
      // immediately), create a new one so the next real request isn't dead on arrival.
      if (!abortRef.current || abortRef.current.signal.aborted) {
        abortRef.current = new AbortController();
      }
      return makeFetcher(abortRef.current.signal)(u);
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000, // 1 minute
      errorRetryCount: 2,
      errorRetryInterval: 1000,
    },
  );

  return {
    summary: data || null,
    isLoading,
    error: error?.name === 'AbortError' ? null : (error?.message || null),
    notFound: (error as any)?.status === 404 || error?.message?.includes('찾을 수 없습니다') || false,
    refetch: mutate,
  };
}