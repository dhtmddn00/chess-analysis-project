'use client';

/**
 * AnalysisTips
 *
 * 분석 대기 화면에서 일정 시간마다 체스 명언·팁·공유 안내·버그 제보 안내를
 * 부드러운 페이드 전환으로 순환 표시합니다.
 */

import { useState, useEffect, useCallback } from 'react';
import { Lightbulb, Quote, Share2, Wrench } from 'lucide-react';
import { useLocale } from 'next-intl';

type TipType = 'quote' | 'tip' | 'share' | 'bug';

interface Tip {
  type: TipType;
  text: string;
  author?: string; // 명언의 경우 출처
}

// ── Tips data ─────────────────────────────────────────────────────────────────

const TIPS_KO: Tip[] = [
  // 체스 명언
  { type: 'quote', text: '폰은 체스의 영혼이다.', author: 'François-André Philidor' },
  { type: 'quote', text: '나쁜 플랜이라도, 플랜이 없는 것보다는 낫다.', author: 'Savielly Tartakower' },
  { type: 'quote', text: '모든 착수에는 목적이 있어야 한다.', author: 'Reuben Fine' },
  { type: 'quote', text: '상대방의 최선수를 항상 먼저 찾아라.', author: 'Emanuel Lasker' },
  { type: 'quote', text: '실수를 저지른 직후 또 다른 실수를 범하는 것이 두 번째 실수다.', author: 'Savielly Tartakower' },
  { type: 'quote', text: '킹은 강한 기물이다 — 엔드게임에서 적극적으로 활용하라.', author: 'Reuben Fine' },
  { type: 'quote', text: '체스는 삶의 거울이다.', author: 'Irving Chernev' },
  { type: 'quote', text: '기회를 놓치기 전에 계산하라, 그러나 너무 오래 계산하지는 마라.', author: 'Mikhail Tal' },
  { type: 'quote', text: '전술은 당신이 전략을 갖추지 못했을 때 스스로 나타난다.', author: 'Savielly Tartakower' },
  { type: 'quote', text: '체스에서 가장 강한 수는 상대방이 가장 두려워하는 수다.', author: 'Savielly Tartakower' },

  // 체스 팁
  { type: 'tip', text: '오프닝에서는 중앙 폰 전개 → 나이트 → 비숍 → 캐슬링 순서를 따르면 안전합니다.' },
  { type: 'tip', text: '상대가 위협을 가했을 때 즉시 반응하기 전에 그 의도를 먼저 파악하세요.' },
  { type: 'tip', text: '같은 기물을 오프닝에서 두 번 이상 움직이는 것은 템포 손실입니다.' },
  { type: 'tip', text: '교환을 할 때는 기물의 점수뿐 아니라 활동성을 함께 고려하세요.' },
  { type: 'tip', text: '루크는 열린 파일 또는 반열린 파일에 배치할 때 가장 강력합니다.' },
  { type: 'tip', text: '엔드게임에서 킹은 공격적으로 활용해야 합니다 — 수동적인 킹은 패배의 원인입니다.' },
  { type: 'tip', text: '나이트는 닫힌 포지션에서, 비숍은 열린 포지션에서 더 강합니다.' },
  { type: 'tip', text: '포지션이 복잡할수록 상대방의 최선수를 먼저 고려하는 습관이 중요합니다.' },

  // 공유 안내
  { type: 'share', text: '분석이 완료되면 하단의 공유 버튼으로 친구나 체스 커뮤니티에 결과를 공유할 수 있습니다!' },
  { type: 'share', text: '나의 체스 아키타입 카드를 이미지로 저장해 SNS에 자랑해보세요 📸' },
  { type: 'share', text: '분석 결과 링크를 복사하면 로그인 없이도 누구나 볼 수 있습니다.' },

  // 버그 제보
  { type: 'bug', text: '분석 결과가 이상하거나 버그를 발견하셨나요? 페이지 하단의 개발자 이메일로 제보해주시면 큰 도움이 됩니다!' },
];

const TIPS_EN: Tip[] = [
  // Chess quotes
  { type: 'quote', text: 'The pawns are the soul of chess.', author: 'François-André Philidor' },
  { type: 'quote', text: 'A bad plan is better than no plan at all.', author: 'Savielly Tartakower' },
  { type: 'quote', text: 'Every move must have a purpose.', author: 'Reuben Fine' },
  { type: 'quote', text: 'Always look for the best move for your opponent.', author: 'Emanuel Lasker' },
  { type: 'quote', text: 'The second mistake after a blunder is the worst blunder.', author: 'Savielly Tartakower' },
  { type: 'quote', text: 'The king is a strong piece — use it actively in the endgame.', author: 'Reuben Fine' },
  { type: 'quote', text: 'Chess is the mirror of life.', author: 'Irving Chernev' },
  { type: 'quote', text: 'Calculate before the opportunity vanishes — but don\'t over-calculate.', author: 'Mikhail Tal' },
  { type: 'quote', text: 'Tactics is what you do when there is something to do; strategy is what you do when there is nothing to do.', author: 'Savielly Tartakower' },
  { type: 'quote', text: 'The most powerful chess move is the one your opponent fears most.', author: 'Savielly Tartakower' },

  // Chess tips
  { type: 'tip', text: 'In the opening, follow: develop center pawns → knights → bishops → castle. Simple but effective.' },
  { type: 'tip', text: 'When your opponent makes a threat, first understand the intention before reacting.' },
  { type: 'tip', text: 'Moving the same piece twice in the opening is a tempo loss — develop new pieces instead.' },
  { type: 'tip', text: 'When trading pieces, consider activity, not just point values.' },
  { type: 'tip', text: 'Rooks belong on open or half-open files — that\'s where they shine.' },
  { type: 'tip', text: 'In the endgame, activate your king. A passive king is often the root cause of defeat.' },
  { type: 'tip', text: 'Knights excel in closed positions; bishops are stronger in open positions.' },
  { type: 'tip', text: 'The more complex the position, the more important it is to always consider your opponent\'s best reply.' },

  // Share hints
  { type: 'share', text: 'Once analysis is done, share your results with friends or your chess community using the share button below!' },
  { type: 'share', text: 'Save your Chess Archetype card as an image and show it off on social media 📸' },
  { type: 'share', text: 'Copy the result link to let anyone view your analysis without logging in.' },

  // Bug report
  { type: 'bug', text: 'Something look off? Found a bug? Report it to the developer email at the bottom of the page — we appreciate every report!' },
];

// ── Config per type ───────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<TipType, {
  Icon: React.ElementType;
  bg: string;
  border: string;
  iconColor: string;
  labelKo: string;
  labelEn: string;
}> = {
  quote: {
    Icon: Quote,
    bg: 'bg-zinc-950',
    border: 'border-zinc-800',
    iconColor: 'text-zinc-400',
    labelKo: '체스 명언',
    labelEn: 'Chess Quote',
  },
  tip: {
    Icon: Lightbulb,
    bg: 'bg-blue-950',
    border: 'border-blue-800',
    iconColor: 'text-blue-400',
    labelKo: '체스 팁',
    labelEn: 'Chess Tip',
  },
  share: {
    Icon: Share2,
    bg: 'bg-emerald-950',
    border: 'border-emerald-800',
    iconColor: 'text-emerald-400',
    labelKo: '공유 안내',
    labelEn: 'Share',
  },
  bug: {
    Icon: Wrench,
    bg: 'bg-amber-950',
    border: 'border-amber-800',
    iconColor: 'text-amber-400',
    labelKo: '개발자에게',
    labelEn: 'Feedback',
  },
};

const INTERVAL_MS = 7000; // 7초마다 전환

// ── Component ─────────────────────────────────────────────────────────────────

export function AnalysisTips() {
  const locale = useLocale();
  const tips = locale === 'ko' ? TIPS_KO : TIPS_EN;

  const [index, setIndex]     = useState(0);
  const [visible, setVisible] = useState(true); // fade state

  const advance = useCallback(() => {
    setVisible(false);
    setTimeout(() => {
      setIndex(prev => (prev + 1) % tips.length);
      setVisible(true);
    }, 400); // fade-out 시간
  }, [tips.length]);

  useEffect(() => {
    const timer = setInterval(advance, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [advance]);

  const tip = tips[index];
  const cfg = TYPE_CONFIG[tip.type];

  return (
    <div className="mt-6">
      {/* Tip card */}
      <div
        className={`rounded-xl border ${cfg.bg} ${cfg.border} p-4 transition-opacity duration-400`}
        style={{ opacity: visible ? 1 : 0 }}
      >
        <div className="flex items-start gap-3">
          <cfg.Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${cfg.iconColor}`} />
          <div className="min-w-0">
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${cfg.iconColor}`}>
              {locale === 'ko' ? cfg.labelKo : cfg.labelEn}
            </p>
            <p className="text-sm text-zinc-300 leading-relaxed">
              {tip.type === 'quote' ? `"${tip.text}"` : tip.text}
            </p>
            {tip.author && (
              <p className="mt-1 text-xs text-zinc-500">— {tip.author}</p>
            )}
          </div>
        </div>
      </div>

      {/* Dot indicators */}
      <div className="mt-3 flex items-center justify-center gap-1.5">
        {tips.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`tip ${i + 1}`}
            onClick={() => {
              setVisible(false);
              setTimeout(() => { setIndex(i); setVisible(true); }, 400);
            }}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === index ? 'w-5 bg-zinc-400' : 'w-1.5 bg-zinc-700 hover:bg-zinc-500'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
