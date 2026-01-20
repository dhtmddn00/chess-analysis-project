"""
Worker 설정 관리 모듈
"""

import os
from typing import Optional


class Settings:
    """Worker 설정 클래스"""
    
    # 데이터베이스 설정
    DB_HOST: str = os.getenv('DB_HOST', 'localhost')
    DB_PORT: int = int(os.getenv('DB_PORT', '5432'))
    DB_NAME: str = os.getenv('DB_NAME', 'chess_analysis')
    DB_USER: str = os.getenv('DB_USER', 'chess_user')
    DB_PASSWORD: str = os.getenv('DB_PASSWORD', 'chess_password')
    
    # Redis 설정
    REDIS_HOST: str = os.getenv('REDIS_HOST', 'localhost')
    REDIS_PORT: int = int(os.getenv('REDIS_PORT', '6379'))
    
    # Stockfish 엔진 설정
    STOCKFISH_PATH: Optional[str] = os.getenv('STOCKFISH_PATH', '/usr/games/stockfish')
    STOCKFISH_DEPTH: int = int(os.getenv('STOCKFISH_DEPTH', '12'))
    STOCKFISH_THREADS: int = int(os.getenv('STOCKFISH_THREADS', '1'))
    STOCKFISH_MEMORY: int = int(os.getenv('STOCKFISH_MEMORY', '128'))
    
    # 분석 깊이 설정 (backend 호환성)
    stockfish_depth_quick: int = int(os.getenv('STOCKFISH_DEPTH_QUICK', '12'))
    stockfish_depth_deep: int = int(os.getenv('STOCKFISH_DEPTH_DEEP', '18'))
    stockfish_threads: int = int(os.getenv('STOCKFISH_THREADS', '1'))
    stockfish_memory: int = int(os.getenv('STOCKFISH_MEMORY', '128'))
    
    # 분석 임계값 설정
    blunder_threshold_cp: int = 300
    mistake_threshold_cp: int = 100
    inaccuracy_threshold_cp: int = 30
    
    # 게임 단계 구분 설정
    opening_max_ply: int = 20
    middlegame_max_ply: int = 40
    
    # Chess.com API 설정
    CHESSCOM_API_BASE_URL: str = "https://api.chess.com/pub"
    CHESSCOM_RATE_LIMIT: int = 100
    CHESSCOM_TIMEOUT: int = 30
    chesscom_api_base_url: str = "https://api.chess.com/pub"
    chesscom_rate_limit: int = 100
    chesscom_timeout: int = 30
    max_game_count: int = 50
    
    # 워커 설정
    WORKER_ID: str = os.getenv('WORKER_ID', '1')
    QUEUE_NAME: str = "chess-analysis-queue"
    
    # 로깅 설정
    LOG_LEVEL: str = os.getenv('LOG_LEVEL', 'INFO')


settings = Settings()


def get_stockfish_path() -> str:
    """
    Stockfish 엔진 경로를 자동 탐지하거나 설정에서 가져옵니다.
    
    Returns:
        str: Stockfish 바이너리 경로
        
    Raises:
        FileNotFoundError: Stockfish를 찾을 수 없는 경우
    """
    import os
    import shutil
    
    if settings.STOCKFISH_PATH and os.path.exists(settings.STOCKFISH_PATH):
        return settings.STOCKFISH_PATH
    
    # 일반적인 설치 경로들 확인
    common_paths = [
        "/usr/games/stockfish",  # Ubuntu/Debian 기본 경로
        "/usr/local/bin/stockfish",
        "/usr/bin/stockfish",
        "/opt/homebrew/bin/stockfish",
        "./engines/stockfish",
        "stockfish"  # PATH에 있는 경우
    ]
    
    for path in common_paths:
        if os.path.exists(path) or (path == "stockfish"):
            # PATH에서 stockfish 명령 확인
            if shutil.which(path):
                return path
    
    raise FileNotFoundError(
        "Stockfish 엔진을 찾을 수 없습니다. "
        "설치하거나 STOCKFISH_PATH 환경변수를 설정해주세요."
    )