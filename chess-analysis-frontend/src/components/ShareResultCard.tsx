'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Copy, Download, Check, Share2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';

interface ShareResultCardProps {
  username: string;
  gameCount: number;
  averageAccuracy: number;
  averageCentipawnLoss: number;
  totalBlunders: number;
  playingStyle: string;
  winrate?: number;
  shortLink: string | null;
  jobId: string | null;
}

/**
 * 분석 결과 공유 카드
 * - 링크 복사: 단축 링크 또는 분석 페이지 직접 링크를 클립보드에 복사
 * - 이미지 저장: html2canvas로 카드 캡처 후 PNG 다운로드
 *
 * NOTE: shareUrl은 window 접근이 필요하므로 useEffect에서 초기화합니다.
 *
 * NOTE(이미지): Tailwind v4가 oklch 색상 변수를 사용하므로, html2canvas 호출 전에
 * getComputedStyle()로 모든 색상을 rgb() 형식으로 인라인 스타일에 적용한 뒤
 * 캡처 후 원상복구합니다.
 */
export function ShareResultCard({
  username,
  gameCount,
  averageAccuracy,
  averageCentipawnLoss,
  totalBlunders,
  playingStyle,
  winrate,
  shortLink,
  jobId,
}: ShareResultCardProps) {
  const t = useTranslations('ShareResultCard');
  const tCommon = useTranslations('Common');
  const locale = useLocale();

  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [capturing, setCapturing] = useState(false);

  /** shareUrl — window 접근은 클라이언트에서만 가능하므로 useEffect에서 설정 */
  const [shareUrl, setShareUrl] = useState('');
  useEffect(() => {
    const url = shortLink
      ? `${window.location.origin}/s/${extractShortCode(shortLink)}`
      : jobId
      ? `${window.location.origin}/${locale}/analysis/${jobId}`
      : window.location.href;
    setShareUrl(url);
  }, [shortLink, jobId, locale]);

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for browsers without Clipboard API
      const ta = document.createElement('textarea');
      ta.value = shareUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  /**
   * html2canvas는 Tailwind v4의 oklch 색상 변수를 파싱하지 못한다.
   * 캡처 전에 대상 요소 트리 전체의 색상 속성을 getComputedStyle()로 읽어
   * inline style로 덮어쓴다 (브라우저는 oklch → rgb로 변환해 반환).
   * 캡처 후 원래 inline style을 복원한다.
   */
  const handleDownloadImage = async () => {
    if (!cardRef.current || capturing) return;
    setCapturing(true);

    const root = cardRef.current;
    const allEls = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];

    // 1) 원래 inline style 저장
    const savedStyles = allEls.map((el) => el.style.cssText);

    // 2) computed 색상을 inline style로 적용 (oklch → rgb)
    allEls.forEach((el) => {
      const cs = window.getComputedStyle(el);
      el.style.backgroundColor = cs.backgroundColor;
      el.style.color = cs.color;
      el.style.borderColor = cs.borderColor;
      el.style.borderTopColor = cs.borderTopColor;
      el.style.borderRightColor = cs.borderRightColor;
      el.style.borderBottomColor = cs.borderBottomColor;
      el.style.borderLeftColor = cs.borderLeftColor;
    });

    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(root, {
        backgroundColor: '#09090b', // zinc-950
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `chess-analysis-${username}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Image capture failed:', err);
    } finally {
      // 3) inline style 복원
      allEls.forEach((el, i) => {
        el.style.cssText = savedStyles[i];
      });
      setCapturing(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Share2 className="h-4 w-4 text-zinc-500" />
        <h4 className="text-sm font-black text-zinc-700 uppercase tracking-widest">{t('title')}</h4>
      </div>

      {/* ── Capture target card ─────────────────────────────────── */}
      <div
        ref={cardRef}
        className="mb-4 rounded-xl bg-zinc-950 p-5 text-white"
        style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-xl text-zinc-950">
              ♔
            </span>
            <div>
              <p className="text-xs font-bold text-zinc-400">Chess Analysis</p>
              <p className="text-base font-black text-white">{username}</p>
            </div>
          </div>
          <span className="rounded-full border border-white/20 px-2.5 py-0.5 text-xs font-bold text-zinc-300">
            {t('gamesAnalyzed', { count: gameCount })}
          </span>
        </div>

        {/* Stats grid */}
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCell label={t('accuracy')} value={`${averageAccuracy.toFixed(1)}%`} highlight />
          <StatCell label={t('avgCpl')} value={averageCentipawnLoss.toFixed(1)} />
          <StatCell label={t('blunders')} value={String(totalBlunders)} />
          {winrate != null && (
            <StatCell label={t('winRate')} value={`${(winrate * 100).toFixed(1)}%`} />
          )}
        </div>

        {/* Style banner */}
        <div className="rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-center">
          <p className="text-xs font-bold text-zinc-400">{t('playingStyle')}</p>
          <p className="mt-0.5 text-lg font-black text-white">{playingStyle || t('analyzing')}</p>
        </div>

        {/* Footer */}
        <p className="mt-3 text-center text-xs text-zinc-500">chesslab.kr</p>
      </div>

      {/* ── Action buttons ──────────────────────────────────────── */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleCopyLink}
          disabled={!shareUrl}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold transition disabled:opacity-40 ${
            copied
              ? 'border-green-300 bg-green-50 text-green-700'
              : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500'
          }`}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              {tCommon('copied')}
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              {tCommon('copyLink')}
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleDownloadImage}
          disabled={capturing}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-zinc-800 disabled:opacity-50 transition"
        >
          {capturing ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {capturing ? tCommon('saving') : tCommon('saveImage')}
        </button>
      </div>

      {/* Shareable URL preview */}
      <p className="mt-2 truncate rounded bg-zinc-50 px-3 py-1.5 text-xs text-zinc-400 font-mono">
        {shareUrl || '…'}
      </p>
    </div>
  );
}

function StatCell({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center">
      <p className="text-[10px] font-semibold text-zinc-400">{label}</p>
      <p className={`mt-1 text-xl font-black ${highlight ? 'text-blue-400' : 'text-white'}`}>
        {value}
      </p>
    </div>
  );
}

/** shortLink URL에서 코드 부분만 추출 */
function extractShortCode(shortLink: string): string {
  return shortLink.split('/').pop() ?? shortLink;
}
