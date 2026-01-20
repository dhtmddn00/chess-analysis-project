"""
개선사항 추출 및 실행계획 생성 엔진

플레이어 프로파일과 코호트 비교 결과를 바탕으로
구체적이고 실행 가능한 개선 방향과 훈련 계획을 생성합니다.
"""

from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, asdict
from enum import Enum
import json
from datetime import datetime, timedelta

from loguru import logger
from ..services.profiler import StyleDimension, PlayerProfile, Evidence
from ..utils.cohort import PlayerComparison, PerformanceLevel
from ..config import settings


class PriorityLevel(Enum):
    """개선 우선순위 등급"""
    CRITICAL = "critical"    # 즉시 개선 필요
    HIGH = "high"           # 높은 우선순위
    MEDIUM = "medium"       # 중간 우선순위
    LOW = "low"             # 낮은 우선순위


class TrainingType(Enum):
    """훈련 유형"""
    TACTICS = "tactics"           # 전술 훈련
    OPENING = "opening"          # 오프닝 연구
    ENDGAME = "endgame"         # 엔드게임 연습
    POSITIONAL = "positional"   # 포지셔널 이해
    TIME_MANAGEMENT = "time"    # 시간 관리
    ANALYSIS = "analysis"       # 게임 분석
    PRACTICE = "practice"       # 실전 연습


@dataclass
class ImprovementArea:
    """개선 영역"""
    area_name: str
    description: str
    priority: PriorityLevel
    current_level: str           # 현재 수준 설명
    target_level: str           # 목표 수준 설명
    evidence: List[Evidence]    # 근거 자료
    impact_score: float         # 개선 시 예상 효과 (1-10)


@dataclass
class TrainingTask:
    """훈련 과제"""
    task_id: str
    name: str
    training_type: TrainingType
    description: str
    duration_minutes: int
    frequency_per_week: int
    
    # 구체적 지시사항
    instructions: List[str]
    resources: List[str]        # 추천 리소스 (사이트, 책 등)
    
    # 측정 지표
    success_metrics: List[str]
    target_improvement: str


@dataclass
class WeeklyPlan:
    """주간 계획"""
    week_number: int
    theme: str                  # 주간 테마
    tasks: List[TrainingTask]
    total_time_minutes: int
    
    # 실전 연습
    practice_games: int
    practice_time_control: str
    practice_focus: str
    
    # 주간 목표
    objectives: List[str]
    kpi_targets: Dict[str, float]  # 측정 가능한 목표들


@dataclass
class ImprovementPlan:
    """종합 개선 계획"""
    player_name: str
    plan_title: str
    duration_weeks: int
    created_at: str
    
    # 개선 영역들
    improvement_areas: List[ImprovementArea]
    
    # 주간별 계획
    weekly_plans: List[WeeklyPlan]
    
    # 전체 목표
    overall_objectives: List[str]
    target_rating_gain: int     # 목표 레이팅 상승폭
    
    # 금지사항/주의사항
    avoid_habits: List[str]
    key_principles: List[str]


class RecommendationEngine:
    """
    개선사항 추천 엔진
    
    플레이어 분석 결과를 바탕으로 개인화된 개선 계획을 생성합니다.
    """
    
    def __init__(self):
        self.training_database = self._initialize_training_database()
        self.improvement_rules = self._initialize_improvement_rules()
        
    def generate_improvement_plan(
        self,
        profile: PlayerProfile,
        comparison: Optional[PlayerComparison] = None,
        target_weeks: int = 4,
        daily_time_minutes: int = 45
    ) -> ImprovementPlan:
        """
        종합 개선 계획 생성
        
        Args:
            profile: 플레이어 프로파일
            comparison: 코호트 비교 결과 (옵션)
            target_weeks: 계획 기간 (주)
            daily_time_minutes: 일일 학습 시간 (분)
            
        Returns:
            완성된 개선 계획
        """
        logger.info(f"개선 계획 생성 시작: {profile.player_name}")
        
        # 1. 개선 영역 식별
        improvement_areas = self._identify_improvement_areas(profile, comparison)
        
        # 2. 우선순위 설정
        prioritized_areas = self._prioritize_areas(improvement_areas, profile)
        
        # 3. 주간 계획 생성
        weekly_plans = self._generate_weekly_plans(
            prioritized_areas, target_weeks, daily_time_minutes
        )
        
        # 4. 전체 목표 및 원칙 설정
        overall_objectives = self._generate_overall_objectives(prioritized_areas, profile)
        target_rating_gain = self._estimate_rating_gain(prioritized_areas, target_weeks)
        avoid_habits = self._generate_avoid_habits(profile, prioritized_areas)
        key_principles = self._generate_key_principles(prioritized_areas)
        
        plan = ImprovementPlan(
            player_name=profile.player_name,
            plan_title=f"{profile.player_name}의 {target_weeks}주 체스 실력향상 계획",
            duration_weeks=target_weeks,
            created_at=datetime.now().isoformat(),
            improvement_areas=prioritized_areas,
            weekly_plans=weekly_plans,
            overall_objectives=overall_objectives,
            target_rating_gain=target_rating_gain,
            avoid_habits=avoid_habits,
            key_principles=key_principles
        )
        
        logger.info(f"개선 계획 생성 완료: {len(prioritized_areas)}개 영역, {target_weeks}주 계획")
        return plan
    
    def _identify_improvement_areas(
        self, 
        profile: PlayerProfile,
        comparison: Optional[PlayerComparison]
    ) -> List[ImprovementArea]:
        """개선 영역 식별"""
        
        areas = []
        
        # 1. 기본 지표 기반 개선 영역
        if profile.overall_acpl > 60:  # 높은 ACPL
            areas.append(ImprovementArea(
                area_name="수의 정확성",
                description="평균 센티폰 손실(ACPL)이 높아 수의 정확성 개선이 필요합니다",
                priority=PriorityLevel.HIGH,
                current_level=f"ACPL {profile.overall_acpl:.1f} (부정확한 수 선택 빈번)",
                target_level=f"ACPL {profile.overall_acpl * 0.8:.1f} (20% 개선)",
                evidence=[],
                impact_score=8.5
            ))
        
        # 2. 스타일 차원 기반 개선 영역
        for dimension, style_score in profile.style_scores.items():
            area = self._analyze_style_dimension(dimension, style_score, profile)
            if area:
                areas.append(area)
        
        # 3. 코호트 비교 기반 개선 영역
        if comparison:
            cohort_areas = self._analyze_cohort_weaknesses(comparison)
            areas.extend(cohort_areas)
        
        # 4. 오프닝 레퍼토리 분석
        opening_areas = self._analyze_opening_repertoire(profile)
        areas.extend(opening_areas)
        
        return areas
    
    def _analyze_style_dimension(
        self, 
        dimension: StyleDimension, 
        style_score, 
        profile: PlayerProfile
    ) -> Optional[ImprovementArea]:
        """스타일 차원별 개선 영역 분석"""
        
        score = style_score.score
        
        # 낮은 점수 = 개선 필요 영역
        if score < 35:
            priority = PriorityLevel.HIGH
        elif score < 50:
            priority = PriorityLevel.MEDIUM
        else:
            return None  # 개선이 특별히 필요하지 않음
        
        # 차원별 맞춤 분석
        if dimension == StyleDimension.TACTICAL_DEPENDENCY:
            return ImprovementArea(
                area_name="전술 능력",
                description="전술적 기회를 놓치거나 전술 실행 정확도가 낮습니다",
                priority=priority,
                current_level=f"전술 점수 {score:.0f}/100 (코호트 평균 이하)",
                target_level="전술 점수 65/100 이상 (안정적 전술 실행)",
                evidence=style_score.evidence[:3],
                impact_score=9.0
            )
            
        elif dimension == StyleDimension.ENDGAME_TECHNIQUE:
            return ImprovementArea(
                area_name="엔드게임 기술",
                description="엔드게임에서 우세를 승리로 전환하는 능력이 부족합니다",
                priority=priority,
                current_level=f"엔드게임 점수 {score:.0f}/100",
                target_level="엔드게임 점수 65/100 이상 (기본 엔드게임 마스터)",
                evidence=style_score.evidence[:3],
                impact_score=7.5
            )
            
        elif dimension == StyleDimension.LEAD_CONVERSION:
            return ImprovementArea(
                area_name="우세형세 유지",
                description="우세한 포지션에서 승리를 확실히 하는 능력이 부족합니다",
                priority=PriorityLevel.HIGH,
                current_level=f"우세 유지 점수 {score:.0f}/100",
                target_level="우세 유지 점수 70/100 이상 (안정적 승부처리)",
                evidence=style_score.evidence[:3],
                impact_score=8.0
            )
            
        elif dimension == StyleDimension.OPENING_VARIETY:
            return ImprovementArea(
                area_name="오프닝 레퍼토리",
                description="오프닝 다양성이 부족하여 예측 가능한 플레이 패턴을 보입니다",
                priority=PriorityLevel.MEDIUM,
                current_level=f"오프닝 다양성 {score:.0f}/100",
                target_level="오프닝 다양성 60/100 이상 (안정적 레퍼토리)",
                evidence=style_score.evidence[:3],
                impact_score=6.5
            )
            
        elif dimension == StyleDimension.TIME_MANAGEMENT:
            return ImprovementArea(
                area_name="시간 관리",
                description="시간 배분이 비효율적이거나 시간 압박 상황에서 성과가 떨어집니다",
                priority=PriorityLevel.MEDIUM,
                current_level=f"시간 관리 점수 {score:.0f}/100",
                target_level="시간 관리 점수 65/100 이상 (효율적 시간 사용)",
                evidence=style_score.evidence[:3],
                impact_score=7.0
            )
            
        else:
            # 기타 차원들에 대한 일반적 처리
            dimension_names = {
                StyleDimension.POSITIONAL_ORIENTATION: "포지셔널 이해",
                StyleDimension.CONSISTENCY: "경기 안정성",
                StyleDimension.SWINDLE_RESISTANCE: "역전 대응능력"
            }
            
            area_name = dimension_names.get(dimension, dimension.value)
            
            return ImprovementArea(
                area_name=area_name,
                description=f"{area_name} 영역에서 개선이 필요합니다",
                priority=priority,
                current_level=f"{area_name} 점수 {score:.0f}/100",
                target_level=f"{area_name} 점수 60/100 이상",
                evidence=style_score.evidence[:3],
                impact_score=6.0
            )
        
        return None
    
    def _analyze_cohort_weaknesses(self, comparison: PlayerComparison) -> List[ImprovementArea]:
        """코호트 비교 결과에서 약점 분석"""
        areas = []
        
        # ACPL 비교
        if comparison.acpl_percentile < 25:
            areas.append(ImprovementArea(
                area_name="수의 정확성 (코호트 비교)",
                description=f"ACPL이 동레벨 플레이어 하위 {comparison.acpl_percentile:.0f}%에 해당합니다",
                priority=PriorityLevel.HIGH,
                current_level=f"하위 {comparison.acpl_percentile:.0f}% (코호트 내)",
                target_level="상위 50% 이상 (코호트 내)",
                evidence=[],
                impact_score=8.5
            ))
        
        # 블런더율 비교
        if comparison.blunder_rate_percentile < 25:
            areas.append(ImprovementArea(
                area_name="블런더 억제 (코호트 비교)",
                description=f"블런더 발생률이 동레벨 플레이어 하위 {comparison.blunder_rate_percentile:.0f}%에 해당합니다",
                priority=PriorityLevel.CRITICAL,
                current_level=f"하위 {comparison.blunder_rate_percentile:.0f}% (블런더 빈발)",
                target_level="상위 50% 이상 (안정적 플레이)",
                evidence=[],
                impact_score=9.5
            ))
        
        return areas
    
    def _analyze_opening_repertoire(self, profile: PlayerProfile) -> List[ImprovementArea]:
        """오프닝 레퍼토리 분석"""
        areas = []
        
        if not profile.opening_repertoire:
            return areas
        
        # 승률이 낮은 오프닝들 식별
        weak_openings = []
        for eco, stats in profile.opening_repertoire.items():
            if stats['games'] >= 3 and stats.get('win_rate', 0) < 0.3:
                weak_openings.append(eco)
        
        if weak_openings:
            areas.append(ImprovementArea(
                area_name="문제 오프닝 개선",
                description=f"일부 오프닝에서 지속적으로 낮은 성과를 보입니다: {', '.join(weak_openings[:3])}",
                priority=PriorityLevel.MEDIUM,
                current_level=f"{len(weak_openings)}개 오프닝에서 30% 미만 승률",
                target_level="모든 주력 오프닝에서 40% 이상 승률",
                evidence=[],
                impact_score=6.5
            ))
        
        return areas
    
    def _prioritize_areas(
        self, 
        areas: List[ImprovementArea], 
        profile: PlayerProfile
    ) -> List[ImprovementArea]:
        """개선 영역 우선순위 설정"""
        
        # 우선순위 점수 계산 (높을수록 우선)
        def priority_score(area: ImprovementArea) -> float:
            base_score = {
                PriorityLevel.CRITICAL: 100,
                PriorityLevel.HIGH: 80,
                PriorityLevel.MEDIUM: 60,
                PriorityLevel.LOW: 40
            }[area.priority]
            
            # 임팩트 스코어 반영
            impact_bonus = area.impact_score * 5
            
            # 플레이어 레벨별 가중치
            if profile.average_rating < 1200:
                # 초급자: 전술과 기본기 우선
                if "전술" in area.area_name or "블런더" in area.area_name:
                    impact_bonus += 20
            elif profile.average_rating < 1600:
                # 중급자: 오프닝과 엔드게임 병행
                if "엔드게임" in area.area_name or "오프닝" in area.area_name:
                    impact_bonus += 15
            else:
                # 고급자: 포지셔널과 일관성 중시
                if "포지셔널" in area.area_name or "일관성" in area.area_name:
                    impact_bonus += 10
            
            return base_score + impact_bonus
        
        # 우선순위별 정렬
        sorted_areas = sorted(areas, key=priority_score, reverse=True)
        
        # 상위 5개 영역만 선택 (너무 많으면 집중도 떨어짐)
        return sorted_areas[:5]
    
    def _generate_weekly_plans(
        self, 
        areas: List[ImprovementArea], 
        weeks: int, 
        daily_time: int
    ) -> List[WeeklyPlan]:
        """주간별 상세 계획 생성"""
        
        weekly_plans = []
        weekly_time = daily_time * 7  # 주간 총 시간
        
        for week in range(1, weeks + 1):
            # 주간 테마 설정 (회전식)
            if week == 1:
                theme = "기초 강화 및 약점 파악"
                focus_areas = areas[:2]
            elif week == 2:
                theme = "핵심 기술 집중 훈련"
                focus_areas = areas[1:3] if len(areas) > 2 else areas
            elif week == 3:
                theme = "종합 적용 및 실전 연습"
                focus_areas = areas[:3]
            else:
                theme = "완성도 향상 및 안정화"
                focus_areas = areas
            
            # 주간 과제 생성
            tasks = self._generate_weekly_tasks(focus_areas, week, weekly_time)
            
            # 실전 연습 계획
            practice_games = max(3, min(10, weekly_time // 60))  # 시간에 따라 조절
            practice_focus = focus_areas[0].area_name if focus_areas else "전반적 개선"
            
            # 주간 목표
            objectives = self._generate_weekly_objectives(focus_areas, week)
            kpi_targets = self._generate_kpi_targets(focus_areas, week)
            
            weekly_plan = WeeklyPlan(
                week_number=week,
                theme=theme,
                tasks=tasks,
                total_time_minutes=sum(task.duration_minutes * task.frequency_per_week for task in tasks),
                practice_games=practice_games,
                practice_time_control="10+0" if week <= 2 else "15+10",  # 점진적 시간 증가
                practice_focus=practice_focus,
                objectives=objectives,
                kpi_targets=kpi_targets
            )
            
            weekly_plans.append(weekly_plan)
        
        return weekly_plans
    
    def _generate_weekly_tasks(
        self, 
        focus_areas: List[ImprovementArea], 
        week: int, 
        weekly_time: int
    ) -> List[TrainingTask]:
        """주간 훈련 과제 생성"""
        
        tasks = []
        remaining_time = weekly_time
        
        for i, area in enumerate(focus_areas):
            if remaining_time <= 0:
                break
            
            # 영역별 시간 배분
            if i == 0:  # 첫 번째 영역 (가장 중요)
                allocated_time = min(remaining_time * 0.4, 180)  # 최대 3시간
            elif i == 1:  # 두 번째 영역
                allocated_time = min(remaining_time * 0.3, 120)  # 최대 2시간
            else:  # 나머지 영역들
                allocated_time = min(remaining_time / max(1, len(focus_areas) - 2), 90)
            
            # 영역별 맞춤 과제 생성
            area_tasks = self._create_tasks_for_area(area, week, allocated_time)
            tasks.extend(area_tasks)
            
            remaining_time -= sum(task.duration_minutes * task.frequency_per_week for task in area_tasks)
        
        # 남은 시간이 있으면 게임 분석 과제 추가
        if remaining_time > 30:
            tasks.append(TrainingTask(
                task_id=f"analysis_w{week}",
                name="게임 분석 및 리뷰",
                training_type=TrainingType.ANALYSIS,
                description="자신의 패배 게임을 엔진으로 분석하고 실수 패턴 파악",
                duration_minutes=30,
                frequency_per_week=2,
                instructions=[
                    "최근 패배한 게임 1-2개 선택",
                    "엔진 분석으로 주요 실수 3개 이상 찾기",
                    "실수 패턴과 개선 방안 노트 작성",
                    "같은 유형의 포지션 추가 연습"
                ],
                resources=["Chess.com 분석 도구", "Lichess 스터디"],
                success_metrics=["분석한 게임 수", "발견한 실수 패턴 수"],
                target_improvement="동일한 실수 반복 50% 감소"
            ))
        
        return tasks
    
    def _create_tasks_for_area(
        self, 
        area: ImprovementArea, 
        week: int, 
        allocated_time: float
    ) -> List[TrainingTask]:
        """개선 영역별 맞춤 과제 생성"""
        
        tasks = []
        
        if "전술" in area.area_name:
            tasks.extend(self._create_tactical_tasks(area, week, allocated_time))
        elif "엔드게임" in area.area_name:
            tasks.extend(self._create_endgame_tasks(area, week, allocated_time))
        elif "오프닝" in area.area_name:
            tasks.extend(self._create_opening_tasks(area, week, allocated_time))
        elif "우세" in area.area_name or "유지" in area.area_name:
            tasks.extend(self._create_conversion_tasks(area, week, allocated_time))
        elif "시간" in area.area_name:
            tasks.extend(self._create_time_management_tasks(area, week, allocated_time))
        else:
            # 일반적인 과제
            tasks.extend(self._create_general_tasks(area, week, allocated_time))
        
        return tasks
    
    def _create_tactical_tasks(self, area: ImprovementArea, week: int, time: float) -> List[TrainingTask]:
        """전술 훈련 과제 생성"""
        
        return [
            TrainingTask(
                task_id=f"tactics_basic_w{week}",
                name="기본 전술 패턴 훈련",
                training_type=TrainingType.TACTICS,
                description="포크, 핀, 스큐어 등 기본 전술 패턴을 반복 학습",
                duration_minutes=20,
                frequency_per_week=5,
                instructions=[
                    "매일 20분간 전술 문제 풀이",
                    "틀린 문제는 3번 이상 반복",
                    "패턴별로 최소 10개 문제씩 해결",
                    "90% 이상 정답률 달성까지 지속"
                ],
                resources=[
                    "Chess.com 전술 트레이너",
                    "Lichess Puzzle Storm",
                    "Chess Tempo 기본 전술"
                ],
                success_metrics=["해결한 문제 수 (주간 700개 목표)", "정답률 (%)", "평균 해결 시간"],
                target_improvement="전술 정답률 85% → 90% 이상"
            ),
            TrainingTask(
                task_id=f"tactics_timed_w{week}",
                name="시간 제한 전술 훈련",
                training_type=TrainingType.TACTICS,
                description="실전 시간 압박 상황에서의 전술 능력 향상",
                duration_minutes=15,
                frequency_per_week=3,
                instructions=[
                    "문제당 30초 제한으로 전술 문제 풀이",
                    "첫 직감을 믿고 빠르게 판단",
                    "틀려도 시간 내에 답 제출",
                    "패턴 인식 속도 향상에 집중"
                ],
                resources=["Chess.com Puzzle Rush", "Lichess Puzzle Racer"],
                success_metrics=["시간 내 해결한 문제 수", "연속 정답 기록"],
                target_improvement="30초 내 전술 문제 해결률 70% 이상"
            )
        ]
    
    def _create_endgame_tasks(self, area: ImprovementArea, week: int, time: float) -> List[TrainingTask]:
        """엔드게임 훈련 과제 생성"""
        
        return [
            TrainingTask(
                task_id=f"endgame_basic_w{week}",
                name="기본 엔드게임 마스터",
                training_type=TrainingType.ENDGAME,
                description="킹+퀸 vs 킹, 킹+룩 vs 킹 등 기본 메이트 패턴 숙달",
                duration_minutes=25,
                frequency_per_week=4,
                instructions=[
                    "킹+퀸 vs 킹 메이트를 10수 이내로 완성",
                    "킹+룩 vs 킹 메이트를 15수 이내로 완성",
                    "킹+투비숍 vs 킹 메이트 연습",
                    "각 패턴마다 10회 이상 반복 연습"
                ],
                resources=[
                    "Chess.com 엔드게임 트레이너",
                    "Lichess Practice",
                    "엔드게임 데이터베이스"
                ],
                success_metrics=["메이트 완성 시간", "실수 없이 완성한 횟수"],
                target_improvement="기본 메이트 패턴 100% 정확도 달성"
            ),
            TrainingTask(
                task_id=f"endgame_practical_w{week}",
                name="실전 엔드게임 연습",
                training_type=TrainingType.ENDGAME,
                description="룩+폰 vs 룩, 퀸+폰 vs 퀸 등 복잡한 엔드게임 학습",
                duration_minutes=30,
                frequency_per_week=3,
                instructions=[
                    "필리도르와 루치나 포지션 원리 학습",
                    "폰 엔드게임에서 왕의 활용 연습",
                    "드로우 홀딩 테크닉 숙달",
                    "우세한 엔드게임을 승리로 전환하는 방법 연습"
                ],
                resources=[
                    "Dvoretsky's Endgame Manual",
                    "Chess.com 엔드게임 코스",
                    "100 Endgames You Must Know"
                ],
                success_metrics=["드로우 홀딩 성공률", "우세 포지션 승률"],
                target_improvement="엔드게임 승률 +15%p 향상"
            )
        ]
    
    def _create_opening_tasks(self, area: ImprovementArea, week: int, time: float) -> List[TrainingTask]:
        """오프닝 훈련 과제 생성"""
        
        return [
            TrainingTask(
                task_id=f"opening_repertoire_w{week}",
                name="오프닝 레퍼토리 정리",
                training_type=TrainingType.OPENING,
                description="백/흑 각각 1-2개 주력 오프닝 라인 완성",
                duration_minutes=30,
                frequency_per_week=3,
                instructions=[
                    "백번에서 1개 주력 오프닝 선택 (e4 or d4)",
                    "흑번에서 e4와 d4에 대한 응답 각각 1개씩 선택",
                    "각 라인의 주요 변형 15수까지 암기",
                    "일반적인 아이디어와 전형적인 계획 학습"
                ],
                resources=[
                    "Chess.com 오프닝 탐색기",
                    "Lichess 마스터 게임 DB",
                    "ChessBase 오프닝 백과사전"
                ],
                success_metrics=["암기한 변형 수", "오프닝에서의 승률"],
                target_improvement="오프닝 15수까지 실수 없이 진행"
            )
        ]
    
    def _create_conversion_tasks(self, area: ImprovementArea, week: int, time: float) -> List[TrainingTask]:
        """우세형세 유지 훈련 과제 생성"""
        
        return [
            TrainingTask(
                task_id=f"conversion_w{week}",
                name="우세형세 승리 전환 훈련",
                training_type=TrainingType.POSITIONAL,
                description="유리한 포지션에서 실수 없이 승리를 확정하는 기술 연습",
                duration_minutes=25,
                frequency_per_week=3,
                instructions=[
                    "우세한 포지션에서 안전한 수 선택 원칙 학습",
                    "불필요한 컴플리케이션 피하는 방법 연습",
                    "시간 관리: 우세할 때는 충분한 시간 사용",
                    "간소화 vs 복잡화 판단 기준 학습"
                ],
                resources=[
                    "실전 게임 분석",
                    "마스터 게임 연구",
                    "포지셔널 플레이 서적"
                ],
                success_metrics=["우세 포지션 승률", "우세에서의 블런더 횟수"],
                target_improvement="우세형세(+1.5 이상)에서 승률 90% 이상"
            )
        ]
    
    def _create_time_management_tasks(self, area: ImprovementArea, week: int, time: float) -> List[TrainingTask]:
        """시간 관리 훈련 과제 생성"""
        
        return [
            TrainingTask(
                task_id=f"time_mgmt_w{week}",
                name="시간 관리 체계 구축",
                training_type=TrainingType.TIME_MANAGEMENT,
                description="각 게임 페이즈별 시간 사용 전략 수립 및 연습",
                duration_minutes=0,  # 실전 게임에서 적용
                frequency_per_week=7,
                instructions=[
                    "오프닝: 처음 10수는 수당 평균 30초 이내",
                    "미들게임: 복잡한 포지션에서만 3분 이상 사용",
                    "엔드게임: 계산이 필요한 순간에 충분한 시간 투자",
                    "매 게임 후 시간 사용 패턴 리뷰"
                ],
                resources=[
                    "Chess.com 시간 분석 도구",
                    "개인 시간 관리 체크리스트"
                ],
                success_metrics=["시간 초과 횟수", "시간 압박 상황에서의 정확도"],
                target_improvement="시간 압박으로 인한 실수 50% 감소"
            )
        ]
    
    def _create_general_tasks(self, area: ImprovementArea, week: int, time: float) -> List[TrainingTask]:
        """일반적인 훈련 과제 생성"""
        
        return [
            TrainingTask(
                task_id=f"general_w{week}",
                name=f"{area.area_name} 집중 훈련",
                training_type=TrainingType.PRACTICE,
                description=area.description,
                duration_minutes=int(time / 3),
                frequency_per_week=3,
                instructions=[
                    f"{area.area_name} 관련 문제집 풀이",
                    "약점 보완을 위한 반복 학습",
                    "실전 게임에서 의식적으로 적용",
                    "개선 상황 지속적 모니터링"
                ],
                resources=["관련 서적", "온라인 트레이닝 도구"],
                success_metrics=[f"{area.area_name} 관련 정확도"],
                target_improvement=area.target_level
            )
        ]
    
    def _generate_weekly_objectives(self, areas: List[ImprovementArea], week: int) -> List[str]:
        """주간 목표 생성"""
        
        objectives = []
        
        for area in areas[:3]:  # 상위 3개 영역만
            if week == 1:
                objectives.append(f"{area.area_name}: 현재 수준 정확히 파악하고 기초 훈련 시작")
            elif week == 2:
                objectives.append(f"{area.area_name}: 집중 훈련으로 기본기 향상")
            elif week == 3:
                objectives.append(f"{area.area_name}: 실전에서 안정적 적용")
            else:
                objectives.append(f"{area.area_name}: 목표 수준 달성 및 습관화")
        
        # 일반적인 주간 목표 추가
        objectives.append(f"실전 게임에서 학습한 내용 적용 및 검증")
        objectives.append(f"이전 주 대비 명확한 개선점 1개 이상 확인")
        
        return objectives
    
    def _generate_kpi_targets(self, areas: List[ImprovementArea], week: int) -> Dict[str, float]:
        """주간 KPI 목표 생성"""
        
        targets = {}
        
        # 기본 KPI들
        if week == 1:
            targets["훈련_완수율"] = 80.0  # %
            targets["실전게임_승률"] = 45.0  # 기준점 설정
        elif week == 2:
            targets["훈련_완수율"] = 85.0
            targets["실전게임_승률"] = 48.0  # 점진적 향상
        elif week == 3:
            targets["훈련_완수율"] = 90.0
            targets["실전게임_승률"] = 52.0
        else:
            targets["훈련_완수율"] = 95.0
            targets["실전게임_승률"] = 55.0
        
        # 영역별 맞춤 KPI
        for area in areas[:2]:
            if "전술" in area.area_name:
                targets["전술_정답률"] = min(95.0, 75.0 + week * 5)
            elif "엔드게임" in area.area_name:
                targets["엔드게임_정확도"] = min(90.0, 70.0 + week * 5)
            elif "블런더" in area.area_name:
                targets["게임당_블런더수"] = max(0.5, 2.0 - week * 0.3)
        
        return targets
    
    def _generate_overall_objectives(self, areas: List[ImprovementArea], profile: PlayerProfile) -> List[str]:
        """전체 목표 생성"""
        
        objectives = []
        
        # 주요 약점 개선 목표
        priority_areas = [area.area_name for area in areas[:3] if area.priority in [PriorityLevel.CRITICAL, PriorityLevel.HIGH]]
        if priority_areas:
            objectives.append(f"핵심 약점 분야 집중 개선: {', '.join(priority_areas)}")
        
        # 레이팅별 맞춤 목표
        if profile.average_rating < 1200:
            objectives.extend([
                "기본 전술 패턴 완전 숙달 (포크, 핀, 스큐어)",
                "1게임당 블런더 1회 이하로 감소",
                "기본 메이트 패턴 100% 정확도 달성"
            ])
        elif profile.average_rating < 1600:
            objectives.extend([
                "복잡한 전술 조합 정확도 80% 이상",
                "주력 오프닝 15수까지 완벽 숙지",
                "기본 엔드게임에서 실수 제로"
            ])
        else:
            objectives.extend([
                "포지셔널 이해도 심화 및 계획 수립 능력 향상",
                "시간 관리 최적화로 정확도와 속도 동시 개선",
                "일관성 있는 고품질 플레이 유지"
            ])
        
        # 측정 가능한 목표
        objectives.append(f"계획 완수 후 안정적으로 {profile.average_rating + 100}+ 레이팅 달성")
        
        return objectives
    
    def _estimate_rating_gain(self, areas: List[ImprovementArea], weeks: int) -> int:
        """예상 레이팅 상승폭 계산"""
        
        total_impact = sum(area.impact_score for area in areas)
        
        # 기본 상승폭 (주당)
        weekly_gain = min(25, total_impact * 2)
        
        # 기간별 효율성 (초기에 더 빠른 상승)
        if weeks <= 4:
            efficiency = 1.0
        elif weeks <= 8:
            efficiency = 0.8
        else:
            efficiency = 0.6
        
        estimated_gain = int(weekly_gain * weeks * efficiency)
        
        # 현실적 범위로 제한
        return max(50, min(200, estimated_gain))
    
    def _generate_avoid_habits(self, profile: PlayerProfile, areas: List[ImprovementArea]) -> List[str]:
        """피해야 할 습관들 생성"""
        
        avoid_list = []
        
        # 일반적인 주의사항
        avoid_list.extend([
            "시간 압박 상황에서 성급한 수 두기",
            "복잡한 계산 없이 직감만으로 전술 시도",
            "패배 후 감정적으로 다음 게임 시작"
        ])
        
        # 영역별 맞춤 주의사항
        for area in areas[:3]:
            if "전술" in area.area_name:
                avoid_list.append("전술 기회가 없을 때 무리하게 콤비네이션 시도")
            elif "엔드게임" in area.area_name:
                avoid_list.append("엔드게임에서 성급한 킹의 전진")
            elif "우세" in area.area_name:
                avoid_list.append("우세할 때 불필요한 복잡한 변형 선택")
            elif "오프닝" in area.area_name:
                avoid_list.append("준비되지 않은 새로운 오프닝 즉석에서 시도")
        
        # 레이팅별 주의사항
        if profile.average_rating < 1400:
            avoid_list.extend([
                "복잡한 포지셔널 게임보다는 명확한 전술적 게임 선호",
                "책에서 본 고급 기법을 성숙하지 않은 상태에서 시도"
            ])
        
        return avoid_list[:7]  # 최대 7개
    
    def _generate_key_principles(self, areas: List[ImprovementArea]) -> List[str]:
        """핵심 원칙들 생성"""
        
        principles = []
        
        # 기본 원칙들
        principles.extend([
            "매일 일정한 시간을 체스에 투자하여 꾸준함 유지",
            "실수를 했을 때 감정적으로 대응하지 말고 학습 기회로 활용",
            "훈련한 내용은 반드시 실전에서 적용해보고 검증"
        ])
        
        # 영역별 원칙
        for area in areas[:3]:
            if "전술" in area.area_name:
                principles.append("전술 문제는 정답률보다 패턴 이해에 집중")
            elif "엔드게임" in area.area_name:
                principles.append("엔드게임은 정확성이 속도보다 중요")
            elif "오프닝" in area.area_name:
                principles.append("오프닝은 암기보다 아이디어와 원리 이해가 우선")
        
        # 학습 원칙
        principles.extend([
            "약점 보완과 강점 강화의 균형 유지",
            "단기 성과보다 장기적 실력 향상에 집중",
            "꾸준한 자기 분석과 피드백으로 객관적 현재 수준 파악"
        ])
        
        return principles[:8]  # 최대 8개
    
    def _initialize_training_database(self) -> Dict[str, Any]:
        """훈련 데이터베이스 초기화"""
        # 실제로는 외부 파일이나 데이터베이스에서 로드
        return {
            "tactical_resources": [
                "Chess.com Tactics Trainer",
                "Lichess Puzzle Storm",
                "Chess Tempo"
            ],
            "endgame_resources": [
                "Chess.com Endgame Trainer",
                "Lichess Practice",
                "100 Endgames You Must Know"
            ],
            "opening_resources": [
                "Chess.com Opening Explorer",
                "Lichess Opening Explorer",
                "ChessBase Online"
            ]
        }
    
    def _initialize_improvement_rules(self) -> Dict[str, Any]:
        """개선 규칙 초기화"""
        return {
            "rating_thresholds": {
                "beginner": 1200,
                "intermediate": 1600,
                "advanced": 2000
            },
            "priority_weights": {
                "tactics": {"beginner": 0.4, "intermediate": 0.3, "advanced": 0.2},
                "endgame": {"beginner": 0.2, "intermediate": 0.3, "advanced": 0.3},
                "opening": {"beginner": 0.1, "intermediate": 0.2, "advanced": 0.2},
                "positional": {"beginner": 0.1, "intermediate": 0.2, "advanced": 0.3}
            }
        }


# 편의 함수들
def generate_improvement_plan(
    profile: PlayerProfile,
    comparison: Optional[PlayerComparison] = None,
    target_weeks: int = 4,
    daily_time_minutes: int = 45
) -> ImprovementPlan:
    """개선 계획 생성 편의 함수"""
    
    engine = RecommendationEngine()
    return engine.generate_improvement_plan(profile, comparison, target_weeks, daily_time_minutes)


def export_plan_to_json(plan: ImprovementPlan) -> str:
    """개선 계획을 JSON으로 내보내기"""
    
    def convert_enums(obj):
        if isinstance(obj, Enum):
            return obj.value
        elif isinstance(obj, dict):
            return {k: convert_enums(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [convert_enums(v) for v in obj]
        else:
            return obj
    
    plan_dict = asdict(plan)
    plan_dict = convert_enums(plan_dict)
    
    return json.dumps(plan_dict, indent=2, ensure_ascii=False)