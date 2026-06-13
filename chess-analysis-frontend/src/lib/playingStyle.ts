// 백엔드(chess-analysis-worker)는 `playing_style`을 언어 중립적 키(예: "tactical_aggressor")로
// 반환한다. 여기서 locale에 맞는 표시 텍스트로 번역한다.
// LEGACY_MAP은 리팩토링 이전(한국어 고정 문자열)로 저장된 기존 분석 결과를 위한 호환 매핑이다.

const PLAYING_STYLE_LABELS: Record<string, { ko: string; en: string }> = {
  tactical_aggressor: { ko: '전술적 공격수', en: 'Tactical Aggressor' },
  positional_master: { ko: '포지셔널 마스터', en: 'Positional Master' },
  attacking_player: { ko: '공격형 플레이어', en: 'Attacking Player' },
  complete_player: { ko: '완전체 플레이어', en: 'Complete Player' },
  risk_taker: { ko: '모험가 스타일', en: 'Risk Taker' },
  balanced_player: { ko: '균형잡힌 플레이어', en: 'Balanced Player' },
};

// 리팩토링 이전 분석 결과는 playing_style 컬럼에 한국어+영어 혼합 문자열이 저장돼 있다.
const LEGACY_MAP: Record<string, string> = {
  '전술적 공격수 (Tactical Aggressor)': 'tactical_aggressor',
  '포지셔널 마스터 (Positional Master)': 'positional_master',
  '공격형 플레이어 (Attacking Player)': 'attacking_player',
  '완전체 플레이어 (Complete Player)': 'complete_player',
  '모험가 스타일 (Risk Taker)': 'risk_taker',
  '균형잡힌 플레이어 (Balanced Player)': 'balanced_player',
  Balanced: 'balanced_player',
};

export function translatePlayingStyle(value: string | undefined | null, locale: string): string {
  if (!value) return '';
  const key = PLAYING_STYLE_LABELS[value] ? value : LEGACY_MAP[value];
  const label = key ? PLAYING_STYLE_LABELS[key] : undefined;
  if (!label) return value; // 알 수 없는 값은 그대로 표시 (안전망)
  return locale === 'en' ? label.en : label.ko;
}
