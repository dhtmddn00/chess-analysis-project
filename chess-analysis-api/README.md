# Chess Analysis API Server

Spring Boot 기반 REST API 서버 - 체스 분석 플랫폼의 핵심 백엔드

## 🏗️ 아키텍처 역할

```
[Next.js] ──────► [Spring Boot API] ─────► [Redis Queue]
                        │                        │
                        ├─► [PostgreSQL]         │
                        ├─► [S3 Storage]         ▼
                        └─► [PDF Generator]  [Python Worker]
```

## 🚀 주요 기능

### 📡 **REST API 제공**
- 분석 요청 수신 및 관리
- 사용자 인증 및 권한 관리
- 실시간 분석 상태 추적
- 분석 결과 조회 및 관리

### 🗃️ **데이터 관리**
- PostgreSQL을 통한 구조화된 데이터 저장
- 분석 요청, 게임 데이터, 결과 관리
- 사용자별 분석 히스토리

### ⚡ **큐 시스템 관리**
- Redis를 활용한 분석 작업 큐 관리
- Python Worker와의 비동기 통신
- 실시간 진행률 추적

### 🔗 **외부 서비스 연동**
- Chess.com API를 통한 게임 데이터 수집
- AWS S3 파일 업로드 및 관리
- PDF 리포트 생성 및 배포

### 🎯 **Short-link 서비스**
- 분석 결과 공유를 위한 단축 링크 생성
- 소셜 미디어 친화적 URL 제공

## 🛠 기술 스택

- **Framework**: Spring Boot 3.2.0
- **Language**: Java 21
- **Database**: PostgreSQL 16
- **Cache/Queue**: Redis 7
- **Storage**: AWS S3
- **Build Tool**: Maven

## 📦 주요 의존성

```xml
<dependencies>
    <!-- Spring Boot Starters -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-redis</artifactId>
    </dependency>
    
    <!-- Database -->
    <dependency>
        <groupId>org.postgresql</groupId>
        <artifactId>postgresql</artifactId>
    </dependency>
    
    <!-- AWS SDK -->
    <dependency>
        <groupId>software.amazon.awssdk</groupId>
        <artifactId>s3</artifactId>
    </dependency>
</dependencies>
```

## 🗄️ 데이터베이스 스키마

### 주요 테이블

#### `analyses` - 분석 요청
```sql
CREATE TABLE analyses (
    id UUID PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    platform VARCHAR(20) NOT NULL,
    game_count INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL,
    progress INTEGER DEFAULT 0,
    current_step TEXT,
    error_message TEXT,
    report_url TEXT,
    short_link TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### `games` - 게임 데이터
```sql
CREATE TABLE games (
    id BIGSERIAL PRIMARY KEY,
    game_id VARCHAR(100) UNIQUE NOT NULL,
    analysis_id UUID REFERENCES analyses(id),
    white_player VARCHAR(50) NOT NULL,
    black_player VARCHAR(50) NOT NULL,
    result VARCHAR(10),
    time_control VARCHAR(20),
    pgn TEXT,
    played_at TIMESTAMP,
    player_color VARCHAR(5),
    player_rating INTEGER,
    opponent_rating INTEGER,
    analysis_status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT NOW()
);
```

#### `style_profiles` - 스타일 프로파일
```sql
CREATE TABLE style_profiles (
    id BIGSERIAL PRIMARY KEY,
    analysis_id UUID REFERENCES analyses(id),
    aggression DOUBLE PRECISION,
    tactical_dependency DOUBLE PRECISION,
    risk_taking DOUBLE PRECISION,
    positional_orientation DOUBLE PRECISION,
    exchange_preference DOUBLE PRECISION,
    opening_variety DOUBLE PRECISION,
    book_deviation DOUBLE PRECISION,
    lead_conversion DOUBLE PRECISION,
    endgame_technique DOUBLE PRECISION,
    time_management DOUBLE PRECISION,
    consistency DOUBLE PRECISION,
    swindle_resistance DOUBLE PRECISION,
    overall_strength DOUBLE PRECISION,
    style_category VARCHAR(50),
    insights_json JSONB,
    recommendations_json JSONB
);
```

## 🔌 API 엔드포인트

### 분석 관리
```
POST   /api/v1/analysis          # 분석 요청 생성
GET    /api/v1/analysis/{id}     # 분석 결과 조회
GET    /api/v1/analysis/{id}/status # 분석 상태 확인
GET    /api/v1/analysis/user/{username} # 사용자별 분석 조회
GET    /api/v1/analysis/stats    # 시스템 통계
```

### Short-link
```
GET    /api/v1/s/{code}         # Short-link 리다이렉트
```

### 시스템
```
GET    /api/v1/health           # 기본 헬스체크
GET    /api/v1/health/actuator/health # 상세 헬스체크
```

## 🚀 실행 방법

### 로컬 개발 환경

1. **사전 요구사항**
```bash
# Java 21 설치
java -version

# Maven 설치
mvn -version

# PostgreSQL 실행
docker run -d --name postgres \
  -e POSTGRES_DB=chess_analysis \
  -e POSTGRES_USER=chess_user \
  -e POSTGRES_PASSWORD=local-dev-only \
  -p 5432:5432 postgres:16-alpine

# Redis 실행
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

2. **애플리케이션 실행**
```bash
# 의존성 설치
mvn clean install

# 애플리케이션 실행
mvn spring-boot:run

# 또는 JAR 파일로 실행
java -jar target/chess-analysis-api-1.0.0.jar
```

### Docker 실행

```bash
# Docker 이미지 빌드
docker build -t chess-analysis-api .

# 컨테이너 실행
docker run -p 8080:8080 \
  -e SPRING_DATASOURCE_URL=jdbc:postgresql://host.docker.internal:5432/chess_analysis \
  -e SPRING_DATA_REDIS_HOST=host.docker.internal \
  chess-analysis-api
```

### Docker Compose (전체 시스템)

```bash
# 전체 시스템 실행
docker-compose up -d

# 로그 확인
docker-compose logs -f chess-api

# 서비스 중지
docker-compose down
```

## 🌐 환경 설정

### application.yml

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/chess_analysis
    username: chess_user
    password: local-dev-only
    
  data:
    redis:
      host: localhost
      port: 6379
      
chess-analysis:
  aws:
    s3:
      bucket-name: chess-analysis-reports
      region: us-east-1
      
  shortlink:
    base-url: http://localhost:8080/api/v1/s
    expiry-days: 30
```

### 환경 변수

```bash
# Database
DB_USERNAME=chess_user
DB_PASSWORD=local-dev-only

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# AWS
AWS_S3_BUCKET=chess-analysis-reports
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# Short-link
SHORTLINK_BASE_URL=http://localhost:8080/api/v1/s
```

## 📊 모니터링

### Actuator 엔드포인트

```
GET /api/v1/health/actuator/health    # 상세 헬스체크
GET /api/v1/health/actuator/metrics   # 메트릭
GET /api/v1/health/actuator/info      # 애플리케이션 정보
```

### 로그 설정

```yaml
logging:
  level:
    com.chessanalysis: DEBUG
  file:
    name: logs/chess-analysis-api.log
```

## 🧪 테스트

```bash
# 단위 테스트 실행
mvn test

# 통합 테스트 실행
mvn verify

# 특정 테스트 클래스 실행
mvn test -Dtest=AnalysisControllerTest
```

## 🚀 빌드 및 배포

```bash
# 프로덕션 빌드
mvn clean package -Pprod

# Docker 이미지 빌드
docker build -t your-registry/chess-analysis-api:latest .

# 이미지 푸시
docker push your-registry/chess-analysis-api:latest
```

## 🤝 개발 가이드

### 코드 스타일
- Google Java Style Guide 준수
- Lombok 적극 활용
- 철저한 예외 처리

### 커밋 메시지 컨벤션
```
feat: 새로운 기능 추가
fix: 버그 수정
docs: 문서 수정
style: 코드 스타일 변경
refactor: 코드 리팩토링
test: 테스트 추가/수정
chore: 빌드 프로세스 또는 보조 도구 수정
```

## 📄 라이선스

MIT License

---

**🤖 Generated with Claude Code**  
**Co-Authored-By: Claude <noreply@anthropic.com>**