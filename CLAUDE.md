# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Architecture

This is a comprehensive chess analysis platform built with a microservices architecture using Docker Compose:

- **chess-analysis-api**: Java Spring Boot service handling HTTP requests, job queuing, and data persistence
- **chess-analysis-frontend**: Next.js 14 React frontend with Apple-inspired design
- **chess-analysis-worker**: Python workers that perform actual chess engine analysis using Stockfish
- **PostgreSQL**: Main database for persistent storage
- **Redis**: Message queue for background jobs and caching

### Data Flow
1. Frontend sends analysis request to Java API
2. API creates Analysis entity and queues job in Redis
3. Python workers consume jobs from Redis queue
4. Workers fetch Chess.com game data, analyze with Stockfish engine
5. Workers update analysis status in PostgreSQL via Redis
6. Frontend polls API for status updates and results

## Development Environment Commands

### Quick Start
```bash
# Start development environment (recommended)
./dev.sh start

# Local development (without Docker, hot reload)
./local-dev.sh start
```

### Development Scripts
```bash
# Core development commands
./dev.sh start          # Start all services in dev mode
./dev.sh stop           # Stop all services
./dev.sh restart        # Restart all services
./dev.sh status         # Show service status
./dev.sh logs [service] # View logs (optionally for specific service)
./dev.sh build          # Rebuild all images
./dev.sh clean          # Stop and remove all containers/volumes
./dev.sh test           # Run end-to-end API test

# Local development (hot reload, IDE debugging)
./local-dev.sh start    # Start databases only, manual service startup
./local-dev.sh stop     # Stop databases
./local-dev.sh status   # Check database status
./local-dev.sh test     # Test API/Frontend connections
```

### Docker Compose Environments
```bash
# Development environment (hot reload, volume mounts)
docker-compose -f docker-compose.dev.yml up -d

# Production environment (optimized builds)
docker-compose up -d
```

### Individual Service Commands

#### Java API (chess-analysis-api)
```bash
cd chess-analysis-api

# Build and test
./gradlew build
./gradlew test

# Run application (requires PostgreSQL/Redis)
./gradlew bootRun

# Build Docker image
docker build -t chess-api .
```

#### Frontend (chess-analysis-frontend) 
```bash
cd chess-analysis-frontend

# Install dependencies
npm install

# Development server
npm run dev

# Production build and start
npm run build
npm start

# Lint code
npm run lint
```

#### Python Worker (chess-analysis-worker)
```bash
cd chess-analysis-worker

# Install dependencies
pip install -r requirements.txt

# Run worker (requires PostgreSQL/Redis)
python -m worker.main
```

## Key Architecture Components

### Chess Analysis Pipeline
- **Stockfish Engine**: Chess engine for position evaluation and move analysis
- **12-Dimensional Style Profiling**: Analyzes player style across dimensions (aggression, tactical dependency, endgame technique, etc.)
- **Progressive Analysis**: Batch processing of games with real-time progress updates
- **Tactical Pattern Detection**: Identifies tactical opportunities (captures, checks, undefended attacks)
- **Cohort Comparison**: Compares players against others in similar rating brackets
- **Training Plan Generation**: Creates personalized improvement recommendations

### Database Schema (PostgreSQL)
- `analyses`: Main analysis jobs with status tracking and results
- `games`: Individual chess games with metadata and PGN data
- `game_analysis_result`: Stockfish analysis results per game
- `style_profile`: 12-dimensional style analysis results

### Redis Usage
- **Job Queue**: Analysis job queuing and processing
- **Caching**: Player summaries and API responses
- **Progress Updates**: Real-time analysis progress tracking

## Environment Configuration

### Docker Internal Communication
Services communicate using Docker service names:
- **Frontend to API**: `http://chess-api:8080` (internal)
- **Workers to Redis**: `redis:6379` 
- **Workers to PostgreSQL**: `postgres:5432`

### Critical Environment Variables
```bash
# Java API
SPRING_PROFILES_ACTIVE=dev|docker
SPRING_DATASOURCE_URL=jdbc:postgresql://postgres:5432/chess_analysis
SPRING_DATA_REDIS_HOST=redis

# Frontend (Docker)
NEXT_PUBLIC_API_URL=http://chess-api:8080

# Python Workers
REDIS_HOST=redis
DB_HOST=postgres
STOCKFISH_PATH=/usr/bin/stockfish
```

## Service Dependencies & Ports
- Frontend: http://localhost:3000
- Java API: http://localhost:8080/api/v1  
- Java API Debug: http://localhost:5005 (dev mode)
- PostgreSQL: localhost:5432
- Redis: localhost:6379

## Development Workflow

### Hot Reload Development
1. Use `./dev.sh start` for full Docker development with volume mounts
2. Frontend: Auto-reloads on file changes in `./chess-analysis-frontend`
3. Workers: Auto-restart on file changes in `./chess-analysis-worker/src`
4. API: Gradle continuous build with Spring Boot DevTools

### Local Development (IDE Debugging)
1. Use `./local-dev.sh start` to start databases only
2. Run services manually in separate terminals for full IDE debugging support
3. Faster iteration but requires local Java/Node/Python setup

### Testing Strategy
- **Java**: JUnit tests via `./gradlew test`
- **Frontend**: ESLint for code quality via `npm run lint`
- **Integration**: `./dev.sh test` runs end-to-end API test
- **Manual Testing**: Use frontend at http://localhost:3000

## Common Issues and Solutions

### Docker Network Issues
If frontend shows 500 errors connecting to API:
- Ensure `NEXT_PUBLIC_API_URL=http://chess-api:8080` in Docker environment
- Restart frontend service: `docker-compose restart chess-frontend`

### Redis/Jackson Serialization 
The system uses custom Jackson ObjectMapper configuration for Redis caching to handle `java.time.Instant` serialization.

### Port Conflicts
```bash
# Check for port conflicts
lsof -ti:3000  # Frontend
lsof -ti:8080  # API
lsof -ti:5432  # PostgreSQL
lsof -ti:6379  # Redis
```

## Architecture Notes
- **Microservices Design**: Each service is independently deployable and scalable
- **Asynchronous Processing**: Long-running analysis jobs use Redis queue with progress updates
- **Chess Engine Integration**: Stockfish engine runs in Python workers for performance
- **API-First Design**: RESTful API with comprehensive OpenAPI documentation
- **Responsive Design**: Frontend uses Apple Design Language with full mobile support
- **Docker-First**: All services containerized with development and production configurations