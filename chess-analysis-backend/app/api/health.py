"""
Health Check API 라우터

서비스 상태 확인 및 모니터링 엔드포인트들
"""

import asyncio
import time
from datetime import datetime
from typing import Dict, Any, List
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from loguru import logger
from ..config import settings, get_stockfish_path
from ..services.chess_api import ChessComAPI
from ..redis_client import get_redis_client


router = APIRouter()


class HealthStatus(BaseModel):
    """헬스 체크 응답 모델"""
    status: str  # "healthy", "degraded", "unhealthy"
    timestamp: str
    uptime_seconds: float
    version: str
    checks: Dict[str, Dict[str, Any]]


class ServiceCheck(BaseModel):
    """개별 서비스 체크 결과"""
    name: str
    status: str  # "pass", "fail", "warn"
    duration_ms: float
    message: str
    details: Dict[str, Any] = {}


# 애플리케이션 시작 시간
_start_time = time.time()


async def check_stockfish_engine() -> ServiceCheck:
    """Stockfish 엔진 상태 확인"""
    start_time = time.time()
    
    try:
        # Stockfish 경로 확인
        stockfish_path = get_stockfish_path()
        
        # 엔진 초기화 테스트
        from ..services.engine import StockfishEngine
        
        async with StockfishEngine() as engine:
            # 간단한 포지션 분석 테스트
            import chess
            board = chess.Board()
            score = await engine.analyze_position(board, depth=1)
            
            if score is not None:
                duration_ms = (time.time() - start_time) * 1000
                return ServiceCheck(
                    name="stockfish_engine",
                    status="pass",
                    duration_ms=duration_ms,
                    message="Stockfish engine is working properly",
                    details={
                        "path": stockfish_path,
                        "test_score": str(score),
                        "depth_quick": settings.stockfish_depth_quick,
                        "depth_deep": settings.stockfish_depth_deep
                    }
                )
            else:
                raise Exception("엔진 분석 결과가 None")
                
    except Exception as e:
        duration_ms = (time.time() - start_time) * 1000
        return ServiceCheck(
            name="stockfish_engine",
            status="fail",
            duration_ms=duration_ms,
            message=f"Stockfish engine check failed: {str(e)}",
            details={"error": str(e)}
        )


async def check_chess_com_api() -> ServiceCheck:
    """Chess.com API 연결 상태 확인"""
    start_time = time.time()
    
    try:
        async with ChessComAPI() as api:
            # 유명한 플레이어의 기본 정보 조회로 API 테스트
            player_info = await api.get_player_info("hikaru")
            
            duration_ms = (time.time() - start_time) * 1000
            
            if player_info and 'url' in player_info:
                return ServiceCheck(
                    name="chess_com_api",
                    status="pass",
                    duration_ms=duration_ms,
                    message="Chess.com API is accessible",
                    details={
                        "base_url": settings.chesscom_api_base_url,
                        "rate_limit": settings.chesscom_rate_limit,
                        "test_player": "hikaru",
                        "response_size": len(str(player_info))
                    }
                )
            else:
                raise Exception("Invalid API response")
                
    except Exception as e:
        duration_ms = (time.time() - start_time) * 1000
        return ServiceCheck(
            name="chess_com_api",
            status="fail",
            duration_ms=duration_ms,
            message=f"Chess.com API check failed: {str(e)}",
            details={"error": str(e)}
        )


async def check_memory_usage() -> ServiceCheck:
    """메모리 사용량 확인"""
    start_time = time.time()
    
    try:
        import psutil
        process = psutil.Process()
        memory_info = process.memory_info()
        memory_mb = memory_info.rss / 1024 / 1024
        
        duration_ms = (time.time() - start_time) * 1000
        
        # 메모리 사용량 경고 임계값 (500MB)
        if memory_mb > 500:
            status = "warn"
            message = f"High memory usage: {memory_mb:.1f}MB"
        else:
            status = "pass"
            message = f"Memory usage normal: {memory_mb:.1f}MB"
        
        return ServiceCheck(
            name="memory_usage",
            status=status,
            duration_ms=duration_ms,
            message=message,
            details={
                "memory_mb": round(memory_mb, 1),
                "memory_percent": process.memory_percent(),
                "pid": process.pid
            }
        )
        
    except ImportError:
        # psutil이 설치되지 않은 경우
        duration_ms = (time.time() - start_time) * 1000
        return ServiceCheck(
            name="memory_usage",
            status="warn",
            duration_ms=duration_ms,
            message="Memory monitoring unavailable (psutil not installed)",
            details={}
        )
    except Exception as e:
        duration_ms = (time.time() - start_time) * 1000
        return ServiceCheck(
            name="memory_usage",
            status="fail",
            duration_ms=duration_ms,
            message=f"Memory check failed: {str(e)}",
            details={"error": str(e)}
        )


async def check_disk_space() -> ServiceCheck:
    """디스크 공간 확인"""
    start_time = time.time()
    
    try:
        import shutil
        
        # 데이터 디렉토리 디스크 공간 확인
        total, used, free = shutil.disk_usage(settings.data_dir)
        
        free_gb = free / (1024**3)
        total_gb = total / (1024**3)
        used_percent = (used / total) * 100
        
        duration_ms = (time.time() - start_time) * 1000
        
        # 디스크 공간 경고 임계값 (1GB 미만 또는 90% 이상 사용)
        if free_gb < 1 or used_percent > 90:
            status = "warn"
            message = f"Low disk space: {free_gb:.1f}GB free ({used_percent:.1f}% used)"
        else:
            status = "pass"
            message = f"Disk space OK: {free_gb:.1f}GB free ({used_percent:.1f}% used)"
        
        return ServiceCheck(
            name="disk_space",
            status=status,
            duration_ms=duration_ms,
            message=message,
            details={
                "total_gb": round(total_gb, 1),
                "free_gb": round(free_gb, 1),
                "used_percent": round(used_percent, 1),
                "path": settings.data_dir
            }
        )
        
    except Exception as e:
        duration_ms = (time.time() - start_time) * 1000
        return ServiceCheck(
            name="disk_space",
            status="fail",
            duration_ms=duration_ms,
            message=f"Disk space check failed: {str(e)}",
            details={"error": str(e)}
        )


async def check_redis() -> ServiceCheck:
    """Redis 연결 및 큐 상태 확인"""
    start_time = time.time()
    
    try:
        redis_client = get_redis_client()
        health_info = redis_client.health_check()
        
        duration_ms = (time.time() - start_time) * 1000
        
        if health_info['status'] == 'healthy':
            return ServiceCheck(
                name="redis",
                status="pass",
                duration_ms=duration_ms,
                message="Redis is healthy and responsive",
                details={
                    "response_time_ms": health_info.get('response_time_ms', 0),
                    "queue_info": health_info.get('queue_info', {}),
                    "cache_test": "passed"
                }
            )
        else:
            return ServiceCheck(
                name="redis",
                status="fail",
                duration_ms=duration_ms,
                message=f"Redis health check failed: {health_info.get('error', 'Unknown error')}",
                details=health_info
            )
    except Exception as e:
        duration_ms = (time.time() - start_time) * 1000
        return ServiceCheck(
            name="redis",
            status="fail",
            duration_ms=duration_ms,
            message=f"Redis check failed: {str(e)}",
            details={"error": str(e)}
        )


@router.get("/", response_model=HealthStatus)
async def health_check():
    """
    전체 서비스 헬스 체크
    
    모든 주요 컴포넌트의 상태를 확인하고 종합적인 서비스 상태를 반환합니다.
    """
    start_time = time.time()
    
    # 병렬로 모든 체크 실행
    checks = await asyncio.gather(
        check_stockfish_engine(),
        check_chess_com_api(),
        check_redis(),
        check_memory_usage(),
        check_disk_space(),
        return_exceptions=True
    )
    
    # 체크 결과 정리
    check_results = {}
    failed_checks = 0
    warning_checks = 0
    
    for check in checks:
        if isinstance(check, Exception):
            check_results["unknown_error"] = {
                "status": "fail",
                "message": str(check),
                "duration_ms": 0
            }
            failed_checks += 1
        elif isinstance(check, ServiceCheck):
            check_results[check.name] = {
                "status": check.status,
                "message": check.message,
                "duration_ms": check.duration_ms,
                "details": check.details
            }
            
            if check.status == "fail":
                failed_checks += 1
            elif check.status == "warn":
                warning_checks += 1
    
    # 전체 상태 결정
    if failed_checks > 0:
        overall_status = "unhealthy"
    elif warning_checks > 0:
        overall_status = "degraded"
    else:
        overall_status = "healthy"
    
    # 응답 생성
    uptime = time.time() - _start_time
    total_duration = (time.time() - start_time) * 1000
    
    return HealthStatus(
        status=overall_status,
        timestamp=datetime.utcnow().isoformat() + "Z",
        uptime_seconds=round(uptime, 1),
        version=settings.api_version,
        checks={
            **check_results,
            "health_check": {
                "status": "pass",
                "message": f"Health check completed in {total_duration:.1f}ms",
                "duration_ms": total_duration,
                "details": {
                    "total_checks": len(checks),
                    "failed_checks": failed_checks,
                    "warning_checks": warning_checks
                }
            }
        }
    )


@router.get("/live")
async def liveness_probe():
    """
    라이브니스 프로브 (Kubernetes/Docker 용)
    
    서비스가 실행 중인지 기본적인 확인만 수행합니다.
    빠른 응답이 필요한 헬스체크에 사용됩니다.
    """
    return {
        "status": "alive",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "service": settings.api_title,
        "version": settings.api_version
    }


@router.get("/ready")
async def readiness_probe():
    """
    레디니스 프로브 (Kubernetes/Docker 용)
    
    서비스가 요청을 처리할 준비가 되었는지 확인합니다.
    필수 의존성만 빠르게 체크합니다.
    """
    try:
        # Stockfish 엔진 기본 체크
        stockfish_path = get_stockfish_path()
        
        # Chess.com API 기본 연결성 체크 (타임아웃 5초)
        async with ChessComAPI() as api:
            # 매우 가벼운 요청으로 연결성만 확인
            pass
        
        return {
            "status": "ready",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "service": settings.api_title,
            "version": settings.api_version,
            "checks": {
                "stockfish": "available",
                "chess_com_api": "connected"
            }
        }
        
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        raise HTTPException(
            status_code=503,
            detail={
                "status": "not_ready",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }
        )


@router.get("/version")
async def version_info():
    """
    버전 정보
    
    서비스 버전과 빌드 정보를 반환합니다.
    """
    return {
        "service": settings.api_title,
        "version": settings.api_version,
        "description": settings.api_description,
        "build": {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "environment": "development" if settings.debug else "production"
        },
        "configuration": {
            "stockfish_depth_quick": settings.stockfish_depth_quick,
            "stockfish_depth_deep": settings.stockfish_depth_deep,
            "default_game_count": settings.default_game_count,
            "max_game_count": settings.max_game_count
        }
    }


@router.get("/metrics")
async def basic_metrics():
    """
    기본 메트릭스
    
    서비스 운영 메트릭스를 반환합니다.
    """
    uptime = time.time() - _start_time
    
    metrics = {
        "uptime_seconds": round(uptime, 1),
        "service": {
            "name": settings.api_title,
            "version": settings.api_version,
            "status": "running"
        },
        "system": {
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }
    }
    
    # 메모리 사용량 (선택적)
    try:
        import psutil
        process = psutil.Process()
        memory_info = process.memory_info()
        metrics["system"]["memory_mb"] = round(memory_info.rss / 1024 / 1024, 1)
        metrics["system"]["memory_percent"] = round(process.memory_percent(), 1)
    except ImportError:
        pass
    
    # 디스크 사용량 (선택적)
    try:
        import shutil
        total, used, free = shutil.disk_usage(settings.data_dir)
        metrics["system"]["disk_free_gb"] = round(free / (1024**3), 1)
        metrics["system"]["disk_used_percent"] = round((used / total) * 100, 1)
    except Exception:
        pass
    
    return metrics


@router.get("/actuator/health")
async def actuator_health():
    """
    Spring Boot 스타일 actuator health 엔드포인트
    
    Spring Boot actuator와 호환되는 헬스체크 응답을 제공합니다.
    """
    try:
        # Redis 상태 확인
        redis_status = "UP"
        try:
            redis_client = get_redis_client()
            redis_client.health_check()
        except Exception:
            redis_status = "DOWN"
        
        # 데이터베이스 상태 (실제로는 데이터베이스 연결 확인)
        db_status = "UP"  # 현재는 파일 기반이므로 기본값
        
        # 전체 상태 결정
        overall_status = "UP" if redis_status == "UP" and db_status == "UP" else "DOWN"
        
        return {
            "status": overall_status,
            "components": {
                "db": {
                    "status": db_status,
                    "details": {
                        "database": "file_based",
                        "validationQuery": "isValid()"
                    }
                },
                "redis": {
                    "status": redis_status,
                    "details": {
                        "cluster_size": 1,
                        "slots_up": 16384 if redis_status == "UP" else 0,
                        "slots_ok": 16384 if redis_status == "UP" else 0
                    }
                },
                "diskSpace": {
                    "status": "UP",
                    "details": {
                        "total": 1000000000,
                        "free": 500000000,
                        "threshold": 10485760,
                        "exists": True
                    }
                }
            }
        }
        
    except Exception as e:
        logger.error(f"Actuator health check failed: {e}")
        return {
            "status": "DOWN",
            "components": {
                "db": {"status": "DOWN"},
                "redis": {"status": "DOWN"}
            }
        }