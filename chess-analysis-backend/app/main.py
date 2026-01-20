"""
Chess Analysis Service - FastAPI 메인 애플리케이션

체스 기보 분석 및 플레이어 프로파일링 서비스의 메인 API 서버
"""

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import time
import uuid
from typing import Dict, Any

from loguru import logger
from .config import settings
from .api.analysis import router as analysis_router
from .api.health import router as health_router


# 애플리케이션 생명주기 관리
@asynccontextmanager
async def lifespan(app: FastAPI):
    """애플리케이션 시작/종료 시 실행할 작업들"""
    
    # 시작 시 실행
    logger.info("Chess Analysis Service 시작")
    logger.info(f"설정: {settings.api_title} v{settings.api_version}")
    logger.info(f"디버그 모드: {settings.debug}")
    
    # Stockfish 엔진 사용 가능 여부 확인
    try:
        from .config import get_stockfish_path
        stockfish_path = get_stockfish_path()
        logger.info(f"Stockfish 엔진 경로: {stockfish_path}")
    except Exception as e:
        logger.error(f"Stockfish 엔진 설정 오류: {e}")
    
    yield
    
    # 종료 시 실행
    logger.info("Chess Analysis Service 종료")


# FastAPI 앱 생성
app = FastAPI(
    title=settings.api_title,
    version=settings.api_version,
    description=settings.api_description,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    lifespan=lifespan
)

# CORS 미들웨어 설정 - 개발 환경에서는 모든 origin 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001"
    ],  # 개발 환경에서 필요한 origins만 허용
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 신뢰할 수 있는 호스트 미들웨어
if not settings.debug:
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=[
            "your-domain.com", 
            "*.your-domain.com",
            "localhost",
            "127.0.0.1",
            "0.0.0.0"
        ]
    )


# 요청 로깅 미들웨어
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """모든 HTTP 요청 로깅"""
    
    request_id = str(uuid.uuid4())[:8]
    start_time = time.time()
    
    # 요청 정보 로깅
    logger.info(
        f"[{request_id}] {request.method} {request.url.path} "
        f"- Client: {request.client.host if request.client else 'unknown'}"
    )
    
    # 요청 처리
    try:
        response = await call_next(request)
        process_time = time.time() - start_time
        
        # 응답 정보 로깅
        logger.info(
            f"[{request_id}] Response: {response.status_code} "
            f"({process_time:.3f}s)"
        )
        
        # 응답 헤더에 처리 시간 추가
        response.headers["X-Process-Time"] = str(process_time)
        response.headers["X-Request-ID"] = request_id
        
        return response
        
    except Exception as e:
        process_time = time.time() - start_time
        logger.error(
            f"[{request_id}] Error: {str(e)} ({process_time:.3f}s)"
        )
        raise


# 전역 예외 핸들러
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """HTTP 예외 처리"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.status_code,
                "message": exc.detail,
                "type": "HTTPException"
            }
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """일반 예외 처리"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": 500,
                "message": "Internal server error" if not settings.debug else str(exc),
                "type": type(exc).__name__
            }
        }
    )


# API 라우터 등록
app.include_router(health_router, prefix="/health", tags=["Health"])
app.include_router(health_router, prefix="/api/v1/health", tags=["Health"])  # 프론트엔드 호환성
app.include_router(analysis_router, prefix="/api/v1", tags=["Analysis"])


# 정적 파일 서빙 (프론트엔드)
try:
    app.mount("/static", StaticFiles(directory="frontend/static"), name="static")
except Exception as e:
    logger.warning(f"정적 파일 마운트 실패: {e}")

# Service Worker 서빙
@app.get("/sw.js")
async def serve_service_worker():
    """서비스 워커 파일 서빙"""
    try:
        with open("frontend/static/sw.js", "r", encoding="utf-8") as f:
            return Response(
                content=f.read(),
                media_type="application/javascript",
                headers={"Service-Worker-Allowed": "/"}
            )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Service Worker not found")


# 프론트엔드 HTML 서빙
@app.get("/", response_class=HTMLResponse)
async def serve_frontend():
    """프론트엔드 HTML 페이지 서빙"""
    try:
        with open("frontend/templates/index.html", "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    except FileNotFoundError:
        return HTMLResponse(
            content="<h1>프론트엔드 파일을 찾을 수 없습니다</h1>",
            status_code=404
        )

# API 정보 엔드포인트
@app.get("/api", response_model=Dict[str, Any])
async def api_root():
    """API 루트 엔드포인트"""
    return {
        "service": settings.api_title,
        "version": settings.api_version,
        "description": settings.api_description,
        "status": "running",
        "docs": "/docs" if settings.debug else "disabled",
        "endpoints": {
            "health": "/health",
            "analysis": "/api/v1/analyze",
            "status": "/api/v1/status/{analysis_id}"
        }
    }


# 서비스 정보 엔드포인트
@app.get("/info", response_model=Dict[str, Any])
async def service_info():
    """서비스 상세 정보"""
    
    try:
        from .config import get_stockfish_path
        stockfish_available = True
        stockfish_path = get_stockfish_path()
    except Exception:
        stockfish_available = False
        stockfish_path = None
    
    return {
        "service": {
            "name": settings.api_title,
            "version": settings.api_version,
            "description": settings.api_description
        },
        "configuration": {
            "debug": settings.debug,
            "default_game_count": settings.default_game_count,
            "max_game_count": settings.max_game_count,
            "analysis_timeout": settings.analysis_timeout
        },
        "engines": {
            "stockfish": {
                "available": stockfish_available,
                "path": stockfish_path,
                "depth_quick": settings.stockfish_depth_quick,
                "depth_deep": settings.stockfish_depth_deep
            }
        },
        "features": {
            "style_analysis": True,
            "cohort_comparison": True,
            "improvement_plans": True,
            "supported_platforms": ["chess.com"],
            "supported_time_controls": ["bullet", "blitz", "rapid", "daily"]
        }
    }


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level=settings.log_level.lower()
    )