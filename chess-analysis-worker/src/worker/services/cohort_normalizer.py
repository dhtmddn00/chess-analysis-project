"""
코호트 정규화 시스템

플레이어의 스타일 점수를 비슷한 실력대 플레이어들과 비교하여
백분위를 계산하고 정규화합니다.
"""

import asyncio
import statistics
from typing import Dict, List, Optional, Tuple, Any, TYPE_CHECKING
from dataclasses import dataclass, asdict
from enum import Enum

from loguru import logger
from ..models.database import DatabaseClient
from ..utils.elite_config import get_elite_config, RatingBand, OpponentBand

if TYPE_CHECKING:
    from ..services.profiler import StyleDimension, PlayerProfile


@dataclass
class CohortStats:
    """코호트 통계 데이터"""
    rating_range: str
    time_control: str
    platform: str
    sample_size: int
    
    # 각 차원별 평균과 표준편차
    dimension_stats: Dict[str, Dict[str, float]]
    
    # 성능 통계
    avg_acpl: float
    avg_accuracy: float
    avg_blunders_per_game: float
    avg_mistakes_per_game: float
    avg_tactical_opportunities: float


class CohortNormalizer:
    """
    코호트 정규화 엔진
    
    플레이어의 스타일과 성능을 비슷한 실력대의 플레이어들과 비교하여
    백분위를 계산하고 정규화된 점수를 제공합니다.
    """
    
    def __init__(self, db_client: DatabaseClient = None):
        self.db_client = db_client
        self._cohort_cache = {}
        self._cache_ttl = 3600  # 1시간 캐시
    
    async def normalize_player_profile(
        self, 
        profile: "PlayerProfile",
        rating: int,
        time_control: str = 'blitz',
        opponent_ratings: List[int] = None
    ) -> "PlayerProfile":
        """
        플레이어 프로파일을 코호트 대비 정규화 (Elite 시스템 통합)
        
        Args:
            profile: 정규화할 플레이어 프로파일
            rating: 플레이어 레이팅
            time_control: 시간제어 ('blitz', 'rapid', 'bullet')
            opponent_ratings: 상대방 레이팅 리스트 (opponent weighting용)
            
        Returns:
            정규화된 백분위가 포함된 프로파일
        """
        logger.info(f"Normalizing profile for {profile.player_name} (rating: {rating}, tc: {time_control})")
        
        # Elite 설정 시스템 사용
        elite_config = get_elite_config()
        rating_band = elite_config.get_rating_band(rating)
        is_elite_player = elite_config.is_elite_player(rating, profile.player_name)
        
        logger.info(f"Rating band for {profile.player_name}: {rating_band.value}, is_elite={is_elite_player}")
        
        # 적절한 코호트 찾기 (Elite 시스템의 rating band 사용)
        rating_range = self._get_elite_rating_range(rating_band)
        cohort_stats = await self._get_cohort_stats(rating_range, time_control)
        
        if not cohort_stats:
            logger.warning(f"No cohort data found for {rating_range} {time_control}")
            return profile
        
        # 상대방 강도 가중치 계산
        opponent_weight = 1.0
        if opponent_ratings:
            avg_opponent_rating = sum(opponent_ratings) / len(opponent_ratings)
            opponent_weight = elite_config.get_opponent_weight(rating, avg_opponent_rating, rating_band)
            logger.info(f"Opponent strength weighting: {opponent_weight:.2f}")
        
        # 각 스타일 차원에 대해 백분위 계산 (Elite 조정 적용)
        normalized_scores = {}
        
        for dimension, score_obj in profile.style_scores.items():
            percentile = self._calculate_percentile(
                score_obj.score,
                cohort_stats.dimension_stats.get(dimension.value, {})
            )
            
            # Elite 점수는 이미 profiler.py에서 적절히 조정되었으므로 추가 조정하지 않음
            # 대신 opponent weighting 적용
            weighted_score = score_obj.score * opponent_weight
            min_score, max_score = elite_config.get_score_limits(rating_band)
            adjusted_score = max(min_score, min(weighted_score, max_score))
            
            if adjusted_score != score_obj.score:
                logger.info(f"Opponent-weighted score for {dimension.value}: {score_obj.score:.1f} -> {adjusted_score:.1f}")
            
            # Update the score object with adjusted score
            score_obj.score = adjusted_score
            score_obj.percentile = percentile
            normalized_scores[dimension] = score_obj
        
        # 성능 지표 백분위 계산
        performance_percentiles = {
            'acpl_percentile': self._calculate_performance_percentile(
                profile.overall_acpl, cohort_stats.avg_acpl, 'acpl', cohort_stats
            ),
            'accuracy_percentile': self._calculate_performance_percentile(
                profile.win_rate, cohort_stats.avg_accuracy, 'accuracy', cohort_stats
            )
        }
        
        # 코호트 정보를 메타데이터에 추가 (Elite 시스템 정보 포함)
        if profile.metadata is None:
            profile.metadata = {}
        
        profile.metadata['cohort_info'] = {
            'rating_range': rating_range,
            'rating_band': rating_band.value,
            'time_control': time_control,
            'cohort_size': cohort_stats.sample_size,
            'percentiles': performance_percentiles,
            'opponent_weight': opponent_weight,
            'is_elite_player': is_elite_player,
            'normalization_date': asyncio.get_event_loop().time()
        }
        
        profile.style_scores = normalized_scores
        
        logger.info(f"Normalized profile for {profile.player_name}: cohort {rating_range}")
        return profile
    
    async def _get_cohort_stats(
        self, 
        rating_range: str, 
        time_control: str,
        platform: str = 'chess.com'
    ) -> Optional[CohortStats]:
        """코호트 통계 데이터 조회"""
        
        cache_key = f"{rating_range}_{time_control}_{platform}"
        
        # 캐시에서 먼저 확인
        if cache_key in self._cohort_cache:
            cached_data, timestamp = self._cohort_cache[cache_key]
            if asyncio.get_event_loop().time() - timestamp < self._cache_ttl:
                return cached_data
        
        try:
            if not self.db_client:
                logger.warning("No database client available for cohort data")
                return None
            
            query = """
                SELECT 
                    rating_range, time_control, platform, sample_size,
                    aggression_mean, aggression_std,
                    tactical_dependency_mean, tactical_dependency_std,
                    risk_taking_mean, risk_taking_std,
                    positional_orientation_mean, positional_orientation_std,
                    exchange_preference_mean, exchange_preference_std,
                    opening_variety_mean, opening_variety_std,
                    book_deviation_mean, book_deviation_std,
                    lead_conversion_mean, lead_conversion_std,
                    endgame_technique_mean, endgame_technique_std,
                    time_management_mean, time_management_std,
                    consistency_mean, consistency_std,
                    swindle_resistance_mean, swindle_resistance_std,
                    avg_acpl, avg_accuracy, avg_blunders_per_game,
                    avg_mistakes_per_game, avg_tactical_opportunities
                FROM cohort_data
                WHERE rating_range = $1 AND time_control = $2 AND platform = $3
            """
            
            result = await self.db_client.fetchrow(query, rating_range, time_control, platform)
            
            if not result:
                return None
            
            # 차원별 통계 구성
            dimension_stats = {
                'aggression': {
                    'mean': result['aggression_mean'],
                    'std': result['aggression_std']
                },
                'tactical_dependency': {
                    'mean': result['tactical_dependency_mean'],
                    'std': result['tactical_dependency_std']
                },
                'risk_taking': {
                    'mean': result['risk_taking_mean'],
                    'std': result['risk_taking_std']
                },
                'positional_orientation': {
                    'mean': result['positional_orientation_mean'],
                    'std': result['positional_orientation_std']
                },
                'exchange_preference': {
                    'mean': result['exchange_preference_mean'],
                    'std': result['exchange_preference_std']
                },
                'opening_variety': {
                    'mean': result['opening_variety_mean'],
                    'std': result['opening_variety_std']
                },
                'book_deviation': {
                    'mean': result['book_deviation_mean'],
                    'std': result['book_deviation_std']
                },
                'lead_conversion': {
                    'mean': result['lead_conversion_mean'],
                    'std': result['lead_conversion_std']
                },
                'endgame_technique': {
                    'mean': result['endgame_technique_mean'],
                    'std': result['endgame_technique_std']
                },
                'time_management': {
                    'mean': result['time_management_mean'],
                    'std': result['time_management_std']
                },
                'consistency': {
                    'mean': result['consistency_mean'],
                    'std': result['consistency_std']
                },
                'swindle_resistance': {
                    'mean': result['swindle_resistance_mean'],
                    'std': result['swindle_resistance_std']
                }
            }
            
            cohort_stats = CohortStats(
                rating_range=result['rating_range'],
                time_control=result['time_control'],
                platform=result['platform'],
                sample_size=result['sample_size'],
                dimension_stats=dimension_stats,
                avg_acpl=result['avg_acpl'],
                avg_accuracy=result['avg_accuracy'],
                avg_blunders_per_game=result['avg_blunders_per_game'],
                avg_mistakes_per_game=result['avg_mistakes_per_game'],
                avg_tactical_opportunities=result['avg_tactical_opportunities']
            )
            
            # 캐시에 저장
            self._cohort_cache[cache_key] = (cohort_stats, asyncio.get_event_loop().time())
            
            return cohort_stats
            
        except Exception as e:
            logger.error(f"Failed to fetch cohort stats for {rating_range} {time_control}: {e}")
            return None
    
    def _get_rating_range(self, rating: int) -> str:
        """레이팅을 레이팅 범위로 변환 (Legacy 호환성)"""
        
        if rating < 800:
            return "600-800"
        elif rating < 1000:
            return "800-1000"
        elif rating < 1200:
            return "1000-1200"
        elif rating < 1400:
            return "1200-1400"
        elif rating < 1600:
            return "1400-1600"
        elif rating < 1800:
            return "1600-1800"
        elif rating < 2000:
            return "1800-2000"
        elif rating < 2200:
            return "2000-2200"
        elif rating < 2400:
            return "2200-2400"
        else:
            return "2400+"
    
    def _get_elite_rating_range(self, rating_band: RatingBand) -> str:
        """Elite 시스템의 rating band를 레이팅 범위로 변환"""
        band_to_range = {
            RatingBand.B1: "600-1600",
            RatingBand.B2: "1600-2200", 
            RatingBand.B3: "2200-2600",
            RatingBand.B4: "2600-2900",
            RatingBand.B5: "2900+"
        }
        return band_to_range.get(rating_band, "2400+")
    
    def _calculate_percentile(
        self, 
        score: float, 
        dimension_stats: Dict[str, float]
    ) -> float:
        """Z-score를 이용한 백분위 계산"""
        
        if not dimension_stats or 'mean' not in dimension_stats or 'std' not in dimension_stats:
            return 50.0  # 기본값
        
        mean = dimension_stats['mean']
        std = dimension_stats['std']
        
        if std <= 0:
            return 50.0
        
        # Z-score 계산
        z_score = (score - mean) / std
        
        # Z-score를 백분위로 변환 (정규분포 가정)
        percentile = self._z_score_to_percentile(z_score)
        
        # 0-100 범위로 제한
        return max(0.0, min(100.0, percentile))
    
    def _calculate_performance_percentile(
        self,
        value: float,
        cohort_mean: float,
        metric_type: str,
        cohort_stats: CohortStats
    ) -> float:
        """성능 지표 백분위 계산"""
        
        # 성능 지표별 표준편차 추정 (실제 데이터가 있다면 DB에서 가져와야 함)
        std_estimates = {
            'acpl': cohort_mean * 0.3,  # ACPL은 평균의 30% 정도가 표준편차
            'accuracy': 15.0,  # 정확도는 약 15% 표준편차
            'blunders': 2.0,   # 블런더는 게임당 2개 정도 표준편차
            'mistakes': 3.0    # 실수는 게임당 3개 정도 표준편차
        }
        
        std = std_estimates.get(metric_type, cohort_mean * 0.2)
        
        if std <= 0:
            return 50.0
        
        z_score = (value - cohort_mean) / std
        
        # ACPL의 경우 낮을수록 좋으므로 부호 반전
        if metric_type == 'acpl':
            z_score = -z_score
        
        percentile = self._z_score_to_percentile(z_score)
        return max(0.0, min(100.0, percentile))
    
    def _z_score_to_percentile(self, z_score: float) -> float:
        """Z-score를 백분위로 변환 (누적분포함수 근사)"""
        
        # 표준정규분포 누적분포함수의 근사값
        # 더 정확한 계산을 위해서는 scipy.stats.norm.cdf를 사용할 수 있음
        
        if z_score < -3:
            return 0.1
        elif z_score > 3:
            return 99.9
        
        # 간단한 근사 공식 (Hastings 근사)
        t = 1.0 / (1.0 + 0.2316419 * abs(z_score))
        d = 0.3989423 * pow(2.718281828, -z_score * z_score / 2)
        prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
        
        if z_score > 0:
            prob = 1.0 - prob
        
        return prob * 100.0
    
    async def update_cohort_data(
        self, 
        rating_range: str, 
        time_control: str,
        profiles: List["PlayerProfile"]
    ) -> bool:
        """새로운 플레이어 데이터로 코호트 통계 업데이트"""
        
        if not profiles:
            return False
        
        try:
            logger.info(f"Updating cohort data for {rating_range} {time_control} with {len(profiles)} profiles")
            
            # 각 차원별 점수 수집
            dimension_scores = {}
            performance_metrics = {
                'acpl': [],
                'accuracy': [],
                'blunders': [],
                'mistakes': [],
                'tactical_opportunities': []
            }
            
            for profile in profiles:
                for dimension, score_obj in profile.style_scores.items():
                    if dimension.value not in dimension_scores:
                        dimension_scores[dimension.value] = []
                    dimension_scores[dimension.value].append(score_obj.score)
                
                # 성능 지표 수집
                performance_metrics['acpl'].append(profile.overall_acpl)
                performance_metrics['accuracy'].append(profile.win_rate * 100)  # 승률을 정확도 대용으로
                
                # 전술 기회 수 (tactical_stats에서 추출)
                if profile.tactical_stats and 'total_tactical_opportunities' in profile.tactical_stats:
                    performance_metrics['tactical_opportunities'].append(
                        profile.tactical_stats['total_tactical_opportunities']
                    )
            
            # 통계 계산
            update_data = []
            
            for dimension, scores in dimension_scores.items():
                if len(scores) >= 2:  # 최소 2개 데이터 포인트 필요
                    mean = statistics.mean(scores)
                    std = statistics.stdev(scores)
                else:
                    mean, std = 50.0, 15.0  # 기본값
                
                update_data.extend([mean, std])
            
            # 성능 지표 통계
            perf_stats = {}
            for metric, values in performance_metrics.items():
                if len(values) >= 2:
                    perf_stats[f'avg_{metric}'] = statistics.mean(values)
                else:
                    perf_stats[f'avg_{metric}'] = 0.0
            
            # 데이터베이스 업데이트
            update_query = """
                UPDATE cohort_data SET
                    sample_size = sample_size + $1,
                    aggression_mean = $2, aggression_std = $3,
                    tactical_dependency_mean = $4, tactical_dependency_std = $5,
                    risk_taking_mean = $6, risk_taking_std = $7,
                    positional_orientation_mean = $8, positional_orientation_std = $9,
                    exchange_preference_mean = $10, exchange_preference_std = $11,
                    opening_variety_mean = $12, opening_variety_std = $13,
                    book_deviation_mean = $14, book_deviation_std = $15,
                    lead_conversion_mean = $16, lead_conversion_std = $17,
                    endgame_technique_mean = $18, endgame_technique_std = $19,
                    time_management_mean = $20, time_management_std = $21,
                    consistency_mean = $22, consistency_std = $23,
                    swindle_resistance_mean = $24, swindle_resistance_std = $25,
                    avg_acpl = $26,
                    avg_accuracy = $27,
                    avg_tactical_opportunities = $28,
                    last_updated = NOW()
                WHERE rating_range = $29 AND time_control = $30 AND platform = $31
            """
            
            params = [
                len(profiles),  # 샘플 크기 증가
                *update_data,   # 12개 차원 * 2 (평균, 표준편차) = 24개
                perf_stats['avg_acpl'],
                perf_stats['avg_accuracy'],
                perf_stats['avg_tactical_opportunities'],
                rating_range,
                time_control,
                'chess.com'
            ]
            
            await self.db_client.execute(update_query, params)
            
            # 캐시 무효화
            cache_key = f"{rating_range}_{time_control}_chess.com"
            if cache_key in self._cohort_cache:
                del self._cohort_cache[cache_key]
            
            logger.info(f"Successfully updated cohort data for {rating_range} {time_control}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to update cohort data: {e}")
            return False
    
    async def get_percentile_insights(
        self, 
        profile: "PlayerProfile"
    ) -> List[Dict[str, Any]]:
        """백분위 기반 인사이트 생성"""
        
        insights = []
        
        try:
            for dimension, score_obj in profile.style_scores.items():
                if score_obj.percentile is None:
                    continue
                
                percentile = score_obj.percentile
                
                # 상위/하위 10% 구간에서 인사이트 생성
                if percentile >= 90:
                    insights.append({
                        'type': 'strength',
                        'dimension': dimension.value,
                        'percentile': percentile,
                        'message': f"{dimension.value} 능력이 상위 {100-percentile:.0f}%에 속합니다",
                        'recommendation': f"강점인 {dimension.value}를 더욱 발전시키세요"
                    })
                elif percentile <= 10:
                    insights.append({
                        'type': 'weakness',
                        'dimension': dimension.value,
                        'percentile': percentile,
                        'message': f"{dimension.value} 능력이 하위 {percentile:.0f}%에 속합니다",
                        'recommendation': f"{dimension.value} 개선에 집중적으로 훈련하세요"
                    })
        
        except Exception as e:
            logger.error(f"Failed to generate percentile insights: {e}")
        
        return insights


# 편의 함수들
async def normalize_profile_with_rating(
    profile: "PlayerProfile",
    rating: int,
    time_control: str = 'blitz',
    db_client: DatabaseClient = None,
    opponent_ratings: List[int] = None
) -> "PlayerProfile":
    """플레이어 프로파일 정규화 편의 함수"""
    
    normalizer = CohortNormalizer(db_client)
    return await normalizer.normalize_player_profile(profile, rating, time_control, opponent_ratings)


def get_rating_range_for_rating(rating: int) -> str:
    """레이팅을 레이팅 범위로 변환하는 편의 함수"""
    normalizer = CohortNormalizer()
    return normalizer._get_rating_range(rating)