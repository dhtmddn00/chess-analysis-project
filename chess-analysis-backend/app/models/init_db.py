"""
데이터베이스 초기화 및 설정 스크립트

이 스크립트는:
1. 데이터베이스 테이블들을 생성합니다
2. 코호트 기준 데이터를 로드합니다
3. 개발용 샘플 데이터를 생성할 수 있습니다
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Any

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from .database import (
    Base, Player, Analysis, Game, GameAnalysis, MoveAnalysis,
    ImprovementPlan, ImprovementArea, WeeklyPlan, TrainingTask,
    CohortBaseline, engine, SessionLocal
)
from ..config import settings

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_all_tables():
    """모든 데이터베이스 테이블 생성"""
    logger.info("Creating database tables...")
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("✅ All tables created successfully")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to create tables: {e}")
        return False


def drop_all_tables():
    """모든 테이블 삭제 (주의: 모든 데이터가 삭제됩니다)"""
    logger.warning("Dropping all database tables...")
    try:
        Base.metadata.drop_all(bind=engine)
        logger.info("✅ All tables dropped successfully")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to drop tables: {e}")
        return False


def load_cohort_baseline_data():
    """코호트 기준 데이터를 JSON 파일에서 로드"""
    logger.info("Loading cohort baseline data...")
    
    # 데이터 파일 경로
    data_file = Path(__file__).parent.parent.parent / "data" / "cohort_baseline.json"
    
    if not data_file.exists():
        logger.error(f"❌ Cohort baseline data file not found: {data_file}")
        return False
    
    try:
        with open(data_file, 'r', encoding='utf-8') as f:
            baseline_data = json.load(f)
        
        db = SessionLocal()
        try:
            # 기존 데이터 삭제
            db.query(CohortBaseline).delete()
            
            loaded_count = 0
            # 실제 JSON 구조에 맞게 파싱 (bucket_key를 최상위 키로 사용)
            for bucket_key, stats in baseline_data.items():
                # bucket_key에서 플랫폼, 시간제어, 레이팅 범위 파싱
                # 예: "chess.com_blitz_600-800" 
                parts = bucket_key.split('_')
                if len(parts) >= 3:
                    platform = parts[0]
                    time_control = parts[1]
                    rating_range = parts[2]
                    rating_min, rating_max = map(int, rating_range.split('-'))
                else:
                    continue  # 잘못된 형식은 건너뛰기
                
                # CohortBaseline 레코드 생성
                baseline = CohortBaseline(
                    platform=platform,
                    time_control=time_control,
                    rating_min=rating_min,
                    rating_max=rating_max,
                    sample_size=stats.get('sample_games', 1000),  # sample_games -> sample_size
                    
                    # ACPL 통계 - 직접 접근
                    acpl_mean=stats['acpl_mean'],
                    acpl_std=stats['acpl_std'],
                    acpl_percentiles=stats['acpl_percentiles'],
                    
                    # 블런더율 통계 - 직접 접근
                    blunder_rate_mean=stats['blunder_rate_mean'],
                    blunder_rate_std=stats['blunder_rate_std'],
                    blunder_rate_percentiles=stats['blunder_rate_percentiles'],
                    
                    # 실수율 통계 - 직접 접근
                    mistake_rate_mean=stats['mistake_rate_mean'],
                    mistake_rate_std=stats['mistake_rate_std'],
                    mistake_rate_percentiles=stats['mistake_rate_percentiles'],
                    
                    # 스타일 분포
                    style_distributions=stats['style_distributions'],
                    
                    last_updated=datetime.now()
                )
                db.add(baseline)
                loaded_count += 1
            
            db.commit()
            logger.info(f"✅ Loaded {loaded_count} cohort baseline records")
            return True
            
        except Exception as e:
            db.rollback()
            logger.error(f"❌ Failed to load cohort data: {e}")
            return False
        finally:
            db.close()
            
    except Exception as e:
        logger.error(f"❌ Failed to read cohort data file: {e}")
        return False


def create_sample_player(username: str = "test_player") -> bool:
    """개발용 샘플 플레이어 생성"""
    logger.info(f"Creating sample player: {username}")
    
    db = SessionLocal()
    try:
        # 기존 플레이어 확인
        existing = db.query(Player).filter(
            Player.username == username,
            Player.platform == "chess.com"
        ).first()
        
        if existing:
            logger.info(f"Player {username} already exists")
            return True
        
        # 새 플레이어 생성
        player = Player(
            username=username,
            platform="chess.com",
            display_name=f"Test Player ({username})",
            country="US",
            current_rating=1500,
            peak_rating=1600,
            total_games=150,
            joined_date=datetime(2020, 1, 1),
            last_online=datetime.now()
        )
        
        db.add(player)
        db.commit()
        logger.info(f"✅ Sample player {username} created")
        return True
        
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Failed to create sample player: {e}")
        return False
    finally:
        db.close()


def check_database_health() -> Dict[str, Any]:
    """데이터베이스 상태 확인"""
    logger.info("Checking database health...")
    
    health_status = {
        "database_connected": False,
        "tables_exist": False,
        "cohort_data_loaded": False,
        "table_counts": {},
        "errors": []
    }
    
    try:
        db = SessionLocal()
        
        # 연결 테스트
        db.execute(text("SELECT 1"))
        health_status["database_connected"] = True
        
        # 테이블 존재 여부 확인
        tables = [
            ("players", Player),
            ("analyses", Analysis),
            ("games", Game),
            ("game_analyses", GameAnalysis),
            ("move_analyses", MoveAnalysis),
            ("improvement_plans", ImprovementPlan),
            ("improvement_areas", ImprovementArea),
            ("weekly_plans", WeeklyPlan),
            ("training_tasks", TrainingTask),
            ("cohort_baselines", CohortBaseline)
        ]
        
        all_tables_exist = True
        for table_name, model_class in tables:
            try:
                count = db.query(model_class).count()
                health_status["table_counts"][table_name] = count
            except Exception as e:
                all_tables_exist = False
                health_status["errors"].append(f"Table {table_name} issue: {str(e)}")
        
        health_status["tables_exist"] = all_tables_exist
        
        # 코호트 데이터 확인
        cohort_count = db.query(CohortBaseline).count()
        health_status["cohort_data_loaded"] = cohort_count > 0
        
        db.close()
        
    except Exception as e:
        health_status["errors"].append(f"Database connection failed: {str(e)}")
    
    # 결과 출력
    logger.info("=== Database Health Check ===")
    logger.info(f"Connected: {health_status['database_connected']}")
    logger.info(f"Tables exist: {health_status['tables_exist']}")
    logger.info(f"Cohort data loaded: {health_status['cohort_data_loaded']}")
    
    if health_status["table_counts"]:
        logger.info("Table counts:")
        for table, count in health_status["table_counts"].items():
            logger.info(f"  {table}: {count}")
    
    if health_status["errors"]:
        logger.warning("Errors found:")
        for error in health_status["errors"]:
            logger.warning(f"  {error}")
    
    return health_status


def initialize_database(force_recreate: bool = False):
    """전체 데이터베이스 초기화"""
    logger.info("=== Database Initialization ===")
    
    if force_recreate:
        logger.warning("Force recreate enabled - dropping existing tables")
        drop_all_tables()
    
    # 1. 테이블 생성
    if not create_all_tables():
        logger.error("Failed to create tables, aborting initialization")
        return False
    
    # 2. 코호트 데이터 로드
    if not load_cohort_baseline_data():
        logger.warning("Failed to load cohort data, but continuing...")
    
    # 3. 개발 환경에서 샘플 데이터 생성
    if settings.debug:
        logger.info("Debug mode - creating sample data")
        create_sample_player("test_user")
        create_sample_player("demo_player")
    
    # 4. 상태 확인
    health_status = check_database_health()
    
    if health_status["database_connected"] and health_status["tables_exist"]:
        logger.info("✅ Database initialization completed successfully")
        return True
    else:
        logger.error("❌ Database initialization failed")
        return False


if __name__ == "__main__":
    """스크립트 직접 실행 시"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Database initialization utility")
    parser.add_argument("--force-recreate", action="store_true",
                       help="Drop and recreate all tables")
    parser.add_argument("--health-check", action="store_true",
                       help="Only run health check")
    parser.add_argument("--load-cohort", action="store_true",
                       help="Only load cohort data")
    
    args = parser.parse_args()
    
    if args.health_check:
        check_database_health()
    elif args.load_cohort:
        load_cohort_baseline_data()
    else:
        initialize_database(force_recreate=args.force_recreate)