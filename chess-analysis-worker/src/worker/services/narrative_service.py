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
    "lead_conversion":        "우세 전환 능력",
    "swindle_resistance":     "역전 허용 저항",
    "blunder_tendency":       "블런더 경향",
}

# ── Prompts ────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
당신은 데이터 기반 체스 코치입니다.
플레이어의 최근 게임 분석 결과를 보고 한국어로 코칭 보고서를 작성하세요.

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

USER_PROMPT_TEMPLATE = """\
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
        """Configure Gemini client. Safe to call even if api_key is absent."""
        if not self._api_key:
            logger.warning(
                "GEMINI_API_KEY not set — NarrativeService disabled, "
                "rule-based fallback will be used"
            )
            return
        try:
            import google.generativeai as genai
            genai.configure(api_key=self._api_key)
            self._model = genai.GenerativeModel(
                model_name="gemini-2.0-flash",
                generation_config={
                    "temperature": 0.7,
                    "max_output_tokens": 600,
                    "response_mime_type": "application/json",
                },
                system_instruction=SYSTEM_PROMPT,
            )
            self._enabled = True
            logger.info("NarrativeService ready (Gemini 2.0 Flash)")
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

    def _build_context(self, profile, stats: dict) -> dict:
        """
        Extract the analytically richest data points in the fewest tokens.
        ~500 tokens when serialised to the prompt template.
        """
        from .profiler import StyleDimension

        total_games = max(profile.total_games, 1)

        # Style dimensions with Korean labels, sorted descending
        style_dict: dict[str, float] = {}
        for dim in StyleDimension:
            score_obj = profile.style_scores.get(dim)
            label = DIMENSION_KR.get(dim.value, dim.value)
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
        style_lines = "\n".join(
            f"  {name}: {score}점"
            for name, score in sorted(ctx["style_dict"].items(), key=lambda x: x[1], reverse=True)
        )
        opening_lines = "\n".join(
            f"  {o['colour']} {o['name']} — {o['games']}게임, 승률 {o['win_pct']}%"
            for o in ctx["openings"]
        ) or "  (데이터 없음)"
        style_tags = ", ".join(ctx["style_tags"]) or "없음"

        return USER_PROMPT_TEMPLATE.format(
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
        Still better than hardcoded strings — uses actual player data.
        """
        strongest = ctx["strongest"]
        weakest = ctx["weakest"]
        loss_rate = ctx["loss_rate"]
        gap = ctx["gap"]

        # Pattern: highlight the contrast
        pattern = (
            f"{strongest} 능력은 뛰어나지만 "
            f"{weakest} 부분에서 약점이 드러나 전체 성과를 제한하고 있습니다"
        )

        # Why losing: use what we know
        if loss_rate > 50:
            why_losing = (
                f"패배율 {loss_rate}%는 상당히 높습니다. "
                f"{strongest}에서는 기회를 만들지만 "
                f"{weakest} 상황에서 그 기회를 유지하지 못하는 패턴이 반복됩니다. "
                f"두 차원의 점수 격차({gap}점)가 크다는 것은 특정 포지션 유형에서 집중적으로 무너진다는 의미입니다."
            )
        else:
            why_losing = (
                f"{weakest} 개선이 승률 향상에 가장 직접적인 영향을 줄 것입니다. "
                f"{strongest}로 만든 기회를 {weakest} 단계에서 잃는 패턴이 보입니다. "
                f"두 차원의 {gap}점 격차를 줄이는 것이 핵심 과제입니다."
            )

        # One action: map weakness to resource
        action_map = {
            "엔드게임 기술":      "Lichess 엔드게임 연습(lichess.org/practice) > Rook Endgames 카테고리 20문제",
            "전술 플레이":       "Chess Tempo(chesstempo.com) 전술 문제 하루 15분, 1주일",
            "포지셔널 플레이":    "Lichess Studies에서 'Pawn Structures' 관련 강의 2개 시청",
            "시간 관리":         "Lichess에서 10+0 블리츠 게임 5판 — 시간이 부족할 때 어떤 수를 포기할지 연습",
            "안정성":            "Chess.com 퍼즐 러시 3분 세션 — 빠른 판단력 안정화 훈련",
            "우세 전환 능력":    "Lichess > 연습 > '우세한 포지션 마무리' 카테고리 15문제",
            "공격성":            "Kings Indian / Sicilian Dragon 오프닝 라인 1개를 YouTube에서 공부",
            "기물 교환 선호":    "Silman의 'How to Reassess Your Chess' 3장 — 교환의 판단 기준",
        }
        default_action = f"Lichess(lichess.org/practice)에서 {weakest} 관련 연습 문제를 집중적으로 풀어보세요"
        one_action = action_map.get(weakest, default_action)

        return {
            "pattern": pattern,
            "why_losing": why_losing,
            "one_action": one_action,
        }

    # ── Main entry point ───────────────────────────────────────────────────────

    async def generate(self, profile, stats: dict) -> dict:
        """
        Generate a coaching narrative for the given player.

        Args:
            profile:  PlayerProfile dataclass from profiler.py
            stats:    dict with keys avg_accuracy, total_blunders, total_mistakes

        Returns:
            dict with keys: pattern, why_losing, one_action
            Never raises — always falls back to rule-based output on any error.
        """
        ctx = self._build_context(profile, stats)

        if not self._can_call_ai():
            reason = "AI disabled" if not self._enabled else "daily limit reached"
            logger.info(f"Narrative: {reason} — using rule-based fallback for {ctx['username']}")
            return self._fallback(ctx)

        try:
            prompt = self._format_prompt(ctx)
            logger.info(
                f"Generating AI narrative for {ctx['username']} "
                f"({ctx['total_games']} games, rating {ctx['average_rating']})"
            )

            # Use asyncio.to_thread since google-generativeai's sync client
            # is thread-safe; avoids blocking the event loop.
            response = await asyncio.to_thread(self._model.generate_content, prompt)
            self._increment_counter()

            raw = response.text.strip()
            # Belt-and-suspenders: strip markdown fences if present despite JSON mode
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
