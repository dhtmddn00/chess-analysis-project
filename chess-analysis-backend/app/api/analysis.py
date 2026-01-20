"""
체스 분석 API 라우터

사용자의 체스 게임을 분석하고 개선 방향을 제시하는 메인 API 엔드포인트들
"""

import asyncio
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Any
from enum import Enum

from fastapi import APIRouter, HTTPException, BackgroundTasks, Query
from pydantic import BaseModel, Field, validator
from loguru import logger

from ..config import settings
from ..services.chess_api import ChessComAPI, ChessComAPIError, PlayerNotFoundError
from ..services.engine import StockfishEngine, analyze_multiple_games
from ..services.profiler import PlayerProfiler, create_player_profile
from ..services.recommendations import RecommendationEngine, generate_improvement_plan
from ..utils.cohort import CohortComparator, compare_player_to_cohort
from ..utils.pgn_parser import parse_chess_com_games, TimeControl, PGNParser


router = APIRouter()


class Platform(str, Enum):
    """지원하는 체스 플랫폼"""
    CHESS_COM = "chess.com"
    LICHESS = "lichess"  # 향후 지원


class AnalysisStatus(str, Enum):
    """분석 상태"""
    PENDING = "pending"
    COLLECTING = "collecting"
    PARSING = "parsing"
    ANALYZING = "analyzing"
    PROFILING = "profiling"
    COMPLETED = "completed"
    FAILED = "failed"


class AnalysisRequest(BaseModel):
    """분석 요청 모델"""
    username: str = Field(..., min_length=3, max_length=50, description="체스 플랫폼 사용자명")
    platform: Platform = Field(Platform.CHESS_COM, description="체스 플랫폼")
    game_count: int = Field(10, ge=5, le=settings.max_game_count, description="분석할 게임 수")
    time_controls: Optional[List[TimeControl]] = Field(None, description="분석할 시간 제어 (전체면 None)")
    include_improvement_plan: bool = Field(True, description="개선 계획 생성 여부")
    plan_weeks: int = Field(4, ge=2, le=12, description="개선 계획 기간 (주)")
    daily_time_minutes: int = Field(45, ge=15, le=120, description="일일 학습 시간 (분)")
    
    @validator('username')
    def validate_username(cls, v):
        if not v.replace('_', '').replace('-', '').isalnum():
            raise ValueError('사용자명에 특수문자가 포함되어 있습니다')
        return v.lower()


class AnalysisProgress(BaseModel):
    """분석 진행 상황"""
    analysis_id: str
    status: AnalysisStatus
    progress_percent: float = Field(0.0, ge=0.0, le=100.0)
    current_step: str
    estimated_remaining_seconds: Optional[int] = None
    message: str
    created_at: str
    updated_at: str
    error_message: Optional[str] = None


class AnalysisResult(BaseModel):
    """분석 결과"""
    analysis_id: str
    username: str
    platform: Platform
    
    # 기본 정보
    player_info: Dict[str, Any]
    games_analyzed: int
    analysis_date: str
    
    # 플레이어 프로파일
    player_profile: Dict[str, Any]
    
    # 코호트 비교
    cohort_comparison: Optional[Dict[str, Any]] = None
    
    # 개선 계획
    improvement_plan: Optional[Dict[str, Any]] = None
    
    # 요약 인사이트
    key_insights: List[str]
    quick_tips: List[str]


# 분석 작업 추적을 위한 인메모리 저장소
analysis_jobs: Dict[str, AnalysisProgress] = {}
analysis_results: Dict[str, Dict[str, Any]] = {}  # 분석 결과 저장소


@router.options("/analyze")
async def analyze_options():
    """CORS preflight 요청 처리"""
    return {"message": "OK"}


@router.post("/analyze", response_model=Dict[str, str])
async def start_analysis(
    request: AnalysisRequest,
    background_tasks: BackgroundTasks
):
    """
    체스 기보 분석 시작
    
    사용자의 최근 게임을 수집하고 분석을 시작합니다.
    분석은 백그라운드에서 실행되며, 상태는 별도 엔드포인트에서 확인할 수 있습니다.
    """
    analysis_id = str(uuid.uuid4())
    
    # 분석 작업 등록
    analysis_jobs[analysis_id] = AnalysisProgress(
        analysis_id=analysis_id,
        status=AnalysisStatus.PENDING,
        current_step="분석 대기 중",
        message=f"{request.username} 플레이어 분석을 시작합니다",
        created_at=datetime.utcnow().isoformat(),
        updated_at=datetime.utcnow().isoformat()
    )
    
    # 백그라운드에서 분석 실행
    background_tasks.add_task(
        run_analysis_pipeline,
        analysis_id,
        request
    )
    
    logger.info(f"분석 시작: {analysis_id} - {request.username} ({request.platform})")
    
    return {
        "analysis_id": analysis_id,
        "status": "pending",
        "message": "분석이 시작되었습니다. 상태 확인은 /api/v1/status/{analysis_id} 를 사용하세요.",
        "estimated_duration_minutes": "3"
    }


@router.get("/status/{analysis_id}", response_model=AnalysisProgress)
async def get_analysis_status(analysis_id: str):
    """
    분석 상태 확인
    
    진행 중인 분석의 현재 상태와 진행률을 반환합니다.
    """
    if analysis_id not in analysis_jobs:
        raise HTTPException(
            status_code=404,
            detail=f"분석 작업을 찾을 수 없습니다: {analysis_id}"
        )
    
    return analysis_jobs[analysis_id]


@router.get("/result/{analysis_id}", response_model=AnalysisResult)
async def get_analysis_result(analysis_id: str):
    """
    분석 결과 조회
    
    완료된 분석의 전체 결과를 반환합니다.
    """
    if analysis_id not in analysis_jobs:
        raise HTTPException(
            status_code=404,
            detail=f"분석 작업을 찾을 수 없습니다: {analysis_id}"
        )
    
    progress = analysis_jobs[analysis_id]
    
    if progress.status != AnalysisStatus.COMPLETED:
        raise HTTPException(
            status_code=400,
            detail=f"분석이 완료되지 않았습니다. 현재 상태: {progress.status}"
        )
    
    # 결과 데이터 조회
    if analysis_id not in analysis_results:
        raise HTTPException(
            status_code=404,
            detail="분석 결과를 찾을 수 없습니다."
        )
    
    return analysis_results[analysis_id]


@router.delete("/analysis/{analysis_id}")
async def cancel_analysis(analysis_id: str):
    """
    분석 작업 취소
    
    진행 중인 분석 작업을 취소합니다.
    """
    if analysis_id not in analysis_jobs:
        raise HTTPException(
            status_code=404,
            detail=f"분석 작업을 찾을 수 없습니다: {analysis_id}"
        )
    
    progress = analysis_jobs[analysis_id]
    
    if progress.status in [AnalysisStatus.COMPLETED, AnalysisStatus.FAILED]:
        raise HTTPException(
            status_code=400,
            detail=f"이미 완료된 작업은 취소할 수 없습니다: {progress.status}"
        )
    
    # 작업 취소 (실제로는 취소 플래그 설정 등이 필요)
    progress.status = AnalysisStatus.FAILED
    progress.current_step = "분석 취소됨"
    progress.message = "사용자에 의해 분석이 취소되었습니다"
    progress.updated_at = datetime.utcnow().isoformat()
    
    return {"message": "분석이 취소되었습니다", "analysis_id": analysis_id}


@router.get("/recent")
async def get_recent_analyses(
    limit: int = Query(10, ge=1, le=50),
    status: Optional[AnalysisStatus] = Query(None)
):
    """
    최근 분석 목록 조회
    
    최근 실행된 분석 작업들의 목록을 반환합니다.
    """
    # 필터링 및 정렬
    filtered_jobs = []
    
    for job in analysis_jobs.values():
        if status is None or job.status == status:
            filtered_jobs.append({
                "analysis_id": job.analysis_id,
                "status": job.status,
                "current_step": job.current_step,
                "progress_percent": job.progress_percent,
                "created_at": job.created_at,
                "updated_at": job.updated_at
            })
    
    # 생성 시간 역순 정렬
    filtered_jobs.sort(key=lambda x: x["created_at"], reverse=True)
    
    return {
        "analyses": filtered_jobs[:limit],
        "total_count": len(filtered_jobs),
        "limit": limit
    }


# 백그라운드 분석 파이프라인
async def run_analysis_pipeline(analysis_id: str, request: AnalysisRequest):
    """
    전체 분석 파이프라인 실행
    
    1. 게임 데이터 수집
    2. PGN 파싱
    3. 엔진 분석
    4. 플레이어 프로파일링
    5. 코호트 비교
    6. 개선 계획 생성
    """
    progress = analysis_jobs[analysis_id]
    
    try:
        # 1단계: 게임 데이터 수집
        await update_progress(progress, AnalysisStatus.COLLECTING, 10, 
                            "Chess.com에서 게임 데이터 수집 중")
        
        async with ChessComAPI() as api:
            games_data, player_info = await api.get_recent_games(
                request.username, request.game_count
            )
        
        if not games_data:
            raise ValueError("분석할 게임이 없습니다. 최근에 플레이한 게임이 있는지 확인해주세요.")
        
        logger.info(f"[{analysis_id}] 게임 수집 완료: {len(games_data)}개")
        
        # 2단계: PGN 파싱
        await update_progress(progress, AnalysisStatus.PARSING, 20, 
                            f"{len(games_data)}개 게임 파싱 중")
        
        parsed_games = parse_chess_com_games(games_data)
        
        # 시간 제어 필터링
        if request.time_controls:
            parsed_games = PGNParser.filter_games_by_criteria(
                parsed_games,
                request.username,
                time_controls=request.time_controls
            )
        else:
            parsed_games = PGNParser.filter_games_by_criteria(
                parsed_games,
                request.username
            )
        
        if not parsed_games:
            raise ValueError("필터링 후 분석할 게임이 없습니다.")
        
        logger.info(f"[{analysis_id}] 게임 파싱 완료: {len(parsed_games)}개")
        
        # 3단계: 엔진 분석
        await update_progress(progress, AnalysisStatus.ANALYZING, 30, 
                            f"{len(parsed_games)}개 게임 엔진 분석 중")
        
        def analysis_progress_callback(completed: int, total: int):
            percent = 30 + (completed / total) * 40  # 30-70%
            asyncio.create_task(update_progress(
                progress, AnalysisStatus.ANALYZING, percent,
                f"게임 분석 중 ({completed}/{total})"
            ))
        
        game_analyses = await analyze_multiple_games(
            parsed_games, 
            depth=settings.stockfish_depth_quick,
            progress_callback=analysis_progress_callback
        )
        
        logger.info(f"[{analysis_id}] 엔진 분석 완료: {len(game_analyses)}개")
        
        # 4단계: 플레이어 프로파일링
        await update_progress(progress, AnalysisStatus.PROFILING, 75, 
                            "플레이어 프로파일 생성 중")
        
        try:
            player_profile = create_player_profile(
                request.username, parsed_games, game_analyses
            )
            logger.info(f"[{analysis_id}] 프로파일링 완료")
        except Exception as e:
            logger.error(f"[{analysis_id}] 프로파일링 오류: {e}", exc_info=True)
            # 기본 프로파일로 대체
            from ..services.profiler import PlayerProfile
            player_profile = PlayerProfile(
                player_name=request.username,
                total_games=len(parsed_games),
                total_moves=sum(len(ga.move_analyses) for ga in game_analyses),
                average_rating=0,
                style_scores={},
                overall_acpl=0.0,
                win_rate=0.0,
                draw_rate=0.0,
                loss_rate=0.0,
                time_control_stats={},
                white_stats={},
                black_stats={},
                opening_repertoire={},
                style_tags=[]
            )
        
        # 5단계: 코호트 비교
        await update_progress(progress, AnalysisStatus.PROFILING, 85, 
                            "동레벨 플레이어와 비교 중")
        
        cohort_comparison = compare_player_to_cohort(player_profile, "chess.com")
        
        # 6단계: 개선 계획 생성
        improvement_plan = None
        if request.include_improvement_plan:
            await update_progress(progress, AnalysisStatus.PROFILING, 95, 
                                "개인 맞춤 개선 계획 생성 중")
            
            improvement_plan = generate_improvement_plan(
                player_profile, 
                cohort_comparison,
                request.plan_weeks,
                request.daily_time_minutes
            )
        
        # 7단계: 결과 정리 및 완료
        await update_progress(progress, AnalysisStatus.COMPLETED, 100, 
                            "분석 완료")
        
        # 인사이트 생성
        key_insights = generate_key_insights(player_profile, cohort_comparison)
        quick_tips = generate_quick_tips(player_profile, improvement_plan)
        
        # 결과 저장 (실제로는 데이터베이스에 저장)
        analysis_result = {
            "analysis_id": analysis_id,
            "username": request.username,
            "platform": request.platform,
            "player_info": player_info,
            "games_analyzed": len(parsed_games),
            "analysis_date": datetime.utcnow().isoformat(),
            "player_profile": serialize_profile(player_profile),
            "cohort_comparison": serialize_comparison(cohort_comparison),
            "improvement_plan": serialize_plan(improvement_plan),
            "key_insights": key_insights,
            "quick_tips": quick_tips
        }
        
        # 결과를 저장소에 저장
        analysis_results[analysis_id] = analysis_result
        
        logger.info(f"[{analysis_id}] 분석 완료: {request.username}")
        
    except PlayerNotFoundError:
        await update_progress(progress, AnalysisStatus.FAILED, 0,
                            "플레이어를 찾을 수 없습니다",
                            "입력한 사용자명이 올바른지 확인해주세요.")
    except ChessComAPIError as e:
        await update_progress(progress, AnalysisStatus.FAILED, 0,
                            "Chess.com API 오류가 발생했습니다",
                            str(e))
    except Exception as e:
        logger.error(f"[{analysis_id}] 분석 실패: {e}", exc_info=True)
        await update_progress(progress, AnalysisStatus.FAILED, 0,
                            "분석 중 오류가 발생했습니다",
                            str(e))


async def update_progress(
    progress: AnalysisProgress, 
    status: AnalysisStatus, 
    percent: float, 
    step: str,
    error_msg: Optional[str] = None
):
    """분석 진행 상황 업데이트"""
    progress.status = status
    progress.progress_percent = percent
    progress.current_step = step
    progress.updated_at = datetime.utcnow().isoformat()
    
    if status == AnalysisStatus.FAILED:
        progress.error_message = error_msg
        progress.message = "분석에 실패했습니다"
    else:
        progress.message = f"{step} ({percent:.0f}%)"
    
    # 예상 남은 시간 계산 (간단한 추정)
    if status not in [AnalysisStatus.COMPLETED, AnalysisStatus.FAILED]:
        remaining_percent = 100 - percent
        if remaining_percent > 0:
            # 대략적인 추정 (전체 3분 가정)
            progress.estimated_remaining_seconds = int((remaining_percent / 100) * 180)


def generate_key_insights(player_profile, cohort_comparison) -> List[str]:
    """핵심 인사이트 생성 - 더 구체적이고 친절한 설명"""
    insights = []
    
    # ACPL 기반 인사이트 (더 구체적으로)
    acpl = player_profile.overall_acpl
    if acpl < 25:
        insights.append(f"✨ 뛰어난 정확성을 보여줍니다! 평균 실수가 {acpl:.1f}점으로 매우 낮아, 각 수를 신중하게 계산하는 능력이 뛰어납니다. 이 수준을 유지하면서 더 공격적인 플레이를 시도해볼 수 있습니다.")
    elif acpl < 40:
        insights.append(f"👍 안정적인 플레이를 보여줍니다. 평균 실수가 {acpl:.1f}점으로 양호하며, 큰 실수 없이 게임을 운영하는 능력이 있습니다. 조금 더 과감한 전술적 시도를 해보시는 것을 추천합니다.")
    elif acpl < 60:
        insights.append(f"🎯 평균적인 정확성입니다. 평균 실수가 {acpl:.1f}점으로, 개선의 여지가 있습니다. 각 수를 두기 전에 '이 수가 무엇을 달성하는가?'를 한 번 더 생각해보세요.")
    else:
        insights.append(f"⚡ 실수 줄이기에 집중해보세요. 평균 실수가 {acpl:.1f}점으로 높은 편입니다. 후보수를 3개씩 찾아보고, 각각의 결과를 2-3수 앞까지 계산하는 습관을 길러보세요.")
    
    # 스타일 기반 인사이트 (더 자세한 설명과 한국어 이름)
    if hasattr(player_profile, 'style_scores') and player_profile.style_scores:
        # 딕셔너리 형태로 변환 (API 응답 형태)
        if isinstance(player_profile.style_scores, dict):
            style_scores = player_profile.style_scores
        else:
            style_scores = {dim.value: score.score for dim, score in player_profile.style_scores.items()}
        
        high_scores = [(dim, score) for dim, score in style_scores.items() if (isinstance(score, (int, float)) and score >= 70) or (hasattr(score, 'score') and score.score >= 70)]
        low_scores = [(dim, score) for dim, score in style_scores.items() if (isinstance(score, (int, float)) and score <= 30) or (hasattr(score, 'score') and score.score <= 30)]
        
        dim_names = {
            "aggression": "공격성",
            "tactical_dependency": "전술 의존도", 
            "endgame_technique": "엔드게임 기술",
            "lead_conversion": "우세 유지력",
            "opening_variety": "오프닝 다양성",
            "consistency": "플레이 일관성",
            "positional_orientation": "포지셔널 지향성",
            "time_management": "시간 관리",
            "risk_taking": "위험 감수성",
            "book_deviation": "창의성",
            "exchange_preference": "교환 선호도",
            "swindle_resistance": "역전 저항력",
            # StyleDimension enum 값들도 처리
            "StyleDimension.AGGRESSION": "공격성",
            "StyleDimension.TACTICAL_DEPENDENCY": "전술 의존도",
            "StyleDimension.ENDGAME_TECHNIQUE": "엔드게임 기술",
            "StyleDimension.LEAD_CONVERSION": "우세 유지력",
            "StyleDimension.OPENING_VARIETY": "오프닝 다양성",
            "StyleDimension.CONSISTENCY": "플레이 일관성",
            "StyleDimension.POSITIONAL_ORIENTATION": "포지셔널 지향성",
            "StyleDimension.TIME_MANAGEMENT": "시간 관리",
            "StyleDimension.RISK_TAKING": "위험 감수성",
            "StyleDimension.BOOK_DEVIATION": "창의성",
            "StyleDimension.EXCHANGE_PREFERENCE": "교환 선호도",
            "StyleDimension.SWINDLE_RESISTANCE": "역전 저항력"
        }
        
        if high_scores:
            # 점수 값 추출 헬퍼 함수
            def get_score_value(score):
                if isinstance(score, (int, float)):
                    return score
                elif hasattr(score, 'score'):
                    return score.score
                return 0
            
            # 차원명 정리 함수 (StyleDimension.XXX 형태를 깨끗하게 정리)
            def clean_dimension_name(dim_key):
                if isinstance(dim_key, str) and dim_key.startswith('StyleDimension.'):
                    clean_key = dim_key.replace('StyleDimension.', '').lower()
                    return dim_names.get(clean_key, dim_names.get(dim_key, dim_key))
                return dim_names.get(str(dim_key), str(dim_key))
            
            top_strength = max(high_scores, key=lambda x: get_score_value(x[1]))
            strength_name = clean_dimension_name(top_strength[0])
            strength_score = get_score_value(top_strength[1])
            
            # 강점에 따른 맞춤형 상세 설명
            strength_descriptions = {
                "창의성": "이론서에 없는 독창적인 수를 자주 구사하여 상대방을 당황시키는 능력이 뛰어납니다",
                "포지셔널 지향성": "장기적인 계획을 세우고 점진적으로 우위를 쌓아가는 전략적 사고가 우수합니다",
                "엔드게임 기술": "기물이 적어진 상황에서 정확한 계산과 기술적 우위를 보여줍니다",
                "전술 의존도": "복잡한 전술적 패턴을 빠르게 인식하고 실행하는 능력이 탁월합니다",
                "역전 저항력": "불리한 상황에서도 끝까지 포기하지 않고 기회를 만들어내는 정신력이 강합니다"
            }
            
            detail = strength_descriptions.get(strength_name, "이 영역에서 동일 레벨 대비 높은 수준을 보입니다")
            insights.append(f"💪 '{strength_name}'이 최고 강점입니다 ({strength_score:.0f}점)! {detail}. 앞으로 게임에서 이 스타일을 더욱 적극적으로 활용해보세요.")
        
        if low_scores:
            def get_score_value(score):
                if isinstance(score, (int, float)):
                    return score
                elif hasattr(score, 'score'):
                    return score.score
                return 0
            
            def clean_dimension_name(dim_key):
                if isinstance(dim_key, str) and dim_key.startswith('StyleDimension.'):
                    clean_key = dim_key.replace('StyleDimension.', '').lower()
                    return dim_names.get(clean_key, dim_names.get(dim_key, dim_key))
                return dim_names.get(str(dim_key), str(dim_key))
            
            main_weakness = min(low_scores, key=lambda x: get_score_value(x[1]))
            weakness_name = clean_dimension_name(main_weakness[0])
            weakness_score = get_score_value(main_weakness[1])
            
            # 약점에 따른 구체적인 개선 방안
            improvement_suggestions = {
                "엔드게임 기술": "체스닷컴의 엔드게임 연습이나 기본 메이트 패턴(킹+퀸, 킹+룩)을 매일 10분씩 연습해보세요",
                "시간 관리": "중요한 수에서는 시간을 투자하되, 자명한 수는 빠르게 두는 연습을 해보세요. 남은 시간을 주기적으로 확인하는 습관을 기르세요",
                "위험 감수성": "때로는 안전한 수보다 상대방을 압박할 수 있는 적극적인 수를 고려해보세요. 계산된 위험은 실력 향상에 도움됩니다",
                "공격성": "상대방 킹 주변의 약점을 찾아 압박하는 연습을 해보세요. 전술 퍼즐에서 공격적인 패턴을 많이 풀어보시길 권합니다",
                "일관성": "매일 일정한 시간에 체스를 두어 컨디션을 일정하게 유지하고, 게임 전 간단한 워밍업 퍼즐을 풀어보세요"
            }
            
            suggestion = improvement_suggestions.get(weakness_name, "관련 강의나 서적을 찾아 체계적으로 학습해보세요")
            insights.append(f"📚 '{weakness_name}' 영역 개선이 우선과제입니다 ({weakness_score:.0f}점). {suggestion}. 이 부분만 집중 보완해도 단기간에 큰 실력 향상을 경험하실 수 있습니다.")
    
    # 승률과 게임 패턴 기반 구체적 인사이트
    if hasattr(player_profile, 'win_rate') and hasattr(player_profile, 'total_games'):
        win_rate = player_profile.win_rate * 100
        total_games = player_profile.total_games
        
        if win_rate >= 70:
            insights.append(f"🏆 탁월한 성과입니다! {total_games}게임에서 {win_rate:.0f}% 승률을 기록했습니다. 이는 현재 레이팅 구간에서 매우 높은 수준으로, 더 높은 레이팅에 도전할 준비가 되었음을 의미합니다. 지금의 플레이 스타일을 유지하면서 한 단계 위 상대들과 경기해보세요.")
        elif win_rate >= 55:
            insights.append(f"👍 안정적인 성장세를 보이고 있습니다. {total_games}게임에서 {win_rate:.0f}% 승률을 달성했으며, 이는 꾸준한 실력 향상을 나타냅니다. 현재 페이스를 유지하면서 한두 가지 약점만 보완하면 더 큰 발전을 이룰 수 있을 것입니다.")
        elif win_rate >= 45:
            insights.append(f"⚖️ 균형 잡힌 실력을 보여줍니다. {total_games}게임에서 {win_rate:.0f}% 승률로, 현재 레이팅에 적합한 수준입니다. 특정 오프닝이나 엔드게임에 집중 투자하면 승률 향상을 기대할 수 있습니다.")
        else:
            insights.append(f"📈 실력 향상의 기회가 큽니다. {total_games}게임에서 {win_rate:.0f}% 승률로, 기본기 강화에 집중하면 단기간에 큰 발전을 보실 수 있습니다. 매일 15-20분 전술 퍼즐을 풀고, 패배한 게임을 엔진으로 분석하는 습관을 기르세요.")
    
    # ACPL과 게임 수 조합 분석
    if hasattr(player_profile, 'total_games'):
        games_count = player_profile.total_games
        if games_count >= 20:
            insights.append(f"📊 충분한 데이터 기반 분석입니다. {games_count}게임의 분석 결과로, 신뢰도 높은 스타일 진단을 제공했습니다. 이 분석을 바탕으로 체계적인 학습 계획을 세워보세요.")
        elif games_count >= 10:
            insights.append(f"📈 기본 패턴이 파악되었습니다. {games_count}게임 분석을 통해 현재 스타일의 윤곽이 드러났습니다. 더 많은 게임을 분석하면 더욱 정확한 진단이 가능합니다.")
        else:
            insights.append(f"🔍 초기 분석 단계입니다. {games_count}게임으로 기본적인 경향성을 파악했습니다. 20-30게임 정도 더 플레이한 후 재분석하면 더욱 정확한 스타일 진단을 받으실 수 있습니다.")
    
    # 추가 실용적 인사이트
    additional_insights = [
        "🎯 실력 향상 팁: 매 게임 후 '가장 아쉬웠던 수 3개'를 기록하고 엔진으로 확인하는 습관을 기르세요. 이는 실수 패턴을 빠르게 인식하는 데 도움됩니다.",
        "⏰ 시간 활용법: 오프닝에서 너무 많은 시간을 쓰지 마세요. 처음 10수는 평균 1분 이내로 두고, 복잡한 미들게임에서 시간을 투자하는 것이 효율적입니다.",
        "🧠 멘탈 관리: 연패가 시작되면 하루 휴식을 취하세요. 2-3연패 후에는 실전보다 퍼즐이나 학습에 집중하는 것이 더 효과적입니다.",
        "📖 학습 추천: 현재 레이팅에서는 전술(Tactics) > 엔드게임 > 오프닝 순으로 학습 우선순위를 두는 것을 권장합니다."
    ]
    
    # 기존 인사이트 수에 따라 추가 인사이트 선택
    remaining_slots = 6 - len(insights)  # 최대 6개까지
    if remaining_slots > 0:
        insights.extend(additional_insights[:remaining_slots])
    
    # 코호트 비교 인사이트 (더 구체적으로)
    if cohort_comparison:
        percentile = cohort_comparison.overall_percentile
        if percentile >= 80:
            insights.append(f"🌟 동일 레이팅 구간에서 상위 {100-percentile:.0f}%에 해당하는 우수한 실력입니다! 현재 플레이 스타일을 유지하면서 더 높은 레이팅을 도전해볼 시기입니다.")
        elif percentile >= 60:
            insights.append(f"👍 동일 레이팅 구간에서 평균 이상의 실력을 보여줍니다 (상위 {100-percentile:.0f}%). 한두 가지 약점만 보완하면 크게 성장할 수 있을 것입니다.")
        elif percentile <= 30:
            insights.append(f"⚡ 같은 레이팅대 평균보다 개선 여지가 큽니다 (하위 {percentile:.0f}%). 기본기 다지기에 집중하시면 단기간에 큰 발전을 보실 수 있을 것입니다.")
    
    return insights[:4]  # 최대 4개


def generate_quick_tips(player_profile, improvement_plan) -> List[str]:
    """즉시 실행 가능한 팁 생성"""
    tips = []
    
    # 기본 팁들
    tips.extend([
        "패배한 게임을 엔진으로 분석해 실수 패턴을 파악하세요",
        "매일 15-20분 전술 문제를 풀어 패턴 인식을 향상시키세요",
        "시간이 충분할 때는 후보수를 미리 생각해두는 습관을 기르세요"
    ])
    
    # 개선 계획 기반 맞춤 팁
    if improvement_plan and improvement_plan.improvement_areas:
        priority_area = improvement_plan.improvement_areas[0]
        
        if "전술" in priority_area.area_name:
            tips.append("체크, 캡처, 위협 수를 찾는 순서로 후보수를 검토하세요")
        elif "엔드게임" in priority_area.area_name:
            tips.append("킹+퀸 vs 킹, 킹+룩 vs 킹 메이트를 완벽히 익히세요")
        elif "오프닝" in priority_area.area_name:
            tips.append("주력 오프닝 1-2개를 선정해 15수까지 완전히 숙지하세요")
    
    return tips[:5]  # 최대 5개


def serialize_profile(profile) -> Dict[str, Any]:
    """프로파일 객체를 직렬화"""
    if not profile:
        return {}
    
    # 실제로는 더 정교한 직렬화 필요
    return {
        "player_name": profile.player_name,
        "total_games": profile.total_games,
        "average_rating": profile.average_rating,
        "overall_acpl": profile.overall_acpl,
        "win_rate": profile.win_rate,
        "style_tags": profile.style_tags,
        # 스타일 점수는 간소화해서 포함
        "style_scores": {
            dim.value: score.score 
            for dim, score in profile.style_scores.items()
        }
    }


def serialize_comparison(comparison) -> Optional[Dict[str, Any]]:
    """코호트 비교 결과 직렬화"""
    if not comparison:
        return None
    
    return {
        "overall_percentile": comparison.overall_percentile,
        "overall_level": comparison.overall_level.value,
        "strengths": comparison.strengths,
        "weaknesses": comparison.weaknesses,
        "cohort_info": {
            "rating_range": f"{comparison.cohort_bucket.rating_min}-{comparison.cohort_bucket.rating_max}",
            "time_control": comparison.cohort_bucket.time_control.value
        }
    }


def serialize_plan(plan) -> Optional[Dict[str, Any]]:
    """개선 계획 직렬화"""
    if not plan:
        return None
    
    return {
        "plan_title": plan.plan_title,
        "duration_weeks": plan.duration_weeks,
        "target_rating_gain": plan.target_rating_gain,
        "overall_objectives": plan.overall_objectives,
        "improvement_areas": [
            {
                "area_name": area.area_name,
                "description": area.description,
                "priority": area.priority.value,
                "current_level": area.current_level,
                "target_level": area.target_level
            } 
            for area in plan.improvement_areas[:3]  # 상위 3개만
        ],
        "weekly_summary": [
            {
                "week": week.week_number,
                "theme": week.theme,
                "objectives": week.objectives,
                "practice_games": week.practice_games
            }
            for week in plan.weekly_plans
        ],
        "key_principles": plan.key_principles,
        "avoid_habits": plan.avoid_habits
    }


@router.get("/analysis/stats")
async def get_analysis_stats():
    """시스템 통계 정보 조회"""
    try:
        # Redis 연결 상태 확인
        from ..redis_client import redis_client
        
        redis_status = "UP"
        queue_size = 0
        try:
            # Redis ping 테스트
            redis_client.ping()
            # 큐 크기 확인 (예시)
            queue_size = redis_client.llen("analysis_queue") or 0
        except Exception as e:
            logger.warning(f"Redis 연결 오류: {e}")
            redis_status = "DOWN"
        
        # 분석 통계 (실제로는 데이터베이스에서 가져와야 함)
        analysis_stats = {
            "total": len(analysis_results),
            "pending": len([r for r in analysis_results.values() if r.get("status") == "pending"]),
            "in_progress": len([r for r in analysis_results.values() if r.get("status") == "in_progress"]),
            "completed": len([r for r in analysis_results.values() if r.get("status") == "completed"]),
            "failed": len([r for r in analysis_results.values() if r.get("status") == "failed"])
        }
        
        return {
            "analysis_stats": analysis_stats,
            "queue_stats": {
                "queue_size": queue_size,
                "status": redis_status,
                "redis_status": redis_status,
                "timestamp": datetime.utcnow().isoformat()
            }
        }
        
    except Exception as e:
        logger.error(f"Stats 조회 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="통계 정보를 가져올 수 없습니다")


@router.post("/analysis")
async def create_analysis(request: AnalysisRequest, background_tasks: BackgroundTasks):
    """새로운 체스 분석 요청 생성"""
    try:
        # 분석 ID 생성
        analysis_id = str(uuid.uuid4())
        
        # 초기 분석 객체 생성
        analysis = {
            "id": analysis_id,
            "username": request.username,
            "platform": request.platform.value if hasattr(request.platform, 'value') else str(request.platform),
            "status": "PENDING",
            "gameCount": request.game_count,
            "progressPercent": 0,
            "currentStep": "분석 대기 중",
            "createdAt": datetime.utcnow().isoformat(),
            "analysisDurationSeconds": 0
        }
        
        # 진행 상황 추적을 위한 객체
        progress = AnalysisProgress(
            analysis_id=analysis_id,
            status=AnalysisStatus.PENDING,
            progress_percent=0,
            current_step="분석 대기 중",
            message="분석 요청이 접수되었습니다",
            created_at=datetime.utcnow().isoformat(),
            updated_at=datetime.utcnow().isoformat()
        )
        
        # 메모리에 저장 (실제로는 데이터베이스에 저장해야 함)
        analysis_jobs[analysis_id] = progress
        analysis_results[analysis_id] = analysis
        
        # 백그라운드에서 분석 실행
        background_tasks.add_task(run_analysis_pipeline, analysis_id, request)
        
        logger.info(f"분석 요청 생성: {analysis_id} for {request.username}")
        
        return analysis
        
    except Exception as e:
        logger.error(f"분석 생성 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="분석 요청을 생성할 수 없습니다")


@router.get("/analysis/{analysis_id}")
async def get_analysis(analysis_id: str):
    """분석 결과 조회"""
    try:
        if analysis_id not in analysis_results:
            raise HTTPException(status_code=404, detail="분석 결과를 찾을 수 없습니다")
        
        analysis = analysis_results[analysis_id]
        progress = analysis_jobs.get(analysis_id)
        
        # 진행 상황 정보 업데이트
        if progress:
            analysis.update({
                "status": progress.status.value if hasattr(progress.status, 'value') else str(progress.status),
                "progressPercent": progress.progress_percent,
                "currentStep": progress.current_step,
                "message": progress.message
            })
        
        return analysis
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"분석 조회 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="분석 결과를 조회할 수 없습니다")


@router.get("/analysis/{analysis_id}/status")
async def get_analysis_status(analysis_id: str):
    """분석 상태 조회"""
    try:
        if analysis_id not in analysis_jobs:
            raise HTTPException(status_code=404, detail="분석 상태를 찾을 수 없습니다")
        
        progress = analysis_jobs[analysis_id]
        
        return {
            "id": progress.analysis_id,
            "status": progress.status.value if hasattr(progress.status, 'value') else str(progress.status),
            "progress": progress.progress_percent,
            "current_step": progress.current_step,
            "message": progress.message,
            "created_at": progress.created_at,
            "updated_at": progress.updated_at,
            "error_message": progress.error_message
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"상태 조회 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="분석 상태를 조회할 수 없습니다")