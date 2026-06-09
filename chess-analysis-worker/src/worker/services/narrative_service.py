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
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

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
  "one_action": "지금 당장 실행 가능한 행동 1개. 플랫폼·카테고리·분량까지 구체적으로"
}
```

## 예시로 배우기

❌ 나쁜 예 (이렇게 쓰지 마세요):
{
  "pattern": "공격적인 스타일을 가지고 있으며 전술 능력이 좋습니다",
  "why_losing": "실수가 많아서 지고 있습니다. 더 신중하게 플레이해야 합니다",
  "one_action": "매일 체스 전술 문제를 풀어보세요"
}

✅ 좋은 예 (이 방향으로 작성하세요):
{
  "pattern": "킹사이드 공격을 만드는 감각은 뛰어나지만, 공격이 막혔을 때 전환할 포지셔널 플랜이 없습니다",
  "why_losing": "패배 게임의 상당수가 30수를 넘어가면서 역전됩니다. 복잡한 미들게임은 잘 이끌지만 기물 교환 후 단순화된 포지션에서 어떻게 이겨야 하는지 모르는 패턴이 반복됩니다. 특히 흑으로 플레이할 때 이 경향이 두드러집니다",
  "one_action": "Lichess 엔드게임 연습(lichess.org/practice) > Rook Endgames 카테고리에서 이번 주 20문제를 집중적으로 푸세요"
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
  "one_action": "One immediately actionable next step — specific platform, category, and quantity"
}
```

## Learn from examples

❌ Bad (don't write like this):
{
  "pattern": "You have an aggressive style with good tactical ability",
  "why_losing": "You lose because of too many mistakes. Play more carefully.",
  "one_action": "Solve chess tactics puzzles every day"
}

✅ Good (aim for this):
{
  "pattern": "You're excellent at creating kingside attacks but have no positional Plan B when the attack is stopped",
  "why_losing": "A significant portion of your losses are reverse after move 30. You navigate complex middlegames well, but once pieces are exchanged and the position simplifies, you don't know how to convert. This pattern is especially pronounced when playing Black.",
  "one_action": "Complete 20 problems in the Rook Endgames category on Lichess (lichess.org/practice) this week"
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
→ 강약 격차: {gap}점

### 주요 오프닝
{opening_lines}

### AI 스타일 태그
{style_tags}
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
→ Gap: {gap} points

### Main openings
{opening_lines}

### Style tags
{style_tags}
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
        }

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
        style_tags = ", ".join(ctx["style_tags"]) or ("none" if is_en else "없음")

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
            gap=ctx["gap"],
            opening_lines=opening_lines,
            style_tags=style_tags,
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

        # Pattern: cross-dimensional causal framing
        pattern = (
            f"{username}님의 가장 두드러진 특징은 {strongest}입니다. "
            f"그러나 {weakest}이(가) 반복적으로 발목을 잡아 실력 발휘를 막고 있습니다."
        )

        # Why losing: more concrete, no raw "gap" numbers
        if loss_rate > 50:
            why_losing = (
                f"승률 {win_rate}%는 {strongest}에서 충분한 기회를 만들고 있다는 뜻입니다. "
                f"문제는 {weakest} 국면에 접어들면 그 우위를 지키지 못하는 것입니다. "
                f"패배 게임 대부분은 이 전환점을 넘지 못하고 역전을 허용하는 패턴을 보입니다."
            )
        else:
            why_losing = (
                f"{strongest} 덕분에 좋은 포지션을 자주 만들지만, "
                f"{weakest} 단계에서 그 이점을 마무리로 연결하지 못하고 있습니다. "
                f"이 부분만 보완해도 현재 승률에서 눈에 띄는 향상을 기대할 수 있습니다."
            )

        # One action: concrete, specific resource per weakness
        action_map = {
            "엔드게임 기술":       "Lichess 엔드게임 연습(lichess.org/practice) → Rook Endgames 카테고리 20문제부터 시작하세요",
            "전술 플레이":        "Chess Tempo(chesstempo.com)에서 매일 15분 전술 문제 — 1주일이면 패턴 인식이 달라집니다",
            "포지셔널 플레이":     "Lichess Studies에서 'Pawn Structures' 강의 2개 시청 — 장기 플랜 수립 능력을 키워드립니다",
            "시간 관리":          "10+5 게임 10판을 두면서 30초 이하로 줄었을 때 어떤 수를 선택할지 의식적으로 연습하세요",
            "안정성":             "Chess.com 퍼즐 러시 3분 세션을 매일 — 빠른 계산과 패턴 인식으로 일관성을 높입니다",
            "우세 전환 능력":     "Lichess 연습 → '결정적 우위 마무리' 카테고리 15문제 — 이기고 있을 때 어떻게 닫는지 배웁니다",
            "공격성":             "Sicilian Defense 또는 King's Indian 오프닝 하나를 YouTube에서 깊이 공부해 공격 레퍼토리를 강화하세요",
            "기물 교환 선호":     "교환이 이루어질 때마다 '내가 유리한가?'를 5초간 체크하는 습관을 들이세요 — 블리츠에서도 가능합니다",
            "오프닝 다양성":      "지금 주로 쓰는 오프닝 하나를 Lichess Opening Explorer로 분석해 핵심 변화를 외우세요",
            "오프닝 이탈 성향":   "Lichess Opening Explorer에서 본인의 오프닝 실수 패턴을 확인하고 핵심 라인 5수를 암기하세요",
            "역전 허용 저항":     "우세한 포지션에서 계속 공격하는 대신 '상대의 반격 경로를 먼저 막기' 연습을 해보세요",
        }
        default_action = (
            f"Lichess(lichess.org/practice)에서 {weakest} 관련 카테고리를 찾아 "
            f"이번 주 20문제를 집중적으로 풀어보세요"
        )
        one_action = action_map.get(weakest, default_action)

        return {
            "pattern": pattern,
            "why_losing": why_losing,
            "one_action": one_action,
        }

    # ── Main entry point ───────────────────────────────────────────────────────

    async def generate(self, profile, stats: dict, locale: str = "ko") -> dict:
        """
        Generate a coaching narrative for the given player.

        Args:
            profile:  PlayerProfile dataclass from profiler.py
            stats:    dict with keys avg_accuracy, total_blunders, total_mistakes
            locale:   "ko" (Korean, default) or "en" (English)

        Returns:
            dict with keys: pattern, why_losing, one_action
            Never raises — always falls back to rule-based output on any error.
        """
        locale = locale if locale in ("ko", "en") else "ko"
        ctx = self._build_context(profile, stats, locale=locale)
        ctx["locale"] = locale  # pass through to _format_prompt

        if not self._can_call_ai():
            reason = "AI disabled" if not self._enabled else "daily limit reached"
            logger.info(f"Narrative: {reason} — using rule-based fallback for {ctx['username']}")
            return self._fallback(ctx)

        try:
            system_prompt = SYSTEM_PROMPT_EN if locale == "en" else SYSTEM_PROMPT_KO
            user_prompt = self._format_prompt(ctx)
            logger.info(
                f"Generating AI narrative [{locale}] for {ctx['username']} "
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
                    max_tokens=600,
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

            required_keys = {"pattern", "why_losing", "one_action"}
            missing = required_keys - narrative.keys()
            if missing:
                raise ValueError(f"AI response missing keys: {missing}")

            logger.info(f"AI narrative generated successfully for {ctx['username']}")
            return {k: narrative[k] for k in required_keys}  # strip extra keys

        except Exception as exc:
            logger.error(
                f"AI narrative generation failed for {ctx.get('username', '?')}: {exc} "
                f"— falling back to rule-based output"
            )
            return self._fallback(ctx)
