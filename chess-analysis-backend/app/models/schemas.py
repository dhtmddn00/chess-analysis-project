"""
Pydantic 데이터 스키마 모델들

API 요청/응답과 데이터 검증을 위한 Pydantic 모델들을 정의합니다.
"""

from datetime import datetime
from typing import Dict, List, Optional, Any, Union
from enum import Enum

from pydantic import BaseModel, Field, validator, ConfigDict


class TimeControlEnum(str, Enum):
    """시간 제어 열거형"""
    BULLET = "bullet"
    BLITZ = "blitz"
    RAPID = "rapid"
    DAILY = "daily"


class GameResultEnum(str, Enum):
    """게임 결과 열거형"""
    WHITE_WIN = "1-0"
    BLACK_WIN = "0-1"
    DRAW = "1/2-1/2"
    UNKNOWN = "*"


class StyleDimensionEnum(str, Enum):
    """스타일 차원 열거형"""
    AGGRESSION = "aggression"
    TACTICAL_DEPENDENCY = "tactical_dependency"
    RISK_TAKING = "risk_taking"
    POSITIONAL_ORIENTATION = "positional_orientation"
    EXCHANGE_PREFERENCE = "exchange_preference"
    OPENING_VARIETY = "opening_variety"
    BOOK_DEVIATION = "book_deviation"
    LEAD_CONVERSION = "lead_conversion"
    ENDGAME_TECHNIQUE = "endgame_technique"
    TIME_MANAGEMENT = "time_management"
    CONSISTENCY = "consistency"
    SWINDLE_RESISTANCE = "swindle_resistance"


class PerformanceLevelEnum(str, Enum):
    """성과 수준 열거형"""
    EXCELLENT = "excellent"
    GOOD = "good"
    AVERAGE = "average"
    BELOW_AVERAGE = "below_average"
    POOR = "poor"


class PriorityLevelEnum(str, Enum):
    """우선순위 수준 열거형"""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


# 기본 모델들
class BaseSchema(BaseModel):
    """기본 스키마 클래스"""
    model_config = ConfigDict(
        str_strip_whitespace=True,
        validate_assignment=True,
        arbitrary_types_allowed=True
    )


class PlayerInfoSchema(BaseSchema):
    """플레이어 기본 정보 스키마"""
    username: str
    platform: str
    rating: int
    country: Optional[str] = None
    title: Optional[str] = None
    joined_date: Optional[datetime] = None
    last_online: Optional[datetime] = None
    profile_url: Optional[str] = None


class GameInfoSchema(BaseSchema):
    """게임 정보 스키마"""
    game_id: str
    white_player: str
    black_player: str
    white_rating: int
    black_rating: int
    result: GameResultEnum
    time_control: TimeControlEnum
    time_control_seconds: int
    time_increment: int
    eco: Optional[str] = None
    opening: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    rated: bool = True
    site: str = "Chess.com"


class MoveAnalysisSchema(BaseSchema):
    """수 분석 결과 스키마"""
    ply: int
    move_san: str
    eval_before: Optional[int] = None
    eval_after: Optional[int] = None
    best_eval: Optional[int] = None
    best_move_san: Optional[str] = None
    quality: str  # "best", "good", "inaccuracy", "mistake", "blunder"
    centipawn_loss: int
    is_check: bool = False
    is_capture: bool = False
    is_castling: bool = False
    time_spent: Optional[float] = None


class GameAnalysisSchema(BaseSchema):
    """게임 분석 결과 스키마"""
    game_info: GameInfoSchema
    white_acpl: float
    black_acpl: float
    white_inaccuracies: int
    white_mistakes: int
    white_blunders: int
    black_inaccuracies: int
    black_mistakes: int
    black_blunders: int
    opening_moves: int
    middlegame_moves: int
    endgame_moves: int
    key_positions: List[Dict[str, Any]] = []


class EvidenceSchema(BaseSchema):
    """증거 데이터 스키마"""
    game_id: str
    ply: int
    move_san: str
    description: str
    impact_score: float
    context: Dict[str, Any] = {}


class StyleScoreSchema(BaseSchema):
    """스타일 점수 스키마"""
    dimension: StyleDimensionEnum
    score: float = Field(..., ge=0.0, le=100.0)
    percentile: Optional[float] = Field(None, ge=0.0, le=100.0)
    evidence: List[EvidenceSchema] = []


class PlayerProfileSchema(BaseSchema):
    """플레이어 프로파일 스키마"""
    player_name: str
    total_games: int
    total_moves: int
    average_rating: int
    
    # 전체 성과 지표
    overall_acpl: float
    win_rate: float = Field(..., ge=0.0, le=1.0)
    draw_rate: float = Field(..., ge=0.0, le=1.0)
    loss_rate: float = Field(..., ge=0.0, le=1.0)
    
    # 스타일 점수들
    style_scores: Dict[StyleDimensionEnum, StyleScoreSchema]
    
    # 시간제어별 성과
    time_control_stats: Dict[TimeControlEnum, Dict[str, float]] = {}
    
    # 색깔별 성과
    white_stats: Dict[str, float] = {}
    black_stats: Dict[str, float] = {}
    
    # 오프닝 레퍼토리
    opening_repertoire: Dict[str, Dict[str, Any]] = {}
    
    # 스타일 태그
    style_tags: List[str] = []
    
    @validator('win_rate', 'draw_rate', 'loss_rate')
    def validate_rates(cls, v):
        if v < 0 or v > 1:
            raise ValueError('비율은 0과 1 사이여야 합니다')
        return v


class CohortBucketSchema(BaseSchema):
    """코호트 버킷 스키마"""
    platform: str
    time_control: TimeControlEnum
    rating_min: int
    rating_max: int
    sample_size: int = 0
    bucket_key: str


class CohortComparisonSchema(BaseSchema):
    """코호트 비교 결과 스키마"""
    player_name: str
    cohort_bucket: CohortBucketSchema
    
    # 기본 지표 비교
    acpl_percentile: float = Field(..., ge=0.0, le=100.0)
    acpl_level: PerformanceLevelEnum
    
    blunder_rate_percentile: float = Field(..., ge=0.0, le=100.0)
    blunder_rate_level: PerformanceLevelEnum
    
    mistake_rate_percentile: float = Field(..., ge=0.0, le=100.0)
    mistake_rate_level: PerformanceLevelEnum
    
    # 스타일 차원별 백분위
    style_percentiles: Dict[StyleDimensionEnum, float] = {}
    style_levels: Dict[StyleDimensionEnum, PerformanceLevelEnum] = {}
    
    # 종합 평가
    overall_percentile: float = Field(..., ge=0.0, le=100.0)
    overall_level: PerformanceLevelEnum
    
    # 강점/약점 요약
    strengths: List[str] = []
    weaknesses: List[str] = []


class ImprovementAreaSchema(BaseSchema):
    """개선 영역 스키마"""
    area_name: str
    description: str
    priority: PriorityLevelEnum
    current_level: str
    target_level: str
    evidence: List[EvidenceSchema] = []
    impact_score: float = Field(..., ge=1.0, le=10.0)


class TrainingTaskSchema(BaseSchema):
    """훈련 과제 스키마"""
    task_id: str
    name: str
    training_type: str  # "tactics", "opening", "endgame", etc.
    description: str
    duration_minutes: int = Field(..., gt=0)
    frequency_per_week: int = Field(..., ge=1, le=7)
    instructions: List[str] = []
    resources: List[str] = []
    success_metrics: List[str] = []
    target_improvement: str


class WeeklyPlanSchema(BaseSchema):
    """주간 계획 스키마"""
    week_number: int = Field(..., ge=1)
    theme: str
    tasks: List[TrainingTaskSchema] = []
    total_time_minutes: int = Field(..., ge=0)
    practice_games: int = Field(..., ge=0)
    practice_time_control: str
    practice_focus: str
    objectives: List[str] = []
    kpi_targets: Dict[str, float] = {}


class ImprovementPlanSchema(BaseSchema):
    """개선 계획 스키마"""
    player_name: str
    plan_title: str
    duration_weeks: int = Field(..., ge=1, le=52)
    created_at: datetime
    
    # 개선 영역들
    improvement_areas: List[ImprovementAreaSchema] = []
    
    # 주간별 계획
    weekly_plans: List[WeeklyPlanSchema] = []
    
    # 전체 목표
    overall_objectives: List[str] = []
    target_rating_gain: int = Field(..., ge=0, le=1000)
    
    # 금지사항/주의사항
    avoid_habits: List[str] = []
    key_principles: List[str] = []


# API 요청/응답 스키마들
class AnalysisRequestSchema(BaseSchema):
    """분석 요청 스키마"""
    username: str = Field(..., min_length=3, max_length=50)
    platform: str = Field("chess.com")
    game_count: int = Field(10, ge=5, le=50)
    time_controls: Optional[List[TimeControlEnum]] = None
    include_improvement_plan: bool = True
    plan_weeks: int = Field(4, ge=2, le=12)
    daily_time_minutes: int = Field(45, ge=15, le=120)
    
    @validator('username')
    def validate_username(cls, v):
        if not v.replace('_', '').replace('-', '').isalnum():
            raise ValueError('사용자명은 영숫자, 언더스코어, 하이픈만 허용됩니다')
        return v.lower()


class AnalysisStatusSchema(BaseSchema):
    """분석 상태 스키마"""
    analysis_id: str
    status: str  # "pending", "collecting", "analyzing", etc.
    progress_percent: float = Field(..., ge=0.0, le=100.0)
    current_step: str
    estimated_remaining_seconds: Optional[int] = None
    message: str
    created_at: datetime
    updated_at: datetime
    error_message: Optional[str] = None


class AnalysisResultSchema(BaseSchema):
    """분석 결과 스키마"""
    analysis_id: str
    username: str
    platform: str
    
    # 기본 정보
    player_info: PlayerInfoSchema
    games_analyzed: int
    analysis_date: datetime
    
    # 분석 결과들
    player_profile: PlayerProfileSchema
    cohort_comparison: Optional[CohortComparisonSchema] = None
    improvement_plan: Optional[ImprovementPlanSchema] = None
    
    # 요약 정보
    key_insights: List[str] = []
    quick_tips: List[str] = []
    
    # 메타데이터
    analysis_duration_seconds: Optional[float] = None
    engine_depth: int = 12
    total_positions_analyzed: int = 0


class AnalysisSummarySchema(BaseSchema):
    """분석 요약 스키마 (목록용)"""
    analysis_id: str
    username: str
    platform: str
    status: str
    games_analyzed: int
    analysis_date: datetime
    key_insight: Optional[str] = None  # 핵심 인사이트 1개
    overall_rating: Optional[str] = None  # "excellent", "good", etc.


# 에러 응답 스키마들
class ErrorSchema(BaseSchema):
    """에러 응답 스키마"""
    code: int
    message: str
    type: str
    details: Optional[Dict[str, Any]] = None


class ValidationErrorSchema(BaseSchema):
    """유효성 검사 에러 스키마"""
    field: str
    message: str
    invalid_value: Any


# 헬스체크 스키마들
class ServiceCheckSchema(BaseSchema):
    """서비스 체크 스키마"""
    name: str
    status: str  # "pass", "fail", "warn"
    duration_ms: float
    message: str
    details: Dict[str, Any] = {}


class HealthStatusSchema(BaseSchema):
    """헬스 상태 스키마"""
    status: str  # "healthy", "degraded", "unhealthy"
    timestamp: datetime
    uptime_seconds: float
    version: str
    checks: Dict[str, ServiceCheckSchema]


# 통계 및 메트릭 스키마들
class PlayerStatsSchema(BaseSchema):
    """플레이어 통계 스키마"""
    username: str
    platform: str
    total_analyses: int
    last_analysis_date: Optional[datetime] = None
    average_rating: int
    rating_progress: List[Dict[str, Any]] = []  # 시계열 데이터
    favorite_time_control: TimeControlEnum
    improvement_trend: str  # "improving", "stable", "declining"


class PlatformStatsSchema(BaseSchema):
    """플랫폼 통계 스키마"""
    platform: str
    total_users: int
    total_analyses: int
    average_games_per_analysis: float
    popular_time_controls: Dict[TimeControlEnum, int]
    common_weaknesses: List[str]
    average_improvement_rating: int


# 응답 래퍼 스키마들
class SuccessResponseSchema(BaseSchema):
    """성공 응답 래퍼"""
    success: bool = True
    data: Any
    message: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ErrorResponseSchema(BaseSchema):
    """에러 응답 래퍼"""
    success: bool = False
    error: ErrorSchema
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class PaginatedResponseSchema(BaseSchema):
    """페이지네이션 응답 래퍼"""
    data: List[Any]
    total_count: int
    page: int = 1
    page_size: int = 10
    total_pages: int
    has_next: bool
    has_previous: bool
    
    @validator('total_pages', pre=True, always=True)
    def calculate_total_pages(cls, v, values):
        total_count = values.get('total_count', 0)
        page_size = values.get('page_size', 10)
        return (total_count + page_size - 1) // page_size if page_size > 0 else 0
    
    @validator('has_next', pre=True, always=True)
    def calculate_has_next(cls, v, values):
        page = values.get('page', 1)
        total_pages = values.get('total_pages', 0)
        return page < total_pages
    
    @validator('has_previous', pre=True, always=True)
    def calculate_has_previous(cls, v, values):
        page = values.get('page', 1)
        return page > 1


# 필터 및 쿼리 스키마들
class AnalysisFilterSchema(BaseSchema):
    """분석 필터 스키마"""
    username: Optional[str] = None
    platform: Optional[str] = None
    status: Optional[str] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    min_games: Optional[int] = Field(None, ge=1)
    max_games: Optional[int] = Field(None, le=100)
    time_controls: Optional[List[TimeControlEnum]] = None


class SortOptionsSchema(BaseSchema):
    """정렬 옵션 스키마"""
    field: str
    direction: str = Field("desc", pattern="^(asc|desc)$")


class SearchQuerySchema(BaseSchema):
    """검색 쿼리 스키마"""
    query: str = Field(..., min_length=1, max_length=100)
    filters: Optional[AnalysisFilterSchema] = None
    sort: Optional[SortOptionsSchema] = None
    page: int = Field(1, ge=1)
    page_size: int = Field(10, ge=1, le=100)