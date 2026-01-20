# Chess Analysis Backend

Stockfish 엔진을 활용한 고성능 체스 분석 API 서버

## 🚀 특징

- **Stockfish 엔진**: 세계 최고 수준의 체스 엔진을 활용한 정밀한 분석
- **Chess.com API 연동**: 실시간 게임 데이터 수집
- **12차원 스타일 분석**: 플레이어의 독특한 체스 스타일 프로파일링
- **비동기 처리**: FastAPI와 Redis를 활용한 고성능 비동기 분석
- **SQLite 데이터베이스**: 경량화된 데이터 저장소
- **실시간 진행률**: WebSocket을 통한 실시간 분석 상태 업데이트

## 🛠 기술 스택

- **Framework**: FastAPI 0.104.1
- **Language**: Python 3.11+
- **Database**: SQLite with SQLAlchemy ORM
- **Cache**: Redis (선택사항)
- **Chess Engine**: Stockfish
- **HTTP Client**: httpx (비동기)
- **Chess Library**: python-chess
- **Task Queue**: Background Tasks

## 📦 설치 및 실행

### 시스템 요구사항

```bash
# macOS (Homebrew)
brew install stockfish

# Ubuntu/Debian
sudo apt-get install stockfish

# 또는 직접 설치
# https://stockfishchess.org/download/
```

### Python 환경 설정

```bash
# Python 가상환경 생성
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 의존성 설치
pip install -r requirements.txt

# 데이터베이스 초기화
python setup_db.py

# 개발 서버 실행
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Docker 실행

```bash
# Docker Compose로 전체 서비스 실행
docker-compose up -d

# 개별 서비스 실행
docker build -t chess-analysis-backend .
docker run -p 8000:8000 chess-analysis-backend
```

## 🌐 환경 변수

`.env` 파일을 생성하고 다음 환경 변수를 설정하세요:

```env
# 데이터베이스
DATABASE_URL=sqlite:///./chess_analysis.db

# Redis (선택사항)
REDIS_URL=redis://localhost:6379

# Stockfish 엔진 경로
STOCKFISH_PATH=/opt/homebrew/bin/stockfish

# API 설정
DEBUG=False
API_VERSION=v1
```

## 📡 API 엔드포인트

### 분석 관련
- `POST /api/v1/analysis` - 새로운 분석 요청
- `GET /api/v1/analysis/{analysis_id}` - 분석 결과 조회
- `GET /api/v1/analysis/{analysis_id}/status` - 분석 상태 확인
- `GET /api/v1/analysis/stats` - 시스템 통계

### 헬스 체크
- `GET /health` - 기본 헬스 체크
- `GET /health/actuator/health` - 상세 헬스 체크 (Spring Boot 스타일)

### API 문서
- `GET /docs` - Swagger UI 문서
- `GET /redoc` - ReDoc 문서

## 🎯 핵심 기능

### 🔍 체스 게임 분석
- **게임 수집**: Chess.com API를 통한 자동 게임 데이터 수집
- **PGN 파싱**: 표준 PGN 형식 게임 데이터 파싱
- **Stockfish 분석**: 각 수에 대한 정밀한 엔진 분석
- **ACPL 계산**: Average Centipawn Loss 기반 성능 평가

### 📊 12차원 스타일 프로파일링
1. **공격성 (Aggression)**: 공격적 플레이 성향
2. **전술 의존도 (Tactical Dependency)**: 전술적 기회 활용 능력
3. **위험 감수 (Risk Taking)**: 위험한 수 선택 성향
4. **포지셔널 지향 (Positional Orientation)**: 포지션 우위 추구
5. **교환 선호도 (Exchange Preference)**: 말 교환 성향
6. **오프닝 다양성 (Opening Variety)**: 오프닝 레퍼토리 다양성
7. **정석 이탈 (Book Deviation)**: 이론에서 벗어나는 정도
8. **우위 전환 (Lead Conversion)**: 유리한 포지션 활용 능력
9. **엔드게임 기술 (Endgame Technique)**: 엔드게임 처리 능력
10. **시간 관리 (Time Management)**: 시간 사용 패턴
11. **일관성 (Consistency)**: 플레이 품질의 일관성
12. **역전 저항력 (Swindle Resistance)**: 불리한 상황 대처 능력

### 🎯 개선 계획 생성
- **약점 분석**: 스타일 프로파일 기반 개선점 도출
- **맞춤형 훈련**: 개인별 맞춤 훈련 계획 제공
- **코호트 비교**: 비슷한 레이팅 플레이어와의 비교 분석

## 📂 프로젝트 구조

```
app/
├── main.py                 # FastAPI 메인 애플리케이션
├── config.py              # 애플리케이션 설정
├── redis_client.py        # Redis 클라이언트
├── api/                   # API 라우터
│   ├── analysis.py        # 분석 관련 엔드포인트
│   └── health.py          # 헬스체크 엔드포인트
├── models/                # 데이터 모델
│   ├── database.py        # SQLAlchemy 모델
│   ├── schemas.py         # Pydantic 스키마
│   └── analysis_types.py  # 분석 관련 타입
├── services/              # 비즈니스 로직
│   ├── chess_api.py       # Chess.com API 클라이언트
│   ├── engine.py          # Stockfish 엔진 래퍼
│   ├── profiler.py        # 스타일 프로파일러
│   └── recommendations.py # 개선 계획 생성
└── utils/                 # 유틸리티
    ├── pgn_parser.py      # PGN 파싱 유틸리티
    └── cohort.py          # 코호트 비교 유틸리티
```

## 🔧 핵심 컴포넌트

### Chess API 클라이언트
```python
from app.services.chess_api import ChessAPIClient

client = ChessAPIClient()
games = await client.get_recent_games("username", 20)
```

### Stockfish 엔진
```python
from app.services.engine import StockfishEngine

engine = StockfishEngine()
analysis = await engine.analyze_game(pgn_data)
```

### 스타일 프로파일러
```python
from app.services.profiler import StyleProfiler

profiler = StyleProfiler()
profile = profiler.create_profile(games, analyses)
```

## 📊 데이터베이스 스키마

### 주요 테이블
- **analyses**: 분석 요청 및 상태
- **games**: 개별 게임 데이터
- **game_analyses**: 게임별 Stockfish 분석 결과
- **style_profiles**: 플레이어 스타일 프로파일
- **improvement_plans**: 개선 계획

## 🚀 성능 최적화

### 비동기 처리
- FastAPI의 비동기 기능 활용
- httpx를 통한 비동기 HTTP 요청
- 백그라운드 작업으로 분석 처리

### 캐싱
- Redis를 활용한 분석 결과 캐싱
- Chess.com API 응답 캐싱
- Stockfish 분석 결과 캐싱

### 데이터베이스 최적화
- 인덱스 최적화
- 배치 처리
- 연결 풀링

## 🧪 테스트

```bash
# 단위 테스트 실행
pytest tests/

# 커버리지 리포트
pytest --cov=app tests/

# 특정 테스트 실행
pytest tests/test_engine.py -v
```

## 📈 모니터링

### 로깅
- 구조화된 JSON 로깅
- 요청/응답 로깅
- 에러 추적

### 메트릭
- 분석 처리 시간
- API 응답 시간
- 에러율 추적

## 🔐 보안

- **입력 검증**: Pydantic을 통한 강력한 입력 검증
- **레이트 리미팅**: API 요청 제한
- **에러 핸들링**: 민감한 정보 노출 방지

## 🚀 배포

### 프로덕션 서버
```bash
# Gunicorn을 사용한 프로덕션 배포
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker

# 또는 uvicorn 직접 사용
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

### Docker 배포
```bash
docker-compose -f docker-compose.prod.yml up -d
```

## 🤝 기여

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 라이선스

MIT License

## 📞 지원

이슈나 질문이 있으시면 GitHub Issues를 통해 문의해주세요.

## 🙏 감사

- [Stockfish](https://stockfishchess.org/) - 강력한 오픈소스 체스 엔진
- [Chess.com](https://www.chess.com/) - 게임 데이터 API 제공
- [python-chess](https://github.com/niklasf/python-chess) - Python 체스 라이브러리