# Deployment Guide

This project is wired for the following production shape:

- Frontend: Vercel
- API: Fly.io
- Worker: Fly.io
- PostgreSQL: Neon
- Redis: Upstash Redis
- CI/CD: GitHub Actions

## 1. Create external services

### Neon

Create a PostgreSQL database and apply the schema:

```bash
psql "$NEON_DATABASE_URL" -v ON_ERROR_STOP=1 -f init-db.sql
```

Keep these values for Fly secrets:

- host
- port
- database
- user
- password

For the Spring Boot API, use a JDBC URL with SSL:

```text
jdbc:postgresql://<host>/<database>?sslmode=require
```

### Upstash Redis

Create a Redis database and keep:

- host
- port
- password
- TLS enabled

The API and worker both expect:

```text
REDIS_HOST
REDIS_PORT
REDIS_PASSWORD
REDIS_SSL=true
```

## 2. Create Fly apps

Pick globally unique names:

```bash
fly apps create chess-analysis-api-prod
fly apps create chess-analysis-worker-prod
```

Set API secrets:

```bash
fly secrets set \
  SPRING_DATASOURCE_URL='jdbc:postgresql://<neon-host>/<db>?sslmode=require' \
  SPRING_DATASOURCE_USERNAME='<neon-user>' \
  SPRING_DATASOURCE_PASSWORD='<neon-password>' \
  REDIS_HOST='<upstash-host>' \
  REDIS_PORT='<upstash-port>' \
  REDIS_PASSWORD='<upstash-password>' \
  REDIS_SSL='true' \
  RATE_LIMIT_WHITELIST_USERNAMES='oswooooo' \
  SHORTLINK_BASE_URL='https://chess-analysis-api-prod.fly.dev/s' \
  -a chess-analysis-api-prod
```

Set worker secrets:

```bash
fly secrets set \
  DB_HOST='<neon-host>' \
  DB_PORT='5432' \
  DB_NAME='<neon-db>' \
  DB_USER='<neon-user>' \
  DB_PASSWORD='<neon-password>' \
  DB_SSL='true' \
  REDIS_HOST='<upstash-host>' \
  REDIS_PORT='<upstash-port>' \
  REDIS_PASSWORD='<upstash-password>' \
  REDIS_SSL='true' \
  -a chess-analysis-worker-prod
```

Manual first deploy:

```bash
fly deploy chess-analysis-api --config deploy/fly/api.fly.toml --app chess-analysis-api-prod
fly deploy chess-analysis-worker --config deploy/fly/worker.fly.toml --app chess-analysis-worker-prod
```

## 3. Connect Vercel

Create a Vercel project from `chess-analysis-frontend`.

Set production environment variables:

```text
INTERNAL_API_URL=https://chess-analysis-api-prod.fly.dev
NEXT_PUBLIC_API_URL=
```

The frontend calls `/api/v1/...`, and `next.config.js` rewrites that path to `INTERNAL_API_URL`.
Do not include `/api/v1` in `INTERNAL_API_URL`; the rewrite adds that path automatically.
If `INTERNAL_API_URL` is missing in production, the frontend falls back to `https://chess-analysis-api-prod.fly.dev`.

## 4. GitHub Actions secrets

Add these repository secrets:

```text
FLY_API_TOKEN
FLY_API_APP=chess-analysis-api-prod
FLY_WORKER_APP=chess-analysis-worker-prod
NEON_DATABASE_URL=postgresql://<neon-user>:<neon-password>@<neon-host>/<neon-db>?sslmode=require
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
PROD_API_URL=https://chess-analysis-api-prod.fly.dev/api/v1
PROD_FRONTEND_URL=https://chess-analysis-gg.vercel.app
SMOKE_CHESS_USERNAME=oswooooo
```

`GITHUB_TOKEN` is provided automatically by GitHub Actions and is used to push Docker images to GitHub Container Registry.

## 5. Pipeline behavior

On pull requests and pushes to `main`, `.github/workflows/ci.yml` runs:

- API Gradle test
- Frontend install, lint, build
- Worker dependency install and Python compile check
- Docker Compose config validation

On pushes to `main`, `.github/workflows/deploy.yml` runs:

- CI workflow
- Docker image build and push to GHCR
- Neon schema migration with `init-db.sql`
- Fly deploy for API
- Fly deploy for worker
- Vercel production deploy
- Production smoke test with `scripts/smoke-test.sh`
- Frontend API proxy smoke test through `/api/v1/player/summary`

## 6. Cost guardrails

The API includes Redis-backed rate limits for public beta:

- username + fast: 3 analyses per day
- username + precise: 1 analysis per day
- IP: 10 analyses per day
- global service: 200 analyses per day
- queue: reject new requests when Redis queue has 30 or more jobs

Counters reset at midnight in `Asia/Seoul`.
Set `RATE_LIMIT_WHITELIST_USERNAMES` or `RATE_LIMIT_WHITELIST_IPS` on the API app to bypass the daily username/IP/global counters for operators or testers. The queue saturation guard still applies.
