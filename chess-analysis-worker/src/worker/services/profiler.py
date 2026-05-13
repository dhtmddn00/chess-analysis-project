"""
플레이어 프로파일링 모듈 (Elite v2.0)

게임 분석 결과를 기반으로 플레이어의 스타일을 12차원 벡터로 분석하고
구체적인 증거와 함께 프로파일을 생성합니다.

Elite-optimized scoring for world-class players with bucket-based evaluation.
"""

import math
import statistics
import time
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass, asdict
from enum import Enum
import chess
from ..utils.elite_config import get_elite_config, RatingBand

from loguru import logger
from ..models.analysis_types import GameAnalysis, MoveAnalysis, MoveQuality, Evidence, StyleScore
from ..utils.pgn_parser import ParsedGame, TimeControl, GameResult
from .chess_api import ChessComAPI
from .tactical_detector import create_tactical_evidence
from .cohort_normalizer import CohortNormalizer
from .training_plan_generator import TrainingPlanGenerator


def safe_variance(data):
    """안전한 variance 계산 - 최소 2개 데이터 포인트 필요"""
    if not data or len(data) < 2:
        return 0.0
    try:
        # 유효한 숫자 데이터만 필터링
        valid_data = [x for x in data if x is not None and isinstance(x, (int, float)) and not math.isnan(x)]
        if len(valid_data) < 2:
            return 0.0
        mean = sum(valid_data) / len(valid_data)
        return sum((x - mean) ** 2 for x in valid_data) / (len(valid_data) - 1)
    except (ValueError, ZeroDivisionError, TypeError):
        return 0.0


class StyleDimension(Enum):
    """스타일 차원 정의"""
    AGGRESSION = "aggression"
    TACTICAL_DEPENDENCY = "tactical_dependency" 
    RISK_TAKING = "risk_taking"
    POSITIONAL_ORIENTATION = "positional_orientation"
    EXCHANGE_PREFERENCE = "exchange_preference"
    OPENING_VARIETY = "opening_variety"
    BOOK_DEVIATION = "book_deviation"
    LEAD_CONVERSION = "lead_conversion"
    ENDGAME_TECHNIQUE = "endgame_technique"
    TIME_MANAGEMENT = "time_management"
    CONSISTENCY = "consistency"
    SWINDLE_RESISTANCE = "swindle_resistance"


@dataclass
class Evidence:
    """스타일 증거 데이터"""
    game_id: str
    ply: int
    move_san: str
    description: str
    impact_score: float
    context: Dict[str, Any]


@dataclass
class StyleScore:
    """개별 스타일 점수"""
    dimension: StyleDimension
    score: float  # 0-100 스케일
    percentile: Optional[float] = None  # 코호트 내 백분위
    evidence: List[Evidence] = None
    
    def __post_init__(self):
        if self.evidence is None:
            self.evidence = []


@dataclass
class PlayerProfile:
    """플레이어 프로파일"""
    player_name: str
    total_games: int
    total_moves: int
    average_rating: int
    
    # 12차원 스타일 점수
    style_scores: Dict[StyleDimension, StyleScore]
    
    # 전체 성과 지표
    overall_acpl: float
    win_rate: float
    draw_rate: float
    loss_rate: float
    
    # 시간제어별 성과
    time_control_stats: Dict[TimeControl, Dict[str, float]]
    
    # 색깔별 성과
    white_stats: Dict[str, float]
    black_stats: Dict[str, float]
    
    # 오프닝 통계
    opening_repertoire: Dict[str, Dict[str, Any]]
    
    # 주요 태그
    style_tags: List[str]
    
    # 플레이어 메타데이터
    metadata: Dict[str, Any] = None
    
    # 전술 통계
    tactical_stats: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}
        if self.tactical_stats is None:
            self.tactical_stats = {}


class PlayerProfiler:
    """
    플레이어 프로파일링 엔진
    
    게임 분석 결과를 바탕으로 플레이어의 스타일을 12차원으로 분석하고
    구체적인 증거와 개선점을 도출합니다.
    """
    
    def __init__(self, db_client=None):
        self.dimension_weights = self._initialize_dimension_weights()
        self.cohort_normalizer = CohortNormalizer(db_client)
        self.training_plan_generator = TrainingPlanGenerator(db_client)
        
    def _initialize_dimension_weights(self) -> Dict[StyleDimension, Dict[str, float]]:
        """각 차원별 가중치 초기화"""
        return {
            StyleDimension.AGGRESSION: {
                'check_rate': 0.25,
                'king_attack_moves': 0.3,
                'pawn_storms': 0.25,
                'eval_volatility': 0.2
            },
            StyleDimension.TACTICAL_DEPENDENCY: {
                'tactical_accuracy': 0.4,
                'tactical_attempts': 0.4,
                'positional_weakness': -0.2
            },
            StyleDimension.RISK_TAKING: {
                'eval_variance': 0.5,
                'material_sacrifices': 0.5
            },
            StyleDimension.POSITIONAL_ORIENTATION: {
                'center_control': 0.4,
                'piece_activity': 0.3,
                'pawn_structure': 0.3
            },
            StyleDimension.EXCHANGE_PREFERENCE: {
                'winning_exchanges': 0.6,
                'losing_exchanges': -0.4
            },
            StyleDimension.OPENING_VARIETY: {
                'eco_diversity': 0.7,
                'line_count': 0.3
            },
            StyleDimension.BOOK_DEVIATION: {
                'early_deviation': 0.6,
                'deviation_success': 0.4
            },
            StyleDimension.LEAD_CONVERSION: {
                'winning_conversion': 0.7,
                'advantage_maintenance': 0.3
            },
            StyleDimension.ENDGAME_TECHNIQUE: {
                'endgame_acpl': 0.6,
                'material_conversion': 0.4
            },
            StyleDimension.TIME_MANAGEMENT: {
                'time_distribution': 0.5,
                'critical_thinking': 0.3,
                'flag_incidents': -0.2
            },
            StyleDimension.CONSISTENCY: {
                'acpl_variance': -0.5,
                'blunder_variance': -0.5
            },
            StyleDimension.SWINDLE_RESISTANCE: {
                'comeback_rate': 0.7,
                'defense_quality': 0.3
            }
        }
    
    async def create_profile(
        self, 
        player_name: str,
        parsed_games: List[ParsedGame],
        game_analyses: List[GameAnalysis]
    ) -> PlayerProfile:
        """
        플레이어 프로파일 생성
        
        Args:
            player_name: 플레이어 이름
            parsed_games: 파싱된 게임 리스트
            game_analyses: 게임 분석 결과 리스트
            
        Returns:
            완성된 플레이어 프로파일
        """
        logger.info(f"플레이어 프로파일 생성 시작: {player_name}")
        
        # 기본 통계 계산
        basic_stats = self._calculate_basic_stats(player_name, parsed_games, game_analyses)
        
        # 12차원 스타일 점수 계산
        style_scores = self._calculate_style_scores(player_name, parsed_games, game_analyses)
        
        # 시간제어별/색깔별 통계
        time_control_stats = self._calculate_time_control_stats(player_name, parsed_games, game_analyses)
        color_stats = self._calculate_color_stats(player_name, parsed_games, game_analyses)
        
        # 오프닝 레퍼토리 분석
        opening_repertoire = self._analyze_opening_repertoire(player_name, parsed_games)
        
        # 스타일 태그 생성
        style_tags = self._generate_style_tags(style_scores)
        
        # 플레이어 메타데이터 수집
        metadata = await self._collect_player_metadata(player_name)
        
        # 전술 통계 계산
        tactical_stats = self._calculate_tactical_stats(game_analyses)
        
        profile = PlayerProfile(
            player_name=player_name,
            total_games=basic_stats['total_games'],
            total_moves=basic_stats['total_moves'],
            average_rating=basic_stats['average_rating'],
            style_scores=style_scores,
            overall_acpl=basic_stats['overall_acpl'],
            win_rate=basic_stats['win_rate'],
            draw_rate=basic_stats['draw_rate'],
            loss_rate=basic_stats['loss_rate'],
            time_control_stats=time_control_stats,
            white_stats=color_stats['white'],
            black_stats=color_stats['black'],
            opening_repertoire=opening_repertoire,
            style_tags=style_tags,
            metadata=metadata,
            tactical_stats=tactical_stats
        )
        
        # 코호트 정규화 (백분위 계산)
        try:
            # 주요 시간제어 결정 (가장 많이 플레이한 시간제어)
            main_time_control = self._determine_main_time_control(parsed_games)
            
            # 코호트 정규화 실행
            normalized_profile = await self.cohort_normalizer.normalize_player_profile(
                profile, basic_stats['average_rating'], main_time_control
            )
            
            logger.info(f"코호트 정규화 완료: {player_name}")
            profile = normalized_profile
            
        except Exception as e:
            logger.warning(f"코호트 정규화 실패 ({player_name}): {e}")
            # 정규화 실패해도 기본 프로파일은 반환
        
        # 훈련 계획 생성 ("100 Elo Up" 플랜)
        try:
            training_plan = await self.training_plan_generator.generate_training_plan(profile)
            
            # 훈련 계획 요약을 메타데이터에 추가
            if profile.metadata is None:
                profile.metadata = {}
            
            profile.metadata['training_plan_summary'] = {
                'total_recommendations': len(training_plan.critical_fixes + training_plan.high_priority + training_plan.medium_priority),
                'critical_fixes': len(training_plan.critical_fixes),
                'estimated_elo_gain': training_plan.target_elo_gain,
                'total_time_hours': training_plan.total_time_estimate,
                'generated_at': time.time()
            }
            
            logger.info(f"훈련 계획 생성 완료: {player_name} (+{training_plan.target_elo_gain} Elo 목표)")
            
        except Exception as e:
            logger.warning(f"훈련 계획 생성 실패 ({player_name}): {e}")
            # 훈련 계획 생성 실패해도 프로파일은 반환
        
        logger.info(f"프로파일 생성 완료: {len(style_scores)}개 차원 분석")
        return profile
    
    def _calculate_basic_stats(
        self, 
        player_name: str, 
        parsed_games: List[ParsedGame], 
        game_analyses: List[GameAnalysis]
    ) -> Dict[str, Any]:
        """기본 통계 계산"""
        
        if not parsed_games or not game_analyses:
            return {
                'total_games': 0,
                'total_moves': 0,
                'average_rating': 0,
                'overall_acpl': 0,
                'win_rate': 0,
                'draw_rate': 0,
                'loss_rate': 0
            }
        
        total_games = len(parsed_games)
        total_moves = sum(len(analysis.move_analyses) for analysis in game_analyses)
        
        # 평균 레이팅 계산
        ratings = []
        results = []
        player_acpls = []
        
        for game, analysis in zip(parsed_games, game_analyses):
            # 플레이어 색깔 확인
            is_white = game.info.white_player.lower() == player_name.lower()
            
            if is_white:
                ratings.append(game.info.white_rating)
                player_acpls.append(analysis.white_acpl)
            else:
                ratings.append(game.info.black_rating)
                player_acpls.append(analysis.black_acpl)
            
            # 결과 계산
            if game.info.result == GameResult.WHITE_WIN:
                results.append('win' if is_white else 'loss')
            elif game.info.result == GameResult.BLACK_WIN:
                results.append('loss' if is_white else 'win')
            else:
                results.append('draw')
        
        average_rating = int(statistics.mean(ratings)) if ratings else 0
        overall_acpl = statistics.mean(player_acpls) if player_acpls else 0
        
        # Calculate elite-adjusted accuracy score using new formula
        elite_config = get_elite_config()
        rating_band = elite_config.get_rating_band(average_rating)
        elite_accuracy = elite_config.calculate_elite_accuracy(overall_acpl, rating_band)
        
        logger.info(f"Elite accuracy for {player_name}: {elite_accuracy:.1f} (ACPL={overall_acpl:.1f}, band={rating_band.value})")
        
        # 승부 통계
        win_count = results.count('win')
        draw_count = results.count('draw')
        loss_count = results.count('loss')
        
        return {
            'total_games': total_games,
            'total_moves': total_moves,
            'average_rating': average_rating,
            'overall_acpl': overall_acpl,
            'elite_accuracy': elite_accuracy,  # New elite-adjusted accuracy
            'win_rate': win_count / max(1, total_games),
            'draw_rate': draw_count / max(1, total_games),
            'loss_rate': loss_count / max(1, total_games)
        }
    
    def _calculate_style_scores(
        self, 
        player_name: str,
        parsed_games: List[ParsedGame], 
        game_analyses: List[GameAnalysis]
    ) -> Dict[StyleDimension, StyleScore]:
        """12차원 스타일 점수 계산"""
        
        style_scores = {}
        
        for dimension in StyleDimension:
            try:
                score, evidence = self._calculate_dimension_score(
                    dimension, player_name, parsed_games, game_analyses
                )
                
                style_scores[dimension] = StyleScore(
                    dimension=dimension,
                    score=score,
                    evidence=evidence
                )
            except Exception as e:
                logger.error(f"차원 {dimension.value} 계산 오류: {e}")
                # 기본값으로 설정
                style_scores[dimension] = StyleScore(
                    dimension=dimension,
                    score=50.0,
                    evidence=[]
                )
        
        return style_scores
    
    def _calculate_dimension_score(
        self, 
        dimension: StyleDimension,
        player_name: str,
        parsed_games: List[ParsedGame],
        game_analyses: List[GameAnalysis]
    ) -> Tuple[float, List[Evidence]]:
        """개별 차원 점수 계산"""
        
        try:
            logger.debug(f"차원 {dimension.value} 계산 시작")
            
            if dimension == StyleDimension.AGGRESSION:
                return self._calculate_aggression(player_name, parsed_games, game_analyses)
            elif dimension == StyleDimension.TACTICAL_DEPENDENCY:
                return self._calculate_tactical_dependency(player_name, parsed_games, game_analyses)
            elif dimension == StyleDimension.RISK_TAKING:
                return self._calculate_risk_taking(player_name, parsed_games, game_analyses)
            elif dimension == StyleDimension.POSITIONAL_ORIENTATION:
                return self._calculate_positional_orientation(player_name, parsed_games, game_analyses)
            elif dimension == StyleDimension.EXCHANGE_PREFERENCE:
                return self._calculate_exchange_preference(player_name, parsed_games, game_analyses)
            elif dimension == StyleDimension.OPENING_VARIETY:
                return self._calculate_opening_variety(player_name, parsed_games, game_analyses)
            elif dimension == StyleDimension.BOOK_DEVIATION:
                return self._calculate_book_deviation(player_name, parsed_games, game_analyses)
            elif dimension == StyleDimension.LEAD_CONVERSION:
                return self._calculate_lead_conversion(player_name, parsed_games, game_analyses)
            elif dimension == StyleDimension.ENDGAME_TECHNIQUE:
                return self._calculate_endgame_technique(player_name, parsed_games, game_analyses)
            elif dimension == StyleDimension.TIME_MANAGEMENT:
                return self._calculate_time_management(player_name, parsed_games, game_analyses)
            elif dimension == StyleDimension.CONSISTENCY:
                return self._calculate_consistency(player_name, parsed_games, game_analyses)
            elif dimension == StyleDimension.SWINDLE_RESISTANCE:
                return self._calculate_swindle_resistance(player_name, parsed_games, game_analyses)
            else:
                return 50.0, []  # 기본값
        except Exception as e:
            logger.error(f"차원 {dimension.value} 계산 중 오류: {e}", exc_info=True)
            return 50.0, []  # 오류 시 기본값 반환
    
    def _calculate_aggression(
        self, 
        player_name: str,
        parsed_games: List[ParsedGame],
        game_analyses: List[GameAnalysis]
    ) -> Tuple[float, List[Evidence]]:
        """공격성 점수 계산"""
        
        check_rates = []
        king_attack_counts = []
        pawn_storm_counts = []
        eval_volatilities = []
        evidence = []
        
        for game, analysis in zip(parsed_games, game_analyses):
            is_white = game.info.white_player.lower() == player_name.lower()
            
            # 플레이어의 수만 필터링
            player_moves = [
                move for move in analysis.move_analyses
                if (move.ply % 2 == 0) == is_white
            ]
            
            if not player_moves:
                continue
            
            # 체크 비율
            check_count = sum(1 for move in player_moves if move.is_check)
            check_rate = check_count / len(player_moves)
            check_rates.append(check_rate)
            
            # 킹 공격 수 (상대 킹 주변 3칸 이내 침투)
            king_attacks = sum(1 for move in player_moves if self._is_king_attack_move(move))
            king_attack_counts.append(king_attacks)
            
            # 폰 스톰 (킹쪽 폰 전진)
            pawn_storms = sum(1 for move in player_moves if self._is_pawn_storm_move(move))
            pawn_storm_counts.append(pawn_storms)
            
            # 평가 변동성
            evals = [move.eval_after for move in player_moves if move.eval_after is not None]
            if len(evals) > 1:
                try:
                    volatility = statistics.stdev(evals)
                    eval_volatilities.append(volatility)
                except (statistics.StatisticsError, ValueError) as e:
                    logger.debug(f"평가 변동성 계산 오류: {e}, evals 개수: {len(evals)}")
                    # 변동성을 수동으로 계산
                    if len(evals) >= 2:
                        mean_eval = statistics.mean(evals)
                        variance = sum((x - mean_eval) ** 2 for x in evals) / (len(evals) - 1)
                        volatility = math.sqrt(variance)
                        eval_volatilities.append(volatility)
            
            # 증거 수집 (상위 공격적 수들)
            aggressive_moves = [
                move for move in player_moves 
                if move.is_check or self._is_king_attack_move(move)
            ]
            
            for move in aggressive_moves[:2]:  # 상위 2개만
                evidence.append(Evidence(
                    game_id=str(hash(f"{game.info.white_player}_{game.info.black_player}")),
                    ply=move.ply,
                    move_san=move.move_san,
                    description=f"공격적 수: {'체크' if move.is_check else '킹 공격'}",
                    impact_score=1.0,
                    context={'is_check': move.is_check, 'eval_after': move.eval_after}
                ))
        
        # 점수 계산 (0-100 스케일)
        weights = self.dimension_weights[StyleDimension.AGGRESSION]
        
        avg_check_rate = statistics.mean(check_rates) if check_rates else 0
        avg_king_attacks = statistics.mean(king_attack_counts) if king_attack_counts else 0
        avg_pawn_storms = statistics.mean(pawn_storm_counts) if pawn_storm_counts else 0
        avg_volatility = statistics.mean(eval_volatilities) if eval_volatilities else 0
        
        # 정규화 및 가중합
        score = (
            weights['check_rate'] * min(100, avg_check_rate * 500) +
            weights['king_attack_moves'] * min(100, avg_king_attacks * 10) +
            weights['pawn_storms'] * min(100, avg_pawn_storms * 20) +
            weights['eval_volatility'] * min(100, avg_volatility / 50)
        )
        
        return max(0, min(100, score)), evidence[:5]  # 상위 5개 증거만
    
    def _calculate_tactical_dependency(
        self, 
        player_name: str,
        parsed_games: List[ParsedGame],
        game_analyses: List[GameAnalysis]
    ) -> Tuple[float, List[Evidence]]:
        """전술 의존성 점수 계산 (Elite v2.0)"""
        
        # Get elite configuration and player rating band
        elite_config = get_elite_config()
        avg_rating = self._get_average_player_rating(parsed_games, player_name)
        rating_band = elite_config.get_rating_band(avg_rating)
        tactical_epsilon = elite_config.get_tactical_epsilon(rating_band)
        
        logger.info(f"Tactical analysis for {player_name}: rating={avg_rating}, band={rating_band.value}, epsilon={tactical_epsilon}")
        
        tactical_success_rates = []
        tactical_attempt_rates = []
        evidence = []
        total_difficulty_weighted_score = 0.0
        total_weight = 0.0
        all_tactical_moves = []  # Collect all tactical moves for complexity analysis
        
        logger.info(f"Starting tactical loop: parsed_games={len(parsed_games)}, game_analyses={len(game_analyses)}")
        
        for game, analysis in zip(parsed_games, game_analyses):
            is_white = game.info.white_player.lower() == player_name.lower()
            opponent_rating = game.info.black_rating if is_white else game.info.white_rating
            
            logger.info(f"Processing game {analysis.game_id}: total_moves={len(analysis.move_analyses)}, is_white={is_white}")
            
            player_moves = [
                move for move in analysis.move_analyses
                if (move.ply % 2 == 0) == is_white
            ]
            
            logger.info(f"Game {analysis.game_id}: player_moves={len(player_moves)}")
            
            if not player_moves:
                logger.warning(f"No player moves found for game {analysis.game_id}")
                continue
            
            # Get opponent strength weight
            opponent_weight = elite_config.get_opponent_weight(avg_rating, opponent_rating or avg_rating, rating_band)
            
            # Enhanced tactical move detection with elite epsilon and position complexity
            tactical_moves = []
            for i, move in enumerate(player_moves):
                is_tactical = move.is_check or move.is_capture or self._is_tactical_move(move)
                if i < 3:  # Log first 3 moves to debug
                    logger.info(f"Checking move {i}: {move.move_san} (check={move.is_check}, capture={move.is_capture}, promotion={move.is_promotion}, tactical={is_tactical})")
                if is_tactical:
                    logger.info(f"Found tactical move: {move.move_san} (check={move.is_check}, capture={move.is_capture}, promotion={move.is_promotion})")
                    # Calculate position complexity for this move
                    position_entropy = self._calculate_position_entropy(analysis, move.ply)
                    
                    # Elite-adjusted success criteria with complexity adjustment
                    base_epsilon = tactical_epsilon
                    complexity_adjusted_epsilon = base_epsilon * (1.0 + position_entropy * 0.5)  # More tolerance in complex positions
                    
                    is_excellent = (
                        move.centipawn_loss <= complexity_adjusted_epsilon and
                        move.quality in [MoveQuality.BEST, MoveQuality.GOOD]
                    )
                    
                    # Calculate difficulty factor
                    difficulty = self._calculate_move_difficulty(move)
                    
                    tactical_move = {
                        'move': move,
                        'is_excellent': is_excellent,
                        'difficulty': difficulty,
                        'opponent_weight': opponent_weight,
                        'position_entropy': position_entropy
                    }
                    tactical_moves.append(tactical_move)
                    all_tactical_moves.append(tactical_move)  # Store for later complexity analysis
            
            tactical_attempt_rate = len(tactical_moves) / len(player_moves)
            tactical_attempt_rates.append(tactical_attempt_rate * opponent_weight)
            
            # Calculate difficulty-weighted success rate
            if tactical_moves:
                successful_count = 0
                total_moves_weight = 0
                
                for tactical_move in tactical_moves:
                    move_weight = tactical_move['difficulty'] * tactical_move['opponent_weight']
                    total_moves_weight += move_weight
                    
                    if tactical_move['is_excellent']:
                        successful_count += move_weight
                        
                        # Enhanced evidence collection
                        if len(evidence) < 5:
                            evidence.append(Evidence(
                                game_id=str(hash(f"{game.info.white_player}_{game.info.black_player}")),
                                ply=tactical_move['move'].ply,
                                move_san=tactical_move['move'].move_san,
                                description=f"고난도 전술 성공 (난이도 {tactical_move['difficulty']:.2f})",
                                impact_score=tactical_move['difficulty'] * tactical_move['opponent_weight'],
                                context={
                                    'quality': tactical_move['move'].quality.value,
                                    'cp_loss': tactical_move['move'].centipawn_loss,
                                    'difficulty': tactical_move['difficulty'],
                                    'opponent_strength': tactical_move['opponent_weight']
                                }
                            ))
                
                if total_moves_weight > 0:
                    success_rate = successful_count / total_moves_weight
                    tactical_success_rates.append(success_rate)
                    total_difficulty_weighted_score += success_rate * total_moves_weight
                    total_weight += total_moves_weight
        
        # Elite-optimized scoring
        avg_success_rate = (total_difficulty_weighted_score / total_weight) if total_weight > 0 else 0
        avg_attempt_rate = statistics.mean(tactical_attempt_rates) if tactical_attempt_rates else 0
        
        # Enhanced scoring formula for elite players
        base_score = (
            0.6 * avg_success_rate * 100 +  # Increased weight on success rate
            0.4 * min(100, avg_attempt_rate * 150)  # Adjusted attempt rate scaling
        )
        
        # Elite player boost
        if rating_band in [RatingBand.B4, RatingBand.B5]:
            # Apply saturation curve for elite players
            base_score = min(base_score * 1.2, 95)  # Boost with ceiling
        
        # Apply position complexity adjustment based on average entropy of tactical positions
        if all_tactical_moves:
            avg_position_entropy = statistics.mean([tm['position_entropy'] for tm in all_tactical_moves])
            base_score = self._apply_position_complexity_adjustment(base_score, avg_position_entropy, rating_band)
        
        final_score = max(0, min(100, base_score))
        
        logger.info(f"Tactical score for {player_name}: {final_score:.1f} (success_rate={avg_success_rate:.2f}, attempt_rate={avg_attempt_rate:.2f})")
        
        return final_score, evidence[:5]
    
    def _get_average_player_rating(self, parsed_games: List[ParsedGame], player_name: str) -> int:
        """Get average rating for player across games"""
        ratings = []
        for game in parsed_games:
            if game.info.white_player.lower() == player_name.lower() and game.info.white_rating:
                ratings.append(game.info.white_rating)
            elif game.info.black_player.lower() == player_name.lower() and game.info.black_rating:
                ratings.append(game.info.black_rating)
        
        return int(statistics.mean(ratings)) if ratings else 2000  # Default fallback
    
    def _calculate_move_difficulty(self, move: MoveAnalysis) -> float:
        """Calculate tactical difficulty factor (0.5 - 2.0)"""
        difficulty = 1.0
        
        # Base difficulty from centipawn loss (precision required)
        if move.centipawn_loss <= 5:
            difficulty += 0.5  # Very precise move
        elif move.centipawn_loss <= 15:
            difficulty += 0.3  # Good precision
        elif move.centipawn_loss <= 30:
            difficulty += 0.1  # Reasonable precision
        
        # Forcing moves (checks/captures) are often clearer
        if move.is_check or move.is_capture:
            difficulty += 0.2
        
        # Complex positions (many tactical opportunities) are harder
        if hasattr(move, 'tactical_opportunities') and move.tactical_opportunities:
            complexity = min(len(move.tactical_opportunities), 5) * 0.1
            difficulty += complexity
        
        return min(difficulty, 2.0)  # Cap at 2.0
    
    def _calculate_risk_taking(
        self, 
        player_name: str,
        parsed_games: List[ParsedGame],
        game_analyses: List[GameAnalysis]
    ) -> Tuple[float, List[Evidence]]:
        """위험 감수 점수 계산"""
        
        eval_variances = []
        sacrifice_counts = []
        evidence = []
        
        for game, analysis in zip(parsed_games, game_analyses):
            is_white = game.info.white_player.lower() == player_name.lower()
            
            player_moves = [
                move for move in analysis.move_analyses
                if (move.ply % 2 == 0) == is_white
            ]
            
            if not player_moves:
                continue
            
            # 평가 분산 (위험도 지표)
            evals = [move.eval_after for move in player_moves if move.eval_after is not None]
            variance = safe_variance(evals)
            eval_variances.append(variance)
            
            # 물질 희생 탐지
            sacrifices = 0
            for move in player_moves:
                if (move.eval_before is not None and move.eval_after is not None and
                    move.eval_before - move.eval_after > 100 and  # 1폰 이상 손실
                    move.quality != MoveQuality.BLUNDER):  # 블런더가 아닌 의도적 희생
                    sacrifices += 1
                    
                    evidence.append(Evidence(
                        game_id=str(hash(f"{game.info.white_player}_{game.info.black_player}")),
                        ply=move.ply,
                        move_san=move.move_san,
                        description=f"물질 희생 ({move.eval_before - move.eval_after}cp)",
                        impact_score=1.5,
                        context={'eval_loss': move.eval_before - move.eval_after}
                    ))
            
            sacrifice_counts.append(sacrifices)
        
        # 점수 계산
        weights = self.dimension_weights[StyleDimension.RISK_TAKING]
        
        avg_variance = statistics.mean(eval_variances) if eval_variances else 0
        avg_sacrifices = statistics.mean(sacrifice_counts) if sacrifice_counts else 0
        
        score = (
            weights['eval_variance'] * min(100, avg_variance / 10000) +
            weights['material_sacrifices'] * min(100, avg_sacrifices * 25)
        )
        
        return max(0, min(100, score)), evidence[:5]
    
    def _calculate_positional_orientation(
        self, 
        player_name: str,
        parsed_games: List[ParsedGame],
        game_analyses: List[GameAnalysis]
    ) -> Tuple[float, List[Evidence]]:
        """포지셔널 지향성 점수 계산"""
        
        positional_scores = []
        evidence = []
        
        for game, analysis in zip(parsed_games, game_analyses):
            is_white = game.info.white_player.lower() == player_name.lower()
            
            player_moves = [
                move for move in analysis.move_analyses
                if (move.ply % 2 == 0) == is_white
            ]

            if not player_moves:
                continue
            
            quiet_good = 0
            forcing_moves = 0
            cp_losses = []

            for move in player_moves:
                is_forcing = move.is_check or move.is_capture or move.is_promotion
                if is_forcing:
                    forcing_moves += 1

                if move.centipawn_loss is not None:
                    cp_losses.append(move.centipawn_loss)

                if (not is_forcing and move.quality in [MoveQuality.BEST, MoveQuality.GOOD]):
                    quiet_good += 1
                    
                    if len(evidence) < 3:
                        evidence.append(Evidence(
                            game_id=str(hash(f"{game.info.white_player}_{game.info.black_player}")),
                            ply=move.ply,
                            move_san=move.move_san,
                            description=f"포지셔널 수: {move.quality.value}",
                            impact_score=1.0,
                            context={'quality': move.quality.value}
                        ))
            
            quiet_good_rate = quiet_good / len(player_moves)
            forcing_rate = forcing_moves / len(player_moves)
            avg_cp_loss = statistics.mean(cp_losses) if cp_losses else 80

            quiet_score = min(100, quiet_good_rate * 100)
            restraint_score = max(0, 100 - (forcing_rate * 120))
            accuracy_score = max(0, 100 - avg_cp_loss)
            game_score = (
                quiet_score * 0.45 +
                restraint_score * 0.25 +
                accuracy_score * 0.30
            )
            positional_scores.append(game_score)
        
        score = statistics.mean(positional_scores) if positional_scores else 50
        
        return score, evidence
    
    def _calculate_exchange_preference(
        self, 
        player_name: str,
        parsed_games: List[ParsedGame],
        game_analyses: List[GameAnalysis]
    ) -> Tuple[float, List[Evidence]]:
        """교환 성향 점수 계산"""
        
        # 우세 시 교환 vs 열세 시 교환 비율로 계산
        winning_exchanges = []
        losing_exchanges = []
        evidence = []
        
        for game, analysis in zip(parsed_games, game_analyses):
            is_white = game.info.white_player.lower() == player_name.lower()
            
            player_moves = [
                move for move in analysis.move_analyses
                if (move.ply % 2 == 0) == is_white
            ]
            
            for move in player_moves:
                if move.is_capture and move.eval_before is not None:
                    # 우세/열세 판단 (백의 관점에서 조정)
                    eval_adjusted = move.eval_before if is_white else -move.eval_before
                    
                    if eval_adjusted > 150:  # 우세
                        winning_exchanges.append(1)
                    elif eval_adjusted < -150:  # 열세
                        losing_exchanges.append(1)
                    
                    if len(evidence) < 3:
                        evidence.append(Evidence(
                            game_id=str(hash(f"{game.info.white_player}_{game.info.black_player}")),
                            ply=move.ply,
                            move_san=move.move_san,
                            description=f"교환 ({eval_adjusted:+d}cp 상황)",
                            impact_score=1.0,
                            context={'eval_before': eval_adjusted}
                        ))
        
        # 교환 성향 점수 (우세 시 높은 교환률 = 간소화 선호)
        winning_rate = len(winning_exchanges) if winning_exchanges else 0
        losing_rate = len(losing_exchanges) if losing_exchanges else 0
        total_exchanges = winning_rate + losing_rate
        
        if total_exchanges > 0:
            # 비율 기반 점수에 완충 구간 추가
            raw_ratio = winning_rate / total_exchanges
            # 극값 방지: 20-80 범위로 제한
            score = 20 + (raw_ratio * 60)
            logger.debug(f"교환 성향 점수: 우세시={winning_rate}, 열세시={losing_rate}, ratio={raw_ratio:.2f}, score={score:.2f}")
        else:
            score = 50  # 교환 데이터 없음
            logger.debug(f"교환 성향 점수: 교환 데이터 없음, 기본값 {score} 사용")
        
        return score, evidence
    
    def _calculate_opening_variety(
        self, 
        player_name: str,
        parsed_games: List[ParsedGame],
        game_analyses: List[GameAnalysis]
    ) -> Tuple[float, List[Evidence]]:
        """오프닝 다양성 점수 계산"""
        
        eco_codes = []
        opening_lines = []
        evidence = []
        
        for game in parsed_games:
            is_white = game.info.white_player.lower() == player_name.lower()
            
            if game.info.eco:
                eco_codes.append(game.info.eco)
            
            # 첫 10수 추출
            first_moves = []
            node = game.game
            move_count = 0
            
            while node.variations and move_count < 10:
                node = node.variation(0)
                if (move_count % 2 == 0) == is_white:  # 플레이어의 수만
                    move_san = game.board_history[move_count].san(node.move)
                    first_moves.append(move_san)
                move_count += 1
            
            if first_moves:
                opening_line = " ".join(first_moves)
                opening_lines.append(opening_line)
        
        # 다양성 계산 (엔트로피)
        eco_diversity = len(set(eco_codes)) / max(1, len(eco_codes)) if eco_codes else 0
        line_diversity = len(set(opening_lines)) / max(1, len(opening_lines)) if opening_lines else 0
        
        # 증거 생성
        unique_ecos = list(set(eco_codes))
        for eco in unique_ecos[:3]:
            evidence.append(Evidence(
                game_id="repertoire",
                ply=0,
                move_san=eco,
                description=f"사용 오프닝: {eco}",
                impact_score=1.0,
                context={'eco': eco}
            ))
        
        score = (eco_diversity + line_diversity) * 50
        return min(100, score), evidence
    
    def _calculate_book_deviation(
        self, 
        player_name: str,
        parsed_games: List[ParsedGame],
        game_analyses: List[GameAnalysis]
    ) -> Tuple[float, List[Evidence]]:
        """이론 이탈 습관 점수 계산"""
        
        # 간단한 휴리스틱: ECO 분류가 있는 게임에서 초기 이탈 탐지
        deviation_games = 0
        total_games = 0
        evidence = []
        
        for game in parsed_games:
            if game.info.eco:
                total_games += 1
                # 게임이 20수 이상이고 일반적이지 않은 ECO면 이탈로 간주
                if len(game.board_history) > 20:
                    # 일반적인 오프닝 (E, D, C로 시작하지 않으면 비주류로 가정)
                    if not game.info.eco.startswith(('E4', 'D4', 'C2', 'C3')):
                        deviation_games += 1
                        
                        evidence.append(Evidence(
                            game_id=str(hash(f"{game.info.white_player}_{game.info.black_player}")),
                            ply=0,
                            move_san=game.info.eco,
                            description=f"비주류 오프닝 선택: {game.info.eco}",
                            impact_score=1.0,
                            context={'eco': game.info.eco}
                        ))
        
        if total_games > 0:
            score = (deviation_games / total_games) * 100
        else:
            score = 50  # 중립
        
        return score, evidence[:3]
    
    def _calculate_lead_conversion(
        self, 
        player_name: str,
        parsed_games: List[ParsedGame],
        game_analyses: List[GameAnalysis]
    ) -> Tuple[float, List[Evidence]]:
        """우세형세 유지력 점수 계산"""
        
        lead_situations = []
        conversions = []
        evidence = []
        
        for game, analysis in zip(parsed_games, game_analyses):
            is_white = game.info.white_player.lower() == player_name.lower()
            
            player_moves = [
                move for move in analysis.move_analyses
                if (move.ply % 2 == 0) == is_white
            ]
            
            # 우세 상황 탐지 (+150cp 이상)
            in_lead = False
            lead_start_eval = None
            
            for move in player_moves:
                if move.eval_before is not None:
                    eval_adjusted = move.eval_before if is_white else -move.eval_before
                    
                    if not in_lead and eval_adjusted > 150:
                        # 우세 진입
                        in_lead = True
                        lead_start_eval = eval_adjusted
                        
                    elif in_lead and eval_adjusted < 50:
                        # 우세 상실
                        lead_situations.append(lead_start_eval)
                        conversions.append(0)  # 실패
                        in_lead = False
                        
                        evidence.append(Evidence(
                            game_id=str(hash(f"{game.info.white_player}_{game.info.black_player}")),
                            ply=move.ply,
                            move_san=move.move_san,
                            description=f"우세 상실: {lead_start_eval:+d}cp → {eval_adjusted:+d}cp",
                            impact_score=1.5,
                            context={'lead_lost': lead_start_eval - eval_adjusted}
                        ))
            
            # 게임 종료 시 우세 유지 확인
            if in_lead:
                lead_situations.append(lead_start_eval)
                # 승리했으면 성공
                if ((game.info.result == GameResult.WHITE_WIN and is_white) or
                    (game.info.result == GameResult.BLACK_WIN and not is_white)):
                    conversions.append(1)  # 성공
                else:
                    conversions.append(0)  # 실패
        
        # 변환율 계산
        if lead_situations:
            success_rate = sum(conversions) / len(conversions)
            score = success_rate * 100
        else:
            score = 50  # 중립 (우세 상황이 없었음)
        
        return score, evidence[:3]
    
    def _calculate_endgame_technique(
        self, 
        player_name: str,
        parsed_games: List[ParsedGame],
        game_analyses: List[GameAnalysis]
    ) -> Tuple[float, List[Evidence]]:
        """엔드게임 기술 점수 계산 (Elite v2.0)"""
        
        # Get elite configuration
        elite_config = get_elite_config()
        avg_rating = self._get_average_player_rating(parsed_games, player_name)
        rating_band = elite_config.get_rating_band(avg_rating)
        
        endgame_acpls = []
        evidence = []
        weighted_scores = []
        
        for game, analysis in zip(parsed_games, game_analyses):
            is_white = game.info.white_player.lower() == player_name.lower()
            opponent_rating = game.info.black_rating if is_white else game.info.white_rating
            
            # 엔드게임 구간의 ACPL
            if is_white:
                endgame_acpl = analysis.white_endgame_acpl
            else:
                endgame_acpl = analysis.black_endgame_acpl
            
            if endgame_acpl and endgame_acpl > 0:
                # Get opponent strength weight
                opponent_weight = elite_config.get_opponent_weight(avg_rating, opponent_rating or avg_rating, rating_band)
                
                endgame_acpls.append(endgame_acpl * opponent_weight)
                
                # Elite-adjusted excellence criteria
                excellent_threshold = 25 if rating_band in [RatingBand.B4, RatingBand.B5] else 30
                
                if endgame_acpl < excellent_threshold:
                    evidence.append(Evidence(
                        game_id=str(hash(f"{game.info.white_player}_{game.info.black_player}")),
                        ply=analysis.opening_moves + analysis.middlegame_moves,
                        move_san="endgame",
                        description=f"정밀한 엔드게임 (ACPL: {endgame_acpl:.1f}, vs {opponent_rating or 'Unknown'})",
                        impact_score=opponent_weight,
                        context={
                            'endgame_acpl': endgame_acpl,
                            'opponent_rating': opponent_rating,
                            'opponent_weight': opponent_weight
                        }
                    ))
        
        # Elite-optimized scoring using new accuracy formula
        if endgame_acpls:
            avg_acpl = statistics.mean(endgame_acpls)
            
            # Use elite configuration for endgame scoring
            k, alpha = elite_config.get_accuracy_params(rating_band)
            min_score, max_score = elite_config.get_score_limits(rating_band)
            
            # Enhanced endgame formula: more forgiving for elite players
            if rating_band == RatingBand.B5:
                # Super-elite: more sophisticated saturation curve
                score = 100 - (k * 0.8) * (avg_acpl ** (alpha * 0.9))
            elif rating_band == RatingBand.B4:
                # Grandmaster: moderate adjustment
                score = 100 - (k * 0.9) * (avg_acpl ** alpha)
            else:
                # Regular formula for lower bands
                score = 100 - k * (avg_acpl ** alpha)
            
            # Apply score limits
            score = max(min_score, min(score, max_score))
            
            # Additional boost for consistent endgame performance
            if len(endgame_acpls) >= 3 and statistics.stdev(endgame_acpls) < 15:
                consistency_boost = min(5, 3 * (1 - statistics.stdev(endgame_acpls) / 15))
                score += consistency_boost
            
            logger.info(f"Endgame score for {player_name}: {score:.1f} (ACPL={avg_acpl:.2f}, band={rating_band.value})")
        else:
            # Default based on rating band
            if rating_band == RatingBand.B5:
                score = 75  # Elite default
            elif rating_band == RatingBand.B4:
                score = 70  # GM default
            else:
                score = 60  # Regular default
            
            logger.info(f"Endgame score for {player_name}: {score} (no data, band default)")
        
        return score, evidence[:3]
    
    def _calculate_time_management(
        self, 
        player_name: str,
        parsed_games: List[ParsedGame],
        game_analyses: List[GameAnalysis]
    ) -> Tuple[float, List[Evidence]]:
        """시간 관리 점수 계산 (Elite v2.0 - Blitz optimized)"""
        
        # Get elite configuration
        elite_config = get_elite_config()
        avg_rating = self._get_average_player_rating(parsed_games, player_name)
        rating_band = elite_config.get_rating_band(avg_rating)
        
        time_deviations = []
        evidence = []
        
        for game, analysis in zip(parsed_games, game_analyses):
            is_white = game.info.white_player.lower() == player_name.lower()
            time_control = self._get_time_control_type(game)
            
            player_moves = [
                move for move in analysis.move_analyses
                if (move.ply % 2 == 0) == is_white and move.time_spent is not None
            ]
            
            if not player_moves:
                continue
            
            # Generate ideal time consumption curve for this time control
            ideal_curve = self._generate_ideal_time_curve(len(player_moves), time_control, rating_band)
            
            # Calculate deviations from ideal curve
            move_deviations = []
            for i, move in enumerate(player_moves):
                if move.time_spent is not None and i < len(ideal_curve):
                    expected_time = ideal_curve[i]
                    deviation = abs(move.time_spent - expected_time)
                    
                    # Critical position relief (spend more time on important moves)
                    if move.centipawn_loss > 30 or move.is_check or move.is_capture:
                        critical_relief = elite_config.config['time_models'].get(time_control, {}).get('critical_relief', 0.5)
                        deviation *= critical_relief
                    
                    move_deviations.append(deviation)
            
            if move_deviations:
                game_mad = statistics.mean(move_deviations)  # Mean Absolute Deviation
                time_deviations.append(game_mad)
                
                # Collect evidence for good time management
                if game_mad < 10:  # Good time management
                    evidence.append(Evidence(
                        game_id=str(hash(f"{game.info.white_player}_{game.info.black_player}")),
                        ply=len(player_moves) // 2,
                        move_san="time_management",
                        description=f"효율적 시간 분배 ({time_control}, 편차: {game_mad:.1f}초)",
                        impact_score=1.0,
                        context={
                            'time_deviation': game_mad,
                            'time_control': time_control,
                            'rating_band': rating_band.value
                        }
                    ))
        
        # Elite-optimized scoring
        if time_deviations:
            avg_mad = statistics.mean(time_deviations)
            
            # Get time management beta for rating band
            main_time_control = self._determine_main_time_control(parsed_games)
            beta = elite_config.get_time_beta(rating_band, main_time_control)
            
            # TimeScore = 100 - β * MAD(spent_i - M(i))
            base_score = 100 - beta * avg_mad
            
            # Elite player adjustments
            if rating_band == RatingBand.B5:
                # Super-elite: More forgiving in blitz, emphasis on results over time
                base_score = max(base_score, 70)  # Floor for elite players
            elif rating_band == RatingBand.B4:
                # Grandmaster: Moderate adjustment
                base_score = max(base_score, 60)  # Floor for GMs
            
            # Apply score limits
            min_score, max_score = elite_config.get_score_limits(rating_band)
            final_score = max(min_score, min(base_score, max_score))
            
            logger.info(f"Time management for {player_name}: {final_score:.1f} (MAD={avg_mad:.1f}, β={beta}, {main_time_control})")
            
        else:
            # Default based on rating band
            if rating_band == RatingBand.B5:
                final_score = 75  # Elite default - good time sense assumed
            elif rating_band == RatingBand.B4:
                final_score = 70  # GM default
            else:
                final_score = 55  # Regular default
            
            logger.info(f"Time management for {player_name}: {final_score} (no time data, band default)")
        
        return final_score, evidence[:3]
    
    def _get_time_control_type(self, game: ParsedGame) -> str:
        """Determine time control type from game"""
        if hasattr(game.info, 'time_control'):
            # Handle TimeControl enum
            if hasattr(game.info.time_control, 'value'):
                tc = game.info.time_control.value.lower()
            else:
                tc = str(game.info.time_control).lower()
            
            if 'bullet' in tc:
                return 'bullet'
            elif 'blitz' in tc:
                return 'blitz_3_0'
            elif 'rapid' in tc:
                return 'rapid'
            elif 'daily' in tc:
                return 'rapid'  # Treat daily as rapid for time management purposes
        return 'blitz_3_0'  # Default assumption
    
    def _generate_ideal_time_curve(self, num_moves: int, time_control: str, rating_band: RatingBand) -> List[float]:
        """Generate ideal time spending curve for given time control"""
        # Simplified ideal curves - in production, these would be learned from data
        if time_control == 'bullet':
            # Quick, relatively even distribution
            return [1.5] * min(num_moves, 40)
        elif time_control == 'blitz_3_0':
            # Blitz: spend more time early-mid game, quick endgame
            curve = []
            for i in range(min(num_moves, 60)):
                if i < 10:  # Opening
                    curve.append(3.0 if rating_band == RatingBand.B5 else 4.0)
                elif i < 30:  # Middlegame
                    curve.append(4.0 if rating_band == RatingBand.B5 else 5.0)
                else:  # Endgame
                    curve.append(2.0 if rating_band == RatingBand.B5 else 2.5)
            return curve
        elif time_control == 'rapid':
            # Rapid: more thinking time available
            return [8.0 if rating_band == RatingBand.B5 else 10.0] * min(num_moves, 50)
        else:
            # Default
            return [4.0] * min(num_moves, 50)
    
    def _calculate_consistency(
        self, 
        player_name: str,
        parsed_games: List[ParsedGame],
        game_analyses: List[GameAnalysis]
    ) -> Tuple[float, List[Evidence]]:
        """일관성 점수 계산 (Elite v2.0 with blunder caps)"""
        
        # Get elite configuration
        elite_config = get_elite_config()
        avg_rating = self._get_average_player_rating(parsed_games, player_name)
        rating_band = elite_config.get_rating_band(avg_rating)
        
        game_acpls = []
        game_blunder_counts = []
        evidence = []
        
        for game, analysis in zip(parsed_games, game_analyses):
            is_white = game.info.white_player.lower() == player_name.lower()
            
            if is_white:
                acpl = analysis.white_acpl
                blunders = analysis.white_blunders
            else:
                acpl = analysis.black_acpl
                blunders = analysis.black_blunders
            
            game_acpls.append(acpl)
            
            # Apply game phase-specific blunder caps for elite players
            # For simplicity, we'll use middlegame caps as default
            blunder_cap = elite_config.get_blunder_cap(rating_band, 'middlegame')
            capped_blunders = min(blunders, blunder_cap)
            
            if capped_blunders < blunders:
                logger.debug(f"Applied blunder cap for {player_name}: {blunders} -> {capped_blunders}")
            
            game_blunder_counts.append(capped_blunders)
        
        # 일관성 = 낮은 분산 (Elite-adjusted)
        score = 50
        acpl_variance = safe_variance(game_acpls)
        blunder_variance = safe_variance(game_blunder_counts)
        
        if len(game_acpls) >= 2:
            # Elite-optimized variance tolerance
            variance_tolerance_factor = 1.5 if rating_band in [RatingBand.B4, RatingBand.B5] else 1.0
            
            # 낮은 분산 = 높은 점수 (elite players get more tolerance)
            acpl_score = max(0, 100 - (acpl_variance / variance_tolerance_factor))
            blunder_score = max(0, 100 - (blunder_variance * 20 / variance_tolerance_factor))
            
            score = (acpl_score + blunder_score) / 2
            
            # Apply saturation curve for elite players
            if rating_band in [RatingBand.B4, RatingBand.B5] and score < 70:
                score = max(70, min(score * 1.15, 88))  # Elite floor with ceiling
                
        elif len(game_acpls) == 1:
            # 단일 게임의 경우 일관성을 평가할 수 없으므로 기본값
            score = 75  # 적당한 기본값
        else:
            score = 50  # 게임 없는 경우 기본값
        
        # Apply score limits for rating band
        min_score, max_score = elite_config.get_score_limits(rating_band)
        score = max(min_score, min(score, max_score))
        
        return score, evidence
    
    def _calculate_swindle_resistance(
        self, 
        player_name: str,
        parsed_games: List[ParsedGame],
        game_analyses: List[GameAnalysis]
    ) -> Tuple[float, List[Evidence]]:
        """역전 저항력 점수 계산"""
        
        comeback_situations = []
        successful_comebacks = []
        evidence = []
        
        for game, analysis in zip(parsed_games, game_analyses):
            is_white = game.info.white_player.lower() == player_name.lower()
            
            player_moves = [
                move for move in analysis.move_analyses
                if (move.ply % 2 == 0) == is_white
            ]
            
            # 열세 상황에서 역전 탐지
            in_deficit = False
            for move in player_moves:
                if move.eval_before is not None:
                    eval_adjusted = move.eval_before if is_white else -move.eval_before
                    
                    if not in_deficit and eval_adjusted < -150:
                        in_deficit = True
                    elif in_deficit and eval_adjusted > 50:
                        # 역전!
                        comeback_situations.append(1)
                        successful_comebacks.append(1)
                        in_deficit = False
                        
                        evidence.append(Evidence(
                            game_id=str(hash(f"{game.info.white_player}_{game.info.black_player}")),
                            ply=move.ply,
                            move_san=move.move_san,
                            description=f"열세 상황에서 역전 성공",
                            impact_score=2.0,
                            context={'eval_swing': eval_adjusted + 150}
                        ))
            
            # 게임 종료 시 열세 상황이었다면
            if in_deficit:
                comeback_situations.append(1)
                # 승리하지 못했으면 실패
                if not ((game.info.result == GameResult.WHITE_WIN and is_white) or
                        (game.info.result == GameResult.BLACK_WIN and not is_white)):
                    successful_comebacks.append(0)
                else:
                    successful_comebacks.append(1)
        
        # 역전 성공률 (극값 방지)
        if comeback_situations:
            success_rate = sum(successful_comebacks) / len(comeback_situations)
            # 25-90 범위로 제한
            score = 25 + (success_rate * 65)
            logger.debug(f"역전 저항력 점수: 상황={len(comeback_situations)}, 성공={sum(successful_comebacks)}, rate={success_rate:.2f}, score={score:.2f}")
        else:
            score = 65  # 역전 상황 없음 - 안정적이므로 양호한 점수
            logger.debug(f"역전 저항력 점수: 역전 상황 없음, 기본값 {score} 사용")
        
        return score, evidence[:3]
    
    def _generate_style_tags(self, style_scores: Dict[StyleDimension, StyleScore]) -> List[str]:
        """스타일 점수 기반 태그 생성"""
        
        tags = []
        
        # 강한 성향들 (70+ 점수)
        high_scores = {
            dim: score for dim, score in style_scores.items()
            if score.score >= 70
        }
        
        # 약한 성향들 (30- 점수)
        low_scores = {
            dim: score for dim, score in style_scores.items()
            if score.score <= 30
        }
        
        # 태그 매핑
        tag_mapping = {
            StyleDimension.AGGRESSION: ("공격적", "수비적"),
            StyleDimension.TACTICAL_DEPENDENCY: ("전술가", "포지셔널"),
            StyleDimension.RISK_TAKING: ("갬빗 성향", "안전 지향"),
            StyleDimension.POSITIONAL_ORIENTATION: ("포지셔널", "전술 지향"),
            StyleDimension.EXCHANGE_PREFERENCE: ("간소화 선호", "복잡화 선호"),
            StyleDimension.OPENING_VARIETY: ("다양한 오프닝", "오프닝 편향"),
            StyleDimension.BOOK_DEVIATION: ("창의적", "이론 중시"),
            StyleDimension.LEAD_CONVERSION: ("우세 유지 강함", "우세 유지 약함"),
            StyleDimension.ENDGAME_TECHNIQUE: ("엔드게임 테크니션", "엔드게임 약함"),
            StyleDimension.TIME_MANAGEMENT: ("시간 관리 우수", "시간 관리 부족"),
            StyleDimension.CONSISTENCY: ("안정적", "들쭉날쭉"),
            StyleDimension.SWINDLE_RESISTANCE: ("역전 능력 강함", "역전 능력 약함")
        }
        
        # 강한 성향 태그 추가
        for dim in high_scores:
            if dim in tag_mapping:
                tags.append(tag_mapping[dim][0])
        
        # 약한 성향 태그 추가
        for dim in low_scores:
            if dim in tag_mapping:
                tags.append(tag_mapping[dim][1])
        
        return tags[:5]  # 최대 5개까지
    
    def _calculate_time_control_stats(
        self, 
        player_name: str,
        parsed_games: List[ParsedGame], 
        game_analyses: List[GameAnalysis]
    ) -> Dict[TimeControl, Dict[str, float]]:
        """시간제어별 통계 계산"""
        
        stats = {}
        
        # 시간제어별 그룹화
        tc_groups = {}
        for game, analysis in zip(parsed_games, game_analyses):
            tc = game.info.time_control
            if tc not in tc_groups:
                tc_groups[tc] = []
            tc_groups[tc].append((game, analysis))
        
        # 각 시간제어별 통계 계산
        for tc, games_analyses in tc_groups.items():
            games, analyses = zip(*games_analyses)
            basic_stats = self._calculate_basic_stats(player_name, games, analyses)
            
            stats[tc] = {
                'games': len(games),
                'win_rate': basic_stats['win_rate'],
                'acpl': basic_stats['overall_acpl']
            }
        
        return stats
    
    def _calculate_color_stats(
        self, 
        player_name: str,
        parsed_games: List[ParsedGame], 
        game_analyses: List[GameAnalysis]
    ) -> Dict[str, Dict[str, float]]:
        """색깔별 통계 계산"""
        
        white_games = []
        black_games = []
        white_analyses = []
        black_analyses = []
        
        for game, analysis in zip(parsed_games, game_analyses):
            if game.info.white_player.lower() == player_name.lower():
                white_games.append(game)
                white_analyses.append(analysis)
            else:
                black_games.append(game)
                black_analyses.append(analysis)
        
        # 백 통계
        white_stats = {}
        if white_games:
            basic_stats = self._calculate_basic_stats(player_name, white_games, white_analyses)
            white_stats = {
                'games': len(white_games),
                'win_rate': basic_stats['win_rate'],
                'acpl': basic_stats['overall_acpl']
            }
        
        # 흑 통계
        black_stats = {}
        if black_games:
            basic_stats = self._calculate_basic_stats(player_name, black_games, black_analyses)
            black_stats = {
                'games': len(black_games),
                'win_rate': basic_stats['win_rate'],
                'acpl': basic_stats['overall_acpl']
            }
        
        return {'white': white_stats, 'black': black_stats}
    
    def _analyze_opening_repertoire(
        self, 
        player_name: str,
        parsed_games: List[ParsedGame]
    ) -> Dict[str, Dict[str, Any]]:
        """오프닝 레퍼토리 분석"""
        
        repertoire = {}
        
        for game in parsed_games:
            is_white = game.info.white_player.lower() == player_name.lower()
            
            if game.info.eco:
                eco = game.info.eco
                
                if eco not in repertoire:
                    repertoire[eco] = {
                        'games': 0,
                        'wins': 0,
                        'draws': 0,
                        'losses': 0,
                        'as_white': 0,
                        'as_black': 0,
                        'opening_name': game.info.opening or eco
                    }
                
                repertoire[eco]['games'] += 1
                
                if is_white:
                    repertoire[eco]['as_white'] += 1
                else:
                    repertoire[eco]['as_black'] += 1
                
                # 결과 카운트
                if game.info.result == GameResult.WHITE_WIN:
                    if is_white:
                        repertoire[eco]['wins'] += 1
                    else:
                        repertoire[eco]['losses'] += 1
                elif game.info.result == GameResult.BLACK_WIN:
                    if is_white:
                        repertoire[eco]['losses'] += 1
                    else:
                        repertoire[eco]['wins'] += 1
                else:
                    repertoire[eco]['draws'] += 1
        
        # 승률 계산
        for eco, stats in repertoire.items():
            total = stats['games']
            if total > 0:
                stats['win_rate'] = stats['wins'] / total
                stats['score'] = (stats['wins'] + 0.5 * stats['draws']) / total
        
        return repertoire
    
    async def _collect_player_metadata(self, player_name: str) -> Dict[str, Any]:
        """Chess.com API에서 플레이어 메타데이터 수집"""
        metadata = {
            'username': player_name,
            'platform': 'chess.com',
            'country': None,
            'title': None,
            'followers': None,
            'joined': None,
            'last_online': None,
            'avatar': None,
            'league': None,
            'streaming': None,
            'stats_collected_at': time.time()
        }
        
        try:
            async with ChessComAPI() as api:
                # 기본 프로파일 정보
                player_info = await api.get_player_info(player_name)
                
                metadata.update({
                    'country': player_info.get('country', '').replace('https://api.chess.com/pub/country/', ''),
                    'title': player_info.get('title'),
                    'followers': player_info.get('followers'),
                    'joined': player_info.get('joined'),
                    'last_online': player_info.get('last_online'),
                    'avatar': player_info.get('avatar'),
                    'league': player_info.get('league'),
                    'streaming': player_info.get('streaming')
                })
                
                # 통계 정보
                try:
                    player_stats = await api.get_player_stats(player_name)
                    
                    # 각 시간제어별 최고 레이팅
                    time_controls = ['chess_rapid', 'chess_blitz', 'chess_bullet', 'chess_daily']
                    ratings = {}
                    
                    for tc in time_controls:
                        if tc in player_stats:
                            tc_stats = player_stats[tc]
                            ratings[tc] = {
                                'rating': tc_stats.get('last', {}).get('rating'),
                                'best_rating': tc_stats.get('best', {}).get('rating'),
                                'games': tc_stats.get('last', {}).get('games_played', 0),
                                'wins': tc_stats.get('record', {}).get('win', 0),
                                'losses': tc_stats.get('record', {}).get('loss', 0),
                                'draws': tc_stats.get('record', {}).get('draw', 0)
                            }
                    
                    metadata['ratings_by_timecontrol'] = ratings
                    
                except Exception as e:
                    logger.warning(f"플레이어 {player_name} 통계 수집 실패: {e}")
                
        except Exception as e:
            logger.warning(f"플레이어 {player_name} 메타데이터 수집 실패: {e}")
        
        return metadata
    
    def _calculate_tactical_stats(self, game_analyses: List[GameAnalysis]) -> Dict[str, Any]:
        """전술 통계 계산 - 찾은 vs 놓친 전술 분석"""
        tactical_stats = {
            'total_tactical_opportunities': 0,
            'patterns_found': {},
            'patterns_missed': {},
            'tactical_accuracy': 0.0,
            'found_tactics': 0,
            'missed_tactics': 0,
            'tactical_themes': [],
            'average_tactical_gain': 0.0
        }
        
        found_count = 0
        missed_count = 0
        patterns_found_count = {}
        patterns_missed_count = {}
        total_tactical_situations = 0
        
        try:
            for analysis in game_analyses:
                if not analysis.move_analyses:
                    continue
                
                for move_analysis in analysis.move_analyses:
                    # 새로운 tactical_usage 데이터 사용
                    if (hasattr(move_analysis, 'tactical_usage') and 
                        move_analysis.tactical_usage):
                        
                        usage = move_analysis.tactical_usage
                        total_tactical_situations += usage.get('available_tactics', 0)
                        
                        if usage.get('tactic_found'):
                            found_count += 1
                            pattern = usage.get('tactic_type_played')
                            if pattern:
                                patterns_found_count[pattern] = patterns_found_count.get(pattern, 0) + 1
                        
                        if usage.get('tactic_missed'):
                            missed_count += 1
                            pattern = usage.get('tactic_type_missed')
                            if pattern:
                                patterns_missed_count[pattern] = patterns_missed_count.get(pattern, 0) + 1
                    
                    # 레거시 데이터도 함께 처리 (이전 분석 결과와 호환성)
                    elif (hasattr(move_analysis, 'tactical_opportunities') and 
                          move_analysis.tactical_opportunities):
                        
                        for opp in move_analysis.tactical_opportunities:
                            pattern = opp.get('pattern', 'unknown')
                            is_found = opp.get('found', True)  # 기본값은 찾았다고 가정
                            
                            if is_found:
                                found_count += 1
                                patterns_found_count[pattern] = patterns_found_count.get(pattern, 0) + 1
                            else:
                                missed_count += 1
                                patterns_missed_count[pattern] = patterns_missed_count.get(pattern, 0) + 1
            
            tactical_stats['total_tactical_opportunities'] = found_count + missed_count
            tactical_stats['patterns_found'] = patterns_found_count
            tactical_stats['patterns_missed'] = patterns_missed_count
            tactical_stats['found_tactics'] = found_count
            tactical_stats['missed_tactics'] = missed_count
            tactical_stats['tactical_themes'] = list(set(
                list(patterns_found_count.keys()) + list(patterns_missed_count.keys())
            ))
            
            # 전술 정확도 = 찾은 전술 / (찾은 전술 + 놓친 전술)
            total_tactics = found_count + missed_count
            if total_tactics > 0:
                tactical_stats['tactical_accuracy'] = found_count / total_tactics
            
            logger.info(f"전술 통계: {found_count}개 찾음, {missed_count}개 놓침, 정확도 {tactical_stats['tactical_accuracy']:.2%}")
            
        except Exception as e:
            logger.error(f"전술 통계 계산 중 오류: {e}")
        
        return tactical_stats
    
    def _determine_main_time_control(self, parsed_games: List[ParsedGame]) -> str:
        """가장 많이 플레이한 시간제어 결정"""
        
        time_control_counts = {}
        
        for game in parsed_games:
            tc = game.info.time_control
            if tc:
                # Chess.com 시간제어를 표준 형태로 변환
                standard_tc = self._normalize_time_control(str(tc))
                time_control_counts[standard_tc] = time_control_counts.get(standard_tc, 0) + 1
        
        if not time_control_counts:
            return 'blitz'  # 기본값
        
        # 가장 많이 플레이한 시간제어 반환
        main_tc = max(time_control_counts.items(), key=lambda x: x[1])[0]
        return main_tc
    
    def _normalize_time_control(self, time_control: str) -> str:
        """시간제어를 표준 형태로 정규화"""
        
        if not time_control or time_control == '-':
            return 'blitz'
        
        tc_lower = time_control.lower()
        
        # 시간 추출 (분 단위)
        import re
        time_match = re.search(r'(\d+)', tc_lower)
        
        if time_match:
            minutes = int(time_match.group(1))
            
            # 시간 기준으로 분류
            if minutes < 3:
                return 'bullet'
            elif minutes <= 15:
                return 'blitz'
            elif minutes <= 60:
                return 'rapid'
            else:
                return 'daily'
        
        # 키워드 기반 분류
        if 'bullet' in tc_lower:
            return 'bullet'
        elif 'blitz' in tc_lower:
            return 'blitz'
        elif 'rapid' in tc_lower:
            return 'rapid'
        elif 'daily' in tc_lower or 'correspondence' in tc_lower:
            return 'daily'
        
        return 'blitz'  # 기본값
    
    # 헬퍼 메서드들
    def _is_king_attack_move(self, move: MoveAnalysis) -> bool:
        """킹 공격 수인지 판단"""
        # 간단한 휴리스틱: 체크이거나 상대 킹 주변으로의 침투
        # 실제로는 보드 상태를 분석해야 하지만, 여기서는 체크로 대체
        return move.is_check
    
    def _is_pawn_storm_move(self, move: MoveAnalysis) -> bool:
        """폰 스톰 수인지 판단"""
        # 간단한 휴리스틱: 폰의 전진 (move 정보만으로는 제한적)
        # 실제로는 보드 위치와 킹의 위치를 비교해야 함
        return False  # 현재는 비활성화
    
    def _is_tactical_move(self, move: MoveAnalysis) -> bool:
        """전술적 수인지 판단"""
        # 포크, 핀, 스큐어, 디스커버드 어택 등을 탐지해야 하지만
        # 여기서는 간단히 캡처와 체크만 사용
        return move.is_capture or move.is_check or move.is_promotion
    
    def _calculate_position_entropy(self, game_analysis: GameAnalysis, ply: int) -> float:
        """포지션 복잡도(엔트로피) 계산"""
        try:
            moves = game_analysis.move_analyses
            if ply >= len(moves):
                return 0.5  # 기본 복잡도
            
            move = moves[ply]
            
            # 복잡도 지표들
            complexity_factors = []
            
            # 1. 전술 기회 수 (많을수록 복잡)
            if hasattr(move, 'tactical_opportunities') and move.tactical_opportunities:
                tactical_count = len(move.tactical_opportunities)
                complexity_factors.append(min(tactical_count / 5.0, 1.0))
            
            # 2. 평가 차이의 절댓값 (큰 평가 변화는 복잡한 위치)
            if move.eval_before is not None and move.eval_after is not None:
                eval_change = abs(move.eval_after - move.eval_before)
                complexity_factors.append(min(eval_change / 200.0, 1.0))
            
            # 3. 체크나 캡처 (전술적 복잡성)
            if move.is_check or move.is_capture:
                complexity_factors.append(0.8)
            
            # 4. 프로모션 (엔드게임 복잡성)
            if move.is_promotion:
                complexity_factors.append(0.9)
            
            # 5. 게임 단계별 기본 복잡도
            if ply < 20:  # 오프닝
                base_complexity = 0.3
            elif ply < 60:  # 미들게임
                base_complexity = 0.7
            else:  # 엔드게임
                base_complexity = 0.4
            
            # 평균 계산
            if complexity_factors:
                entropy = (sum(complexity_factors) / len(complexity_factors) + base_complexity) / 2.0
            else:
                entropy = base_complexity
            
            return max(0.1, min(entropy, 1.0))
            
        except Exception as e:
            logger.debug(f"Position entropy calculation failed for ply {ply}: {e}")
            return 0.5  # 기본값
    
    def _apply_position_complexity_adjustment(self, base_score: float, position_entropy: float, rating_band) -> float:
        """포지션 복잡도에 따른 점수 조정"""
        elite_config = get_elite_config()
        
        # 복잡도 임계값 가져오기
        config = elite_config.config.get('complexity', {})
        simple_threshold = config.get('entropy_thresholds', {}).get('simple', 0.3)
        complex_threshold = config.get('entropy_thresholds', {}).get('complex', 0.7)
        
        # 조정 팩터 가져오기
        adjustment_factors = config.get('adjustment_factors', {})
        simple_penalty = adjustment_factors.get('simple_penalty', 1.2)
        complex_relief = adjustment_factors.get('complex_relief', 0.8)
        
        # 복잡도에 따른 조정
        if position_entropy < simple_threshold:
            # 단순한 포지션: 더 엄격하게 평가
            adjusted_score = base_score / simple_penalty
            logger.debug(f"Simple position penalty: {base_score:.1f} -> {adjusted_score:.1f} (entropy: {position_entropy:.2f})")
        elif position_entropy > complex_threshold:
            # 복잡한 포지션: 더 관대하게 평가
            adjusted_score = base_score * complex_relief
            adjusted_score = min(adjusted_score, 95.0)  # 최대값 제한
            logger.debug(f"Complex position relief: {base_score:.1f} -> {adjusted_score:.1f} (entropy: {position_entropy:.2f})")
        else:
            # 보통 복잡도: 조정 없음
            adjusted_score = base_score
        
        return adjusted_score


# 편의 함수들
async def create_player_profile(
    player_name: str,
    parsed_games: List[ParsedGame],
    game_analyses: List[GameAnalysis]
) -> PlayerProfile:
    """플레이어 프로파일 생성 편의 함수"""
    
    profiler = PlayerProfiler()
    return await profiler.create_profile(player_name, parsed_games, game_analyses)
