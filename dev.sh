#!/bin/bash

# Chess Analysis Development Environment

set -e

case "$1" in
  start)
    echo "🚀 Starting Chess Analysis in development mode..."
    docker-compose -f docker-compose.dev.yml up -d
    echo ""
    echo "✅ Services started!"
    echo "📱 Frontend: http://localhost:3000"
    echo "🔧 API: http://localhost:8080"
    echo "🐛 API Debug: http://localhost:5005"
    echo "🗄️  Database: localhost:5432"
    echo "📦 Redis: localhost:6379"
    echo ""
    echo "📊 Check status: ./dev.sh status"
    echo "📝 View logs: ./dev.sh logs [service]"
    ;;
  
  stop)
    echo "🛑 Stopping development environment..."
    docker-compose -f docker-compose.dev.yml down
    echo "✅ Stopped!"
    ;;
  
  restart)
    echo "🔄 Restarting development environment..."
    docker-compose -f docker-compose.dev.yml down
    docker-compose -f docker-compose.dev.yml up -d
    echo "✅ Restarted!"
    ;;
  
  status)
    echo "📊 Development environment status:"
    docker-compose -f docker-compose.dev.yml ps
    ;;
  
  logs)
    if [ -z "$2" ]; then
      echo "📝 All service logs:"
      docker-compose -f docker-compose.dev.yml logs --tail=50 -f
    else
      echo "📝 Logs for $2:"
      docker-compose -f docker-compose.dev.yml logs --tail=50 -f "$2"
    fi
    ;;
  
  build)
    echo "🔨 Rebuilding development images..."
    docker-compose -f docker-compose.dev.yml build --no-cache
    echo "✅ Build complete!"
    ;;
  
  clean)
    echo "🧹 Cleaning up development environment..."
    docker-compose -f docker-compose.dev.yml down -v --remove-orphans
    docker system prune -f
    echo "✅ Cleaned!"
    ;;
  
  test)
    echo "🧪 Running Docker Compose smoke test..."
    ./scripts/smoke-test.sh
    ;;
  
  *)
    echo "Chess Analysis Development Environment"
    echo ""
    echo "Usage: $0 {start|stop|restart|status|logs|build|clean|test}"
    echo ""
    echo "Commands:"
    echo "  start     - Start all services in development mode"
    echo "  stop      - Stop all services"
    echo "  restart   - Restart all services"
    echo "  status    - Show service status"
    echo "  logs      - Show logs (optionally for specific service)"
    echo "  build     - Rebuild all images"
    echo "  clean     - Stop and remove all containers/volumes"
    echo "  test      - Run end-to-end test"
    echo ""
    echo "Examples:"
    echo "  $0 start"
    echo "  $0 logs chess-frontend"
    echo "  $0 status"
    exit 1
    ;;
esac
