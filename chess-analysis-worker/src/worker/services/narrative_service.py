"""
NarrativeService — AI-powered chess coaching narrative generator.

Turns raw Stockfish metrics into a personalised Korean coaching report by
finding the causal relationship between a player's strongest and weakest
dimensions, then naming one concrete next action.

Design principles:
  - One Gemini call per analysis; result cached forever in DB (idempotent).
  - Context capped at ~600 tokens; output targeted at ~400 tokens.
  - Hard daily limit tracked in Redis; graceful rule-based fallback if exceeded.
  - Temperature 0.7: natural language without hallucination.
  - JSON output mode: parseable without fragile markdown stripping.
"""

import asyncio
import json
import logging
import unicodedata
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)


def _korean_subject_particle(word: str) -> str:
    """받침(종성) 유무에 따라 '이' 또는 '가'를 반환합니다.

    한글 음절 유니코드: 가(0xAC00) ~ 힣(0xD7A3)
    종성 공식: (code_point - 0xAC00) % 28  — 0이면 받침 없음
    """
    if not word:
        return "이"
    last_char = word.rstrip()[-1] if word.rstrip() else word[-1]
    code = ord(last_char)
    if 0xAC00 <= code <= 0xD7A3:
        return "가" if (code - 0xAC00) % 28 == 0 else "이"
    # 한글 음절이 아닌 경우 (영문·숫자 등): 기본값 '이'
    return "이"

# ── Korean labels for StyleDimension enum values ──────────────────────────────

DIMENSION_KR = {
    "tactical_dependency":    "전술 플레이",
    "positional_orientation": "포지셔널 플레이",
    "aggression":             "공격성",
    "endgame_technique":      "엔드게임 기술",
    "time_management":        "시간 관리",
    "consistency":            "안정성",
    "risk_taking":            "리스크 감수",
    "exchange_preference":    "기물 교환 선호",
    "opening_variety":        "오프닝 다양성",
    "book_deviation":         "오프닝 이탈 성향",
    "lead_conversion":        "우세 전환 능력",
    "swindle_resistance":     "역전 허용 저항",
}

DIMENSION_EN = {
    "tactical_dependency":    "Tactical Play",
    "positional_orientation": "Positional Play",
    "aggression":             "Aggression",
    "endgame_technique":      "Endgame Technique",
    "time_management":        "Time Management",
    "consistency":            "Consistency",
    "risk_taking":            "Risk-Taking",
    "exchange_preference":    "Exchange Preference",
    "opening_variety":        "Opening Variety",
    "book_deviation":         "Opening Deviation",
    "lead_conversion":        "Lead Conversion",
    "swindle_resistance":     "Swindle Resistance",
}

# ── Country(ISO 3166-1 alpha-2) → output language ─────────────────────────────
# 계정 국가가 있으면 그 나라 주 언어로 AI 응답을 생성한다.
# "Korean"/"English"는 전용 시스템 프롬프트(KO/EN)를 쓰고,
# 그 외 언어는 영어 프롬프트(EN) + "respond in {language}" 지시로 처리한다.
COUNTRY_LANGUAGE = {
    "KR": "Korean",
    "US": "English", "GB": "English", "CA": "English", "AU": "English",
    "NZ": "English", "IE": "English", "IN": "English", "PH": "English",
    "SG": "English", "ZA": "English",
    "JP": "Japanese",
    "CN": "Chinese", "TW": "Chinese", "HK": "Chinese",
    "DE": "German", "AT": "German", "CH": "German",
    "FR": "French", "BE": "French",
    "ES": "Spanish", "MX": "Spanish", "AR": "Spanish", "CO": "Spanish",
    "CL": "Spanish", "PE": "Spanish",
    "RU": "Russian", "BY": "Russian", "KZ": "Russian",
    "BR": "Portuguese", "PT": "Portuguese",
    "IT": "Italian",
    "UA": "Ukrainian",
    "PL": "Polish",
    "NL": "Dutch",
    "TR": "Turkish",
    "VN": "Vietnamese",
    "ID": "Indonesian",
    "TH": "Thai",
    "SE": "Swedish",
    "NO": "Norwegian",
    "FI": "Finnish",
    "GR": "Greek",
    "CZ": "Czech",
    "HU": "Hungarian",
    "RO": "Romanian",
}


def _resolve_language(locale: str, country: Optional[str]) -> tuple[str, str]:
    """출력 언어를 결정한다.

    우선순위: 계정 국가(country) > UI 로케일(locale).

    반환: (language_name, base_locale)
      - language_name: "Korean" / "English" / "Japanese" 등 — 프롬프트 지시·로깅용
      - base_locale:   "ko" 또는 "en" — 데이터 라벨(DIMENSION_KR/EN)과
                       기본 프롬프트(KO/EN) 선택용
    """
    if country:
        lang = COUNTRY_LANGUAGE.get(country.strip().upper())
        if lang == "Korean":
            return ("Korean", "ko")
        if lang == "English":
            return ("English", "en")
        if lang:  # 제3 언어 — 영어 프롬프트 베이스 + 언어 지시
            return (lang, "en")
    # 국가 정보 없음/미매핑 → UI 로케일
    return ("English", "en") if locale == "en" else ("Korean", "ko")

# ── Prompts ────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT_KO = """\
당신은 데이터 기반 체스 코치입니다.
플레이어의 최근 게임 분석 결과를 보고 한국어로 코칭 보고서를 작성하세요.

## 언어 규칙 (필수)
- 반드시 순수 한국어로만 작성하세요
- 한자, 중국어, 일본어, 베트남어 등 다른 언어 글자를 절대 섞지 마세요
- 영어 고유명사(Lichess, Chess.com 등)는 허용

## 핵심 접근법
단순 수치 나열이 아닌, 여러 차원을 교차 분석해 하나의 인과 관계를 찾으세요.
"A는 강한데 B가 약하다" → "그래서 X라는 상황에서 Y가 발생한다" → "따라서 Z를 해야 한다"

## 절대 금지
- 일반적 조언 — "전술 훈련을 하세요", "시간 관리를 개선하세요" (어느 플레이어에게나 해당)
- 수치 나열 — "전술 82%, 엔드게임 61%입니다" (해석 없는 숫자만 나열)
- 의미 없는 격려 — "잘 하고 있습니다", "계속 노력하세요"
- 플레이어가 이미 알 수 있는 뻔한 사실

## 출력 형식 (JSON)
```json
{
  "pattern": "이 플레이어의 체스 패턴 — 강점과 약점의 인과관계 1문장",
  "why_losing": "패배가 발생하는 구체적 메커니즘 2~3문장. 수치 1~2개 인용 필수. 어떤 상황에서, 어떤 수순으로 무너지는지",
  "actions": [
    "즉시 실행 가능한 핵심 훈련 — 플랫폼·카테고리·분량 명시",
    "두 번째 훈련 — 첫 번째와 다른 측면을 보완",
    "세 번째 훈련 (선택, 첫 두 개보다 장기적인 내용일 때만)"
  ]
}
```

actions 작성 규칙:
- 반드시 2개, 데이터가 뚜렷한 패턴을 3개 지지할 때만 3개
- 각 항목은 서로 다른 문제(오프닝/미들게임/엔드게임, 또는 전술/포지셔널)를 다룰 것
- "전술 문제를 풀어라" 같은 범용 조언 금지 — 이 플레이어의 실수 패턴에 직접 연결된 것만

## 예시로 배우기

❌ 나쁜 예 (이렇게 쓰지 마세요):
{
  "pattern": "공격적인 스타일을 가지고 있으며 전술 능력이 좋습니다",
  "why_losing": "실수가 많아서 지고 있습니다. 더 신중하게 플레이해야 합니다",
  "actions": ["매일 체스 전술 문제를 풀어보세요", "시간 관리를 연습하세요"]
}

✅ 좋은 예 (이 방향으로 작성하세요):
{
  "pattern": "킹사이드 공격을 만드는 감각은 뛰어나지만, 공격이 막혔을 때 전환할 포지셔널 플랜이 없습니다",
  "why_losing": "패배 게임의 상당수가 30수를 넘어가면서 역전됩니다. 기물 교환 후 단순화된 포지션에서 어떻게 이겨야 하는지 모르는 패턴이 반복됩니다. 특히 흑으로 플레이할 때 이 경향이 두드러집니다",
  "actions": [
    "Lichess 엔드게임 연습(lichess.org/practice) > Rook Endgames 카테고리 20문제 — 단순화 후 마무리 능력",
    "패배한 게임 3개를 Lichess 분석 도구로 직접 복기하며 30수 이후 어느 수에서 방향을 잃었는지 표시하세요"
  ]
}
"""

SYSTEM_PROMPT_EN = """\
You are a data-driven chess coach.
Analyze the player's recent game metrics and write a coaching report in English.

## Core approach
Don't list numbers — find ONE causal relationship by cross-correlating multiple dimensions.
"A is strong but B is weak" → "so in situation X, outcome Y occurs" → "therefore do Z"

## Strictly forbidden
- Generic advice — "study tactics", "improve time management" (applies to everyone)
- Number listing — "Tactical: 82%, Endgame: 61%" (numbers without interpretation)
- Hollow encouragement — "you're doing great", "keep it up"
- Stating what the player already knows

## Output format (JSON)
```json
{
  "pattern": "This player's chess identity — how strength and weakness are causally linked (1 sentence)",
  "why_losing": "The specific mechanism causing losses — what situation, what sequence breaks down (2-3 sentences, cite 1-2 numbers)",
  "actions": [
    "Core drill — specific platform, category, quantity",
    "Second drill — addresses a different aspect than the first",
    "Third drill (optional — only if the data clearly supports a 3rd distinct problem)"
  ]
}
```

actions rules:
- Always 2 items; only 3 when data shows 3 clearly distinct patterns
- Each item must address a different problem area (opening vs endgame, tactical vs positional)
- No generic advice — each must connect directly to this player's mistake patterns

## Learn from examples

❌ Bad (don't write like this):
{
  "pattern": "You have an aggressive style with good tactical ability",
  "why_losing": "You lose because of too many mistakes. Play more carefully.",
  "actions": ["Solve chess tactics puzzles every day", "Practice time management"]
}

✅ Good (aim for this):
{
  "pattern": "You're excellent at creating kingside attacks but have no positional Plan B when the attack is stopped",
  "why_losing": "A significant portion of your losses are reversed after move 30. Once pieces are exchanged and the position simplifies, you don't know how to convert. This pattern is especially pronounced when playing Black.",
  "actions": [
    "Complete 20 problems in the Rook Endgames category on Lichess (lichess.org/practice) — build your conversion ability",
    "Review your 3 most recent losses in Lichess analysis — mark the exact move where you lost direction after move 30"
  ]
}
"""

USER_PROMPT_TEMPLATE_KO = """\
## 플레이어 데이터

플레이어: {username} | 레이팅 {average_rating} | 분석 게임 수: {total_games}

### 기본 성과 지표
- 평균 정확도: {avg_accuracy}%
- 평균 센티폰 손실(ACPL): {avg_centipawn_loss}
- 게임당 블런더: {blunders_per_game}개
- 승/무/패: {win_rate}% / {draw_rate}% / {loss_rate}%
- 백 승률: {white_win_rate}%  |  흑 승률: {black_win_rate}%

### 12차원 스타일 분석 (100점 만점, 높을수록 강함)
{style_lines}

→ 가장 강한 차원: {strongest} ({strongest_score}점)
→ 가장 약한 차원: {weakest} ({weakest_score}점)

### 주요 오프닝
{opening_lines}

### 게임별 실수 기록 (50cp 이상 손실, 게임 순서대로)
이 데이터에서 반복 패턴을 찾으세요 — 같은 수 대역, 같은 오프닝, 같은 색깔에서 반복되는지 확인.
{decisive_lines}
"""

USER_PROMPT_TEMPLATE_EN = """\
## Player Data

Player: {username} | Rating: {average_rating} | Games analyzed: {total_games}

### Performance metrics
- Average accuracy: {avg_accuracy}%
- Average centipawn loss (ACPL): {avg_centipawn_loss}
- Blunders per game: {blunders_per_game}
- Win / Draw / Loss: {win_rate}% / {draw_rate}% / {loss_rate}%
- Win rate as White: {white_win_rate}%  |  Win rate as Black: {black_win_rate}%

### 12-dimension style analysis (0–100, higher = stronger)
{style_lines}

→ Strongest dimension: {strongest} ({strongest_score})
→ Weakest dimension:   {weakest} ({weakest_score})

### Main openings
{opening_lines}

### Mistake log (50cp+ losses, ordered by game)
Find repeating patterns — same move range, same opening, same color?
{decisive_lines}
"""

# Aliases used by the rest of the module (Korean is default)
USER_PROMPT_TEMPLATE = USER_PROMPT_TEMPLATE_KO


class NarrativeService:
    """
    Generates a data-driven, personalised coaching narrative for a chess player.

    Usage:
        svc = NarrativeService(redis_client, api_key=os.getenv("GEMINI_API_KEY"))
        svc.initialize()
        narrative = await svc.generate(profile, stats)
        # narrative = {"pattern": "...", "why_losing": "...", "one_action": "..."}
    """

    AI_DAILY_LIMIT = 300  # Hard ceiling; Java global limit is 200 analyses/day

    def __init__(self, redis_client, api_key: Optional[str] = None):
        self._redis = redis_client
        self._api_key = api_key
        self._model = None
        self._enabled = False

    # ── Initialisation ─────────────────────────────────────────────────────────

    def initialize(self) -> None:
        """Configure Groq client. Safe to call even if api_key is absent."""
        if not self._api_key:
            logger.warning(
                "GROQ_API_KEY not set — NarrativeService disabled, "
                "rule-based fallback will be used"
            )
            return
        try:
            from groq import Groq
            self._client = Groq(api_key=self._api_key)
            self._enabled = True
            logger.info("NarrativeService ready (Groq / Llama-3.3-70B)")
        except Exception as exc:
            logger.error(f"NarrativeService initialisation failed: {exc}")

    # ── Rate-limit helpers ─────────────────────────────────────────────────────

    def _daily_key(self) -> str:
        date = datetime.now(ZoneInfo("Asia/Seoul")).strftime("%Y-%m-%d")
        return f"ai:narrative:calls:{date}"

    def _can_call_ai(self) -> bool:
        if not self._enabled:
            return False
        try:
            count = int(self._redis.get(self._daily_key()) or 0)
            return count < self.AI_DAILY_LIMIT
        except Exception:
            return False  # Redis failure → skip AI safely

    def _increment_counter(self) -> None:
        try:
            pipe = self._redis.pipeline()
            key = self._daily_key()
            pipe.incr(key)
            pipe.expire(key, 86400 * 2)  # 2-day TTL for safety
            pipe.execute()
        except Exception as exc:
            logger.warning(f"AI counter increment failed (non-fatal): {exc}")

    # ── Context builder ────────────────────────────────────────────────────────

    def _build_context(self, profile, stats: dict, locale: str = "ko") -> dict:
        """
        Extract the analytically richest data points in the fewest tokens.
        ~500 tokens when serialised to the prompt template.
        """
        from .profiler import StyleDimension

        total_games = max(profile.total_games, 1)
        dim_labels = DIMENSION_EN if locale == "en" else DIMENSION_KR

        # Style dimensions with locale-appropriate labels, sorted descending
        style_dict: dict[str, float] = {}
        for dim in StyleDimension:
            score_obj = profile.style_scores.get(dim)
            label = dim_labels.get(dim.value, dim.value)
            style_dict[label] = round(score_obj.score, 1) if score_obj else 0.0

        sorted_dims = sorted(style_dict.items(), key=lambda x: x[1])
        weakest_name, weakest_score = sorted_dims[0]
        strongest_name, strongest_score = sorted_dims[-1]

        # Top 2 openings per colour (max 4 total)
        openings: list[dict] = []
        for colour_key, colour_kr in (("white", "백"), ("black", "흑")):
            repertoire = (profile.opening_repertoire or {}).get(colour_key, {})
            top = sorted(repertoire.items(), key=lambda x: x[1].get("games", 0), reverse=True)
            for name, data in top[:2]:
                openings.append({
                    "colour": colour_kr,
                    "name": name,
                    "games": data.get("games", 0),
                    "win_pct": round(data.get("win_rate", 0.0) * 100, 1),
                })

        white_stats = profile.white_stats or {}
        black_stats = profile.black_stats or {}

        return {
            "username": profile.player_name,
            "average_rating": profile.average_rating,
            "total_games": total_games,
            "avg_accuracy": round(stats.get("avg_accuracy", 0.0), 1),
            "avg_centipawn_loss": round(profile.overall_acpl, 1),
            "blunders_per_game": round(stats.get("total_blunders", 0) / total_games, 2),
            "win_rate": round(profile.win_rate * 100, 1),
            "draw_rate": round(profile.draw_rate * 100, 1),
            "loss_rate": round(profile.loss_rate * 100, 1),
            "white_win_rate": round(white_stats.get("win_rate", 0.0) * 100, 1),
            "black_win_rate": round(black_stats.get("win_rate", 0.0) * 100, 1),
            "style_dict": style_dict,         # full dict for fallback
            "strongest": strongest_name,
            "strongest_score": strongest_score,
            "weakest": weakest_name,
            "weakest_score": weakest_score,
            "gap": round(strongest_score - weakest_score, 1),
            "openings": openings,
            "style_tags": (profile.style_tags or [])[:5],
            # 프롬프트 토큰 상한(~600) 보장: cp_loss가 큰(승부에 가장 영향 준) 수 상위 15개만.
            # 전체를 넣으면 50게임 기준 1000+개가 들어가 Groq TPM 한도(12k)를 초과한다.
            "decisive_moves": sorted(
                stats.get("decisive_moves", []),
                key=lambda m: m.get("cp_loss", 0),
                reverse=True,
            )[:15],
        }

    def _format_decisive_lines(self, decisive_moves: list, is_en: bool) -> str:
        """Format decisive moves into a compact, AI-readable text block."""
        if not decisive_moves:
            return "  (no data)" if is_en else "  (데이터 없음)"

        lines = []
        for m in decisive_moves:
            quality_label = "blunder" if m["cp_loss"] >= 100 else "mistake"
            if not is_en:
                quality_label = "블런더" if m["cp_loss"] >= 100 else "실수"
            opening = f" [{m['opening']}]" if m.get("opening") else ""
            result = f" ({m['result']})" if m.get("result") else ""
            color = m.get("color", "")
            color_str = f" {color}" if color else ""

            if is_en:
                lines.append(
                    f"  Game {m['game']}{color_str}{opening}{result} | "
                    f"move {m['move']}: {m['played']} ({quality_label}, -{m['cp_loss']}cp) → best: {m['best']}"
                )
            else:
                lines.append(
                    f"  게임{m['game']}{color_str}{opening}{result} | "
                    f"{m['move']}수: {m['played']} ({quality_label}, -{m['cp_loss']}cp) → 최선: {m['best']}"
                )
        return "\n".join(lines)

    def _format_prompt(self, ctx: dict) -> str:
        locale = ctx.get("locale", "ko")
        is_en = locale == "en"
        score_suffix = "" if is_en else "점"
        games_label = "games" if is_en else "게임"
        winrate_label = "win rate" if is_en else "승률"
        no_data = "(no data)" if is_en else "(데이터 없음)"

        style_lines = "\n".join(
            f"  {name}: {score}{score_suffix}"
            for name, score in sorted(ctx["style_dict"].items(), key=lambda x: x[1], reverse=True)
        )
        opening_lines = "\n".join(
            f"  {o['colour']} {o['name']} — {o['games']} {games_label}, {winrate_label} {o['win_pct']}%"
            for o in ctx["openings"]
        ) or f"  {no_data}"
        decisive_lines = self._format_decisive_lines(ctx.get("decisive_moves", []), is_en)

        template = USER_PROMPT_TEMPLATE_EN if is_en else USER_PROMPT_TEMPLATE_KO
        return template.format(
            username=ctx["username"],
            average_rating=ctx["average_rating"],
            total_games=ctx["total_games"],
            avg_accuracy=ctx["avg_accuracy"],
            avg_centipawn_loss=ctx["avg_centipawn_loss"],
            blunders_per_game=ctx["blunders_per_game"],
            win_rate=ctx["win_rate"],
            draw_rate=ctx["draw_rate"],
            loss_rate=ctx["loss_rate"],
            white_win_rate=ctx["white_win_rate"],
            black_win_rate=ctx["black_win_rate"],
            style_lines=style_lines,
            strongest=ctx["strongest"],
            strongest_score=ctx["strongest_score"],
            weakest=ctx["weakest"],
            weakest_score=ctx["weakest_score"],
            opening_lines=opening_lines,
            decisive_lines=decisive_lines,
        )

    # ── Fallback (rule-based) ──────────────────────────────────────────────────

    def _fallback(self, ctx: dict) -> dict:
        """
        Rule-based fallback for when AI is unavailable.
        Uses actual player data — avoids raw numbers and internal variable names.
        """
        strongest = ctx["strongest"]
        weakest = ctx["weakest"]
        win_rate = ctx["win_rate"]
        loss_rate = ctx["loss_rate"]
        username = ctx["username"]

        # 조사 선택: 받침 유무에 따라 '이' / '가' 자동 결정
        weakest_particle = _korean_subject_particle(weakest)

        # Pattern: cross-dimensional causal framing
        pattern = (
            f"{username}님의 가장 두드러진 특징은 {strongest}입니다. "
            f"그러나 {weakest}{weakest_particle} 반복적으로 발목을 잡아 실력 발휘를 막고 있습니다."
        )

        # Why losing: concrete cause-effect, no misleading win_rate framing
        if loss_rate > 50:
            why_losing = (
                f"{strongest}에서 기회를 만들고 있지만, "
                f"{weakest} 국면에 접어들면 그 우위를 지키지 못하는 것이 반복됩니다. "
                f"패배 게임 대부분은 이 전환점을 넘지 못하고 역전을 허용하는 패턴을 보입니다."
            )
        else:
            why_losing = (
                f"{strongest} 덕분에 좋은 포지션을 자주 만들지만, "
                f"{weakest} 단계에서 그 이점을 마무리로 연결하지 못하고 있습니다. "
                f"이 부분만 보완해도 현재 승률에서 눈에 띄는 향상을 기대할 수 있습니다."
            )

        # Actions: 약점별 2개 고품질 훈련 추천
        # 각 항목은 서로 다른 문제(즉시/중기, 전술/포지셔널)를 다룸
        action_map = {
            "엔드게임 기술": [
                "Lichess 엔드게임 연습(lichess.org/practice) → Rook Endgames 카테고리 20문제 — 단순화 후 마무리 능력 집중 훈련",
                "최근 패배 게임 3개를 복기하며 '언제 우위를 잃었는가'를 정확히 표시하세요 — 패턴이 보입니다",
            ],
            "전술 플레이": [
                "Chess Tempo(chesstempo.com) 전술 문제 하루 15분, 1주일 — 포크·핀·스큐어 카테고리 집중",
                "Lichess 분석 도구로 패배 게임의 놓친 전술 기회를 찾아 직접 풀어보세요",
            ],
            "포지셔널 플레이": [
                "Lichess Studies에서 'Pawn Structures' 강의 2개 시청 — 장기 플랜 수립 능력",
                "폰 구조가 고정된 포지션에서 어느 쪽이 더 나은 기물 배치를 가졌는지 매 게임 기록해보세요",
            ],
            "시간 관리": [
                "10+5 게임 10판 — 30초 이하로 줄었을 때 어떤 수를 포기할지 미리 결정해두는 연습",
                "Chess.com 일일 퍼즐로 빠른 패턴 인식 훈련 — 느린 계산 없이 판단하는 근육을 키웁니다",
            ],
            "안정성": [
                "Chess.com 퍼즐 러시 3분 세션 매일 — 빠른 계산과 패턴 인식으로 일관성을 높입니다",
                "게임 중 '상대의 위협을 먼저 확인' 루틴을 습관화하세요 — 블리츠에서도 1수 전 체크",
            ],
            "우세 전환 능력": [
                "Lichess 연습 → '결정적 우위 마무리' 카테고리 15문제 — 이기고 있을 때 어떻게 닫는지",
                "우세할 때 기물을 교환하려는 충동을 억제하고 '압박 유지' 전략을 의식적으로 시도해보세요",
            ],
            "공격성": [
                "Sicilian Defense 또는 King's Indian 오프닝 하나를 YouTube로 깊이 공부해 공격 레퍼토리 강화",
                "Lichess Studies에서 공격적 미들게임 강의 1개 시청 — 킹사이드 공격의 조건과 타이밍",
            ],
            "기물 교환 선호": [
                "교환할 때마다 '내가 더 활성화된 기물을 얻는가?'를 5초 체크하는 습관 — 블리츠에서도 가능",
                "Silman의 포지셔널 체스 원리 학습 — 어떤 기물이 좋은 교환인지 판단 기준 정립",
            ],
            "오프닝 다양성": [
                "현재 가장 많이 쓰는 오프닝 1개를 Lichess Opening Explorer로 분석해 핵심 변화 5수 암기",
                "새 오프닝 1개를 추가로 배우기 전에 현재 레퍼토리의 약점 라인부터 보완하세요",
            ],
            "오프닝 이탈 성향": [
                "Lichess Opening Explorer에서 본인의 오프닝 실수 패턴 확인 — 어느 수에서 이론을 벗어나는지",
                "주 오프닝 핵심 라인 10수를 Chessable로 암기 — 반복 노출이 가장 효율적인 방법입니다",
            ],
            "역전 허용 저항": [
                "우세한 포지션에서 '공격 계속' 대신 '상대 반격 경로 차단'을 먼저 찾는 습관 훈련",
                "방어 포지션 연습 — Lichess Studies에서 수비적 자원을 찾는 훈련 문제 10개",
            ],
        }
        default_actions = [
            f"Lichess(lichess.org/practice)에서 {weakest} 관련 카테고리를 찾아 이번 주 20문제를 집중적으로 풀어보세요",
            f"최근 패배 게임 2개를 복기하며 {weakest}이 어떻게 결과에 영향을 줬는지 직접 확인해보세요",
        ]
        actions = action_map.get(weakest, default_actions)

        return {
            "pattern": pattern,
            "why_losing": why_losing,
            "actions": actions,
        }

    # ── Main entry point ───────────────────────────────────────────────────────

    async def generate(self, profile, stats: dict, locale: str = "ko",
                       country: Optional[str] = None) -> dict:
        """
        Generate a coaching narrative for the given player.

        Args:
            profile:  PlayerProfile dataclass from profiler.py
            stats:    dict with keys avg_accuracy, total_blunders, total_mistakes
            locale:   "ko" (Korean, default) or "en" (English) — UI locale
            country:  ISO 3166-1 alpha-2 account country (optional). When set,
                      its primary language takes precedence over `locale`.

        Returns:
            dict with keys: pattern, why_losing, actions (list of 2-3 strings)
            Never raises — always falls back to rule-based output on any error.
        """
        locale = locale if locale in ("ko", "en") else "ko"
        # 언어 결정: 계정 국가 우선, 없으면 로케일
        language, base_locale = _resolve_language(locale, country)
        # 데이터 라벨·기본 프롬프트는 base_locale(ko/en) 기준
        ctx = self._build_context(profile, stats, locale=base_locale)
        ctx["locale"] = base_locale  # pass through to _format_prompt

        if not self._can_call_ai():
            reason = "AI disabled" if not self._enabled else "daily limit reached"
            logger.info(f"Narrative: {reason} — using rule-based fallback for {ctx['username']}")
            return self._fallback(ctx)

        try:
            # 프롬프트 선택:
            #  - Korean → SYSTEM_PROMPT_KO (한국어 지시·출력)
            #  - English → SYSTEM_PROMPT_EN
            #  - 그 외 언어 → EN 베이스 + 출력 언어 강제 지시
            if language == "Korean":
                system_prompt = SYSTEM_PROMPT_KO
            elif language == "English":
                system_prompt = SYSTEM_PROMPT_EN
            else:
                system_prompt = SYSTEM_PROMPT_EN + (
                    f"\n\n## CRITICAL LANGUAGE OVERRIDE\n"
                    f"Write your ENTIRE response — pattern, why_losing, and every action — "
                    f"in {language}. Do NOT use English or any other language. "
                    f"Chess platform names (Lichess, Chess.com) may stay in English."
                )
            user_prompt = self._format_prompt(ctx)
            logger.info(
                f"Generating AI narrative [{language}/{base_locale}] for {ctx['username']} "
                f"({ctx['total_games']} games, rating {ctx['average_rating']})"
            )

            # Groq client is sync — run in thread to avoid blocking the event loop
            def _call_groq():
                return self._client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user",   "content": user_prompt},
                    ],
                    temperature=0.7,
                    max_tokens=1000,   # actions 2~3개 포함 — 잘림 방지
                    response_format={"type": "json_object"},
                )

            response = await asyncio.to_thread(_call_groq)
            self._increment_counter()

            raw = response.choices[0].message.content.strip()
            # Belt-and-suspenders: strip markdown fences if Groq wraps output
            if raw.startswith("```"):
                parts = raw.split("```")
                raw = parts[1].lstrip("json").strip() if len(parts) > 1 else raw

            narrative = json.loads(raw)

            required_keys = {"pattern", "why_losing", "actions"}
            missing = required_keys - narrative.keys()
            if missing:
                # 하위 호환: 구형 one_action 필드가 오면 actions로 변환
                if "one_action" in narrative and "actions" not in narrative:
                    narrative["actions"] = [narrative["one_action"]]
                    missing.discard("actions")
                if missing:
                    raise ValueError(f"AI response missing keys: {missing}")

            # actions 검증: 반드시 2~3개 문자열 리스트
            actions = narrative.get("actions", [])
            if not isinstance(actions, list) or len(actions) < 1:
                raise ValueError(f"actions must be a non-empty list, got: {actions}")
            # 1개면 fallback의 두 번째 항목으로 보완
            if len(actions) == 1:
                ctx_fallback = self._fallback(ctx)
                actions = [actions[0]] + ctx_fallback["actions"][1:]
            # 3개 초과면 상위 3개만
            actions = actions[:3]

            logger.info(f"AI narrative generated ({len(actions)} actions) for {ctx['username']}")
            return {
                "pattern":    narrative["pattern"],
                "why_losing": narrative["why_losing"],
                "actions":    actions,
            }

        except Exception as exc:
            logger.error(
                f"AI narrative generation failed for {ctx.get('username', '?')}: {exc} "
                f"— falling back to rule-based output"
            )
            return self._fallback(ctx)
