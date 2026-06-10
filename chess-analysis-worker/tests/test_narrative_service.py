"""Unit tests for NarrativeService — no Gemini API key required."""
import pytest
from unittest.mock import MagicMock, patch
import json
import sys, os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from worker.services.narrative_service import NarrativeService, DIMENSION_KR, DIMENSION_EN


# ── Minimal PlayerProfile stub ────────────────────────────────────────────────

class StyleScore:
    def __init__(self, score): self.score = score

class FakeStyleDimension:
    """Mirrors StyleDimension enum values used in real code."""
    TACTICAL_DEPENDENCY    = "tactical_dependency"
    POSITIONAL_ORIENTATION = "positional_orientation"
    AGGRESSION             = "aggression"
    ENDGAME_TECHNIQUE      = "endgame_technique"
    TIME_MANAGEMENT        = "time_management"
    CONSISTENCY            = "consistency"
    RISK_TAKING            = "risk_taking"
    EXCHANGE_PREFERENCE    = "exchange_preference"
    OPENING_VARIETY        = "opening_variety"
    LEAD_CONVERSION        = "lead_conversion"
    SWINDLE_RESISTANCE     = "swindle_resistance"
    BLUNDER_TENDENCY       = "blunder_tendency"

class FakeProfile:
    def __init__(self, **kwargs):
        self.player_name = kwargs.get('player_name', 'testuser')
        self.total_games = kwargs.get('total_games', 20)
        self.average_rating = kwargs.get('average_rating', 1200)
        self.overall_acpl = kwargs.get('overall_acpl', 45.0)
        self.win_rate = kwargs.get('win_rate', 0.5)
        self.draw_rate = kwargs.get('draw_rate', 0.1)
        self.loss_rate = kwargs.get('loss_rate', 0.4)
        self.white_stats = kwargs.get('white_stats', {'win_rate': 0.55})
        self.black_stats = kwargs.get('black_stats', {'win_rate': 0.45})
        self.opening_repertoire = kwargs.get('opening_repertoire', {
            'white': {'Sicilian Defense': {'games': 8, 'win_rate': 0.5}},
            'black': {'King\'s Indian Defense': {'games': 6, 'win_rate': 0.33}},
        })
        self.style_tags = kwargs.get('style_tags', ['공격형', '전술가'])
        # Build style_scores with all 12 dimensions
        from worker.services.profiler import StyleDimension
        scores = kwargs.get('scores', {})
        self.style_scores = {
            dim: StyleScore(scores.get(dim.value, 60.0))
            for dim in StyleDimension
        }


SAMPLE_STATS = {'avg_accuracy': 75.0, 'total_blunders': 8, 'total_mistakes': 12}


# ── Tests ──────────────────────────────────────────────────────────────────────

class TestNarrativeServiceInit:

    def test_disabled_without_api_key(self):
        svc = NarrativeService(redis_client=MagicMock(), api_key=None)
        svc.initialize()
        assert svc._enabled is False

    def test_can_call_ai_false_when_disabled(self):
        svc = NarrativeService(redis_client=MagicMock(), api_key=None)
        svc.initialize()
        assert svc._can_call_ai() is False

    def test_redis_failure_returns_false_not_raise(self):
        redis = MagicMock()
        redis.get.side_effect = Exception("Redis down")
        svc = NarrativeService(redis_client=redis, api_key="dummy")
        svc._enabled = True
        assert svc._can_call_ai() is False

    def test_daily_limit_blocks_ai(self):
        redis = MagicMock()
        redis.get.return_value = str(NarrativeService.AI_DAILY_LIMIT)
        svc = NarrativeService(redis_client=redis, api_key="dummy")
        svc._enabled = True
        assert svc._can_call_ai() is False

    def test_under_daily_limit_allows_ai(self):
        redis = MagicMock()
        redis.get.return_value = "50"
        svc = NarrativeService(redis_client=redis, api_key="dummy")
        svc._enabled = True
        assert svc._can_call_ai() is True


class TestBuildContext:

    def test_context_has_required_keys(self):
        svc = NarrativeService(redis_client=MagicMock())
        profile = FakeProfile()
        ctx = svc._build_context(profile, SAMPLE_STATS)

        required = {'username', 'total_games', 'avg_accuracy', 'avg_centipawn_loss',
                    'blunders_per_game', 'win_rate', 'draw_rate', 'loss_rate',
                    'strongest', 'weakest', 'gap', 'style_dict', 'openings', 'style_tags'}
        assert required.issubset(ctx.keys())

    def test_korean_labels_by_default(self):
        svc = NarrativeService(redis_client=MagicMock())
        profile = FakeProfile()
        ctx = svc._build_context(profile, SAMPLE_STATS, locale='ko')
        labels = set(ctx['style_dict'].keys())
        assert '엔드게임 기술' in labels
        assert 'Endgame Technique' not in labels

    def test_english_labels_for_en_locale(self):
        svc = NarrativeService(redis_client=MagicMock())
        profile = FakeProfile()
        ctx = svc._build_context(profile, SAMPLE_STATS, locale='en')
        labels = set(ctx['style_dict'].keys())
        assert 'Endgame Technique' in labels
        assert '엔드게임 기술' not in labels

    def test_strongest_weakest_computed(self):
        svc = NarrativeService(redis_client=MagicMock())
        profile = FakeProfile(scores={
            'tactical_dependency': 90.0,
            'endgame_technique': 20.0,
        })
        ctx = svc._build_context(profile, SAMPLE_STATS, locale='ko')
        assert ctx['strongest'] == '전술 플레이'
        assert ctx['weakest'] == '엔드게임 기술'
        assert ctx['gap'] == pytest.approx(70.0, abs=5.0)

    def test_blunders_per_game_calculated(self):
        svc = NarrativeService(redis_client=MagicMock())
        profile = FakeProfile(total_games=20)
        ctx = svc._build_context(profile, {'avg_accuracy': 75.0, 'total_blunders': 10, 'total_mistakes': 5})
        assert ctx['blunders_per_game'] == pytest.approx(0.5)


class TestFallback:

    def test_fallback_returns_required_keys(self):
        svc = NarrativeService(redis_client=MagicMock())
        ctx = {
            'username': 'user', 'strongest': '전술 플레이', 'weakest': '엔드게임 기술',
            'win_rate': 40.0, 'loss_rate': 45.0, 'gap': 30.0, 'style_dict': {},
        }
        result = svc._fallback(ctx)
        assert set(result.keys()) == {'pattern', 'why_losing', 'actions'}
        assert len(result['pattern']) > 10
        assert len(result['why_losing']) > 10
        # actions: 2~3개 문자열 리스트
        assert isinstance(result['actions'], list)
        assert 2 <= len(result['actions']) <= 3
        assert all(isinstance(a, str) and len(a) > 10 for a in result['actions'])

    def test_fallback_high_loss_rate_branch(self):
        svc = NarrativeService(redis_client=MagicMock())
        ctx = {'username': 'u', 'strongest': 'A', 'weakest': 'B',
               'win_rate': 30.0, 'loss_rate': 60.0, 'gap': 20.0, 'style_dict': {}}
        result = svc._fallback(ctx)
        # 패배율 높은 분기: 역전/전환점 메시지
        assert '역전' in result['why_losing'] or '전환점' in result['why_losing']

    def test_fallback_endgame_weakness_maps_to_lichess(self):
        svc = NarrativeService(redis_client=MagicMock())
        ctx = {'username': 'u', 'strongest': 'A', 'weakest': '엔드게임 기술',
               'win_rate': 50.0, 'loss_rate': 40.0, 'gap': 20.0, 'style_dict': {}}
        result = svc._fallback(ctx)
        # actions 중 하나는 Lichess 엔드게임 연습을 포함
        joined = ' '.join(result['actions'])
        assert 'Lichess' in joined or 'lichess' in joined


@pytest.mark.asyncio
class TestGenerateWithoutApi:

    async def test_falls_back_when_disabled(self):
        """With no API key, generate() returns rule-based fallback."""
        svc = NarrativeService(redis_client=MagicMock(), api_key=None)
        svc.initialize()

        profile = FakeProfile()
        result = await svc.generate(profile, SAMPLE_STATS, locale='ko')

        assert set(result.keys()) == {'pattern', 'why_losing', 'actions'}
        assert isinstance(result['pattern'], str)
        assert len(result['pattern']) > 0
        assert isinstance(result['actions'], list) and len(result['actions']) >= 2

    async def test_falls_back_when_limit_reached(self):
        redis = MagicMock()
        redis.get.return_value = str(NarrativeService.AI_DAILY_LIMIT)
        svc = NarrativeService(redis_client=redis, api_key="dummy")
        svc._enabled = True

        profile = FakeProfile()
        result = await svc.generate(profile, SAMPLE_STATS, locale='ko')

        assert 'pattern' in result

    async def test_locale_ko_uses_korean_keys_in_context(self):
        svc = NarrativeService(redis_client=MagicMock(), api_key=None)
        svc.initialize()
        profile = FakeProfile()
        result = await svc.generate(profile, SAMPLE_STATS, locale='ko')
        # Fallback result should be in Korean (Hangul Syllables U+AC00–U+D7A3)
        assert any('가' <= c <= '힣' for c in result['pattern'])

    async def test_invalid_locale_defaults_to_ko(self):
        svc = NarrativeService(redis_client=MagicMock(), api_key=None)
        svc.initialize()
        profile = FakeProfile()
        result = await svc.generate(profile, SAMPLE_STATS, locale='fr')  # unsupported
        assert 'pattern' in result  # should not crash


class TestFormatPrompt:

    def test_korean_prompt_contains_korean_text(self):
        svc = NarrativeService(redis_client=MagicMock())
        profile = FakeProfile()
        ctx = svc._build_context(profile, SAMPLE_STATS, locale='ko')
        ctx['locale'] = 'ko'
        prompt = svc._format_prompt(ctx)
        assert '플레이어' in prompt
        assert '승률' in prompt

    def test_english_prompt_contains_english_text(self):
        svc = NarrativeService(redis_client=MagicMock())
        profile = FakeProfile()
        ctx = svc._build_context(profile, SAMPLE_STATS, locale='en')
        ctx['locale'] = 'en'
        prompt = svc._format_prompt(ctx)
        assert 'Player Data' in prompt
        assert 'Win rate' in prompt
        assert '플레이어' not in prompt
