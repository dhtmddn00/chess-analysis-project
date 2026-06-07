"""Tests for worker error classification and retry logic."""
import pytest
from unittest.mock import AsyncMock, MagicMock
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from worker.main import ChessAnalysisWorker, FatalAnalysisError, TransientAnalysisError


@pytest.fixture
def worker():
    w = ChessAnalysisWorker.__new__(ChessAnalysisWorker)
    w.redis_client = MagicMock()
    w.db_client = AsyncMock()
    w.engine = AsyncMock()
    w.chess_api = AsyncMock()
    w.profiler = AsyncMock()
    w.analyzer = AsyncMock()
    w.narrative_service = MagicMock()
    w.narrative_service.generate = AsyncMock(return_value={
        'pattern': 'test', 'why_losing': 'test', 'one_action': 'test'
    })
    w.running = False
    w.queue_name = "chess-analysis-queue"
    w._move_schema_ready = False
    return w


def _unwrap(fn):
    """Unwrap tenacity @retry decorator (single level of __wrapped__)."""
    return fn.__wrapped__


@pytest.mark.asyncio
async def test_unsupported_platform_raises_fatal(worker):
    """Unsupported platform should mark job FAILED without retry."""
    job_data = {
        'analysisId': 'test-id-123',
        'username': 'testuser',
        'platform': 'unsupported_platform',   # ← 진짜 지원 안 하는 플랫폼
        'gameCount': 10,
        'priority': 'fast',
    }
    worker.update_analysis_status = AsyncMock()

    # FatalAnalysisError should not propagate (caught internally, no re-raise)
    await _unwrap(worker.process_analysis_job)(worker, job_data)

    worker.update_analysis_status.assert_called()
    last_call_args = worker.update_analysis_status.call_args
    assert last_call_args[0][1] == 'FAILED'


@pytest.mark.asyncio
async def test_no_games_found_raises_fatal(worker):
    """Empty game list should mark job FAILED without retry."""
    job_data = {
        'analysisId': 'test-id-456',
        'username': 'nonexistent_user',
        'platform': 'chess.com',
        'gameCount': 10,
        'priority': 'fast',
    }
    worker.update_analysis_status = AsyncMock()
    worker.chess_api.get_recent_games = AsyncMock(return_value=([], {}))

    await _unwrap(worker.process_analysis_job)(worker, job_data)

    worker.update_analysis_status.assert_called()
    last_call_args = worker.update_analysis_status.call_args
    assert last_call_args[0][1] == 'FAILED'


@pytest.mark.asyncio
async def test_network_error_raises_transient(worker):
    """Network errors from Chess.com API should be wrapped as TransientAnalysisError."""
    job_data = {
        'analysisId': 'test-id-789',
        'username': 'testuser',
        'platform': 'chess.com',
        'gameCount': 10,
        'priority': 'fast',
    }
    worker.update_analysis_status = AsyncMock()
    worker.chess_api.get_recent_games = AsyncMock(
        side_effect=Exception("Connection refused")
    )

    with pytest.raises(TransientAnalysisError):
        await _unwrap(worker.process_analysis_job)(worker, job_data)


def test_fatal_error_is_not_transient():
    assert not issubclass(FatalAnalysisError, TransientAnalysisError)


def test_transient_error_is_not_fatal():
    assert not issubclass(TransientAnalysisError, FatalAnalysisError)
