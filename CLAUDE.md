# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Behavioral Guidelines

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### Think Before Coding

Before implementing: state assumptions explicitly, surface tradeoffs, push back on overcomplication, and ask when something is unclear. Don't pick silently between interpretations.

### Simplicity First

Minimum code that solves the problem. No features beyond what was asked, no abstractions for single-use code, no error handling for impossible scenarios. If you write 200 lines and it could be 50, rewrite it.

### Surgical Changes

Touch only what you must. Don't refactor adjacent code, match existing style even if you'd do it differently, and don't delete pre-existing dead code unless asked. Every changed line should trace directly to the request.

### Goal-Driven Execution

Transform tasks into verifiable goals. For multi-step tasks, state a plan with explicit verify steps before starting.

---

## Project Architecture

Chess analysis platform with microservices:

- **chess-analysis-api**: Java 21 / Spring Boot 3.2 — HTTP endpoints, rate limiting, job queuing, data persistence
- **chess-analysis-frontend**: Next.js 14 (App Router) — React UI polling for analysis results
- **chess-analysis-worker**: Python async workers — Stockfish engine analysis, Chess.com API integration
- **PostgreSQL**: Primary persistence; **Redis**: job queue, rate limit counters, distributed locks, caching

### Data Flow
1. Frontend POST `/api/v1/analysis` → API creates `Analysis` (UUID), acquires Redis distributed lock (30s TTL) to prevent duplicate submissions, enqueues job to `chess-analysis-queue`
2. Worker consumes job, fetches games from Chess.com public API, analyzes moves with Stockfish
3. Worker writes per-game results + 12-dim style profile to PostgreSQL, updates progress via Redis
4. Frontend polls `/api/v1/analysis/{id}/status` every 2 seconds; retrieves full results at `/api/v1/analysis/{id}/result`

### Progress Stages
Worker reports: 0–20% collect → 20–30% parse → 30–70% analyze → 70–90% profile → 90–100% finalize

### Rate Limiting (Redis-based, resets midnight Asia/Seoul)
- Per-user: 3 fast / 1 precise per day (`rate:analysis:username:*`)
- Per-IP: 10/day (`rate:analysis:ip:*`); Global: 200/day (`rate:analysis:global:*`)
- Queue blocks new jobs if 30+ jobs pending; whitelists configurable via env vars

### Stale Analysis Detection
- PENDING → stale after 45 minutes; IN_PROGRESS → stale after 30 minutes

## Development Commands

```bash
./dev.sh start             # Start all services (Docker, hot reload)
./local-dev.sh start       # Start only databases (for IDE debugging)
./dev.sh stop | restart | status | build | clean
./dev.sh logs [service]
./dev.sh test              # End-to-end API smoke test
```

```bash
# Java API
cd chess-analysis-api
./gradlew build && ./gradlew test
./gradlew bootRun          # Needs PostgreSQL + Redis

# Frontend
cd chess-analysis-frontend
npm install && npm run dev
npm run lint

# Python Worker
cd chess-analysis-worker
pip install -r requirements.txt
python -m worker.main      # Needs PostgreSQL + Redis
```

## Key Source Locations

| Concern | Path |
|---|---|
| API entry point | `chess-analysis-api/src/main/java/.../ChessAnalysisApiApplication.java` |
| Main REST endpoints | `AnalysisController` — POST/GET `/api/v1/analysis` |
| Rate limit logic | `AnalysisRateLimitService` |
| Job queuing | `AnalysisQueueService` |
| Worker entry point | `chess-analysis-worker/src/worker/main.py` |
| 12-dim style profiling | `PlayerProfiler` |
| Stockfish engine wrapper | `StockfishEngine` |
| Frontend API client | `chess-analysis-frontend/src/lib/api.ts` |
| Status polling hook | `useAnalysisProgress` (polls every 2s) |
| DB schema | `init-db.sql` |

## Database Schema

- `analyses` — UUID id, status, progress %, current_step, short_link, error_message
- `games` — game metadata and PGN, FK to analysis
- `game_analysis_results` — accuracy, ACPL, blunders per game; `move_analysis_json` JSONB
- `style_profiles` — 12 float columns + `insights_json`, `recommendations_json` JSONB

## Service Ports & Docker URLs

| Service | Local | Docker internal |
|---|---|---|
| Frontend | 3000 | — |
| Java API (`/api/v1`) | 8080 | `http://chess-api:8080` |
| API debug (dev) | 5005 | — |
| PostgreSQL | 5432 | `postgres:5432` |
| Redis | 6379 | `redis:6379` |

## Critical Environment Variables

```bash
# Java API
SPRING_PROFILES_ACTIVE=dev|docker
SPRING_DATASOURCE_URL=jdbc:postgresql://postgres:5432/chess_analysis
SPRING_DATA_REDIS_HOST=redis

# Frontend
NEXT_PUBLIC_API_URL=http://chess-api:8080   # Must use Docker service name, not localhost

# Worker
REDIS_HOST=redis
DB_HOST=postgres
STOCKFISH_PATH=/usr/bin/stockfish
```

## Non-Obvious Gotchas

- **Korean strings are intentional**: Error messages and logs are in Korean for the Korean user base. Do not translate them.
- **Jackson/Redis serialization**: Custom `ObjectMapper` handles `java.time.Instant` for Redis. Don't replace with a default mapper.
- **Short links**: Each analysis gets a `/s/{shortLink}` alias (30-day expiry) in the `short_link` column.
- **No unit test files**: Testing is via `./dev.sh test` (integration) and `npm run lint`. `./gradlew test` has no test classes yet.
- **Worker startup order**: Worker performs API health-check before consuming jobs to ensure DB migrations are complete.
- **500 errors in Docker**: Almost always `NEXT_PUBLIC_API_URL` is set to `localhost` instead of the Docker service name.
