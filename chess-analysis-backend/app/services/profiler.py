"""
플레이어 프로파일링 모듈

게임 분석 결과를 기반으로 플레이어의 스타일을 12차원 벡터로 분석하고
구체적인 증거와 함께 프로파일을 생성합니다.
"""

import math
import statistics
from typing import List, Dict, Optional, Tuple, Any
from dataclasses import dataclass, asdict
from enum import Enum
import chess

from loguru import logger
from ..models.analysis_types import GameAnalysis, MoveAnalysis, MoveQuality, Evidence, StyleScore
from ..utils.pgn_parser import ParsedGame, TimeControl, GameResult


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


class PlayerProfiler:
    """
    플레이어 프로파일링 엔진
    
    게임 분석 결과를 바탕으로 플레이어의 스타일을 12차원으로 분석하고
    구체적인 증거와 개선점을 도출합니다.
    """
    
    def __init__(self):
        self.dimension_weights = self._initialize_dimension_weights()
        
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
    
    def create_profile(
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
            style_tags=style_tags
        )
        
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
        
        # 승부 통계
        win_count = results.count('win')
        draw_count = results.count('draw')
        loss_count = results.count('loss')
        
        return {
            'total_games': total_games,
            'total_moves': total_moves,
            'average_rating': average_rating,
            'overall_acpl': overall_acpl,
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
        """전술 의존성 점수 계산"""
        
        tactical_success_rates = []
        tactical_attempt_rates = []
        evidence = []
        
        for game, analysis in zip(parsed_games, game_analyses):
            is_white = game.info.white_player.lower() == player_name.lower()
            
            player_moves = [
                move for move in analysis.move_analyses
                if (move.ply % 2 == 0) == is_white
            ]
            
            if not player_moves:
                continue
            
            # 전술적 수 탐지 (체크, 캡처, 위협)
            tactical_moves = [
                move for move in player_moves
                if move.is_check or move.is_capture or self._is_tactical_move(move)
            ]
            
            tactical_attempt_rate = len(tactical_moves) / len(player_moves)
            tactical_attempt_rates.append(tactical_attempt_rate)
            
            # 전술 성공률 (전술적 수 중 좋은 수의 비율)
            if tactical_moves:
                successful_tactics = [
                    move for move in tactical_moves
                    if move.quality in [MoveQuality.BEST, MoveQuality.GOOD]
                ]
                success_rate = len(successful_tactics) / len(tactical_moves)
                tactical_success_rates.append(success_rate)
                
                # 증거 수집
                for move in successful_tactics[:2]:
                    evidence.append(Evidence(
                        game_id=str(hash(f"{game.info.white_player}_{game.info.black_player}")),
                        ply=move.ply,
                        move_san=move.move_san,
                        description=f"성공적 전술: {move.quality.value}",
                        impact_score=1.0,
                        context={'quality': move.quality.value, 'cp_loss': move.centipawn_loss}
                    ))
        
        # 점수 계산
        weights = self.dimension_weights[StyleDimension.TACTICAL_DEPENDENCY]
        
        avg_success_rate = statistics.mean(tactical_success_rates) if tactical_success_rates else 0
        avg_attempt_rate = statistics.mean(tactical_attempt_rates) if tactical_attempt_rates else 0
        
        score = (
            weights['tactical_accuracy'] * avg_success_rate * 100 +
            weights['tactical_attempts'] * min(100, avg_attempt_rate * 200)
        )
        
        return max(0, min(100, score)), evidence[:5]
    
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
        
        # 간단한 휴리스틱 기반 계산
        positional_moves = []
        evidence = []
        
        for game, analysis in zip(parsed_games, game_analyses):
            is_white = game.info.white_player.lower() == player_name.lower()
            
            player_moves = [
                move for move in analysis.move_analyses
                if (move.ply % 2 == 0) == is_white
            ]
            
            # 포지셔널 수 탐지 (비전술적이면서 좋은 수)
            pos_count = 0
            for move in player_moves:
                if (not move.is_check and not move.is_capture and
                    move.quality in [MoveQuality.BEST, MoveQuality.GOOD]):
                    pos_count += 1
                    
                    if len(evidence) < 3:
                        evidence.append(Evidence(
                            game_id=str(hash(f"{game.info.white_player}_{game.info.black_player}")),
                            ply=move.ply,
                            move_san=move.move_san,
                            description=f"포지셔널 수: {move.quality.value}",
                            impact_score=1.0,
                            context={'quality': move.quality.value}
                        ))
            
            if player_moves:
                positional_moves.append(pos_count / len(player_moves))
        
        avg_positional_rate = statistics.mean(positional_moves) if positional_moves else 0
        score = min(100, avg_positional_rate * 150)
        
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
        """엔드게임 기술 점수 계산"""
        
        endgame_acpls = []
        evidence = []
        
        for game, analysis in zip(parsed_games, game_analyses):
            is_white = game.info.white_player.lower() == player_name.lower()
            
            # 엔드게임 구간의 ACPL
            if is_white:
                endgame_acpl = analysis.white_endgame_acpl
            else:
                endgame_acpl = analysis.black_endgame_acpl
            
            if endgame_acpl > 0:
                endgame_acpls.append(endgame_acpl)
                
                if endgame_acpl < 30:  # 좋은 엔드게임 기술
                    evidence.append(Evidence(
                        game_id=str(hash(f"{game.info.white_player}_{game.info.black_player}")),
                        ply=analysis.opening_moves + analysis.middlegame_moves,
                        move_san="endgame",
                        description=f"훌륭한 엔드게임 기술 (ACPL: {endgame_acpl:.1f})",
                        impact_score=1.0,
                        context={'endgame_acpl': endgame_acpl}
                    ))
        
        # 점수 계산 (낮은 ACPL = 높은 점수)
        if endgame_acpls:
            avg_acpl = statistics.mean(endgame_acpls)
            score = max(20, min(95, 100 - (avg_acpl - 10) * 2))  # ACPL 10을 기준점으로
            logger.debug(f"엔드게임 기술 점수: ACPL={avg_acpl:.2f}, score={score:.2f}")
        else:
            score = 60  # 엔드게임 데이터 없음 - 약간 양호한 기본값
            logger.debug(f"엔드게임 기술 점수: 데이터 없음, 기본값 {score} 사용")
        
        return score, evidence[:3]
    
    def _calculate_time_management(
        self, 
        player_name: str,
        parsed_games: List[ParsedGame],
        game_analyses: List[GameAnalysis]
    ) -> Tuple[float, List[Evidence]]:
        """시간 관리 점수 계산"""
        
        # 시계 정보가 있는 경우만 계산
        time_distributions = []
        critical_times = []
        evidence = []
        
        for game, analysis in zip(parsed_games, game_analyses):
            is_white = game.info.white_player.lower() == player_name.lower()
            
            player_moves = [
                move for move in analysis.move_analyses
                if (move.ply % 2 == 0) == is_white and move.time_spent is not None
            ]
            
            if not player_moves:
                continue
            
            # 시간 분배 분석
            times = [move.time_spent for move in player_moves if move.time_spent is not None]
            if times:
                time_variance = safe_variance(times)
                time_distributions.append(time_variance)
                
                # 중요한 수에서의 시간 사용
                critical_moves = [
                    move for move in player_moves
                    if move.centipawn_loss > 50 or move.is_check or move.is_capture
                ]
                
                if critical_moves:
                    critical_times_for_moves = [m.time_spent for m in critical_moves if m.time_spent is not None]
                    if critical_times_for_moves:
                        avg_critical_time = statistics.mean(critical_times_for_moves)
                        critical_times.append(avg_critical_time)
        
        # 점수 계산 (적절한 시간 분배 = 높은 점수)
        if time_distributions:
            avg_variance = statistics.mean(time_distributions)
            # 적당한 변동성이 좋음 (너무 빠르거나 느리지 않게)
            score = max(20, min(80, 100 - abs(avg_variance - 10) * 5))
            logger.debug(f"시간 관리 점수 계산: variance={avg_variance:.2f}, score={score:.2f}")
        else:
            score = 55  # 시간 정보 없음 - 중립적 점수
            logger.debug(f"시간 관리 점수: 시간 정보 없음, 기본값 {score} 사용")
        
        return score, evidence
    
    def _calculate_consistency(
        self, 
        player_name: str,
        parsed_games: List[ParsedGame],
        game_analyses: List[GameAnalysis]
    ) -> Tuple[float, List[Evidence]]:
        """일관성 점수 계산"""
        
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
            game_blunder_counts.append(blunders)
        
        # 일관성 = 낮은 분산
        score = 50
        acpl_variance = safe_variance(game_acpls)
        blunder_variance = safe_variance(game_blunder_counts)
        
        if len(game_acpls) >= 2:
            # 낮은 분산 = 높은 점수
            acpl_score = max(0, 100 - acpl_variance)
            blunder_score = max(0, 100 - blunder_variance * 20)
            
            score = (acpl_score + blunder_score) / 2
        elif len(game_acpls) == 1:
            # 단일 게임의 경우 일관성을 평가할 수 없으므로 기본값
            score = 75  # 적당한 기본값
        else:
            score = 50  # 게임 없는 경우 기본값
        
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


# 편의 함수들
def create_player_profile(
    player_name: str,
    parsed_games: List[ParsedGame],
    game_analyses: List[GameAnalysis]
) -> PlayerProfile:
    """플레이어 프로파일 생성 편의 함수"""
    
    profiler = PlayerProfiler()
    return profiler.create_profile(player_name, parsed_games, game_analyses)