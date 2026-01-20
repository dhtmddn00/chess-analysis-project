"""
SQLAlchemy 데이터베이스 모델들

분석 결과와 사용자 데이터를 저장하기 위한 데이터베이스 모델들을 정의합니다.
"""

import json
from datetime import datetime
from typing import Dict, List, Any, Optional

from sqlalchemy import (
    create_engine, Column, Integer, String, Float, Boolean, Text, DateTime,
    ForeignKey, Index, UniqueConstraint, JSON, Enum as SQLEnum
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker, Session
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid

from ..config import settings

# SQLAlchemy 베이스 클래스
Base = declarative_base()


# 열거형들 (Python enum을 SQLAlchemy enum으로 변환)
class TimeControlType(str):
    BULLET = "bullet"
    BLITZ = "blitz"
    RAPID = "rapid"
    DAILY = "daily"


class GameResultType(str):
    WHITE_WIN = "1-0"
    BLACK_WIN = "0-1"
    DRAW = "1/2-1/2"
    UNKNOWN = "*"


class AnalysisStatusType(str):
    PENDING = "pending"
    COLLECTING = "collecting"
    PARSING = "parsing"
    ANALYZING = "analyzing"
    PROFILING = "profiling"
    COMPLETED = "completed"
    FAILED = "failed"


class PriorityType(str):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


# 메인 테이블들
class Player(Base):
    """플레이어 기본 정보"""
    __tablename__ = "players"
    
    id = Column(Integer, primary_key=True)
    username = Column(String(50), nullable=False)
    platform = Column(String(20), nullable=False, default="chess.com")
    display_name = Column(String(100))
    
    # 플레이어 메타데이터
    country = Column(String(3))  # ISO country code
    title = Column(String(10))   # GM, IM, FM, etc.
    joined_date = Column(DateTime)
    last_online = Column(DateTime)
    profile_url = Column(String(200))
    
    # 통계
    current_rating = Column(Integer)
    peak_rating = Column(Integer)
    total_games = Column(Integer, default=0)
    
    # 메타데이터
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # 관계
    analyses = relationship("Analysis", back_populates="player", cascade="all, delete-orphan")
    games = relationship("Game", back_populates="player", cascade="all, delete-orphan")
    
    # 인덱스와 제약조건
    __table_args__ = (
        UniqueConstraint('username', 'platform', name='uq_player_username_platform'),
        Index('idx_player_platform_username', 'platform', 'username'),
        Index('idx_player_rating', 'current_rating'),
        Index('idx_player_updated', 'updated_at'),
    )
    
    def __repr__(self):
        return f"<Player(username='{self.username}', platform='{self.platform}', rating={self.current_rating})>"


class Analysis(Base):
    """분석 작업 및 결과"""
    __tablename__ = "analyses"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    player_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    
    # 분석 설정
    game_count_requested = Column(Integer, nullable=False)
    game_count_analyzed = Column(Integer, default=0)
    time_controls = Column(JSON)  # List of time controls
    engine_depth = Column(Integer, default=12)
    
    # 분석 상태
    status = Column(String(20), nullable=False, default=AnalysisStatusType.PENDING)
    progress_percent = Column(Float, default=0.0)
    current_step = Column(String(100))
    error_message = Column(Text)
    
    # 시간 정보
    created_at = Column(DateTime, default=func.now())
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    analysis_duration_seconds = Column(Float)
    
    # 분석 결과 요약
    overall_acpl = Column(Float)
    win_rate = Column(Float)
    total_moves_analyzed = Column(Integer, default=0)
    
    # 스타일 점수들 (JSON으로 저장)
    style_scores = Column(JSON)
    
    # 코호트 비교 결과
    cohort_comparison = Column(JSON)
    
    # 핵심 인사이트
    key_insights = Column(JSON)  # List of strings
    quick_tips = Column(JSON)    # List of strings
    
    # 관계
    player = relationship("Player", back_populates="analyses")
    games = relationship("GameAnalysis", back_populates="analysis", cascade="all, delete-orphan")
    improvement_plan = relationship("ImprovementPlan", back_populates="analysis", uselist=False, cascade="all, delete-orphan")
    
    # 인덱스
    __table_args__ = (
        Index('idx_analysis_player_status', 'player_id', 'status'),
        Index('idx_analysis_created', 'created_at'),
        Index('idx_analysis_status', 'status'),
    )
    
    def __repr__(self):
        return f"<Analysis(id='{self.id}', player_id={self.player_id}, status='{self.status}')>"


class Game(Base):
    """게임 기본 정보"""
    __tablename__ = "games"
    
    id = Column(Integer, primary_key=True)
    player_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    
    # 게임 식별
    external_id = Column(String(100))  # Chess.com UUID, Lichess ID 등
    platform = Column(String(20), nullable=False)
    
    # 게임 정보
    white_player = Column(String(50), nullable=False)
    black_player = Column(String(50), nullable=False)
    white_rating = Column(Integer)
    black_rating = Column(Integer)
    
    # 게임 결과
    result = Column(String(10), nullable=False)  # "1-0", "0-1", "1/2-1/2", "*"
    
    # 시간 제어
    time_control = Column(String(20), nullable=False)
    time_control_seconds = Column(Integer)
    time_increment = Column(Integer)
    
    # 오프닝 정보
    eco = Column(String(5))
    opening = Column(String(200))
    
    # 게임 메타데이터
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    rated = Column(Boolean, default=True)
    pgn = Column(Text)
    
    # 생성/수정 시간
    created_at = Column(DateTime, default=func.now())
    
    # 관계
    player = relationship("Player", back_populates="games")
    analysis = relationship("GameAnalysis", back_populates="game", uselist=False, cascade="all, delete-orphan")
    
    # 인덱스
    __table_args__ = (
        UniqueConstraint('external_id', 'platform', name='uq_game_external_platform'),
        Index('idx_game_player_time', 'player_id', 'end_time'),
        Index('idx_game_platform_time', 'platform', 'end_time'),
        Index('idx_game_eco', 'eco'),
        Index('idx_game_time_control', 'time_control'),
    )
    
    def __repr__(self):
        return f"<Game(id={self.id}, white='{self.white_player}', black='{self.black_player}', result='{self.result}')>"


class GameAnalysis(Base):
    """게임별 상세 분석 결과"""
    __tablename__ = "game_analyses"
    
    id = Column(Integer, primary_key=True)
    analysis_id = Column(String(36), ForeignKey("analyses.id"), nullable=False)
    game_id = Column(Integer, ForeignKey("games.id"), nullable=False)
    
    # 플레이어 색깔 (해당 분석의 플레이어가 백인지 흑인지)
    player_color = Column(String(5), nullable=False)  # "white" or "black"
    
    # 전체 게임 분석 결과
    white_acpl = Column(Float, nullable=False)
    black_acpl = Column(Float, nullable=False)
    player_acpl = Column(Float, nullable=False)  # 해당 플레이어의 ACPL
    
    # 실수 통계
    white_inaccuracies = Column(Integer, default=0)
    white_mistakes = Column(Integer, default=0)
    white_blunders = Column(Integer, default=0)
    black_inaccuracies = Column(Integer, default=0)
    black_mistakes = Column(Integer, default=0)
    black_blunders = Column(Integer, default=0)
    
    # 페이즈별 분석
    opening_moves = Column(Integer, default=0)
    middlegame_moves = Column(Integer, default=0)
    endgame_moves = Column(Integer, default=0)
    
    # 페이즈별 ACPL
    white_opening_acpl = Column(Float)
    white_middlegame_acpl = Column(Float)
    white_endgame_acpl = Column(Float)
    black_opening_acpl = Column(Float)
    black_middlegame_acpl = Column(Float)
    black_endgame_acpl = Column(Float)
    
    # 주요 실수들 (JSON으로 저장)
    key_mistakes = Column(JSON)  # List of mistake details
    
    # 시간 분석 (있는 경우)
    time_analysis = Column(JSON)
    
    # 생성 시간
    created_at = Column(DateTime, default=func.now())
    
    # 관계
    analysis = relationship("Analysis", back_populates="games")
    game = relationship("Game", back_populates="analysis")
    move_analyses = relationship("MoveAnalysis", back_populates="game_analysis", cascade="all, delete-orphan")
    
    # 인덱스
    __table_args__ = (
        Index('idx_game_analysis_acpl', 'player_acpl'),
        Index('idx_game_analysis_analysis', 'analysis_id'),
    )
    
    def __repr__(self):
        return f"<GameAnalysis(id={self.id}, game_id={self.game_id}, player_acpl={self.player_acpl})>"


class MoveAnalysis(Base):
    """수별 상세 분석 결과"""
    __tablename__ = "move_analyses"
    
    id = Column(Integer, primary_key=True)
    game_analysis_id = Column(Integer, ForeignKey("game_analyses.id"), nullable=False)
    
    # 수 정보
    ply = Column(Integer, nullable=False)  # 수 번호 (0부터)
    move_san = Column(String(10), nullable=False)  # 대수 표기법
    move_uci = Column(String(5))  # UCI 표기법
    
    # 평가값들 (centipawn 단위)
    eval_before = Column(Integer)
    eval_after = Column(Integer)
    best_eval = Column(Integer)
    
    # 최선수 정보
    best_move_san = Column(String(10))
    best_move_uci = Column(String(5))
    
    # 수의 품질
    quality = Column(String(20), nullable=False)  # "best", "good", "inaccuracy", "mistake", "blunder"
    centipawn_loss = Column(Integer, default=0)
    
    # 수의 특성
    is_check = Column(Boolean, default=False)
    is_capture = Column(Boolean, default=False)
    is_castling = Column(Boolean, default=False)
    is_promotion = Column(Boolean, default=False)
    
    # 시간 정보
    time_spent = Column(Float)  # 초 단위
    time_left = Column(Float)   # 남은 시간 (초)
    
    # 관계
    game_analysis = relationship("GameAnalysis", back_populates="move_analyses")
    
    # 인덱스
    __table_args__ = (
        Index('idx_move_analysis_game_ply', 'game_analysis_id', 'ply'),
        Index('idx_move_analysis_quality', 'quality'),
    )
    
    def __repr__(self):
        return f"<MoveAnalysis(id={self.id}, ply={self.ply}, move='{self.move_san}', quality='{self.quality}')>"


class ImprovementPlan(Base):
    """개선 계획"""
    __tablename__ = "improvement_plans"
    
    id = Column(Integer, primary_key=True)
    analysis_id = Column(String(36), ForeignKey("analyses.id"), nullable=False)
    
    # 계획 기본 정보
    title = Column(String(200), nullable=False)
    duration_weeks = Column(Integer, nullable=False)
    target_rating_gain = Column(Integer, default=0)
    
    # 전체 목표들
    overall_objectives = Column(JSON)  # List of strings
    key_principles = Column(JSON)      # List of strings
    avoid_habits = Column(JSON)        # List of strings
    
    # 생성 시간
    created_at = Column(DateTime, default=func.now())
    
    # 관계
    analysis = relationship("Analysis", back_populates="improvement_plan")
    improvement_areas = relationship("ImprovementArea", back_populates="plan", cascade="all, delete-orphan")
    weekly_plans = relationship("WeeklyPlan", back_populates="plan", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<ImprovementPlan(id={self.id}, title='{self.title}', weeks={self.duration_weeks})>"


class ImprovementArea(Base):
    """개선 영역"""
    __tablename__ = "improvement_areas"
    
    id = Column(Integer, primary_key=True)
    plan_id = Column(Integer, ForeignKey("improvement_plans.id"), nullable=False)
    
    # 영역 정보
    area_name = Column(String(100), nullable=False)
    description = Column(Text)
    priority = Column(String(20), nullable=False)
    
    # 현재/목표 수준
    current_level = Column(String(200))
    target_level = Column(String(200))
    
    # 영향도 점수
    impact_score = Column(Float, nullable=False)
    
    # 증거 자료들
    evidence = Column(JSON)  # List of evidence objects
    
    # 관계
    plan = relationship("ImprovementPlan", back_populates="improvement_areas")
    
    # 인덱스
    __table_args__ = (
        Index('idx_improvement_area_priority', 'priority'),
        Index('idx_improvement_area_impact', 'impact_score'),
    )
    
    def __repr__(self):
        return f"<ImprovementArea(id={self.id}, name='{self.area_name}', priority='{self.priority}')>"


class WeeklyPlan(Base):
    """주간 계획"""
    __tablename__ = "weekly_plans"
    
    id = Column(Integer, primary_key=True)
    plan_id = Column(Integer, ForeignKey("improvement_plans.id"), nullable=False)
    
    # 주간 정보
    week_number = Column(Integer, nullable=False)
    theme = Column(String(200))
    
    # 시간 할당
    total_time_minutes = Column(Integer, default=0)
    
    # 실전 연습
    practice_games = Column(Integer, default=0)
    practice_time_control = Column(String(20))
    practice_focus = Column(String(200))
    
    # 목표들
    objectives = Column(JSON)    # List of strings
    kpi_targets = Column(JSON)   # Dict of KPI targets
    
    # 관계
    plan = relationship("ImprovementPlan", back_populates="weekly_plans")
    tasks = relationship("TrainingTask", back_populates="weekly_plan", cascade="all, delete-orphan")
    
    # 인덱스
    __table_args__ = (
        Index('idx_weekly_plan_week', 'plan_id', 'week_number'),
    )
    
    def __repr__(self):
        return f"<WeeklyPlan(id={self.id}, week={self.week_number}, theme='{self.theme}')>"


class TrainingTask(Base):
    """훈련 과제"""
    __tablename__ = "training_tasks"
    
    id = Column(Integer, primary_key=True)
    weekly_plan_id = Column(Integer, ForeignKey("weekly_plans.id"), nullable=False)
    
    # 과제 정보
    task_id = Column(String(50), nullable=False)
    name = Column(String(200), nullable=False)
    training_type = Column(String(50), nullable=False)
    description = Column(Text)
    
    # 시간 할당
    duration_minutes = Column(Integer, nullable=False)
    frequency_per_week = Column(Integer, nullable=False)
    
    # 지시사항과 리소스
    instructions = Column(JSON)  # List of strings
    resources = Column(JSON)     # List of strings
    
    # 성과 측정
    success_metrics = Column(JSON)  # List of strings
    target_improvement = Column(String(200))
    
    # 관계
    weekly_plan = relationship("WeeklyPlan", back_populates="tasks")
    
    def __repr__(self):
        return f"<TrainingTask(id={self.id}, name='{self.name}', type='{self.training_type}')>"


# 코호트 및 통계 테이블들
class CohortBaseline(Base):
    """코호트 기준 통계"""
    __tablename__ = "cohort_baselines"
    
    id = Column(Integer, primary_key=True)
    
    # 코호트 정의
    platform = Column(String(20), nullable=False)
    time_control = Column(String(20), nullable=False)
    rating_min = Column(Integer, nullable=False)
    rating_max = Column(Integer, nullable=False)
    
    # 샘플 정보
    sample_size = Column(Integer, nullable=False)
    last_updated = Column(DateTime, default=func.now())
    
    # 통계 데이터
    acpl_mean = Column(Float, nullable=False)
    acpl_std = Column(Float, nullable=False)
    acpl_percentiles = Column(JSON)  # Dict of percentiles
    
    blunder_rate_mean = Column(Float, nullable=False)
    blunder_rate_std = Column(Float, nullable=False)
    blunder_rate_percentiles = Column(JSON)
    
    mistake_rate_mean = Column(Float, nullable=False)
    mistake_rate_std = Column(Float, nullable=False)
    mistake_rate_percentiles = Column(JSON)
    
    # 스타일 차원별 분포
    style_distributions = Column(JSON)
    
    # 인덱스
    __table_args__ = (
        UniqueConstraint('platform', 'time_control', 'rating_min', 'rating_max', 
                        name='uq_cohort_baseline'),
        Index('idx_cohort_platform_time_rating', 'platform', 'time_control', 'rating_min', 'rating_max'),
        Index('idx_cohort_updated', 'last_updated'),
    )
    
    @property
    def bucket_key(self):
        return f"{self.platform}_{self.time_control}_{self.rating_min}-{self.rating_max}"
    
    def __repr__(self):
        return f"<CohortBaseline(platform='{self.platform}', time_control='{self.time_control}', rating={self.rating_min}-{self.rating_max})>"


# 데이터베이스 엔진 및 세션 설정
engine = create_engine(
    settings.database_url,
    echo=settings.database_echo,
    pool_pre_ping=True,
    pool_recycle=300
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Session:
    """데이터베이스 세션 의존성"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    """모든 테이블 생성"""
    Base.metadata.create_all(bind=engine)


def drop_tables():
    """모든 테이블 삭제 (개발용)"""
    Base.metadata.drop_all(bind=engine)


# 유틸리티 함수들
def get_or_create_player(db: Session, username: str, platform: str = "chess.com") -> Player:
    """플레이어 조회 또는 생성"""
    player = db.query(Player).filter(
        Player.username == username,
        Player.platform == platform
    ).first()
    
    if not player:
        player = Player(
            username=username,
            platform=platform
        )
        db.add(player)
        db.commit()
        db.refresh(player)
    
    return player


def save_analysis_result(
    db: Session,
    analysis_id: str,
    player: Player,
    parsed_games: List,
    game_analyses: List,
    player_profile,
    cohort_comparison=None,
    improvement_plan=None
):
    """분석 결과를 데이터베이스에 저장"""
    
    # Analysis 레코드 업데이트
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not analysis:
        return None
    
    analysis.status = AnalysisStatusType.COMPLETED
    analysis.completed_at = func.now()
    analysis.game_count_analyzed = len(parsed_games)
    analysis.overall_acpl = player_profile.overall_acpl
    analysis.win_rate = player_profile.win_rate
    analysis.total_moves_analyzed = player_profile.total_moves
    
    # 스타일 점수 저장
    style_scores_dict = {}
    for dim, score in player_profile.style_scores.items():
        style_scores_dict[dim.value] = {
            'score': score.score,
            'percentile': score.percentile,
            'evidence': [
                {
                    'game_id': ev.game_id,
                    'ply': ev.ply,
                    'move_san': ev.move_san,
                    'description': ev.description,
                    'impact_score': ev.impact_score,
                    'context': ev.context
                }
                for ev in score.evidence
            ]
        }
    analysis.style_scores = style_scores_dict
    
    # 코호트 비교 결과 저장
    if cohort_comparison:
        analysis.cohort_comparison = {
            'overall_percentile': cohort_comparison.overall_percentile,
            'overall_level': cohort_comparison.overall_level.value,
            'acpl_percentile': cohort_comparison.acpl_percentile,
            'blunder_rate_percentile': cohort_comparison.blunder_rate_percentile,
            'strengths': cohort_comparison.strengths,
            'weaknesses': cohort_comparison.weaknesses
        }
    
    # 게임 및 분석 결과들 저장
    for i, (parsed_game, game_analysis) in enumerate(zip(parsed_games, game_analyses)):
        # 게임 저장
        game = Game(
            player_id=player.id,
            external_id=parsed_game.info.game_id,
            platform=player.platform,
            white_player=parsed_game.info.white_player,
            black_player=parsed_game.info.black_player,
            white_rating=parsed_game.info.white_rating,
            black_rating=parsed_game.info.black_rating,
            result=parsed_game.info.result.value,
            time_control=parsed_game.info.time_control.value,
            time_control_seconds=parsed_game.info.time_control_seconds,
            time_increment=parsed_game.info.time_increment,
            eco=parsed_game.info.eco,
            opening=parsed_game.info.opening,
            start_time=parsed_game.info.start_time,
            end_time=parsed_game.info.end_time,
            rated=parsed_game.info.rated,
            pgn=parsed_game.info.pgn_text
        )
        db.add(game)
        db.flush()  # ID를 얻기 위해
        
        # 게임 분석 저장
        player_color = "white" if parsed_game.info.white_player.lower() == player.username else "black"
        
        game_analysis_record = GameAnalysis(
            analysis_id=analysis_id,
            game_id=game.id,
            player_color=player_color,
            white_acpl=game_analysis.white_acpl,
            black_acpl=game_analysis.black_acpl,
            player_acpl=game_analysis.white_acpl if player_color == "white" else game_analysis.black_acpl,
            white_inaccuracies=game_analysis.white_inaccuracies,
            white_mistakes=game_analysis.white_mistakes,
            white_blunders=game_analysis.white_blunders,
            black_inaccuracies=game_analysis.black_inaccuracies,
            black_mistakes=game_analysis.black_mistakes,
            black_blunders=game_analysis.black_blunders,
            opening_moves=game_analysis.opening_moves,
            middlegame_moves=game_analysis.middlegame_moves,
            endgame_moves=game_analysis.endgame_moves,
            white_opening_acpl=game_analysis.white_opening_acpl,
            white_middlegame_acpl=game_analysis.white_middlegame_acpl,
            white_endgame_acpl=game_analysis.white_endgame_acpl,
            black_opening_acpl=game_analysis.black_opening_acpl,
            black_middlegame_acpl=game_analysis.black_middlegame_acpl,
            black_endgame_acpl=game_analysis.black_endgame_acpl
        )
        db.add(game_analysis_record)
        db.flush()
        
        # 수별 분석 저장 (주요 실수들만)
        for move_analysis in game_analysis.move_analyses:
            if move_analysis.quality in ['mistake', 'blunder'] or move_analysis.centipawn_loss > 50:
                move_record = MoveAnalysis(
                    game_analysis_id=game_analysis_record.id,
                    ply=move_analysis.ply,
                    move_san=move_analysis.move_san,
                    eval_before=move_analysis.eval_before,
                    eval_after=move_analysis.eval_after,
                    best_eval=move_analysis.best_eval,
                    best_move_san=move_analysis.best_move_san,
                    quality=move_analysis.quality.value,
                    centipawn_loss=move_analysis.centipawn_loss,
                    is_check=move_analysis.is_check,
                    is_capture=move_analysis.is_capture,
                    is_castling=move_analysis.is_castling,
                    time_spent=move_analysis.time_spent
                )
                db.add(move_record)
    
    # 개선 계획 저장
    if improvement_plan:
        plan_record = ImprovementPlan(
            analysis_id=analysis_id,
            title=improvement_plan.plan_title,
            duration_weeks=improvement_plan.duration_weeks,
            target_rating_gain=improvement_plan.target_rating_gain,
            overall_objectives=improvement_plan.overall_objectives,
            key_principles=improvement_plan.key_principles,
            avoid_habits=improvement_plan.avoid_habits
        )
        db.add(plan_record)
        db.flush()
        
        # 개선 영역들 저장
        for area in improvement_plan.improvement_areas:
            area_record = ImprovementArea(
                plan_id=plan_record.id,
                area_name=area.area_name,
                description=area.description,
                priority=area.priority.value,
                current_level=area.current_level,
                target_level=area.target_level,
                impact_score=area.impact_score,
                evidence=[
                    {
                        'game_id': ev.game_id,
                        'ply': ev.ply,
                        'move_san': ev.move_san,
                        'description': ev.description,
                        'impact_score': ev.impact_score,
                        'context': ev.context
                    }
                    for ev in area.evidence
                ]
            )
            db.add(area_record)
        
        # 주간 계획들 저장
        for weekly_plan in improvement_plan.weekly_plans:
            week_record = WeeklyPlan(
                plan_id=plan_record.id,
                week_number=weekly_plan.week_number,
                theme=weekly_plan.theme,
                total_time_minutes=weekly_plan.total_time_minutes,
                practice_games=weekly_plan.practice_games,
                practice_time_control=weekly_plan.practice_time_control,
                practice_focus=weekly_plan.practice_focus,
                objectives=weekly_plan.objectives,
                kpi_targets=weekly_plan.kpi_targets
            )
            db.add(week_record)
            db.flush()
            
            # 훈련 과제들 저장
            for task in weekly_plan.tasks:
                task_record = TrainingTask(
                    weekly_plan_id=week_record.id,
                    task_id=task.task_id,
                    name=task.name,
                    training_type=task.training_type.value,
                    description=task.description,
                    duration_minutes=task.duration_minutes,
                    frequency_per_week=task.frequency_per_week,
                    instructions=task.instructions,
                    resources=task.resources,
                    success_metrics=task.success_metrics,
                    target_improvement=task.target_improvement
                )
                db.add(task_record)
    
    # 모든 변경사항 커밋
    db.commit()
    
    return analysis