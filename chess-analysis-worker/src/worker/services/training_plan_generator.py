"""
훈련 계획 생성기 - "100 Elo Up" 시스템

플레이어 분석 결과를 바탕으로 개인화된 훈련 계획을 생성하여
단계적인 실력 향상을 도모합니다.
"""

import asyncio
import json
from typing import Dict, List, Optional, Tuple, Any, TYPE_CHECKING
from dataclasses import dataclass, asdict
from enum import Enum

from loguru import logger
from ..models.database import DatabaseClient

if TYPE_CHECKING:
    from ..services.profiler import PlayerProfile, StyleDimension


class TrainingCategory(Enum):
    """훈련 카테고리"""
    TACTICAL = "tactical"
    POSITIONAL = "positional"
    OPENING = "opening"
    ENDGAME = "endgame"
    CALCULATION = "calculation"
    TIME_MANAGEMENT = "time_management"
    PSYCHOLOGICAL = "psychological"
    THEORETICAL = "theoretical"


class Priority(Enum):
    """우선순위"""
    CRITICAL = 1    # 즉시 해결 필요
    HIGH = 2        # 높은 우선순위
    MEDIUM = 3      # 중간 우선순위
    LOW = 4         # 낮은 우선순위
    MAINTENANCE = 5 # 유지/보강


@dataclass
class TrainingRecommendation:
    """개별 훈련 추천"""
    category: TrainingCategory
    priority: Priority
    title: str
    description: str
    specific_focus: List[str]
    difficulty_level: int  # 1-5
    estimated_elo_gain: int
    time_investment_hours: int
    resources: List[Dict[str, str]]  # 책, 사이트, 도구 등
    evidence_games: List[str]  # 근거 게임들
    evidence_moves: List[str]  # 근거 수들
    success_metrics: List[str]  # 성공 지표


@dataclass
class TrainingPlan:
    """전체 훈련 계획"""
    player_name: str
    current_rating: int
    target_elo_gain: int
    total_time_estimate: int  # 총 예상 시간 (시간)
    
    # 우선순위별 추천사항
    critical_fixes: List[TrainingRecommendation]
    high_priority: List[TrainingRecommendation]
    medium_priority: List[TrainingRecommendation]
    long_term_goals: List[TrainingRecommendation]
    
    # 주간/월간 계획
    weekly_focus: Dict[str, str]
    monthly_milestones: List[str]
    
    # 맞춤 자료
    recommended_resources: Dict[str, List[str]]
    practice_schedule: Dict[str, str]


class TrainingPlanGenerator:
    """
    훈련 계획 생성기
    
    플레이어의 스타일 분석, 백분위, 전술 통계를 종합하여
    개인화된 "100 Elo Up" 훈련 계획을 생성합니다.
    """
    
    def __init__(self, db_client: DatabaseClient = None):
        self.db_client = db_client
        self.resource_database = self._initialize_resources()
        self.elo_gain_matrix = self._initialize_elo_gain_matrix()

    def _dimension_value(self, dimension: "StyleDimension") -> str:
        """Return a stable key for StyleDimension without importing profiler at runtime."""
        return getattr(dimension, 'value', str(dimension))
    
    async def generate_training_plan(
        self,
        profile: "PlayerProfile",
        target_elo_gain: int = 100
    ) -> TrainingPlan:
        """
        개인화된 훈련 계획 생성
        
        Args:
            profile: 플레이어 프로파일
            target_elo_gain: 목표 Elo 상승폭
            
        Returns:
            완성된 훈련 계획
        """
        logger.info(f"Generating training plan for {profile.player_name} (target: +{target_elo_gain} Elo)")
        
        # 1. 약점과 강점 분석
        weaknesses = self._identify_weaknesses(profile)
        strengths = self._identify_strengths(profile)
        
        # 2. 우선순위별 추천사항 생성
        critical_fixes = await self._generate_critical_fixes(profile, weaknesses)
        high_priority = await self._generate_high_priority_items(profile, weaknesses)
        medium_priority = await self._generate_medium_priority_items(profile, strengths, weaknesses)
        long_term_goals = await self._generate_long_term_goals(profile, target_elo_gain)
        
        # 3. 시간 투자 계산
        total_time = self._calculate_total_time(critical_fixes + high_priority + medium_priority)
        
        # 4. 주간/월간 계획 생성
        weekly_focus = self._generate_weekly_focus(critical_fixes, high_priority)
        monthly_milestones = self._generate_monthly_milestones(target_elo_gain, profile.average_rating)
        
        # 5. 맞춤 자료 및 일정 생성
        recommended_resources = self._generate_resource_recommendations(profile, weaknesses)
        practice_schedule = self._generate_practice_schedule(critical_fixes, high_priority)
        
        # 6. 계획 저장
        training_plan = TrainingPlan(
            player_name=profile.player_name,
            current_rating=profile.average_rating,
            target_elo_gain=target_elo_gain,
            total_time_estimate=total_time,
            critical_fixes=critical_fixes,
            high_priority=high_priority,
            medium_priority=medium_priority,
            long_term_goals=long_term_goals,
            weekly_focus=weekly_focus,
            monthly_milestones=monthly_milestones,
            recommended_resources=recommended_resources,
            practice_schedule=practice_schedule
        )
        
        # 데이터베이스에 저장
        if self.db_client:
            await self._save_training_plan(training_plan, profile)
        
        logger.info(f"Training plan generated: {len(critical_fixes + high_priority + medium_priority)} recommendations")
        return training_plan
    
    def _identify_weaknesses(self, profile: "PlayerProfile") -> List[Tuple["StyleDimension", float]]:
        """백분위 기반 약점 식별"""
        weaknesses = []
        
        for dimension, score_obj in profile.style_scores.items():
            if score_obj.percentile is not None and score_obj.percentile < 25:
                # 하위 25% 이하는 약점으로 분류
                weakness_severity = (25 - score_obj.percentile) / 25  # 0-1 스케일
                weaknesses.append((dimension, weakness_severity))
        
        # 심각도 순으로 정렬
        weaknesses.sort(key=lambda x: x[1], reverse=True)
        return weaknesses
    
    def _identify_strengths(self, profile: "PlayerProfile") -> List[Tuple["StyleDimension", float]]:
        """백분위 기반 강점 식별"""
        strengths = []
        
        for dimension, score_obj in profile.style_scores.items():
            if score_obj.percentile is not None and score_obj.percentile > 75:
                # 상위 25% 이상은 강점으로 분류
                strength_level = (score_obj.percentile - 75) / 25  # 0-1 스케일
                strengths.append((dimension, strength_level))
        
        # 강점 순으로 정렬
        strengths.sort(key=lambda x: x[1], reverse=True)
        return strengths
    
    async def _generate_critical_fixes(
        self, 
        profile: "PlayerProfile",
        weaknesses: List[Tuple["StyleDimension", float]]
    ) -> List[TrainingRecommendation]:
        """치명적인 문제점에 대한 긴급 수정사항"""
        critical_fixes = []
        
        # 가장 심각한 2-3개 약점만 처리
        for dimension, severity in weaknesses[:3]:
            if severity > 0.7:  # 매우 심각한 약점만
                recommendation = await self._create_critical_fix_recommendation(
                    dimension, severity, profile
                )
                if recommendation:
                    critical_fixes.append(recommendation)
        
        return critical_fixes
    
    async def _create_critical_fix_recommendation(
        self,
        dimension: "StyleDimension",
        severity: float,
        profile: "PlayerProfile"
    ) -> Optional[TrainingRecommendation]:
        """치명적 약점에 대한 구체적 추천사항 생성"""
        
        dimension_templates = {
            'tactical_dependency': {
                'title': '전술 기본기 긴급 보강',
                'description': '전술적 감각이 크게 부족합니다. 기본 전술 패턴 학습이 시급합니다.',
                'specific_focus': ['기본 포크 패턴', '간단한 핀 전술', '백 랭크 메이트 패턴'],
                'difficulty_level': 2,
                'estimated_elo_gain': 80,
                'time_investment': 40,
                'category': TrainingCategory.TACTICAL
            },
            'endgame_technique': {
                'title': '엔드게임 기본 테크닉',
                'description': '엔드게임 실력이 크게 부족합니다. 기본 엔드게임 학습이 필요합니다.',
                'specific_focus': ['K+Q vs K', 'K+R vs K', '기본 폰 엔드게임'],
                'difficulty_level': 2,
                'estimated_elo_gain': 60,
                'time_investment': 30,
                'category': TrainingCategory.ENDGAME
            },
            'time_management': {
                'title': '시간 관리 시스템 구축',
                'description': '시간 관리가 매우 부족합니다. 체계적인 시간 배분 학습이 필요합니다.',
                'specific_focus': ['오프닝 시간 절약', '중반전 계산 효율화', '시간 압박 대응'],
                'difficulty_level': 3,
                'estimated_elo_gain': 50,
                'time_investment': 25,
                'category': TrainingCategory.TIME_MANAGEMENT
            }
        }
        
        template = dimension_templates.get(self._dimension_value(dimension))
        if not template:
            return None
        
        # 플레이어별 맞춤화
        evidence_games = self._extract_evidence_games(profile, dimension)
        resources = self._get_resources_for_dimension(dimension, template['difficulty_level'])
        
        return TrainingRecommendation(
            category=template['category'],
            priority=Priority.CRITICAL,
            title=template['title'],
            description=template['description'],
            specific_focus=template['specific_focus'],
            difficulty_level=template['difficulty_level'],
            estimated_elo_gain=int(template['estimated_elo_gain'] * severity),
            time_investment_hours=template['time_investment'],
            resources=resources,
            evidence_games=evidence_games,
            evidence_moves=[],
            success_metrics=self._generate_success_metrics(dimension)
        )
    
    async def _generate_high_priority_items(
        self,
        profile: "PlayerProfile",
        weaknesses: List[Tuple["StyleDimension", float]]
    ) -> List[TrainingRecommendation]:
        """높은 우선순위 개선사항"""
        high_priority = []
        
        for dimension, severity in weaknesses[3:6]:  # 4-6번째 약점들
            if severity > 0.4:  # 중등도 이상 약점
                recommendation = await self._create_high_priority_recommendation(
                    dimension, severity, profile
                )
                if recommendation:
                    high_priority.append(recommendation)
        
        # 전술 통계 기반 추천
        if profile.tactical_stats:
            tactical_rec = self._create_tactical_improvement_recommendation(profile)
            if tactical_rec:
                high_priority.append(tactical_rec)
        
        return high_priority
    
    async def _create_high_priority_recommendation(
        self,
        dimension: "StyleDimension",
        severity: float,
        profile: "PlayerProfile"
    ) -> Optional[TrainingRecommendation]:
        """높은 우선순위 추천사항 생성"""
        
        templates = {
            'positional_orientation': {
                'title': '포지셔널 판단력 향상',
                'description': '포지션 평가와 계획 수립 능력을 개선해야 합니다.',
                'focus': ['중앙 지배', '기물 활동성', '폰 구조 이해'],
                'category': TrainingCategory.POSITIONAL,
                'elo_gain': 40
            },
            'opening_variety': {
                'title': '오프닝 레퍼토리 확장',
                'description': '제한적인 오프닝 지식으로 인한 불리함을 해소해야 합니다.',
                'focus': ['주요 오프닝 2-3개 마스터', '트랜스포지션 이해', '오프닝 원리'],
                'category': TrainingCategory.OPENING,
                'elo_gain': 35
            },
            'consistency': {
                'title': '플레이 안정성 확보',
                'description': '기복이 심한 플레이를 안정화해야 합니다.',
                'focus': ['루틴 확립', '집중력 훈련', '실수 패턴 분석'],
                'category': TrainingCategory.PSYCHOLOGICAL,
                'elo_gain': 30
            }
        }
        
        template = templates.get(self._dimension_value(dimension))
        if not template:
            return None
        
        return TrainingRecommendation(
            category=template['category'],
            priority=Priority.HIGH,
            title=template['title'],
            description=template['description'],
            specific_focus=template['focus'],
            difficulty_level=3,
            estimated_elo_gain=int(template['elo_gain'] * severity),
            time_investment_hours=20,
            resources=self._get_resources_for_dimension(dimension, 3),
            evidence_games=self._extract_evidence_games(profile, dimension),
            evidence_moves=[],
            success_metrics=self._generate_success_metrics(dimension)
        )
    
    def _create_tactical_improvement_recommendation(
        self, 
        profile: "PlayerProfile"
    ) -> Optional[TrainingRecommendation]:
        """전술 통계 기반 개선사항"""
        
        if not profile.tactical_stats or not isinstance(profile.tactical_stats, dict):
            return None
        
        tactical_accuracy = profile.tactical_stats.get('tactical_accuracy', 0)
        missed_tactics = profile.tactical_stats.get('missed_tactics', 0)
        
        if tactical_accuracy < 0.6 or missed_tactics > 5:
            return TrainingRecommendation(
                category=TrainingCategory.TACTICAL,
                priority=Priority.HIGH,
                title='전술적 정확도 향상',
                description=f'전술 정확도 {tactical_accuracy*100:.0f}%로 개선이 필요합니다.',
                specific_focus=['전술 퍼즐 풀이', '블런더 체크 습관', '계산 정확도'],
                difficulty_level=3,
                estimated_elo_gain=45,
                time_investment_hours=25,
                resources=self._get_tactical_resources(),
                evidence_games=[],
                evidence_moves=[],
                success_metrics=['전술 정확도 80% 달성', '게임당 놓친 전술 3개 이하']
            )
        
        return None
    
    async def _generate_medium_priority_items(
        self,
        profile: "PlayerProfile",
        strengths: List[Tuple["StyleDimension", float]],
        weaknesses: List[Tuple["StyleDimension", float]]
    ) -> List[TrainingRecommendation]:
        """중간 우선순위 개선사항"""
        medium_priority = []
        
        # 강점 활용 방안
        if strengths:
            strength_rec = self._create_strength_enhancement_recommendation(strengths[0], profile)
            if strength_rec:
                medium_priority.append(strength_rec)
        
        # 일반적인 실력 향상
        general_recs = self._create_general_improvement_recommendations(profile)
        medium_priority.extend(general_recs)
        
        return medium_priority
    
    def _create_strength_enhancement_recommendation(
        self,
        strength: Tuple["StyleDimension", float],
        profile: "PlayerProfile"
    ) -> Optional[TrainingRecommendation]:
        """강점 활용 및 극대화 방안"""
        
        dimension, level = strength
        
        strength_templates = {
            'aggression': {
                'title': '공격적 스타일 극대화',
                'description': '뛰어난 공격 감각을 더욱 발전시켜 결정력을 높입니다.',
                'focus': ['킹 공격 패턴', '갬빗 활용', '이니셔티브 유지']
            },
            'tactical_dependency': {
                'title': '전술적 우위 확대',
                'description': '뛰어난 전술 실력을 바탕으로 복잡한 포지션에서 우위를 점합니다.',
                'focus': ['복합 전술', '깊은 계산', '전술적 직관']
            }
        }
        
        dimension_key = self._dimension_value(dimension)
        template = strength_templates.get(dimension_key)
        if not template:
            return None
        
        return TrainingRecommendation(
            category=TrainingCategory.TACTICAL if dimension_key == 'tactical_dependency' else TrainingCategory.POSITIONAL,
            priority=Priority.MEDIUM,
            title=template['title'],
            description=template['description'],
            specific_focus=template['focus'],
            difficulty_level=4,
            estimated_elo_gain=25,
            time_investment_hours=15,
            resources=self._get_advanced_resources(dimension),
            evidence_games=[],
            evidence_moves=[],
            success_metrics=[f'{dimension.value} 활용도 증가']
        )
    
    def _create_general_improvement_recommendations(
        self,
        profile: "PlayerProfile"
    ) -> List[TrainingRecommendation]:
        """일반적인 실력 향상 방안"""
        
        recommendations = []
        
        # 정기적인 게임 분석
        recommendations.append(TrainingRecommendation(
            category=TrainingCategory.THEORETICAL,
            priority=Priority.MEDIUM,
            title='자기 게임 분석 습관화',
            description='매주 자신의 게임을 체계적으로 분석하여 패턴을 파악합니다.',
            specific_focus=['실수 패턴 분석', '결정적 순간 검토', '개선점 도출'],
            difficulty_level=2,
            estimated_elo_gain=20,
            time_investment_hours=10,
            resources=self._get_analysis_resources(),
            evidence_games=[],
            evidence_moves=[],
            success_metrics=['주 1회 이상 게임 분석', '실수 패턴 3개 이상 식별']
        ))
        
        return recommendations
    
    async def _generate_long_term_goals(
        self,
        profile: "PlayerProfile",
        target_elo_gain: int
    ) -> List[TrainingRecommendation]:
        """장기 목표 설정"""
        
        long_term = []
        
        # 레이팅 목표에 따른 장기 계획
        current_rating = profile.average_rating
        target_rating = current_rating + target_elo_gain
        
        if target_rating >= 1800:
            long_term.append(TrainingRecommendation(
                category=TrainingCategory.THEORETICAL,
                priority=Priority.LOW,
                title='마스터급 이론 학습',
                description='고급 이론과 현대 체스 트렌드를 학습합니다.',
                specific_focus=['그랜드마스터 게임 분석', '현대 오프닝 트렌드', '고급 엔드게임'],
                difficulty_level=5,
                estimated_elo_gain=100,
                time_investment_hours=100,
                resources=self._get_advanced_theoretical_resources(),
                evidence_games=[],
                evidence_moves=[],
                success_metrics=[f'{target_rating} Elo 달성', '토너먼트 참가']
            ))
        
        return long_term
    
    def _generate_weekly_focus(
        self,
        critical_fixes: List[TrainingRecommendation],
        high_priority: List[TrainingRecommendation]
    ) -> Dict[str, str]:
        """주간 집중 영역 설정"""
        
        weekly_plan = {}
        
        # 첫 2주는 치명적 문제 해결
        if critical_fixes:
            weekly_plan['Week 1-2'] = f"집중: {critical_fixes[0].title}"
        
        # 다음 2주는 높은 우선순위
        if high_priority:
            weekly_plan['Week 3-4'] = f"집중: {high_priority[0].title}"
        
        # 전체적인 패턴
        weekly_plan['Daily'] = "전술 퍼즐 15분, 자기 게임 분석 30분"
        weekly_plan['Weekly'] = "약점 영역 집중 훈련 2시간"
        weekly_plan['Monthly'] = "진행 상황 점검 및 계획 조정"
        
        return weekly_plan
    
    def _generate_monthly_milestones(self, target_gain: int, current_rating: int) -> List[str]:
        """월간 마일스톤 설정"""
        
        monthly_gain = target_gain // 4  # 4개월 계획
        milestones = []
        
        for month in range(1, 5):
            milestone_rating = current_rating + (monthly_gain * month)
            milestones.append(f"Month {month}: {milestone_rating} Elo 달성")
        
        milestones.extend([
            "실수율 20% 감소",
            "전술 정확도 80% 달성",
            "약점 영역 2개 이상 개선"
        ])
        
        return milestones
    
    def _calculate_total_time(self, recommendations: List[TrainingRecommendation]) -> int:
        """총 예상 시간 계산"""
        return sum(rec.time_investment_hours for rec in recommendations)
    
    def _extract_evidence_games(self, profile: "PlayerProfile", dimension: "StyleDimension") -> List[str]:
        """해당 차원의 증거 게임들 추출"""
        # StyleScore에서 evidence를 추출
        if dimension in profile.style_scores:
            score_obj = profile.style_scores[dimension]
            return [ev.game_id for ev in score_obj.evidence[:3]]
        return []
    
    def _generate_success_metrics(self, dimension: "StyleDimension") -> List[str]:
        """성공 지표 생성"""
        
        metrics = {
            'tactical_dependency': [
                "전술 퍼즐 정확도 85% 달성",
                "게임당 전술 기회 놓침 2개 이하",
                "전술적 실수로 인한 패배 50% 감소"
            ],
            'endgame_technique': [
                "기본 엔드게임 100% 정확도",
                "엔드게임 ACPL 20 이하 달성",
                "우세한 엔드게임 승률 90% 이상"
            ],
            'time_management': [
                "시간 초과로 인한 패배 제거",
                "평균 시간 사용 균등화",
                "중요한 순간 충분한 시간 확보"
            ]
        }
        
        return metrics.get(self._dimension_value(dimension), ["해당 영역 백분위 50% 이상 달성"])
    
    # 리소스 관련 메서드들
    def _initialize_resources(self) -> Dict[str, Dict[str, List[str]]]:
        """훈련 자료 데이터베이스 초기화"""
        return {
            'tactical': {
                'beginner': [
                    {'type': 'website', 'name': 'Chess.com Tactics', 'url': 'https://chess.com/puzzles'},
                    {'type': 'website', 'name': 'Lichess Puzzles', 'url': 'https://lichess.org/training'},
                    {'type': 'book', 'name': 'Bobby Fischer Teaches Chess', 'author': 'Bobby Fischer'}
                ],
                'intermediate': [
                    {'type': 'website', 'name': 'ChessTempo', 'url': 'https://chesstempo.com'},
                    {'type': 'book', 'name': '1001 Brilliant Ways to Checkmate', 'author': 'Fred Reinfeld'},
                    {'type': 'course', 'name': 'Chess.com Tactics Course', 'level': 'intermediate'}
                ]
            },
            'positional': {
                'beginner': [
                    {'type': 'book', 'name': 'How to Reassess Your Chess', 'author': 'Jeremy Silman'},
                    {'type': 'video', 'name': 'Saint Louis Chess Club Lectures', 'topic': 'positional play'}
                ]
            },
            'endgame': {
                'beginner': [
                    {'type': 'book', 'name': '100 Endgames You Must Know', 'author': 'Jesus de la Villa'},
                    {'type': 'website', 'name': 'Lichess Endgame Practice', 'url': 'https://lichess.org/practice'}
                ]
            }
        }
    
    def _initialize_elo_gain_matrix(self) -> Dict[str, int]:
        """Elo 상승 예상치 매트릭스"""
        return {
            'tactical_basic': 60,
            'tactical_intermediate': 40,
            'positional_basic': 45,
            'endgame_basic': 50,
            'opening_repertoire': 35,
            'time_management': 30,
            'consistency': 25,
            'calculation': 55
        }
    
    def _get_resources_for_dimension(self, dimension: "StyleDimension", level: int) -> List[Dict[str, str]]:
        """차원별 맞춤 자료 제공"""
        resource_map = {
            'tactical_dependency': 'tactical',
            'positional_orientation': 'positional',
            'endgame_technique': 'endgame'
        }
        
        category = resource_map.get(self._dimension_value(dimension), 'tactical')
        level_name = 'beginner' if level <= 2 else 'intermediate'
        
        return self.resource_database.get(category, {}).get(level_name, [])
    
    def _get_tactical_resources(self) -> List[Dict[str, str]]:
        """전술 훈련 자료"""
        return [
            {'type': 'daily', 'name': '매일 전술 퍼즐 20개', 'time': '15분'},
            {'type': 'weekly', 'name': '주간 전술 테스트', 'time': '30분'},
            {'type': 'tool', 'name': 'CT-ART 4.0', 'description': '전술 훈련 소프트웨어'}
        ]
    
    def _get_analysis_resources(self) -> List[Dict[str, str]]:
        """게임 분석 자료"""
        return [
            {'type': 'engine', 'name': 'Stockfish', 'purpose': '정확한 분석'},
            {'type': 'method', 'name': '블런더 체크리스트', 'description': '매 게임 후 실수 분석'},
            {'type': 'habit', 'name': '일기 작성', 'description': '게임별 배운 점 기록'}
        ]
    
    def _get_advanced_resources(self, dimension: "StyleDimension") -> List[Dict[str, str]]:
        """고급 자료"""
        return [
            {'type': 'masterclass', 'name': '그랜드마스터 강의', 'level': 'advanced'},
            {'type': 'database', 'name': 'ChessBase', 'purpose': '고급 분석'},
            {'type': 'community', 'name': '체스 클럽 참가', 'benefit': '실전 경험'}
        ]
    
    def _get_advanced_theoretical_resources(self) -> List[Dict[str, str]]:
        """고급 이론 자료"""
        return [
            {'type': 'book', 'name': 'Dvoretsky\'s Endgame Manual', 'level': 'expert'},
            {'type': 'magazine', 'name': 'Chess Informant', 'content': '최신 이론'},
            {'type': 'course', 'name': '마스터 레벨 코스', 'provider': 'various'}
        ]
    
    def _generate_resource_recommendations(
        self,
        profile: "PlayerProfile",
        weaknesses: List[Tuple["StyleDimension", float]]
    ) -> Dict[str, List[str]]:
        """맞춤형 자료 추천"""
        
        recommendations = {
            'immediate': [],
            'weekly': [],
            'monthly': []
        }
        
        # 즉시 시작할 수 있는 자료
        recommendations['immediate'].extend([
            "Chess.com 전술 퍼즐 (매일 15분)",
            "자신의 최근 게임 3개 분석",
            "기본 엔드게임 패턴 1개 학습"
        ])
        
        # 주간 계획
        recommendations['weekly'].extend([
            "약점 영역 집중 훈련 (2시간)",
            "새로운 오프닝 라인 1개 학습",
            "전술 테스트 (30분)"
        ])
        
        # 월간 계획
        recommendations['monthly'].extend([
            "진전 상황 평가 및 계획 조정",
            "새로운 훈련 자료 탐색",
            "실력 레벨에 맞는 상대와 연습 게임"
        ])
        
        return recommendations
    
    def _generate_practice_schedule(
        self,
        critical_fixes: List[TrainingRecommendation],
        high_priority: List[TrainingRecommendation]
    ) -> Dict[str, str]:
        """연습 일정 생성"""
        
        schedule = {
            '평일 (월-금)': "전술 퍼즐 15분 + 이론 학습 30분",
            '주말': "집중 훈련 2시간 + 실전 게임 3게임",
            '주간 목표': "약점 영역 1개 집중 개선",
            '월간 목표': "실력 측정 및 계획 조정"
        }
        
        if critical_fixes:
            schedule['우선 과제'] = critical_fixes[0].title
        
        return schedule
    
    async def _save_training_plan(
        self,
        training_plan: TrainingPlan,
        profile: "PlayerProfile"
    ) -> bool:
        """훈련 계획을 데이터베이스에 저장"""
        
        if not self.db_client:
            return False
        
        try:
            # 분석 ID는 메타데이터에서 추출 (실제로는 더 체계적인 방법 필요)
            analysis_id = "00000000-0000-0000-0000-000000000000"  # 임시값
            
            # 모든 추천사항을 하나의 리스트로 합치기
            all_recommendations = (
                training_plan.critical_fixes + 
                training_plan.high_priority + 
                training_plan.medium_priority +
                training_plan.long_term_goals
            )
            
            for rec in all_recommendations:
                insert_query = """
                    INSERT INTO training_recommendations (
                        analysis_id, category, priority, title, description,
                        specific_focus, difficulty_level, estimated_elo_gain,
                        time_investment_hours, resources, evidence_games, evidence_moves
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                """
                
                await self.db_client.execute(insert_query, [
                    analysis_id,
                    rec.category.value,
                    rec.priority.value,
                    rec.title,
                    rec.description,
                    rec.specific_focus,
                    rec.difficulty_level,
                    rec.estimated_elo_gain,
                    rec.time_investment_hours,
                    json.dumps(rec.resources),
                    rec.evidence_games,
                    rec.evidence_moves
                ])
            
            logger.info(f"Saved {len(all_recommendations)} training recommendations for {profile.player_name}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to save training plan: {e}")
            return False


# 편의 함수들
async def generate_training_plan_for_profile(
    profile: "PlayerProfile",
    target_elo_gain: int = 100,
    db_client: DatabaseClient = None
) -> TrainingPlan:
    """플레이어 프로파일에 대한 훈련 계획 생성"""
    
    generator = TrainingPlanGenerator(db_client)
    return await generator.generate_training_plan(profile, target_elo_gain)


def create_quick_improvement_plan(profile: "PlayerProfile") -> Dict[str, str]:
    """빠른 개선을 위한 간단한 계획"""
    
    quick_plan = {
        'today': "전술 퍼즐 20개 + 자기 게임 1개 분석",
        'this_week': "약점 영역 식별 및 기초 훈련 시작",
        'this_month': "체계적인 훈련 계획 수립 및 실행",
        'focus_area': "가장 심각한 약점 1개에 집중"
    }
    
    return quick_plan
