"""
데이터베이스 유틸리티 함수들

분석 작업과 관련된 데이터베이스 조회, 생성, 업데이트 등의 
공통 기능들을 제공합니다.
"""

from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_, func

from .database import (
    Player, Analysis, Game, GameAnalysis, MoveAnalysis,
    ImprovementPlan, ImprovementArea, WeeklyPlan, TrainingTask,
    CohortBaseline, AnalysisStatusType, SessionLocal
)


class PlayerManager:
    """플레이어 관련 데이터베이스 작업"""
    
    @staticmethod
    def get_or_create(db: Session, username: str, platform: str = "chess.com") -> Player:
        """플레이어 조회 또는 생성"""
        player = db.query(Player).filter(
            Player.username == username,
            Player.platform == platform
        ).first()
        
        if not player:
            player = Player(username=username, platform=platform)
            db.add(player)
            db.commit()
            db.refresh(player)
        
        return player
    
    @staticmethod
    def update_stats(db: Session, player: Player, 
                    current_rating: Optional[int] = None,
                    total_games: Optional[int] = None,
                    **kwargs) -> Player:
        """플레이어 통계 업데이트"""
        if current_rating is not None:
            player.current_rating = current_rating
            if player.peak_rating is None or current_rating > player.peak_rating:
                player.peak_rating = current_rating
        
        if total_games is not None:
            player.total_games = total_games
        
        for key, value in kwargs.items():
            if hasattr(player, key):
                setattr(player, key, value)
        
        player.updated_at = func.now()
        db.commit()
        db.refresh(player)
        return player
    
    @staticmethod
    def get_recent_analyses(db: Session, player_id: int, limit: int = 5) -> List[Analysis]:
        """플레이어의 최근 분석들 조회"""
        return db.query(Analysis).filter(
            Analysis.player_id == player_id
        ).order_by(desc(Analysis.created_at)).limit(limit).all()


class AnalysisManager:
    """분석 관련 데이터베이스 작업"""
    
    @staticmethod
    def create_analysis(db: Session, player_id: int, game_count: int,
                       time_controls: List[str] = None, engine_depth: int = 12) -> Analysis:
        """새 분석 작업 생성"""
        analysis = Analysis(
            player_id=player_id,
            game_count_requested=game_count,
            time_controls=time_controls or [],
            engine_depth=engine_depth,
            status=AnalysisStatusType.PENDING
        )
        db.add(analysis)
        db.commit()
        db.refresh(analysis)
        return analysis
    
    @staticmethod
    def update_status(db: Session, analysis_id: str, status: str,
                     progress_percent: float = None, current_step: str = None,
                     error_message: str = None):
        """분석 상태 업데이트"""
        analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
        if not analysis:
            return None
        
        analysis.status = status
        if progress_percent is not None:
            analysis.progress_percent = progress_percent
        if current_step is not None:
            analysis.current_step = current_step
        if error_message is not None:
            analysis.error_message = error_message
        
        if status == AnalysisStatusType.ANALYZING and not analysis.started_at:
            analysis.started_at = func.now()
        elif status == AnalysisStatusType.COMPLETED:
            analysis.completed_at = func.now()
            if analysis.started_at:
                # 분석 소요 시간 계산 (초 단위)
                duration = (datetime.now() - analysis.started_at).total_seconds()
                analysis.analysis_duration_seconds = duration
        
        db.commit()
        db.refresh(analysis)
        return analysis
    
    @staticmethod
    def get_analysis_with_details(db: Session, analysis_id: str) -> Optional[Analysis]:
        """분석과 관련 데이터 모두 조회"""
        return db.query(Analysis).filter(Analysis.id == analysis_id).first()
    
    @staticmethod
    def get_active_analyses(db: Session) -> List[Analysis]:
        """진행 중인 분석들 조회"""
        return db.query(Analysis).filter(
            Analysis.status.in_([
                AnalysisStatusType.PENDING,
                AnalysisStatusType.COLLECTING,
                AnalysisStatusType.PARSING,
                AnalysisStatusType.ANALYZING,
                AnalysisStatusType.PROFILING
            ])
        ).all()
    
    @staticmethod
    def cleanup_old_analyses(db: Session, days_old: int = 30) -> int:
        """오래된 분석 데이터 정리"""
        cutoff_date = datetime.now() - timedelta(days=days_old)
        
        old_analyses = db.query(Analysis).filter(
            Analysis.created_at < cutoff_date,
            Analysis.status.in_([AnalysisStatusType.COMPLETED, AnalysisStatusType.FAILED])
        ).all()
        
        count = len(old_analyses)
        for analysis in old_analyses:
            db.delete(analysis)
        
        db.commit()
        return count


class CohortManager:
    """코호트 데이터 관련 작업"""
    
    @staticmethod
    def get_baseline(db: Session, platform: str, time_control: str,
                    rating: int) -> Optional[CohortBaseline]:
        """플레이어 레이팅에 맞는 코호트 기준선 조회"""
        return db.query(CohortBaseline).filter(
            CohortBaseline.platform == platform,
            CohortBaseline.time_control == time_control,
            CohortBaseline.rating_min <= rating,
            CohortBaseline.rating_max >= rating
        ).first()
    
    @staticmethod
    def get_all_baselines(db: Session, platform: str = None) -> List[CohortBaseline]:
        """모든 코호트 기준선 조회"""
        query = db.query(CohortBaseline)
        if platform:
            query = query.filter(CohortBaseline.platform == platform)
        return query.order_by(
            CohortBaseline.platform,
            CohortBaseline.time_control,
            CohortBaseline.rating_min
        ).all()
    
    @staticmethod
    def get_rating_distribution(db: Session, platform: str, time_control: str) -> Dict[str, Any]:
        """레이팅별 분포 통계"""
        baselines = db.query(CohortBaseline).filter(
            CohortBaseline.platform == platform,
            CohortBaseline.time_control == time_control
        ).order_by(CohortBaseline.rating_min).all()
        
        distribution = {
            'buckets': [],
            'total_players': 0
        }
        
        for baseline in baselines:
            bucket = {
                'rating_range': f"{baseline.rating_min}-{baseline.rating_max}",
                'sample_size': baseline.sample_size,
                'acpl_mean': baseline.acpl_mean,
                'blunder_rate_mean': baseline.blunder_rate_mean
            }
            distribution['buckets'].append(bucket)
            distribution['total_players'] += baseline.sample_size
        
        return distribution


class GameManager:
    """게임 관련 데이터베이스 작업"""
    
    @staticmethod
    def save_games_bulk(db: Session, player_id: int, games_data: List[Dict]) -> List[Game]:
        """게임들을 일괄 저장"""
        games = []
        for game_data in games_data:
            # 중복 체크
            existing = db.query(Game).filter(
                Game.external_id == game_data.get('external_id'),
                Game.platform == game_data.get('platform')
            ).first()
            
            if existing:
                continue
            
            game = Game(player_id=player_id, **game_data)
            db.add(game)
            games.append(game)
        
        db.commit()
        return games
    
    @staticmethod
    def get_player_games(db: Session, player_id: int, limit: int = 50,
                        time_control: str = None) -> List[Game]:
        """플레이어의 게임들 조회"""
        query = db.query(Game).filter(Game.player_id == player_id)
        
        if time_control:
            query = query.filter(Game.time_control == time_control)
        
        return query.order_by(desc(Game.end_time)).limit(limit).all()
    
    @staticmethod
    def get_opening_statistics(db: Session, player_id: int, 
                              time_control: str = None) -> Dict[str, Any]:
        """플레이어의 오프닝 통계"""
        query = db.query(Game.eco, Game.opening, func.count().label('count')).filter(
            Game.player_id == player_id,
            Game.eco.isnot(None)
        )
        
        if time_control:
            query = query.filter(Game.time_control == time_control)
        
        results = query.group_by(Game.eco, Game.opening).order_by(desc('count')).all()
        
        openings = {}
        total_games = 0
        
        for eco, opening, count in results:
            openings[eco] = {
                'name': opening,
                'games': count,
                'percentage': 0  # 나중에 계산
            }
            total_games += count
        
        # 퍼센트 계산
        for eco in openings:
            openings[eco]['percentage'] = round(
                (openings[eco]['games'] / total_games) * 100, 1
            )
        
        return {
            'total_games': total_games,
            'openings': openings
        }


class DatabaseStats:
    """데이터베이스 통계 조회"""
    
    @staticmethod
    def get_system_stats(db: Session) -> Dict[str, Any]:
        """전체 시스템 통계"""
        return {
            'total_players': db.query(Player).count(),
            'total_analyses': db.query(Analysis).count(),
            'completed_analyses': db.query(Analysis).filter(
                Analysis.status == AnalysisStatusType.COMPLETED
            ).count(),
            'total_games': db.query(Game).count(),
            'total_game_analyses': db.query(GameAnalysis).count(),
            'active_analyses': db.query(Analysis).filter(
                Analysis.status.in_([
                    AnalysisStatusType.PENDING,
                    AnalysisStatusType.COLLECTING,
                    AnalysisStatusType.PARSING,
                    AnalysisStatusType.ANALYZING,
                    AnalysisStatusType.PROFILING
                ])
            ).count(),
            'cohort_buckets': db.query(CohortBaseline).count()
        }
    
    @staticmethod
    def get_recent_activity(db: Session, hours: int = 24) -> Dict[str, Any]:
        """최근 활동 통계"""
        since = datetime.now() - timedelta(hours=hours)
        
        return {
            'new_analyses': db.query(Analysis).filter(
                Analysis.created_at >= since
            ).count(),
            'completed_analyses': db.query(Analysis).filter(
                Analysis.completed_at >= since
            ).count(),
            'new_players': db.query(Player).filter(
                Player.created_at >= since
            ).count()
        }


# 컨텍스트 매니저로 데이터베이스 세션 관리
class DBSession:
    """데이터베이스 세션 컨텍스트 매니저"""
    
    def __enter__(self) -> Session:
        self.db = SessionLocal()
        return self.db
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self.db.rollback()
        else:
            self.db.commit()
        self.db.close()


# 편의 함수들
def with_db_session(func):
    """데이터베이스 세션을 자동으로 관리하는 데코레이터"""
    def wrapper(*args, **kwargs):
        with DBSession() as db:
            return func(db, *args, **kwargs)
    return wrapper


@with_db_session
def quick_player_lookup(db: Session, username: str, platform: str = "chess.com") -> Optional[Player]:
    """빠른 플레이어 조회"""
    return db.query(Player).filter(
        Player.username == username,
        Player.platform == platform
    ).first()


@with_db_session
def quick_analysis_status(db: Session, analysis_id: str) -> Optional[Dict[str, Any]]:
    """분석 상태 빠른 조회"""
    analysis = db.query(Analysis).filter(Analysis.id == analysis_id).first()
    if not analysis:
        return None
    
    return {
        'id': analysis.id,
        'status': analysis.status,
        'progress_percent': analysis.progress_percent,
        'current_step': analysis.current_step,
        'error_message': analysis.error_message,
        'created_at': analysis.created_at.isoformat() if analysis.created_at else None,
        'completed_at': analysis.completed_at.isoformat() if analysis.completed_at else None
    }