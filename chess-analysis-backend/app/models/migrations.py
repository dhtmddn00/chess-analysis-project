"""
데이터베이스 마이그레이션 유틸리티

스키마 변경과 데이터 마이그레이션을 관리합니다.
"""

import logging
from datetime import datetime
from typing import List, Dict, Any, Callable
from sqlalchemy import Column, Integer, String, Text, DateTime, create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.sql import func

from ..config import settings

# 로깅 설정
logger = logging.getLogger(__name__)

# 마이그레이션 히스토리를 위한 별도 테이블
MigrationBase = declarative_base()

class MigrationHistory(MigrationBase):
    """마이그레이션 실행 히스토리"""
    __tablename__ = "migration_history"
    
    id = Column(Integer, primary_key=True)
    version = Column(String(50), nullable=False, unique=True)
    description = Column(String(200), nullable=False)
    executed_at = Column(DateTime, default=func.now())
    success = Column(Integer, default=1)  # 1=성공, 0=실패
    error_message = Column(Text)
    
    def __repr__(self):
        return f"<Migration(version='{self.version}', success={self.success})>"


class MigrationManager:
    """마이그레이션 매니저"""
    
    def __init__(self):
        self.engine = create_engine(settings.database_url)
        self.session_maker = sessionmaker(bind=self.engine)
        self.migrations: List[Migration] = []
        
        # 마이그레이션 히스토리 테이블 생성
        MigrationBase.metadata.create_all(self.engine)
    
    def register_migration(self, migration: 'Migration'):
        """마이그레이션 등록"""
        self.migrations.append(migration)
        self.migrations.sort(key=lambda m: m.version)
    
    def get_executed_migrations(self) -> List[str]:
        """실행된 마이그레이션 버전 목록 조회"""
        session = self.session_maker()
        try:
            executed = session.query(MigrationHistory.version).filter(
                MigrationHistory.success == 1
            ).all()
            return [version for version, in executed]
        finally:
            session.close()
    
    def run_pending_migrations(self, dry_run: bool = False) -> bool:
        """대기 중인 마이그레이션들 실행"""
        executed_versions = self.get_executed_migrations()
        pending_migrations = [
            m for m in self.migrations 
            if m.version not in executed_versions
        ]
        
        if not pending_migrations:
            logger.info("No pending migrations")
            return True
        
        logger.info(f"Found {len(pending_migrations)} pending migrations")
        
        for migration in pending_migrations:
            if dry_run:
                logger.info(f"[DRY RUN] Would execute: {migration.version} - {migration.description}")
                continue
            
            if not self._execute_migration(migration):
                logger.error(f"Migration {migration.version} failed, stopping")
                return False
        
        if not dry_run:
            logger.info("All migrations completed successfully")
        
        return True
    
    def _execute_migration(self, migration: 'Migration') -> bool:
        """단일 마이그레이션 실행"""
        logger.info(f"Executing migration: {migration.version} - {migration.description}")
        
        session = self.session_maker()
        history_record = None
        
        try:
            # 히스토리 레코드 생성
            history_record = MigrationHistory(
                version=migration.version,
                description=migration.description,
                success=0  # 실패로 초기화
            )
            session.add(history_record)
            session.commit()
            
            # 마이그레이션 실행
            migration.execute(self.engine, session)
            
            # 성공으로 마킹
            history_record.success = 1
            session.commit()
            
            logger.info(f"✅ Migration {migration.version} completed")
            return True
            
        except Exception as e:
            logger.error(f"❌ Migration {migration.version} failed: {e}")
            
            if history_record:
                history_record.error_message = str(e)
                session.commit()
            
            session.rollback()
            return False
            
        finally:
            session.close()
    
    def rollback_migration(self, version: str) -> bool:
        """마이그레이션 롤백 (구현된 경우)"""
        migration = next((m for m in self.migrations if m.version == version), None)
        if not migration:
            logger.error(f"Migration {version} not found")
            return False
        
        if not hasattr(migration, 'rollback') or not callable(migration.rollback):
            logger.error(f"Migration {version} does not support rollback")
            return False
        
        logger.info(f"Rolling back migration: {version}")
        
        session = self.session_maker()
        try:
            migration.rollback(self.engine, session)
            
            # 히스토리에서 제거
            history_record = session.query(MigrationHistory).filter(
                MigrationHistory.version == version
            ).first()
            if history_record:
                session.delete(history_record)
            
            session.commit()
            logger.info(f"✅ Migration {version} rolled back")
            return True
            
        except Exception as e:
            logger.error(f"❌ Rollback failed: {e}")
            session.rollback()
            return False
        finally:
            session.close()
    
    def show_migration_status(self):
        """마이그레이션 상태 출력"""
        executed_versions = set(self.get_executed_migrations())
        
        logger.info("=== Migration Status ===")
        for migration in self.migrations:
            status = "✅ EXECUTED" if migration.version in executed_versions else "⏳ PENDING"
            logger.info(f"{migration.version}: {status} - {migration.description}")


class Migration:
    """마이그레이션 베이스 클래스"""
    
    def __init__(self, version: str, description: str, execute_func: Callable = None, rollback_func: Callable = None):
        self.version = version
        self.description = description
        self._execute_func = execute_func
        self._rollback_func = rollback_func
    
    def execute(self, engine, session):
        """마이그레이션 실행"""
        if self._execute_func:
            self._execute_func(engine, session)
        else:
            raise NotImplementedError("Migration execute method not implemented")
    
    def rollback(self, engine, session):
        """마이그레이션 롤백"""
        if self._rollback_func:
            self._rollback_func(engine, session)
        else:
            raise NotImplementedError("Migration rollback method not implemented")


# 전역 마이그레이션 매니저 인스턴스
migration_manager = MigrationManager()


def migration(version: str, description: str):
    """마이그레이션 데코레이터"""
    def decorator(func):
        migration_obj = Migration(version, description, func)
        migration_manager.register_migration(migration_obj)
        return func
    return decorator


# 예시 마이그레이션들
@migration("001", "Initial database schema creation")
def create_initial_schema(engine, session):
    """초기 데이터베이스 스키마 생성"""
    from .database import Base
    Base.metadata.create_all(engine)


@migration("002", "Add indexes for performance optimization")
def add_performance_indexes(engine, session):
    """성능 최적화를 위한 인덱스 추가"""
    # 이미 모델에 정의되어 있음, 별도 작업 불필요
    pass


@migration("003", "Populate cohort baseline data")
def populate_cohort_data(engine, session):
    """코호트 기준 데이터 초기 로드"""
    from .init_db import load_cohort_baseline_data
    # 세션 기반이 아닌 별도 로직 사용
    load_cohort_baseline_data()


# 향후 마이그레이션 예시들
def add_player_statistics_table(engine, session):
    """플레이어 통계 테이블 추가 (예시)"""
    # 새로운 테이블 추가 시
    session.execute(text("""
        CREATE TABLE IF NOT EXISTS player_statistics (
            id SERIAL PRIMARY KEY,
            player_id INTEGER REFERENCES players(id),
            stat_date DATE,
            rating INTEGER,
            games_played INTEGER,
            win_rate FLOAT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """))


def add_analysis_tags_column(engine, session):
    """분석에 태그 컬럼 추가 (예시)"""
    session.execute(text("""
        ALTER TABLE analyses 
        ADD COLUMN IF NOT EXISTS tags TEXT[]
    """))


def create_user_feedback_table(engine, session):
    """사용자 피드백 테이블 생성 (예시)"""
    session.execute(text("""
        CREATE TABLE IF NOT EXISTS user_feedback (
            id SERIAL PRIMARY KEY,
            analysis_id VARCHAR(36) REFERENCES analyses(id),
            rating INTEGER CHECK (rating >= 1 AND rating <= 5),
            feedback_text TEXT,
            improvement_suggestions TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """))


# 마이그레이션 유틸리티 함수들
def run_migrations(dry_run: bool = False):
    """마이그레이션 실행 (편의 함수)"""
    return migration_manager.run_pending_migrations(dry_run=dry_run)


def show_migration_status():
    """마이그레이션 상태 출력 (편의 함수)"""
    migration_manager.show_migration_status()


def rollback_migration(version: str):
    """마이그레이션 롤백 (편의 함수)"""
    return migration_manager.rollback_migration(version)


if __name__ == "__main__":
    """스크립트 직접 실행 시"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Database migration utility")
    parser.add_argument("--status", action="store_true",
                       help="Show migration status")
    parser.add_argument("--run", action="store_true",
                       help="Run pending migrations")
    parser.add_argument("--dry-run", action="store_true",
                       help="Show what would be migrated")
    parser.add_argument("--rollback", metavar="VERSION",
                       help="Rollback specific migration")
    
    args = parser.parse_args()
    
    if args.status:
        show_migration_status()
    elif args.dry_run:
        run_migrations(dry_run=True)
    elif args.run:
        success = run_migrations(dry_run=False)
        exit(0 if success else 1)
    elif args.rollback:
        success = rollback_migration(args.rollback)
        exit(0 if success else 1)
    else:
        parser.print_help()