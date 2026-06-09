#!/bin/bash

# 로컬 개발 환경 (Docker 없이 직접 실행)

set -e

# 환경변수 설정
export SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/chess_analysis
export SPRING_DATASOURCE_USERNAME=chess_user
export SPRING_DATASOURCE_PASSWORD=local-dev-only
export SPRING_DATA_REDIS_HOST=localhost
export SPRING_DATA_REDIS_PORT=6379

export REDIS_HOST=localhost
export REDIS_PORT=6379
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=chess_analysis
export DB_USER=chess_user
export DB_PASSWORD=local-dev-only

export NEXT_PUBLIC_API_URL=http://localhost:8080

# Auth
export JWT_SECRET="local-dev-jwt-secret-key-minimum-32-bytes-long"
export COOKIE_SECURE=false
export FRONTEND_URL=http://localhost:3000
# RESEND_API_KEY 없으면 인증 URL이 서버 콘솔에 출력됨 (로컬 테스트용)
export RESEND_API_KEY=

case "$1" in
  start)
    echo "🚀 Starting Local Development Environment..."
    
    # Database 확인
    echo "📊 Starting databases..."
    docker-compose up -d postgres redis
    sleep 5
    
    echo ""
    echo "✅ 로컬 개발 환경 준비 완료!"
    echo ""
    echo "이제 각 터미널에서 다음 명령어를 실행하세요:"
    echo ""
    echo "🔧 API 서버:"
    echo "   cd chess-analysis-api && ./gradlew bootRun"
    echo ""
    echo "🖥️  프론트엔드:"
    echo "   cd chess-analysis-frontend && npm run dev"
    echo ""
    echo "🤖 워커:"
    echo "   cd chess-analysis-worker && python -m worker.main"
    echo ""
    echo "📱 접속: http://localhost:3000"
    echo "🔧 API: http://localhost:8080"
    ;;
    
  stop)
    echo "🛑 Stopping databases..."
    docker-compose down
    echo "✅ Stopped!"
    ;;
    
  status)
    echo "📊 Database status:"
    docker-compose ps postgres redis
    echo ""
    echo "🔗 Connection test:"
    echo "PostgreSQL: $(docker exec chess-postgres pg_isready -U chess_user -d chess_analysis 2>/dev/null && echo '✅ Ready' || echo '❌ Not ready')"
    echo "Redis: $(docker exec chess-redis redis-cli ping 2>/dev/null && echo '✅ Ready' || echo '❌ Not ready')"
    ;;
    
  test)
    echo "🧪 Testing API connection..."
    if curl -s -f http://localhost:8080/api/v1/actuator/health >/dev/null 2>&1; then
      echo "✅ API is running"
    else
      echo "❌ API is not running"
      echo "Run: cd chess-analysis-api && ./gradlew bootRun"
    fi
    
    if curl -s -f http://localhost:3000 >/dev/null 2>&1; then
      echo "✅ Frontend is running"
    else
      echo "❌ Frontend is not running"
      echo "Run: cd chess-analysis-frontend && npm run dev"
    fi
    ;;
    
  *)
    echo "로컬 개발 환경 (Hot Reload 지원)"
    echo ""
    echo "Usage: $0 {start|stop|status|test}"
    echo ""
    echo "Commands:"
    echo "  start   - 데이터베이스 시작 및 개발 가이드 표시"
    echo "  stop    - 데이터베이스 중지"
    echo "  status  - 서비스 상태 확인"
    echo "  test    - API/Frontend 연결 테스트"
    echo ""
    echo "Hot Reload 개발:"
    echo "1. $0 start          # 데이터베이스 시작"
    echo "2. 터미널1: cd chess-analysis-api && ./gradlew bootRun"
    echo "3. 터미널2: cd chess-analysis-frontend && npm run dev"
    echo "4. 터미널3: cd chess-analysis-worker && python -m worker.main"
    echo ""
    echo "장점:"
    echo "- ⚡ 즉시 Hot Reload (코드 수정시 자동 반영)"
    echo "- 🐛 쉬운 디버깅 (IDE 디버거 사용 가능)"
    echo "- 🔄 빠른 재시작 (Docker 빌드 불필요)"
    exit 1
    ;;
esac