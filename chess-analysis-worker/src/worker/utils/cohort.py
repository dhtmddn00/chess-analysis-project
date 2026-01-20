"""
코호트 비교 및 벤치마킹 시스템

동일한 레이팅/시간제어 구간의 플레이어들과 비교하여
상대적 성과를 평가하고 백분위 점수를 계산합니다.
"""

import json
import statistics
from typing import Dict, List, Optional, Tuple, Any, TYPE_CHECKING
from dataclasses import dataclass, asdict
from enum import Enum
import math

from loguru import logger
from ..config import settings
from ..utils.pgn_parser import TimeControl

if TYPE_CHECKING:
    from ..services.profiler import StyleDimension, PlayerProfile


class PerformanceLevel(Enum):
    """성과 수준 분류"""
    EXCELLENT = "excellent"  # 상위 10%
    GOOD = "good"           # 상위 25%
    AVERAGE = "average"     # 중간 50%
    BELOW_AVERAGE = "below_average"  # 하위 25%
    POOR = "poor"          # 하위 10%


@dataclass
class CohortBucket:
    """코호트 버킷 정의"""
    platform: str  # "chess.com", "lichess"
    time_control: TimeControl
    rating_min: int
    rating_max: int
    sample_size: int = 0
    
    @property
    def bucket_key(self) -> str:
        """버킷 식별 키 생성"""
        return f"{self.platform}_{self.time_control.value}_{self.rating_min}-{self.rating_max}"


@dataclass
class CohortStatistics:
    """코호트 통계 데이터"""
    bucket: CohortBucket
    
    # 기본 지표
    acpl_mean: float
    acpl_std: float
    acpl_percentiles: Dict[int, float]  # 10, 25, 50, 75, 90
    
    blunder_rate_mean: float
    blunder_rate_std: float
    blunder_rate_percentiles: Dict[int, float]
    
    mistake_rate_mean: float
    mistake_rate_std: float
    mistake_rate_percentiles: Dict[int, float]
    
    # 스타일 차원별 분포
    style_distributions: Dict["StyleDimension", Dict[str, float]]
    
    # 업데이트 정보
    last_updated: str
    sample_games: int


@dataclass
class PlayerComparison:
    """플레이어 코호트 비교 결과"""
    player_name: str
    cohort_bucket: CohortBucket
    
    # 기본 지표 비교
    acpl_percentile: float
    acpl_level: PerformanceLevel
    
    blunder_rate_percentile: float
    blunder_rate_level: PerformanceLevel
    
    mistake_rate_percentile: float
    mistake_rate_level: PerformanceLevel
    
    # 스타일 차원별 백분위
    style_percentiles: Dict["StyleDimension", float]
    style_levels: Dict["StyleDimension", PerformanceLevel]
    
    # 종합 평가
    overall_percentile: float
    overall_level: PerformanceLevel
    
    # 강점/약점 요약
    strengths: List[str]  # 상위 25% 이상인 영역들
    weaknesses: List[str]  # 하위 25% 이하인 영역들


class CohortComparator:
    """
    코호트 비교 엔진
    
    플레이어 성과를 동일 조건의 다른 플레이어들과 비교하고
    상대적 강점/약점을 분석합니다.
    """
    
    def __init__(self, cohort_data_path: Optional[str] = None):
        """
        Args:
            cohort_data_path: 코호트 데이터 파일 경로 (None이면 기본 경로)
        """
        self.cohort_data_path = cohort_data_path or f"{settings.data_dir}/cohort_baseline.json"
        self.cohort_stats: Dict[str, CohortStatistics] = {}
        self._load_cohort_data()
    
    def _load_cohort_data(self):
        """코호트 기준 데이터 로드"""
        try:
            with open(self.cohort_data_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            for bucket_key, stats_data in data.items():
                # 버킷 정보 파싱
                bucket_parts = bucket_key.split('_')
                if len(bucket_parts) >= 3:
                    platform = bucket_parts[0]
                    time_control = TimeControl(bucket_parts[1])
                    rating_range = bucket_parts[2]
                    rating_min, rating_max = map(int, rating_range.split('-'))
                    
                    bucket = CohortBucket(
                        platform=platform,
                        time_control=time_control,
                        rating_min=rating_min,
                        rating_max=rating_max,
                        sample_size=stats_data.get('sample_games', 0)
                    )
                    
                    # 스타일 분포 복원
                    style_distributions = {}
                    for dim_name, dist in stats_data.get('style_distributions', {}).items():
                        try:
                            from ..services.profiler import StyleDimension
                            dimension = StyleDimension(dim_name)
                            style_distributions[dimension] = dist
                        except ValueError:
                            continue
                    
                    cohort_stats = CohortStatistics(
                        bucket=bucket,
                        acpl_mean=stats_data['acpl_mean'],
                        acpl_std=stats_data['acpl_std'],
                        acpl_percentiles=stats_data['acpl_percentiles'],
                        blunder_rate_mean=stats_data['blunder_rate_mean'],
                        blunder_rate_std=stats_data['blunder_rate_std'],
                        blunder_rate_percentiles=stats_data['blunder_rate_percentiles'],
                        mistake_rate_mean=stats_data['mistake_rate_mean'],
                        mistake_rate_std=stats_data['mistake_rate_std'],
                        mistake_rate_percentiles=stats_data['mistake_rate_percentiles'],
                        style_distributions=style_distributions,
                        last_updated=stats_data.get('last_updated', ''),
                        sample_games=stats_data.get('sample_games', 0)
                    )
                    
                    self.cohort_stats[bucket_key] = cohort_stats
            
            logger.info(f"코호트 데이터 로드 완료: {len(self.cohort_stats)}개 버킷")
            
        except FileNotFoundError:
            logger.warning(f"코호트 데이터 파일 없음: {self.cohort_data_path}")
            self._initialize_default_cohorts()
        except Exception as e:
            logger.error(f"코호트 데이터 로드 실패: {e}")
            self._initialize_default_cohorts()
    
    def _initialize_default_cohorts(self):
        """기본 코호트 데이터 초기화"""
        logger.info("기본 코호트 데이터 생성 중...")
        
        # 기본 레이팅 구간들
        rating_ranges = [
            (600, 800), (800, 1000), (1000, 1200), (1200, 1400),
            (1400, 1600), (1600, 1800), (1800, 2000), (2000, 2200)
        ]
        
        # 기본 시간 제어들
        time_controls = [TimeControl.BLITZ, TimeControl.RAPID, TimeControl.BULLET]
        platforms = ["chess.com"]
        
        for platform in platforms:
            for time_control in time_controls:
                for rating_min, rating_max in rating_ranges:
                    bucket = CohortBucket(
                        platform=platform,
                        time_control=time_control,
                        rating_min=rating_min,
                        rating_max=rating_max
                    )
                    
                    # 기본 통계 (대략적인 추정값)
                    base_acpl = self._estimate_base_acpl(rating_min, rating_max)
                    base_blunder_rate = self._estimate_base_blunder_rate(rating_min, rating_max)
                    base_mistake_rate = self._estimate_base_mistake_rate(rating_min, rating_max)
                    
                    cohort_stats = CohortStatistics(
                        bucket=bucket,
                        acpl_mean=base_acpl,
                        acpl_std=base_acpl * 0.3,
                        acpl_percentiles={
                            10: base_acpl * 0.6,
                            25: base_acpl * 0.8,
                            50: base_acpl,
                            75: base_acpl * 1.2,
                            90: base_acpl * 1.5
                        },
                        blunder_rate_mean=base_blunder_rate,
                        blunder_rate_std=base_blunder_rate * 0.5,
                        blunder_rate_percentiles={
                            10: base_blunder_rate * 0.3,
                            25: base_blunder_rate * 0.6,
                            50: base_blunder_rate,
                            75: base_blunder_rate * 1.4,
                            90: base_blunder_rate * 2.0
                        },
                        mistake_rate_mean=base_mistake_rate,
                        mistake_rate_std=base_mistake_rate * 0.4,
                        mistake_rate_percentiles={
                            10: base_mistake_rate * 0.4,
                            25: base_mistake_rate * 0.7,
                            50: base_mistake_rate,
                            75: base_mistake_rate * 1.3,
                            90: base_mistake_rate * 1.8
                        },
                        style_distributions=self._generate_default_style_distributions(),
                        last_updated="default",
                        sample_games=1000  # 가상의 샘플 크기
                    )
                    
                    self.cohort_stats[bucket.bucket_key] = cohort_stats
        
        # 기본 데이터를 파일로 저장
        self.save_cohort_data()
    
    def _estimate_base_acpl(self, rating_min: int, rating_max: int) -> float:
        """레이팅 기반 기본 ACPL 추정"""
        avg_rating = (rating_min + rating_max) / 2
        
        # 대략적인 추정 공식 (경험적 데이터 기반)
        if avg_rating < 800:
            return 120.0
        elif avg_rating < 1200:
            return 80.0
        elif avg_rating < 1600:
            return 50.0
        elif avg_rating < 2000:
            return 35.0
        else:
            return 25.0
    
    def _estimate_base_blunder_rate(self, rating_min: int, rating_max: int) -> float:
        """레이팅 기반 기본 블런더율 추정 (게임당)"""
        avg_rating = (rating_min + rating_max) / 2
        
        if avg_rating < 800:
            return 2.5
        elif avg_rating < 1200:
            return 1.8
        elif avg_rating < 1600:
            return 1.2
        elif avg_rating < 2000:
            return 0.8
        else:
            return 0.5
    
    def _estimate_base_mistake_rate(self, rating_min: int, rating_max: int) -> float:
        """레이팅 기반 기본 실수율 추정 (게임당)"""
        avg_rating = (rating_min + rating_max) / 2
        
        if avg_rating < 800:
            return 4.0
        elif avg_rating < 1200:
            return 3.2
        elif avg_rating < 1600:
            return 2.5
        elif avg_rating < 2000:
            return 2.0
        else:
            return 1.5
    
    def _generate_default_style_distributions(self) -> Dict["StyleDimension", Dict[str, float]]:
        """기본 스타일 분포 생성 (모든 차원에서 정규분포 가정)"""
        from ..services.profiler import StyleDimension
        distributions = {}
        
        for dimension in StyleDimension:
            distributions[dimension] = {
                'mean': 50.0,  # 중간값
                'std': 15.0,   # 적당한 분산
                'min': 0.0,
                'max': 100.0,
                'percentiles': {
                    10: 35.0,
                    25: 42.5,
                    50: 50.0,
                    75: 57.5,
                    90: 65.0
                }
            }
        
        return distributions
    
    def find_cohort_bucket(
        self, 
        platform: str, 
        time_control: TimeControl, 
        rating: int
    ) -> Optional[CohortBucket]:
        """
        플레이어에 해당하는 코호트 버킷 찾기
        
        Args:
            platform: 플랫폼 ("chess.com", "lichess")
            time_control: 시간 제어
            rating: 플레이어 레이팅
            
        Returns:
            매칭되는 코호트 버킷 (없으면 None)
        """
        for bucket_key, cohort_stats in self.cohort_stats.items():
            bucket = cohort_stats.bucket
            
            if (bucket.platform.lower() == platform.lower() and
                bucket.time_control == time_control and
                bucket.rating_min <= rating <= bucket.rating_max):
                return bucket
        
        return None
    
    def compare_player(
        self, 
        profile: "PlayerProfile",
        platform: str = "chess.com",
        time_control: Optional[TimeControl] = None
    ) -> Optional[PlayerComparison]:
        """
        플레이어를 코호트와 비교
        
        Args:
            profile: 플레이어 프로파일
            platform: 플랫폼 이름
            time_control: 시간 제어 (None이면 자동 선택)
            
        Returns:
            비교 결과 (매칭되는 코호트가 없으면 None)
        """
        # 시간 제어 자동 선택
        if time_control is None:
            time_control = self._select_primary_time_control(profile)
        
        # 코호트 버킷 찾기
        bucket = self.find_cohort_bucket(platform, time_control, profile.average_rating)
        if not bucket:
            logger.warning(f"매칭되는 코호트 없음: {platform}, {time_control}, {profile.average_rating}")
            return None
        
        cohort_stats = self.cohort_stats[bucket.bucket_key]
        
        # 기본 지표 비교
        acpl_percentile = self._calculate_percentile(
            profile.overall_acpl,
            cohort_stats.acpl_mean,
            cohort_stats.acpl_std,
            cohort_stats.acpl_percentiles,
            lower_is_better=True
        )
        
        # 블런더/실수율 계산 (프로파일에서 추출)
        player_blunder_rate = self._extract_blunder_rate(profile)
        player_mistake_rate = self._extract_mistake_rate(profile)
        
        blunder_percentile = self._calculate_percentile(
            player_blunder_rate,
            cohort_stats.blunder_rate_mean,
            cohort_stats.blunder_rate_std,
            cohort_stats.blunder_rate_percentiles,
            lower_is_better=True
        )
        
        mistake_percentile = self._calculate_percentile(
            player_mistake_rate,
            cohort_stats.mistake_rate_mean,
            cohort_stats.mistake_rate_std,
            cohort_stats.mistake_rate_percentiles,
            lower_is_better=True
        )
        
        # 스타일 차원별 백분위
        style_percentiles = {}
        style_levels = {}
        from ..services.profiler import StyleDimension
        
        for dimension in StyleDimension:
            if dimension in profile.style_scores and dimension in cohort_stats.style_distributions:
                player_score = profile.style_scores[dimension].score
                distribution = cohort_stats.style_distributions[dimension]
                
                percentile = self._calculate_style_percentile(player_score, distribution)
                style_percentiles[dimension] = percentile
                style_levels[dimension] = self._percentile_to_level(percentile)
        
        # 종합 백분위 (가중평균)
        overall_percentile = (
            acpl_percentile * 0.4 +
            blunder_percentile * 0.3 +
            mistake_percentile * 0.2 +
            statistics.mean(style_percentiles.values()) * 0.1
        ) if style_percentiles else (
            acpl_percentile * 0.5 +
            blunder_percentile * 0.3 +
            mistake_percentile * 0.2
        )
        
        # 강점/약점 분석
        strengths, weaknesses = self._analyze_strengths_weaknesses(
            acpl_percentile, blunder_percentile, mistake_percentile, style_percentiles
        )
        
        return PlayerComparison(
            player_name=profile.player_name,
            cohort_bucket=bucket,
            acpl_percentile=acpl_percentile,
            acpl_level=self._percentile_to_level(acpl_percentile),
            blunder_rate_percentile=blunder_percentile,
            blunder_rate_level=self._percentile_to_level(blunder_percentile),
            mistake_rate_percentile=mistake_percentile,
            mistake_rate_level=self._percentile_to_level(mistake_percentile),
            style_percentiles=style_percentiles,
            style_levels=style_levels,
            overall_percentile=overall_percentile,
            overall_level=self._percentile_to_level(overall_percentile),
            strengths=strengths,
            weaknesses=weaknesses
        )
    
    def _select_primary_time_control(self, profile: "PlayerProfile") -> TimeControl:
        """프로파일에서 주요 시간 제어 선택"""
        # 가장 많이 플레이한 시간 제어 선택
        if profile.time_control_stats:
            max_games = 0
            primary_tc = TimeControl.BLITZ
            
            for tc, stats in profile.time_control_stats.items():
                if stats['games'] > max_games:
                    max_games = stats['games']
                    primary_tc = tc
            
            return primary_tc
        else:
            return TimeControl.BLITZ  # 기본값
    
    def _calculate_percentile(
        self,
        value: float,
        mean: float,
        std: float,
        percentiles: Dict[int, float],
        lower_is_better: bool = False
    ) -> float:
        """
        값의 백분위 계산
        
        Args:
            value: 계산할 값
            mean: 코호트 평균
            std: 코호트 표준편차
            percentiles: 미리 계산된 백분위값들
            lower_is_better: 낮은 값이 좋은지 여부 (ACPL, 블런더율 등)
            
        Returns:
            백분위 (0-100, 높을수록 좋음)
        """
        # Z-score 계산
        if std <= 0:
            z_score = 0
        else:
            z_score = (value - mean) / std
        
        # 정규분포 누적 분포 함수를 사용한 백분위 계산
        from math import erf, sqrt
        
        # 표준 정규분포 CDF 근사
        percentile_raw = 50 * (1 + erf(z_score / sqrt(2)))
        
        # lower_is_better인 경우 반전
        if lower_is_better:
            percentile = 100 - percentile_raw
        else:
            percentile = percentile_raw
        
        return max(0, min(100, percentile))
    
    def _calculate_style_percentile(self, value: float, distribution: Dict[str, Any]) -> float:
        """스타일 점수의 백분위 계산"""
        mean = distribution['mean']
        std = distribution['std']
        
        if std <= 0:
            return 50.0
        
        z_score = (value - mean) / std
        
        # 정규분포 CDF 근사
        from math import erf, sqrt
        percentile = 50 * (1 + erf(z_score / sqrt(2)))
        
        return max(0, min(100, percentile))
    
    def _percentile_to_level(self, percentile: float) -> PerformanceLevel:
        """백분위를 성과 수준으로 변환"""
        if percentile >= 90:
            return PerformanceLevel.EXCELLENT
        elif percentile >= 75:
            return PerformanceLevel.GOOD
        elif percentile >= 25:
            return PerformanceLevel.AVERAGE
        elif percentile >= 10:
            return PerformanceLevel.BELOW_AVERAGE
        else:
            return PerformanceLevel.POOR
    
    def _extract_blunder_rate(self, profile: "PlayerProfile") -> float:
        """프로파일에서 게임당 블런더율 추출"""
        # 간단한 추정: 전체 게임 수 대비 평균 블런더 수
        # 실제로는 각 게임의 블런더 수를 직접 집계해야 함
        return 1.0  # 기본값
    
    def _extract_mistake_rate(self, profile: "PlayerProfile") -> float:
        """프로파일에서 게임당 실수율 추출"""
        # 간단한 추정
        return 2.0  # 기본값
    
    def _analyze_strengths_weaknesses(
        self,
        acpl_percentile: float,
        blunder_percentile: float,
        mistake_percentile: float,
        style_percentiles: Dict["StyleDimension", float]
    ) -> Tuple[List[str], List[str]]:
        """강점과 약점 분석"""
        
        strengths = []
        weaknesses = []
        
        # 기본 지표 분석
        if acpl_percentile >= 75:
            strengths.append("정확한 수 선택 (낮은 ACPL)")
        elif acpl_percentile <= 25:
            weaknesses.append("부정확한 수 선택 (높은 ACPL)")
        
        if blunder_percentile >= 75:
            strengths.append("블런더 억제 능력")
        elif blunder_percentile <= 25:
            weaknesses.append("잦은 블런더")
        
        if mistake_percentile >= 75:
            strengths.append("안정적 플레이 (낮은 실수율)")
        elif mistake_percentile <= 25:
            weaknesses.append("불안정한 플레이 (높은 실수율)")
        
        # 스타일 차원 분석
        from ..services.profiler import StyleDimension
        dimension_names = {
            StyleDimension.AGGRESSION: "공격성",
            StyleDimension.TACTICAL_DEPENDENCY: "전술 능력",
            StyleDimension.RISK_TAKING: "위험 감수",
            StyleDimension.POSITIONAL_ORIENTATION: "포지셔널 이해",
            StyleDimension.EXCHANGE_PREFERENCE: "교환 판단",
            StyleDimension.OPENING_VARIETY: "오프닝 다양성",
            StyleDimension.BOOK_DEVIATION: "창의성",
            StyleDimension.LEAD_CONVERSION: "우세 유지 능력",
            StyleDimension.ENDGAME_TECHNIQUE: "엔드게임 기술",
            StyleDimension.TIME_MANAGEMENT: "시간 관리",
            StyleDimension.CONSISTENCY: "일관성",
            StyleDimension.SWINDLE_RESISTANCE: "역전 능력"
        }
        
        for dimension, percentile in style_percentiles.items():
            name = dimension_names.get(dimension, dimension.value)
            
            if percentile >= 75:
                strengths.append(name)
            elif percentile <= 25:
                weaknesses.append(name)
        
        return strengths[:5], weaknesses[:5]  # 최대 5개씩
    
    def save_cohort_data(self):
        """코호트 데이터를 파일로 저장"""
        try:
            # 직렬화 가능한 형태로 변환
            data = {}
            for bucket_key, cohort_stats in self.cohort_stats.items():
                # "StyleDimension" enum을 문자열로 변환
                style_distributions = {}
                for dimension, distribution in cohort_stats.style_distributions.items():
                    style_distributions[dimension.value] = distribution
                
                data[bucket_key] = {
                    'acpl_mean': cohort_stats.acpl_mean,
                    'acpl_std': cohort_stats.acpl_std,
                    'acpl_percentiles': cohort_stats.acpl_percentiles,
                    'blunder_rate_mean': cohort_stats.blunder_rate_mean,
                    'blunder_rate_std': cohort_stats.blunder_rate_std,
                    'blunder_rate_percentiles': cohort_stats.blunder_rate_percentiles,
                    'mistake_rate_mean': cohort_stats.mistake_rate_mean,
                    'mistake_rate_std': cohort_stats.mistake_rate_std,
                    'mistake_rate_percentiles': cohort_stats.mistake_rate_percentiles,
                    'style_distributions': style_distributions,
                    'last_updated': cohort_stats.last_updated,
                    'sample_games': cohort_stats.sample_games
                }
            
            with open(self.cohort_data_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            logger.info(f"코호트 데이터 저장 완료: {self.cohort_data_path}")
            
        except Exception as e:
            logger.error(f"코호트 데이터 저장 실패: {e}")
    
    def get_cohort_summary(self, bucket_key: str) -> Optional[Dict[str, Any]]:
        """코호트 요약 정보 반환"""
        if bucket_key in self.cohort_stats:
            cohort_stats = self.cohort_stats[bucket_key]
            
            return {
                'bucket_key': bucket_key,
                'platform': cohort_stats.bucket.platform,
                'time_control': cohort_stats.bucket.time_control.value,
                'rating_range': f"{cohort_stats.bucket.rating_min}-{cohort_stats.bucket.rating_max}",
                'sample_size': cohort_stats.sample_games,
                'acpl_mean': round(cohort_stats.acpl_mean, 1),
                'blunder_rate_mean': round(cohort_stats.blunder_rate_mean, 2),
                'last_updated': cohort_stats.last_updated
            }
        
        return None
    
    def list_available_cohorts(self) -> List[Dict[str, Any]]:
        """사용 가능한 코호트 목록 반환"""
        cohorts = []
        
        for bucket_key in sorted(self.cohort_stats.keys()):
            summary = self.get_cohort_summary(bucket_key)
            if summary:
                cohorts.append(summary)
        
        return cohorts


# 편의 함수들
def compare_player_to_cohort(
    profile: "PlayerProfile",
    platform: str = "chess.com",
    time_control: Optional[TimeControl] = None,
    cohort_data_path: Optional[str] = None
) -> Optional[PlayerComparison]:
    """플레이어 코호트 비교 편의 함수"""
    
    comparator = CohortComparator(cohort_data_path)
    return comparator.compare_player(profile, platform, time_control)


def get_performance_badge(level: PerformanceLevel) -> str:
    """성과 수준을 배지 문자열로 변환"""
    badges = {
        PerformanceLevel.EXCELLENT: "🏆",
        PerformanceLevel.GOOD: "🥇", 
        PerformanceLevel.AVERAGE: "🥈",
        PerformanceLevel.BELOW_AVERAGE: "🥉",
        PerformanceLevel.POOR: "📉"
    }
    
    return badges.get(level, "❓")


def format_percentile_description(percentile: float) -> str:
    """백분위를 설명 문자열로 변환"""
    if percentile >= 90:
        return f"상위 {100-percentile:.0f}% (매우 우수)"
    elif percentile >= 75:
        return f"상위 {100-percentile:.0f}% (우수)"
    elif percentile >= 50:
        return f"상위 {100-percentile:.0f}% (평균 이상)"
    elif percentile >= 25:
        return f"하위 {percentile:.0f}% (평균 이하)"
    else:
        return f"하위 {percentile:.0f}% (개선 필요)"