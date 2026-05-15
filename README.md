# Chess Analysis Project

Chess.com 게임을 수집하고 Stockfish 기반 분석을 실행해 플레이어의 성과 지표, 오프닝 레퍼토리, 12차원 플레이 스타일 프로필을 보여주는 체스 분석 서비스입니다.

현재 프로젝트는 Next.js 프론트엔드, Spring Boot API, Python Stockfish worker, PostgreSQL, Redis queue를 하나의 레포지토리에서 관리합니다.

## Current Status

- Chess.com 사용자명 기반 분석 지원
- Lichess 분석은 현재 비활성화 상태
- `/api/v1/analysis` 기반 UUID analysisId 분석 흐름 사용
- Redis queue 이름은 `chess-analysis-queue`
- 분석 진행률과 결과는 API를 통해 polling
- Next.js UI는 모노톤 중심의 현대적인 분석 화면으로 구성
- Vercel, Fly.io, Neon, Upstash Redis, GitHub Actions 기준 배포 구성이 추가됨
- 공개 베타 비용 보호를 위한 Redis 기반 rate limit 적용

## Architecture

```text
Browser
  -> Next.js frontend
  -> Spring Boot API
  -> Redis queue/cache
  -> Python Stockfish worker
  -> PostgreSQL
```

### Services

| Path | Role | Stack |
| --- | --- | --- |
| `chess-analysis-frontend` | 사용자 화면, 분석 요청/진행률/결과 표시 | Next.js 14, React, TypeScript, SWR |
| `chess-analysis-api` | 분석 job 생성, 상태/결과 조회, DB/Redis 연동 | Spring Boot 3, Java 21, JPA, Redis |
| `chess-analysis-worker` | Chess.com 게임 수집, Stockfish 분석, 스타일 프로파일링 | Python 3.11, Stockfish, asyncpg, redis |
| `postgres` | 분석 결과와 프로필 저장 | PostgreSQL |
| `redis` | 분석 queue, 진행률 cache, rate limit counter | Redis |

## Main Features

- Chess.com 최근 게임 수집
- 빠른 분석(`fast`)과 정밀 분석(`precise`) 우선순위
- 실시간 분석 진행률 표시
- 성과 지표 요약
- 백/흑 별 자주 사용하는 오프닝 1, 2위와 최근 분석 게임 내 비율 표시
- 12차원 스타일 프로파일링
- 주요 플레이 스타일 요약과 상세 설명
- Stockfish 기반 game/move 분석
- 분석 결과 저장 및 재조회
- Docker Compose smoke test

## Style Profile Dimensions

분석 결과는 아래 12개 차원으로 플레이 스타일을 요약합니다.

| Dimension | Description |
| --- | --- |
| Aggression | 공격적 수와 주도권 추구 성향 |
| Tactical Dependency | 전술 기회 탐지와 활용 경향 |
| Risk Taking | 불확실하거나 복잡한 포지션 선택 성향 |
| Positional Orientation | 조용한 수, 구조, 장기 우위 관리 성향 |
| Exchange Preference | 교환 선택과 물질 균형 관리 성향 |
| Opening Variety | 오프닝 레퍼토리 다양성 |
| Book Deviation | 정석 이탈 시점과 빈도 |
| Lead Conversion | 유리한 포지션을 승리로 전환하는 능력 |
| Endgame Technique | 엔드게임 처리 능력 |
| Time Management | 시간 사용 패턴 |
| Consistency | 수 품질의 안정성 |
| Swindle Resistance | 불리한 상황에서 버티거나 역전하는 능력 |

## Public Beta Limits

운영 비용을 제어하기 위해 API에는 Redis 기반 일일 제한이 들어가 있습니다.

| Scope | Limit |
| --- | --- |
| username + fast | 하루 3회 |
| username + precise | 하루 1회 |
| IP | 하루 10회 |
| 전체 서비스 | 하루 200회 |
| Redis queue | 대기열 30개 이상이면 신규 요청 차단 |

카운터는 `Asia/Seoul` 기준 자정에 초기화됩니다.

## Local Development

### Requirements

- Docker Desktop
- Java 21
- Node.js 20
- Python 3.11
- Stockfish

Docker Compose 개발 환경을 사용할 경우 PostgreSQL, Redis, Stockfish worker, API, frontend가 함께 실행됩니다.

### Start With Docker Compose

```bash
./dev.sh start
```

서비스 URL:

```text
Frontend: http://localhost:3000
API:      http://localhost:8080/api/v1
Health:   http://localhost:8080/api/v1/actuator/health
Postgres: localhost:5432
Redis:    localhost:6379
```

자주 쓰는 명령:

```bash
./dev.sh status
./dev.sh logs
./dev.sh logs chess-api
./dev.sh logs chess-worker-1
./dev.sh restart
./dev.sh stop
```

### Smoke Test

```bash
./dev.sh test
```

또는 직접 실행:

```bash
CHESS_USERNAME=hikaru GAME_COUNT=5 ./scripts/smoke-test.sh
```

기본 API URL은 `http://localhost:8080/api/v1`입니다. 운영 API를 검증할 때는 다음처럼 지정할 수 있습니다.

```bash
API_URL=https://<api-host>/api/v1 CHESS_USERNAME=hikaru GAME_COUNT=5 ./scripts/smoke-test.sh
```

### Run Services Manually

DB와 Redis만 Docker로 켜고 각 서비스를 로컬에서 실행할 수도 있습니다.

```bash
./local-dev.sh start
```

API:

```bash
cd chess-analysis-api
./gradlew bootRun
```

Frontend:

```bash
cd chess-analysis-frontend
npm install
npm run dev
```

Worker:

```bash
cd chess-analysis-worker
pip install -r requirements.txt
PYTHONPATH=src python -m worker.main
```

## Environment Variables

### API

```env
DB_USERNAME=chess_user
DB_PASSWORD=local-dev-only
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_SSL=false
SHORTLINK_BASE_URL=http://localhost:8080/api/v1/s
```

운영에서는 `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD`를 Fly secret으로 주입합니다.

### Worker

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=chess_analysis
DB_USER=chess_user
DB_PASSWORD=local-dev-only
DB_SSL=false
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_SSL=false
STOCKFISH_PATH=/usr/games/stockfish
```

### Frontend

기본 개발 환경에서는 Next.js rewrite가 `/api/v1/*` 요청을 API로 프록시합니다.

```env
INTERNAL_API_URL=http://localhost:8080
NEXT_PUBLIC_API_URL=
```

Vercel 운영 환경에서는 `INTERNAL_API_URL`을 Fly API URL로 설정합니다.

## API Overview

주요 엔드포인트:

```text
POST /api/v1/analysis
GET  /api/v1/analysis/{analysisId}
GET  /api/v1/analysis/{analysisId}/status
GET  /api/v1/analysis/{analysisId}/result
GET  /api/v1/player/summary?platform=chess.com&username={username}
GET  /api/v1/actuator/health
```

분석 생성 요청 예시:

```bash
curl -X POST http://localhost:8080/api/v1/analysis \
  -H "Content-Type: application/json" \
  -d '{
    "username": "hikaru",
    "platform": "chess.com",
    "gameCount": 5,
    "timeControl": "all",
    "priority": "fast"
  }'
```

## Deployment

현재 권장 배포 구조는 다음과 같습니다.

| Layer | Platform |
| --- | --- |
| Frontend | Vercel |
| API | Fly.io |
| Worker | Fly.io |
| PostgreSQL | Neon |
| Redis queue/cache | Upstash Redis |
| CI/CD | GitHub Actions |

관련 파일:

- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `deploy/fly/api.fly.toml`
- `deploy/fly/worker.fly.toml`
- `docs/deploy/README.md`

배포 절차와 필요한 secret 목록은 `docs/deploy/README.md`를 기준으로 관리합니다.

GitHub Actions 흐름:

```text
push to main
  -> API Gradle test
  -> Frontend lint/build
  -> Worker Python compile check
  -> Docker Compose config validation
  -> Docker image build/push
  -> Fly API deploy
  -> Fly worker deploy
  -> Vercel frontend deploy
  -> production smoke test
```

## Verification

로컬에서 변경 전후로 확인할 기본 명령:

```bash
cd chess-analysis-api
./gradlew test --no-daemon
```

```bash
cd chess-analysis-frontend
npm run lint
npm run build
```

```bash
python3 -m compileall -q chess-analysis-worker/src
docker compose -f docker-compose.dev.yml config --quiet
docker compose -f docker-compose.yml config --quiet
```

## Repository Notes

- 이 레포지토리는 현재 통합 monorepo입니다.
- 이전 FastAPI backend와 사용하지 않는 파일들은 정리되었습니다.
- 공식 분석 흐름은 Spring Boot API, Redis queue, Python worker 조합입니다.
- Lichess는 UI/API에서 준비 중 또는 비활성 상태로 취급합니다.
- 운영 비용 방어를 위해 worker 수와 Stockfish depth는 보수적으로 잡는 것을 권장합니다.

## License

MIT License

## Credits

- Stockfish
- Chess.com public API
- Next.js
- Spring Boot
- PostgreSQL
- Redis
