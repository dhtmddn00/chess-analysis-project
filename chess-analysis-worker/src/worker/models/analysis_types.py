"""
분석 관련 공통 데이터 타입들

CircularImport 문제를 해결하기 위해 공통으로 사용되는 
데이터 클래스들을 별도 모듈로 분리했습니다.
"""

from typing import List, Dict, Optional, Any
from dataclasses import dataclass
from enum import Enum


class MoveQuality(Enum):
    """수의 품질 등급"""
    BEST = "best"
    GOOD = "good"
    INACCURACY = "inaccuracy"
    MISTAKE = "mistake"
    BLUNDER = "blunder"


@dataclass
class MoveAnalysis:
    """개별 수 분석 결과"""
    ply: int  # 수 번호 (0부터 시작)
    move_san: str  # 대수 표기법
    move_uci: Optional[str] = None  # UCI 표기법
    
    # 평가값들 (centipawn 단위)
    eval_before: Optional[int] = None
    eval_after: Optional[int] = None
    best_eval: Optional[int] = None
    
    # 최선수 정보
    best_move_san: Optional[str] = None
    best_move_uci: Optional[str] = None
    
    # 수의 품질
    quality: MoveQuality = MoveQuality.GOOD
    centipawn_loss: int = 0
    
    # 수의 특성
    is_check: bool = False
    is_capture: bool = False
    is_castling: bool = False
    is_promotion: bool = False
    
    # 시간 정보
    time_spent: Optional[float] = None  # 초 단위
    time_left: Optional[float] = None   # 남은 시간
    
    # 전술 정보
    tactical_opportunities: Optional[List[Dict[str, Any]]] = None  # 전술 기회들
    tactical_motifs: Optional[List[str]] = None  # 전술 모티프들
    tactical_usage: Optional[Dict[str, Any]] = None  # 전술 활용도 정보 (found/missed)


@dataclass
class GameAnalysis:
    """게임 전체 분석 결과"""
    game_id: str
    
    # 전체 ACPL (Average Centipawn Loss)
    white_acpl: float
    black_acpl: float
    
    # 실수 통계
    white_inaccuracies: int = 0
    white_mistakes: int = 0
    white_blunders: int = 0
    black_inaccuracies: int = 0
    black_mistakes: int = 0
    black_blunders: int = 0
    
    # 페이즈별 정보
    opening_moves: int = 0
    middlegame_moves: int = 0
    endgame_moves: int = 0
    
    # 페이즈별 ACPL
    white_opening_acpl: Optional[float] = None
    white_middlegame_acpl: Optional[float] = None
    white_endgame_acpl: Optional[float] = None
    black_opening_acpl: Optional[float] = None
    black_middlegame_acpl: Optional[float] = None
    black_endgame_acpl: Optional[float] = None
    
    # 상세 수 분석들
    move_analyses: List[MoveAnalysis] = None
    
    # 주요 실수들 (필터링된)
    key_mistakes: List[Dict[str, Any]] = None
    
    def __post_init__(self):
        if self.move_analyses is None:
            self.move_analyses = []
        if self.key_mistakes is None:
            self.key_mistakes = []


@dataclass
class Evidence:
    """스타일 분석의 증거 자료"""
    game_id: str
    ply: int
    move_san: str
    description: str
    impact_score: float
    context: Optional[Dict[str, Any]] = None


@dataclass
class StyleScore:
    """스타일 차원별 점수와 증거"""
    score: float  # 0-100 점수
    percentile: Optional[float] = None  # 코호트 대비 백분위
    evidence: List[Evidence] = None
    
    def __post_init__(self):
        if self.evidence is None:
            self.evidence = []


class TimeControlType(Enum):
    """시간 제어 타입"""
    BULLET = "bullet"
    BLITZ = "blitz"
    RAPID = "rapid"  
    DAILY = "daily"


class GameResult(Enum):
    """게임 결과"""
    WHITE_WIN = "1-0"
    BLACK_WIN = "0-1"
    DRAW = "1/2-1/2"
    UNKNOWN = "*"


class AnalysisStatus(Enum):
    """분석 상태"""
    PENDING = "pending"
    COLLECTING = "collecting"
    PARSING = "parsing"
    ANALYZING = "analyzing"
    PROFILING = "profiling"
    COMPLETED = "completed"
    FAILED = "failed"