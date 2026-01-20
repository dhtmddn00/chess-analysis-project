# Chess Analysis Worker Dockerfile
FROM python:3.11-slim

# 시스템 패키지 설치
RUN apt-get update && apt-get install -y \
    curl \
    stockfish \
    && rm -rf /var/lib/apt/lists/*

# 작업 디렉토리 설정
WORKDIR /app

# Python 의존성 파일 복사
COPY requirements.txt .

# Python 의존성 설치
RUN pip install --no-cache-dir -r requirements.txt

# 애플리케이션 소스 복사
COPY src/ ./src/
COPY config/ ./config/

# 환경 변수 설정
ENV PYTHONPATH=/app/src
ENV STOCKFISH_PATH=/usr/games/stockfish

# 헬스체크 설정 (Redis 연결 확인)
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import redis; r=redis.Redis(host='${REDIS_HOST:-redis}', port=int('${REDIS_PORT:-6379}')); r.ping()" || exit 1

# 워커 실행
CMD ["python", "-m", "worker.main"]