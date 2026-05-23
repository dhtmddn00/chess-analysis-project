import { useState, useEffect } from 'react';
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

const fetcher = (url: string) => {
  console.log('Fetching from URL:', url);
  return fetch(url).then(async res => {
    console.log('Response status:', res.status, res.statusText);
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
  });
};

export function usePlayerSummary(
  platform: string | null, 
  username: string | null,
  enabled: boolean = true
): UsePlayerSummaryResult {
  const shouldFetch = enabled && platform && username;
  const url = shouldFetch 
    ? `/api/v1/player/summary?platform=${platform}&username=${encodeURIComponent(username)}`
    : null;

  const { data, error, isLoading, mutate } = useSWR<PlayerSummary>(
    url,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, // 1 minute
      errorRetryCount: 2,
      errorRetryInterval: 1000,
    }
  );

  return {
    summary: data || null,
    isLoading,
    error: error?.message || null,
    notFound: (error as any)?.status === 404 || error?.message?.includes('찾을 수 없습니다') || false,
    refetch: mutate,
  };
}