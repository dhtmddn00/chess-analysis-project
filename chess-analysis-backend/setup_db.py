#!/usr/bin/env python3
"""
데이터베이스 설정 및 초기화 스크립트

이 스크립트는:
1. 데이터베이스 연결을 테스트합니다
2. 필요한 테이블들을 생성합니다
3. 코호트 기준 데이터를 로드합니다
4. 마이그레이션을 실행합니다
5. 기본적인 데이터베이스 상태를 확인합니다
"""

import sys
import os
from pathlib import Path

# 프로젝트 루트를 Python 경로에 추가
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

try:
    from app.config import settings
    from app.models.init_db import initialize_database, check_database_health
    from app.models.migrations import run_migrations, show_migration_status
    from app.models.db_utils import DatabaseStats, DBSession
    
    print("✅ Successfully imported all database modules")
except ImportError as e:
    print(f"❌ Failed to import modules: {e}")
    print("Make sure you're running this from the project root directory")
    sys.exit(1)


def test_database_connection():
    """데이터베이스 연결 테스트"""
    print("\n=== Testing Database Connection ===")
    try:
        from sqlalchemy import text
        with DBSession() as db:
            db.execute(text("SELECT 1"))
        print("✅ Database connection successful")
        return True
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        print(f"Database URL: {settings.database_url}")
        return False


def setup_database():
    """데이터베이스 완전 설정"""
    print("\n=== Database Setup ===")
    
    # 1. 연결 테스트
    if not test_database_connection():
        print("Please check your database configuration in app/config.py")
        return False
    
    # 2. 마이그레이션 상태 확인
    print("\n--- Migration Status ---")
    show_migration_status()
    
    # 3. 마이그레이션 실행
    print("\n--- Running Migrations ---")
    if not run_migrations():
        print("❌ Migration failed")
        return False
    
    # 4. 데이터베이스 초기화
    print("\n--- Database Initialization ---")
    if not initialize_database():
        print("❌ Database initialization failed")
        return False
    
    # 5. 최종 상태 확인
    print("\n--- Final Health Check ---")
    health_status = check_database_health()
    
    if health_status['database_connected'] and health_status['tables_exist']:
        print("✅ Database setup completed successfully!")
        return True
    else:
        print("❌ Database setup completed with issues")
        return False


def show_database_stats():
    """데이터베이스 통계 출력"""
    print("\n=== Database Statistics ===")
    try:
        with DBSession() as db:
            stats = DatabaseStats.get_system_stats(db)
            
            print(f"Players: {stats['total_players']}")
            print(f"Total Analyses: {stats['total_analyses']}")
            print(f"Completed Analyses: {stats['completed_analyses']}")
            print(f"Active Analyses: {stats['active_analyses']}")
            print(f"Total Games: {stats['total_games']}")
            print(f"Game Analyses: {stats['total_game_analyses']}")
            print(f"Cohort Buckets: {stats['cohort_buckets']}")
            
    except Exception as e:
        print(f"❌ Failed to get database stats: {e}")


def main():
    """메인 실행 함수"""
    print("Chess Analysis Service - Database Setup")
    print("=" * 50)
    
    # 설정 정보 출력
    print(f"Database URL: {settings.database_url}")
    print(f"Debug Mode: {settings.debug}")
    print(f"Environment: {os.getenv('ENVIRONMENT', 'development')}")
    
    # 데이터베이스 설정 실행
    success = setup_database()
    
    if success:
        # 통계 정보 출력
        show_database_stats()
        
        print("\n🎉 Database is ready!")
        print("\nYou can now:")
        print("- Start the API server: uvicorn app.main:app --reload")
        print("- Open the frontend: open frontend/templates/index.html")
        print("- Check migration status: python app/models/migrations.py --status")
        
        return 0
    else:
        print("\n💥 Database setup failed!")
        print("Please check the error messages above and fix any issues.")
        return 1


if __name__ == "__main__":
    sys.exit(main())