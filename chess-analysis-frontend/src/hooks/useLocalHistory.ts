'use client';

import { useState, useEffect, useCallback } from 'react';

// ── Storage schema ────────────────────────────────────────────────────────────

export interface RecentAnalysis {
  jobId: string;
  username: string;
  analyzedAt: string;   // ISO 8601
  gameCount: number;
  accuracy: number;     // 0–100
  playingStyle: string;
  winrate: number;      // 0–1
}

const KEYS = {
  usernames: 'chess:usernames',
  analyses:  'chess:analyses',
} as const;

const MAX_USERNAMES = 5;
const MAX_ANALYSES  = 10;

// ── Safe localStorage helpers ────────────────────────────────────────────────

function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or private-mode restriction — silently ignore
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

interface UseLocalHistoryReturn {
  /** 최근 검색한 유저명 목록 (최신순, 최대 5개) */
  recentUsernames: string[];
  /** 최근 분석 완료 목록 (최신순, 최대 10개) */
  recentAnalyses: RecentAnalysis[];
  /** 유저명을 최근 목록 맨 앞에 추가 (중복 제거 후) */
  addUsername: (username: string) => void;
  /** 분석 완료 결과를 저장 */
  addAnalysis: (entry: Omit<RecentAnalysis, 'analyzedAt'>) => void;
  /** 특정 분석 항목 삭제 */
  removeAnalysis: (jobId: string) => void;
  /** 전체 히스토리 초기화 */
  clearHistory: () => void;
}

export function useLocalHistory(): UseLocalHistoryReturn {
  const [recentUsernames, setRecentUsernames] = useState<string[]>([]);
  const [recentAnalyses, setRecentAnalyses]   = useState<RecentAnalysis[]>([]);

  // SSR-safe 초기 로드
  useEffect(() => {
    setRecentUsernames(load<string[]>(KEYS.usernames, []));
    setRecentAnalyses(load<RecentAnalysis[]>(KEYS.analyses, []));
  }, []);

  const addUsername = useCallback((username: string) => {
    const trimmed = username.trim();
    if (!trimmed) return;
    setRecentUsernames((prev) => {
      const next = [trimmed, ...prev.filter((u) => u !== trimmed)].slice(0, MAX_USERNAMES);
      save(KEYS.usernames, next);
      return next;
    });
  }, []);

  const addAnalysis = useCallback((entry: Omit<RecentAnalysis, 'analyzedAt'>) => {
    setRecentAnalyses((prev) => {
      const next: RecentAnalysis[] = [
        { ...entry, analyzedAt: new Date().toISOString() },
        ...prev.filter((a) => a.jobId !== entry.jobId),
      ].slice(0, MAX_ANALYSES);
      save(KEYS.analyses, next);
      return next;
    });
  }, []);

  const removeAnalysis = useCallback((jobId: string) => {
    setRecentAnalyses((prev) => {
      const next = prev.filter((a) => a.jobId !== jobId);
      save(KEYS.analyses, next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    save(KEYS.usernames, []);
    save(KEYS.analyses, []);
    setRecentUsernames([]);
    setRecentAnalyses([]);
  }, []);

  return { recentUsernames, recentAnalyses, addUsername, addAnalysis, removeAnalysis, clearHistory };
}
