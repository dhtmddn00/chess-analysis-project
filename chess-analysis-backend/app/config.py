"""
애플리케이션 설정 관리 모듈

환경변수와 기본값을 통해 애플리케이션 설정을 관리합니다.
"""

import os
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """애플리케이션 설정 클래스"""
    
    # API 설정
    api_title: str = "Chess Analysis Service"
    api_version: str = "1.0.0"
    api_description: str = "체스 기보 분석 및 플레이어 프로파일링 서비스"
    
    # 서버 설정
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    
    # 데이터베이스 설정
    database_url: str = "sqlite:///./chess_analysis.db"
    database_echo: bool = False
    
    # Chess.com API 설정
    chesscom_api_base_url: str = "https://api.chess.com/pub"
    chesscom_rate_limit: int = 100  # requests per minute
    chesscom_timeout: int = 30  # seconds
    
    # Lichess API 설정 (향후 확장용)
    lichess_api_base_url: str = "https://lichess.org/api"
    lichess_rate_limit: int = 300
    lichess_timeout: int = 30
    
    # Stockfish 엔진 설정
    stockfish_path: Optional[str] = None  # None이면 자동 탐지
    stockfish_depth_quick: int = 12  # 빠른 분석용
    stockfish_depth_deep: int = 18   # 정밀 분석용
    stockfish_threads: int = 1
    stockfish_memory: int = 128  # MB
    
    # 분석 설정
    default_game_count: int = 10
    max_game_count: int = 50
    analysis_timeout: int = 300  # seconds per game
    
    # 캐시 설정
    cache_enabled: bool = True
    cache_ttl: int = 3600  # seconds (1 hour)
    
    # 로깅 설정
    log_level: str = "INFO"
    log_format: str = "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>"
    
    # 보안 설정
    secret_key: str = "your-secret-key-change-in-production"
    access_token_expire_minutes: int = 30
    
    # 코호트 분석 설정
    cohort_rating_tolerance: int = 100  # ±100 rating points
    cohort_min_sample_size: int = 100   # 최소 표본 크기
    
    # 플레이스타일 분석 설정
    style_dimensions: int = 12
    blunder_threshold_cp: int = 300
    mistake_threshold_cp: int = 100
    inaccuracy_threshold_cp: int = 30
    
    # 게임 페이즈 구분 설정
    opening_max_ply: int = 20
    middlegame_max_ply: int = 40
    
    # 파일 경로 설정
    data_dir: str = "./data"
    engines_dir: str = "./engines"
    temp_dir: str = "./temp"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# 전역 설정 인스턴스
settings = Settings()


def get_stockfish_path() -> str:
    """
    Stockfish 엔진 경로를 자동 탐지하거나 설정에서 가져옵니다.
    
    Returns:
        str: Stockfish 바이너리 경로
        
    Raises:
        FileNotFoundError: Stockfish를 찾을 수 없는 경우
    """
    if settings.stockfish_path and os.path.exists(settings.stockfish_path):
        return settings.stockfish_path
    
    # 일반적인 설치 경로들 확인
    common_paths = [
        "/usr/local/bin/stockfish",
        "/usr/bin/stockfish",
        "/opt/homebrew/bin/stockfish",
        "./engines/stockfish",
        "stockfish"  # PATH에 있는 경우
    ]
    
    for path in common_paths:
        if os.path.exists(path) or (path == "stockfish"):
            # PATH에서 stockfish 명령 확인
            import shutil
            if shutil.which(path):
                return path
    
    raise FileNotFoundError(
        "Stockfish 엔진을 찾을 수 없습니다. "
        "설치하거나 STOCKFISH_PATH 환경변수를 설정해주세요."
    )


def create_directories():
    """필요한 디렉토리들을 생성합니다."""
    directories = [
        settings.data_dir,
        settings.engines_dir,
        settings.temp_dir
    ]
    
    for directory in directories:
        os.makedirs(directory, exist_ok=True)


# 애플리케이션 시작 시 디렉토리 생성
create_directories()