# 체스 분석 플랫폼 종합 기술 문서

## 📋 목차
1. [프로젝트 개요](#프로젝트-개요)
2. [시스템 아키텍처](#시스템-아키텍처)
3. [개발 환경 설정](#개발-환경-설정)
4. [마이크로서비스 상세 설명](#마이크로서비스-상세-설명)
5. [데이터베이스 설계](#데이터베이스-설계)
6. [API 문서](#api-문서)
7. [체스 분석 알고리즘](#체스-분석-알고리즘)
8. [배포 및 운영](#배포-및-운영)
9. [문제 해결 가이드](#문제-해결-가이드)
10. [확장성 고려사항](#확장성-고려사항)

---

## 🎯 프로젝트 개요

### 프로젝트 목적
본 프로젝트는 **체스 게임 분석 및 플레이어 스타일 프로파일링을 위한 종합 플랫폼**입니다. Chess.com API를 통해 게임 데이터를 수집하고, Stockfish 엔진을 활용한 정밀 분석을 제공합니다.

### 핵심 기능
- **게임 분석**: Stockfish 엔진을 통한 수준별 분석 (ACPL, 정확도, 실수 분류)
- **스타일 프로파일링**: 12차원 플레이어 스타일 분석 (공격성, 전술적 의존도, 엔드게임 테크닉 등)
- **전술 패턴 탐지**: 캡처, 체크, 무방비 공격 등 실용적 전술 기회 식별 및 통계 제공
- **코호트 비교**: 동일 레이팅 대역 플레이어와의 성능 비교
- **훈련 계획 생성**: 개인 맞춤형 체스 실력 향상 로드맵

### 기술 스택 요약
- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend API**: Java Spring Boot, PostgreSQL, Redis
- **Analysis Worker**: Python, Stockfish, asyncio, asyncpg
- **Infrastructure**: Docker, Docker Compose
- **External APIs**: Chess.com Public API

---

## 🏗️ 시스템 아키텍처

### 전체 구조도
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Next.js       │    │   Spring Boot   │    │   PostgreSQL    │
│   Frontend      │◄──►│   API Server    │◄──►│   Database      │
│   (Port 3000)   │    │   (Port 8080)   │    │   (Port 5432)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │     Redis       │    │   Python        │
                       │   Queue/Cache   │◄──►│   Workers       │
                       │   (Port 6379)   │    │   (Stockfish)   │
                       └─────────────────┘    └─────────────────┘
                                                       │
                                                       ▼
                                                ┌─────────────────┐
                                                │   Chess.com     │
                                                │   Public API    │
                                                └─────────────────┘
```

### 데이터 흐름
1. **사용자 요청**: 프론트엔드에서 분석 요청 전송
2. **작업 큐잉**: Spring Boot API가 Redis 큐에 작업 추가
3. **데이터 수집**: Python 워커가 Chess.com API에서 게임 데이터 수집
4. **게임 분석**: Stockfish 엔진으로 각 게임 수준별 분석
5. **스타일 프로파일링**: 다차원 플레이어 스타일 분석
6. **결과 저장**: 분석 결과를 PostgreSQL에 저장
7. **상태 업데이트**: Redis를 통한 실시간 진행 상황 업데이트
8. **결과 제공**: 프론트엔드에서 분석 결과 시각화

---

## ⚙️ 개발 환경 설정

### 필수 요구사항
- **Docker**: 20.10.0 이상
- **Docker Compose**: 2.0.0 이상
- **Java**: 17 이상 (개발 시)
- **Node.js**: 18.0.0 이상 (개발 시)
- **Python**: 3.11 이상 (개발 시)

### 전체 시스템 실행
```bash
# 저장소 클론
git clone <repository-url>
cd chess-analysis-repos

# 전체 서비스 실행
docker-compose up -d

# 로그 확인
docker-compose logs -f

# 서비스 중지
docker-compose down
```

### 서비스별 개발 모드

#### 1. 프론트엔드 (Next.js)
```bash
cd chess-analysis-frontend
npm install
npm run dev  # http://localhost:3000
```

#### 2. API 서버 (Spring Boot)
```bash
cd chess-analysis-api
./gradlew bootRun  # http://localhost:8080
```

#### 3. Python 워커
```bash
cd chess-analysis-worker
pip install -r requirements.txt
python -m src.worker.main
```

### 환경 변수 설정

#### Docker Compose 환경변수
```yaml
# PostgreSQL
POSTGRES_DB: chess_analysis
POSTGRES_USER: chess_user
POSTGRES_PASSWORD: local-dev-only

# Redis
REDIS_HOST: redis
REDIS_PORT: 6379

# Spring Boot
SPRING_PROFILES_ACTIVE: docker
SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/chess_analysis

# Python Worker
STOCKFISH_PATH: /usr/bin/stockfish
WORKER_ID: 1
```

---

## 🔧 마이크로서비스 상세 설명

### 1. Frontend Service (Next.js)

#### 주요 컴포넌트
- **AnalysisRequest**: 분석 요청 폼
- **ProgressTracker**: 실시간 분석 진행 상황
- **ResultsDashboard**: 분석 결과 시각화
- **StyleProfile**: 12차원 스타일 프로필 차트

#### 특징
- **Apple-inspired 디자인**: 깔끔하고 직관적인 UI/UX
- **실시간 업데이트**: Server-Sent Events를 통한 진행 상황 추적
- **반응형 디자인**: 모바일/태블릿/데스크톱 최적화
- **다국어 지원**: 한국어/영어 지원

### 2. API Service (Spring Boot)

#### 핵심 컨트롤러
```java
@RestController
@RequestMapping("/api/v1")
public class AnalysisController {
    
    @PostMapping("/analysis")
    public ResponseEntity<AnalysisResponseDto> createAnalysis(
        @RequestBody @Valid AnalysisRequestDto request
    ) {
        // 분석 요청 처리 및 큐잉
    }
    
    @GetMapping("/analysis/{id}")
    public ResponseEntity<AnalysisResponseDto> getAnalysis(
        @PathVariable String id
    ) {
        // 분석 상태 및 결과 조회
    }
}
```

#### 주요 서비스
- **AnalysisService**: 분석 요청 관리, 상태 추적 및 전술 데이터 JSON 파싱
- **QueueService**: Redis 큐를 통한 작업 관리
- **ResultService**: 분석 결과 조회, 캐싱 및 전술 통계 제공

#### 데이터베이스 연동
- **JPA/Hibernate**: ORM을 통한 데이터 관리
- **Connection Pooling**: HikariCP를 통한 연결 최적화
- **Transaction Management**: @Transactional을 통한 트랜잭션 관리

### 3. Analysis Worker (Python)

#### 워커 아키텍처
```python
class ChessAnalysisWorker:
    def __init__(self):
        self.redis_client = redis.Redis()
        self.db_pool = asyncpg.create_pool()
        self.stockfish = chess.engine.SimpleEngine()
    
    async def process_analysis_job(self, job):
        # 1. 게임 데이터 수집
        games = await self.collect_games(job['username'])
        
        # 2. 게임 분석
        analyses = await self.analyze_games(games)
        
        # 3. 스타일 프로파일링
        profile = await self.generate_style_profile(analyses)
        
        # 4. 결과 저장
        await self.store_results(job['analysisId'], profile)
```

#### 주요 모듈

##### 게임 수집기 (`chess_api.py`)
- Chess.com Public API 연동
- 게임 메타데이터 수집
- PGN 형식 데이터 파싱
- 레이트 리미팅 처리

##### 분석 엔진 (`engine.py`)
- Stockfish 엔진 연동 및 관리
- 수준별 게임 분석 (각 수마다 평가값 계산)
- ACPL (Average Centipawn Loss) 계산
- 수의 품질 분류 (Best/Good/Inaccuracy/Mistake/Blunder)

##### 전술 탐지기 (`simple_tactical_detector.py`)
- **실용적 전술 패턴 탐지**: 캡처, 체크, 무방비 공격, 포크, 핀 등
- **성능 최적화**: 중요한 수(손실 30cp 이상, 캡처, 체크)에서만 분석 실행
- **가치 평가**: 각 전술 기회의 센티폰 가치와 난이도 계산
- **JSON 기반 통계**: 패턴별 발견 횟수, 정확도, 평균 가치 등 상세 통계 제공

##### 스타일 프로파일러 (`profiler.py`)
- 12차원 스타일 분석
  - 공격성 (Aggression)
  - 전술적 의존도 (Tactical Dependency)
  - 포지셔널 플레이 (Positional Play)
  - 엔드게임 테크닉 (Endgame Technique)
  - 시간 관리 (Time Management)
  - 오프닝 다양성 (Opening Variety)
  - 리스크 관용도 (Risk Tolerance)
  - 교환 선호도 (Exchange Preference)
  - 리드 전환 능력 (Lead Conversion)
  - 일관성 (Consistency)
  - 스윈들 저항력 (Swindle Resistance)
  - 기물 활동성 선호 (Piece Activity Preference)

---

## 🗃️ 데이터베이스 설계

### 핵심 테이블 구조

#### 1. 분석 관리 테이블
```sql
-- 분석 작업 메인 테이블
CREATE TABLE analyses (
    id UUID PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    platform VARCHAR(20) NOT NULL,
    game_count INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL,  -- PENDING, COLLECTING, ANALYZING, COMPLETED, FAILED
    progress INTEGER DEFAULT 0,
    current_step VARCHAR(100),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 2. 워커용 게임 데이터 테이블
```sql
-- 게임 원본 데이터 (워커용)
CREATE TABLE games_worker (
    id SERIAL PRIMARY KEY,
    analysis_id UUID REFERENCES analyses(id),
    game_index INTEGER NOT NULL,
    pgn TEXT NOT NULL,
    white_player VARCHAR(50),
    black_player VARCHAR(50),
    result VARCHAR(10),
    time_control VARCHAR(20),
    date_played VARCHAR(50),
    opening VARCHAR(100),
    termination VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(analysis_id, game_index)
);
```

#### 3. 스타일 프로파일 테이블
```sql
-- 플레이어 스타일 분석 결과 (워커용)
CREATE TABLE style_profiles_worker (
    id SERIAL PRIMARY KEY,
    analysis_id UUID REFERENCES analyses(id),
    playing_style VARCHAR(100),
    strengths TEXT[],
    weaknesses TEXT[],
    opening_repertoire JSONB,
    
    -- 12차원 스타일 점수
    aggression_rating DECIMAL(5,2),
    tactical_rating DECIMAL(5,2),
    positional_rating DECIMAL(5,2),
    endgame_rating INTEGER,
    time_management_rating INTEGER,
    opening_variety DECIMAL(5,2),
    risk_tolerance DECIMAL(5,2),
    exchange_preference DECIMAL(5,2),
    lead_conversion DECIMAL(5,2),
    consistency DECIMAL(5,2),
    swindle_resistance DECIMAL(5,2),
    piece_activity_preference DECIMAL(5,2),
    
    -- 기타 통계
    blunder_tendency DECIMAL(5,2),
    tactical_stats JSONB,
    summary_data JSONB,
    metadata JSONB,
    
    created_at TIMESTAMP DEFAULT NOW()
);
```

#### 4. 인덱스 설정
```sql
-- 성능 최적화를 위한 인덱스
CREATE INDEX idx_analyses_username ON analyses(username);
CREATE INDEX idx_analyses_status ON analyses(status);
CREATE INDEX idx_analyses_created_at ON analyses(created_at);
CREATE INDEX idx_games_worker_analysis_id ON games_worker(analysis_id);
CREATE INDEX idx_style_profiles_analysis_id ON style_profiles_worker(analysis_id);
```

### 데이터 저장 목적 및 활용

#### 1. 캐싱 효과
- 동일 사용자의 재분석 시 기존 데이터 재사용
- Chess.com API 호출 빈도 감소
- 분석 시간 단축

#### 2. 분석 기록 보존
- 플레이어의 시간별 실력 변화 추적
- 과거 분석 결과와 현재 비교
- 장기간 개선 사항 모니터링

#### 3. 통계 분석 기반
- 코호트 분석을 위한 다량의 플레이어 데이터 확보
- 레이팅별, 시간 제어별 통계 생성
- 메타 게임 트렌드 분석

#### 4. 개인화 서비스
- 개인별 훈련 계획 생성 기반 데이터
- 약점 패턴 식별 및 개선 방안 제시
- 맞춤형 오프닝 레퍼토리 추천

---

## 📡 API 문서

### 1. 분석 요청 API

#### POST `/api/v1/analysis`
```json
// Request
{
    "username": "oswooooo",
    "platform": "chess.com",
    "gameCount": 5
}

// Response
{
    "id": "8f0c34e6-919f-4a11-b7ed-f6a10aa3f888",
    "username": "oswooooo",
    "platform": "chess.com",
    "gameCount": 5,
    "status": "PENDING",
    "progress": 0,
    "currentStep": "Queued for processing",
    "errorMessage": null,
    "reportUrl": null,
    "shortLink": "http://localhost:8080/s/DsXK72L9",
    "createdAt": "2025-08-24T15:32:37.753518627",
    "updatedAt": "2025-08-24T15:32:37.753518627"
}
```

#### 검증 규칙
- `username`: 필수, 1-50자
- `platform`: 필수, "chess.com" 값만 허용
- `gameCount`: 필수, 5-50 범위

### 2. 분석 상태 조회 API

#### GET `/api/v1/analysis/{id}`
```json
// Response - 진행 중
{
    "id": "8f0c34e6-919f-4a11-b7ed-f6a10aa3f888",
    "status": "ANALYZING",
    "progress": 60,
    "currentStep": "Analyzing game 3 of 5",
    "errorMessage": null
}

// Response - 완료
{
    "id": "8f0c34e6-919f-4a11-b7ed-f6a10aa3f888",
    "status": "COMPLETED",
    "progress": 100,
    "currentStep": "Analysis completed successfully",
    "reportUrl": "/api/v1/analysis/8f0c34e6-919f-4a11-b7ed-f6a10aa3f888/report"
}
```

### 3. 에러 응답 형식
```json
{
    "timestamp": "2025-08-24T15:32:26.765+00:00",
    "status": 400,
    "error": "Bad Request",
    "message": "Minimum 5 games required",
    "path": "/api/v1/analysis"
}
```

---

## 🧠 체스 분석 알고리즘

> 자세한 체스 분석 알고리즘은 별도 문서 [CHESS_ANALYSIS_LOGIC.md](CHESS_ANALYSIS_LOGIC.md)에서 확인할 수 있습니다.

### 분석 파이프라인 개요

#### 1단계: 게임 데이터 수집
- Chess.com Public API 호출
- PGN 형식 데이터 파싱
- 게임 메타데이터 추출

#### 2단계: Stockfish 엔진 분석
- 각 수마다 포지션 평가
- 최선수 계산 및 비교
- 센티폰 손실(Centipawn Loss) 계산

#### 3단계: 수의 품질 분류
- **Best Move**: 손실 5cp 이하
- **Good Move**: 손실 6-15cp
- **Inaccuracy**: 손실 16-50cp
- **Mistake**: 손실 51-100cp
- **Blunder**: 손실 100cp 초과

#### 4단계: 전술 패턴 탐지
- 포크, 핀, 캡처 기회 식별
- 무방비 기물 공격 탐지
- 전술 기회의 가치 평가

#### 5단계: 스타일 프로파일 생성
- 12차원 플레이어 특성 분석
- 강점/약점 식별
- 개선 방안 제시

---

## 🚀 배포 및 운영

### Docker Compose 프로덕션 설정

#### docker-compose.prod.yml
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: chess_analysis
      POSTGRES_USER: chess_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    restart: unless-stopped

  chess-api:
    image: chess-api:latest
    environment:
      - SPRING_PROFILES_ACTIVE=prod
      - SPRING_DATASOURCE_PASSWORD=${DB_PASSWORD}
      - SPRING_DATA_REDIS_PASSWORD=${REDIS_PASSWORD}
    restart: unless-stopped

  chess-workers:
    image: chess-worker:latest
    deploy:
      replicas: 3
    environment:
      - REDIS_PASSWORD=${REDIS_PASSWORD}
      - DB_PASSWORD=${DB_PASSWORD}
    restart: unless-stopped

  chess-frontend:
    image: chess-frontend:latest
    environment:
      - NEXT_PUBLIC_API_URL=${API_URL}
    restart: unless-stopped
```

### 모니터링 설정

#### 헬스체크 구성
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8080/actuator/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

#### 로그 수집
```bash
# 전체 서비스 로그
docker-compose logs -f

# 특정 서비스 로그
docker-compose logs -f chess-api
docker-compose logs -f chess-worker-1
```

---

## 🔧 문제 해결 가이드

### 일반적인 문제들

#### 1. 분석이 80%에서 실패하는 경우
**원인**: GameAnalysis 객체의 iterable 오류
```python
# 문제 코드
if 'moves' in analysis:  # GameAnalysis는 딕셔너리가 아님

# 해결 방법
if hasattr(analysis, 'move_analyses') and analysis.move_analyses:
```

#### 2. 전술 패턴 분석에서 0개가 나오는 경우
**원인**: API와 워커 간 데이터 저장소 불일치
- **문제**: API가 `tactical_opportunities` 테이블을 조회하지만, 워커는 `style_profiles_worker.tactical_stats`에 JSON으로 저장
- **해결**: API 서비스에서 JSON 파싱 로직 추가
```java
// Java API 서비스 - JSON 파싱 로직
if (tacticalStatsJson.contains("\"patterns_found\":")) {
    String patternsSection = tacticalStatsJson.split("\"patterns_found\":\\s*\\{")[1].split("\\}")[0];
    String[] patterns = patternsSection.split(",");
    
    for (String patternData : patterns) {
        String[] parts = patternData.split(":");
        if (parts.length == 2) {
            String patternName = parts[0].trim().replaceAll("\"", "");
            int count = Integer.parseInt(parts[1].trim());
            // 전술 패턴 데이터 처리
        }
    }
}
```

#### 3. chess 모듈 속성 오류
**원인**: chess 모듈의 RANK_1 등 속성 사용 불가
```python
# 문제 코드
for direction in [chess.RANK_1, chess.RANK_8]:

# 해결 방법
directions = [(0, 1), (0, -1), (1, 0), (-1, 0)]  # 상하좌우
```

#### 4. 데이터베이스 중복 키 오류
**원인**: 동일한 analysis_id와 game_index 조합 중복
```sql
-- 해결 방법: ON CONFLICT 절 추가
INSERT INTO games_worker (...) VALUES (...)
ON CONFLICT (analysis_id, game_index) DO NOTHING;
```

#### 5. Chess.com API 레이트 리미팅
**원인**: API 호출 빈도가 너무 높음
```python
# 해결 방법: 요청 간 지연 추가
import asyncio
await asyncio.sleep(0.5)  # 500ms 지연
```

### 디버깅 방법

#### 로그 레벨 조정
```yaml
# docker-compose.yml
environment:
  - LOGGING_LEVEL_ROOT=DEBUG
  - LOGGING_LEVEL_COM_CHESSANALYSIS=TRACE
```

#### 데이터베이스 직접 조회
```bash
# 분석 상태 확인
docker exec chess-postgres psql -U chess_user -d chess_analysis -c \
  "SELECT id, status, progress, error_message FROM analyses ORDER BY created_at DESC LIMIT 5;"

# 워커 테이블 데이터 확인
docker exec chess-postgres psql -U chess_user -d chess_analysis -c \
  "SELECT COUNT(*) FROM games_worker WHERE analysis_id='your-analysis-id';"
```

---

## 📈 확장성 고려사항

### 수평 확장

#### 워커 스케일링
```yaml
# docker-compose.yml
chess-worker:
  deploy:
    replicas: 5  # 워커 수 증가
  environment:
    - WORKER_ID=${HOSTNAME}  # 고유 ID 설정
```

#### 데이터베이스 샤딩
```python
# 사용자별 데이터 분산
def get_shard_db(username: str) -> str:
    shard_id = hash(username) % 4
    return f"chess_analysis_shard_{shard_id}"
```

### 캐싱 전략

#### Redis 캐시 계층화
```python
# L1: 분석 결과 캐시 (TTL: 1시간)
# L2: 게임 데이터 캐시 (TTL: 24시간)  
# L3: 플레이어 메타데이터 캐시 (TTL: 7일)

class CacheManager:
    def get_analysis_result(self, analysis_id: str):
        # L1 캐시 먼저 확인
        result = redis.get(f"analysis:{analysis_id}")
        if result:
            return json.loads(result)
        
        # DB에서 조회 후 캐시 저장
        result = db.get_analysis(analysis_id)
        redis.setex(f"analysis:{analysis_id}", 3600, json.dumps(result))
        return result
```

### 성능 최적화

#### 비동기 처리 최적화
```python
# 게임 분석 병렬 처리
async def analyze_games_parallel(games: List[ParsedGame]) -> List[GameAnalysis]:
    semaphore = asyncio.Semaphore(3)  # 동시 실행 제한
    
    async def analyze_single_game(game):
        async with semaphore:
            return await self.stockfish_engine.analyze_game(game)
    
    tasks = [analyze_single_game(game) for game in games]
    return await asyncio.gather(*tasks)
```

#### 데이터베이스 최적화
```sql
-- 파티셔닝으로 성능 개선
CREATE TABLE analyses_2024 PARTITION OF analyses
FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

-- 인덱스 최적화
CREATE INDEX CONCURRENTLY idx_analyses_status_created 
ON analyses(status, created_at) WHERE status IN ('PENDING', 'ANALYZING');
```

---

## 📝 개발 가이드라인

### 코드 스타일

#### Python (PEP 8 기반)
```python
# 함수명: snake_case
def analyze_chess_game(pgn_data: str) -> GameAnalysis:
    pass

# 클래스명: PascalCase  
class ChessAnalysisEngine:
    pass

# 상수: UPPER_SNAKE_CASE
MAX_ANALYSIS_TIME = 300
```

#### Java (Google Style 기반)
```java
// 클래스명: PascalCase
public class AnalysisService {
    // 메서드명: camelCase
    public AnalysisResponseDto createAnalysis(AnalysisRequestDto request) {
        return null;
    }
}
```

### 테스트 전략

#### 단위 테스트
```python
# Python - pytest
def test_stockfish_analysis():
    engine = StockfishEngine()
    pgn = "1. e4 e5 2. Nf3 Nc6"
    result = engine.analyze_game(pgn)
    
    assert result.white_acpl > 0
    assert len(result.move_analyses) == 4
```

```java
// Java - JUnit 5
@Test
void createAnalysis_ValidRequest_ReturnsAnalysisDto() {
    // Given
    AnalysisRequestDto request = new AnalysisRequestDto("oswooooo", "chess.com", 5);
    
    // When
    AnalysisResponseDto response = analysisService.createAnalysis(request);
    
    // Then
    assertThat(response.getStatus()).isEqualTo(AnalysisStatus.PENDING);
}
```

---

## 🔗 관련 문서

- [체스 분석 로직 상세 가이드](CHESS_ANALYSIS_LOGIC.md)
- [API 명세서](API_SPECIFICATION.md)
- [데이터베이스 스키마](DATABASE_SCHEMA.md)
- [배포 가이드](DEPLOYMENT_GUIDE.md)

---

## 📞 지원 및 문의

### 이슈 리포팅
버그 발견이나 기능 요청 시 GitHub Issues를 통해 보고해 주세요.

### 기여 가이드라인
1. Fork 저장소
2. 기능 브랜치 생성 (`feature/new-feature`)
3. 코드 변경 및 테스트
4. Pull Request 생성

---

*본 문서는 체스 분석 플랫폼의 종합적인 기술 가이드입니다. 추가 질문이나 개선 사항이 있으시면 언제든지 연락해 주세요.*