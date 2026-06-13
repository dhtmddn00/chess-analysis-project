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
  { type: 'quote', text: '전략은 생각을 필요로 하고, 전술은 관찰을 필요로 한다.', author: '막스 오이베' },
  { type: 'quote', text: '당신이 좋은 수를 찾았거든 잠시 멈추어라 - 그리고 더 좋은 수를 찾아보라.', author: '에마누엘 라스커' },
  { type: 'quote', text: '시험해 본 결과 e4가 가장 좋다.', author: '바비 피셔' },
  { type: 'quote', text: '폰은 체스의 영혼이다.', author: '프랑수아앙드레 필리도르' },
  { type: 'quote', text: '위협하는 것이 잡는 것보다 더 강하다.', author: '아론 님조비치' },
  { type: 'quote', text: '오프닝은 교과서처럼 하고, 미들게임은 마법처럼, 엔드게임은 기계처럼 하라.', author: '루돌프 슈필만' },
  { type: 'quote', text: '부실한 계획이라도 있는 것이 아예 없는 것보다는 낫다.', author: '미하일 치고린' },
  { type: 'quote', text: '기물들이 당신을 도울 수 있도록 당신도 기물들을 도우라.', author: '폴 모피' },
  { type: 'quote', text: '구석에 박힌 나이트는 우울하다.' },
  { type: 'quote', text: '당신은 상대를 2+2=5가 성립하는, 단 한 사람밖에 나갈 수 없는 깊고 어두운 숲 속으로 끌고 가야 한다.', author: '미하일 탈' },
  { type: 'quote', text: '하나의 나쁜 수가 마흔 개의 좋은 수를 물거품으로 만든다.', author: '블라디미르 호로비츠' },
  { type: 'quote', text: '당신이 이긴 경기보다 패배한 경기로부터 더 많은 것을 배울 것이다.', author: '호세 라울 카파블랑카' },
  { type: 'quote', text: '희생수에 대한 열정은 체스를 하는 사람에게 있어 본성의 일부이기 때문에 우리는 희생수의 매력을 거부할 수 없는 것이다.', author: '루돌프 슈필만' },
  { type: 'quote', text: '희생수를 논파하는 가장 좋은 방법은 수락하는 것이다.', author: '빌헬름 슈타이니츠' },
  { type: 'quote', text: '주도권을 가진 쪽만이 공격할 권리를 가진다.', author: '빌헬름 슈타이니츠' },
  { type: 'quote', text: '전투적인 마음가짐을 가져야 한다. 상대의 수를 강제하고 기회를 잡아야 한다.', author: '바비 피셔' },
  { type: 'quote', text: '상대 킹의 목숨을 따기 위해서는 다른 어떠한 대가도 중요하지 않다.', author: '알렉산드르 코블렌츠' },
  { type: 'quote', text: '통과한 폰은 보드에 남아 있는 기물이 줄어들수록 강력해진다.', author: '호세 라울 카파블랑카' },
  { type: 'quote', text: '적 기물을 향해 전진하는 통과한 폰 2개가 대회에서 내게 많은 승리를 가져다 주었다.', author: '다비드 브론슈타인' },
  { type: 'quote', text: '핀에 걸린 기물의 수비력은 허상에 불과하다.', author: '아론 님조비치' },
  { type: 'quote', text: '킹은 미들게임에서는 그저 엑스트라에 불과하지만, 엔드게임에서는 스타의 반열에 오른다.', author: '아론 님조비치' },
  { type: 'quote', text: '아무리 게으른 킹이라 하더라도 더블 체크 앞에서는 꽁지 빠지게 도망간다!', author: '아론 님조비치' },
  { type: 'quote', text: '비숍들을 가진 자에게 미래가 있다.', author: '지그베르트 타라시' },
  { type: 'quote', text: '콤비네이션은 체스게임의 시(詩)문이다. 그들은 체스에 있어 음악의 선율과도 같은 존재이다. 그들은 물질적 고난에 대한 정신의 승리를 나타낸다.', author: '루벤 파인' },

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
  { type: 'quote', text: 'Strategy requires thought, tactics require observation.', author: 'Max Euwe' },
  { type: 'quote', text: 'When you see a good move, look for a better one.', author: 'Emanuel Lasker' },
  { type: 'quote', text: '1.e4 - Best by test.', author: 'Bobby Fischer' },
  { type: 'quote', text: 'Pawns are the soul of the game.', author: 'François-André Philidor' },
  { type: 'quote', text: 'The threat is stronger than the execution.', author: 'Aron Nimzowitsch' },
  { type: 'quote', text: 'In the opening a master should play like a book, in the middlegame he should play like a magician, and in the endgame he should play like a machine.', author: 'Rudolf Spielmann' },
  { type: 'quote', text: 'Even a poor plan is better than no plan at all.', author: 'Mikhail Chigorin' },
  { type: 'quote', text: 'Help your pieces so they can help you.', author: 'Paul Morphy' },
  { type: 'quote', text: 'Knight on the rim is dim.' },
  { type: 'quote', text: 'You must take your opponent into a deep dark forest where 2+2=5, and the path leading out is only wide enough for one.', author: 'Mikhail Tal' },
  { type: 'quote', text: 'One bad move nullifies forty good ones.', author: 'Vladimir Horowitz' },
  { type: 'quote', text: 'You may learn much more from a game you lose than from a game you win.', author: 'Jose Raul Capablanca' },
  { type: 'quote', text: "We cannot resist the fascination of sacrifice, since a passion for sacrifices is part of a chess player's nature.", author: 'Rudolf Spielmann' },
  { type: 'quote', text: 'A sacrifice is best refuted by accepting it.', author: 'Wilhelm Steinitz' },
  { type: 'quote', text: 'Only the player with the initiative has the right to attack.', author: 'Wilhelm Steinitz' },
  { type: 'quote', text: 'You have to have the fighting spirit. You have to force moves and take chances.', author: 'Bobby Fischer' },
  { type: 'quote', text: 'No price is too great for the scalp of the enemy king.', author: 'Alexander Koblents' },
  { type: 'quote', text: 'A passed pawn increases in strength as the number of pieces on the board diminishes.', author: 'Jose Raul Capablanca' },
  { type: 'quote', text: 'Two passed pawns advancing into enemy pieces have brought me more than a dozen points in tournaments.', author: 'David Bronstein' },
  { type: 'quote', text: 'The defensive power of a pinned piece is only imaginary.', author: 'Aron Nimzowitsch' },
  { type: 'quote', text: 'In the middlegame, the king is merely an extra. But in the endgame, he is one of the star actors.', author: 'Aron Nimzowitsch' },
  { type: 'quote', text: 'Even the laziest king flees wildly in the face of a double check!', author: 'Aron Nimzowitsch' },
  { type: 'quote', text: 'The future belongs to him who has the bishops.', author: 'Siegbert Tarrasch' },
  { type: 'quote', text: 'Combinations are the poetry of the game. They are to chess what melody is to music. They represent the triumph of mind over matter.', author: 'Reuben Fine' },

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

/**
 * 다음 팁 인덱스를 확률적으로 선택한다.
 *
 * - 50% 확률 → quote | tip 풀
 * - 50% 확률 → share | bug 풀
 * - 같은 인덱스가 연속으로 나오지 않도록 현재 인덱스 제외
 */
function pickNext(tips: Tip[], current: number): number {
  const useActionable = Math.random() < 0.5;
  const pool = tips
    .map((t, i) => ({ i, t }))
    .filter(({ i, t }) =>
      i !== current &&
      (useActionable
        ? t.type === 'share' || t.type === 'bug'
        : t.type === 'quote' || t.type === 'tip'),
    );
  // 풀이 비어있으면(share/bug가 전부 current 하나뿐 등) 전체에서 선택
  const fallback = tips.map((_, i) => i).filter(i => i !== current);
  const candidates = pool.length > 0 ? pool.map(x => x.i) : fallback;
  return candidates[Math.floor(Math.random() * candidates.length)] ?? 0;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AnalysisTips() {
  const locale = useLocale();
  const tips = locale === 'ko' ? TIPS_KO : TIPS_EN;

  const [index, setIndex]     = useState(0);
  const [visible, setVisible] = useState(true); // fade state

  const advance = useCallback(() => {
    setVisible(false);
    setTimeout(() => {
      setIndex(prev => pickNext(tips, prev));
      setVisible(true);
    }, 400); // fade-out 시간
  }, [tips]);

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
            <p className="text-sm font-bold text-white leading-relaxed">
              {tip.type === 'quote' ? `"${tip.text}"` : tip.text}
            </p>
            {tip.author && (
              <p className="mt-1 text-xs font-bold text-white">— {tip.author}</p>
            )}
          </div>
        </div>
      </div>

      {/* Next button */}
      <div className="mt-3 flex items-center justify-end">
        <button
          type="button"
          onClick={advance}
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          {locale === 'ko' ? '다음 →' : 'Next →'}
        </button>
      </div>
    </div>
  );
}
