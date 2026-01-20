"""
간단한 전술 기회 탐지기

성능을 위해 기본적인 전술 패턴만 탐지합니다.
"""

import chess
import chess.engine
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
from loguru import logger


class SimpleTacticalPattern(Enum):
    """간단한 전술 패턴"""
    FORK = "fork"
    PIN = "pin"
    CAPTURE = "capture"
    CHECK = "check"
    ATTACK_UNDEFENDED = "attack_undefended"


@dataclass
class SimpleTacticalOpportunity:
    """간단한 전술 기회"""
    pattern: SimpleTacticalPattern
    value_gain: int  # centipawn 
    difficulty: int  # 1-3
    description: str
    target_squares: List[chess.Square]


def analyze_tactical_opportunity_usage(
    board_before: chess.Board,
    move_played: chess.Move,
    best_move: chess.Move = None
) -> Dict:
    """
    전술 기회 활용도 분석 - 실제로 전술을 찾았는지/놓쳤는지 비교
    
    Args:
        board_before: 착수 전 보드 상태
        move_played: 실제 착수한 수
        best_move: 엔진이 추천한 최적수
        
    Returns:
        전술 기회 활용 통계
    """
    color = board_before.turn
    available_tactics = _find_available_tactics(board_before, color)
    
    # 실제 착수가 전술적인지 확인
    played_tactic = _identify_tactic_in_move(board_before, move_played)
    
    # 최적수가 전술적인지 확인 (놓친 기회)
    best_tactic = None
    if best_move:
        best_tactic = _identify_tactic_in_move(board_before, best_move)
    
    return {
        'available_tactics': len(available_tactics),
        'tactic_found': played_tactic is not None,
        'tactic_missed': best_tactic is not None and played_tactic is None,
        'tactic_type_played': played_tactic.value if played_tactic else None,
        'tactic_type_missed': best_tactic.value if best_tactic and played_tactic is None else None,
        'tactical_accuracy': 1.0 if played_tactic and not best_tactic else (0.5 if played_tactic else 0.0)
    }


def analyze_simple_tactical_opportunities(
    board: chess.Board, 
    max_opportunities: int = 5
) -> List[SimpleTacticalOpportunity]:
    """
    간단한 전술 기회 탐지 (레거시 호환성을 위해 유지)
    """
    opportunities = []
    color = board.turn
    
    piece_values = {
        chess.PAWN: 100,
        chess.KNIGHT: 300,
        chess.BISHOP: 300,
        chess.ROOK: 500,
        chess.QUEEN: 900,
        chess.KING: 0
    }
    
    try:
        # 모든 법적 수 검사
        legal_moves = list(board.legal_moves)
        
        for move in legal_moves[:20]:  # 성능을 위해 처음 20개만 검사
            board_copy = board.copy()
            board_copy.push(move)
            
            # 1. 캡처 기회 탐지
            if board.piece_at(move.to_square):
                captured_piece = board.piece_at(move.to_square)
                value = piece_values.get(captured_piece.piece_type, 0)
                
                opportunities.append(SimpleTacticalOpportunity(
                    pattern=SimpleTacticalPattern.CAPTURE,
                    value_gain=value,
                    difficulty=1,
                    description=f"{chess.piece_name(captured_piece.piece_type)} 캡처",
                    target_squares=[move.to_square]
                ))
            
            # 2. 체크 기회 탐지
            if board_copy.is_check():
                opportunities.append(SimpleTacticalOpportunity(
                    pattern=SimpleTacticalPattern.CHECK,
                    value_gain=50,  # 체크의 기본 가치
                    difficulty=1,
                    description="킹 체크",
                    target_squares=[move.to_square]
                ))
            
            # 3. 무방비 기물 공격 탐지
            attacked_squares = _get_attacked_squares(board_copy, color)
            for square in attacked_squares:
                target_piece = board_copy.piece_at(square)
                if (target_piece and 
                    target_piece.color != color and
                    not _is_defended(board_copy, square, target_piece.color)):
                    
                    value = piece_values.get(target_piece.piece_type, 0)
                    if value > 100:  # 폰보다 가치있는 기물만
                        opportunities.append(SimpleTacticalOpportunity(
                            pattern=SimpleTacticalPattern.ATTACK_UNDEFENDED,
                            value_gain=value // 2,  # 절반 가치 (확실하지 않으므로)
                            difficulty=2,
                            description=f"무방비 {chess.piece_name(target_piece.piece_type)} 공격",
                            target_squares=[square]
                        ))
        
        # 4. 간단한 포크 패턴 탐지
        opportunities.extend(_detect_simple_forks(board, piece_values))
        
        # 가치순으로 정렬하고 상위만 반환
        opportunities.sort(key=lambda x: x.value_gain, reverse=True)
        return opportunities[:max_opportunities]
        
    except Exception as e:
        logger.warning(f"간단한 전술 탐지 오류: {e}")
        return []


def _get_attacked_squares(board: chess.Board, color: chess.Color) -> List[chess.Square]:
    """특정 색깔이 공격하는 모든 스퀘어"""
    attacked = []
    
    for square in chess.SQUARES:
        if board.is_attacked_by(color, square):
            attacked.append(square)
    
    return attacked


def _is_defended(board: chess.Board, square: chess.Square, color: chess.Color) -> bool:
    """스퀘어가 특정 색깔에 의해 방어되고 있는지"""
    return board.is_attacked_by(color, square)


def _detect_simple_forks(board: chess.Board, piece_values: Dict) -> List[SimpleTacticalOpportunity]:
    """간단한 포크 패턴 탐지"""
    forks = []
    color = board.turn
    
    # 나이트 포크만 탐지 (가장 일반적)
    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece and piece.color == color and piece.piece_type == chess.KNIGHT:
            
            # 나이트가 공격할 수 있는 모든 스퀘어
            knight_attacks = board.attacks(square)
            valuable_targets = []
            
            for target_square in knight_attacks:
                target_piece = board.piece_at(target_square)
                if (target_piece and 
                    target_piece.color != color and
                    target_piece.piece_type in [chess.ROOK, chess.QUEEN, chess.KING]):
                    valuable_targets.append((target_square, target_piece))
            
            # 2개 이상의 가치있는 타겟이 있으면 포크
            if len(valuable_targets) >= 2:
                total_value = sum(piece_values.get(piece.piece_type, 0) for _, piece in valuable_targets)
                
                forks.append(SimpleTacticalOpportunity(
                    pattern=SimpleTacticalPattern.FORK,
                    value_gain=total_value // 3,  # 예상 가치
                    difficulty=2,
                    description=f"나이트 포크 ({len(valuable_targets)}개 타겟)",
                    target_squares=[sq for sq, _ in valuable_targets]
                ))
    
    return forks


def create_simple_tactical_evidence(
    opportunities: List[SimpleTacticalOpportunity],
    game_id: str,
    ply: int
) -> List[Dict]:
    """간단한 전술 증거 생성"""
    evidence = []
    
    for opp in opportunities:
        evidence.append({
            'game_id': game_id,
            'ply': ply,
            'pattern': opp.pattern.value,
            'description': opp.description,
            'impact_score': float(opp.value_gain / 100.0),  # centipawn을 점수로 변환
            'difficulty': opp.difficulty,
            'target_squares': [chess.square_name(sq) for sq in opp.target_squares]
        })
    
    return evidence


def _find_available_tactics(board: chess.Board, color: chess.Color) -> List[SimpleTacticalPattern]:
    """보드에서 활용 가능한 전술 패턴 찾기"""
    available = []
    piece_values = {
        chess.PAWN: 100, chess.KNIGHT: 300, chess.BISHOP: 300,
        chess.ROOK: 500, chess.QUEEN: 900, chess.KING: 0
    }
    
    for move in board.legal_moves:
        tactic = _identify_tactic_in_move(board, move)
        if tactic and tactic not in available:
            available.append(tactic)
    
    return available


def _identify_tactic_in_move(board: chess.Board, move: chess.Move) -> Optional[SimpleTacticalPattern]:
    """특정 착수에서 사용된 전술 패턴 식별"""
    if not move:
        return None
    
    board_copy = board.copy()
    
    # 1. 캡처 확인
    if board.piece_at(move.to_square):
        return SimpleTacticalPattern.CAPTURE
    
    # 2. 체크 확인  
    board_copy.push(move)
    if board_copy.is_check():
        return SimpleTacticalPattern.CHECK
    
    # 3. 포크 확인 (나이트 포크)
    moved_piece = board.piece_at(move.from_square)
    if moved_piece and moved_piece.piece_type == chess.KNIGHT:
        knight_attacks = board_copy.attacks(move.to_square)
        valuable_targets = 0
        
        for target_square in knight_attacks:
            target_piece = board_copy.piece_at(target_square)
            if (target_piece and 
                target_piece.color != moved_piece.color and
                target_piece.piece_type in [chess.ROOK, chess.QUEEN, chess.KING]):
                valuable_targets += 1
        
        if valuable_targets >= 2:
            return SimpleTacticalPattern.FORK
    
    # 4. 무방비 기물 공격 확인
    attacked_squares = []
    for square in chess.SQUARES:
        if board_copy.is_attacked_by(moved_piece.color, square):
            attacked_squares.append(square)
    
    for square in attacked_squares:
        target_piece = board_copy.piece_at(square)
        if (target_piece and 
            target_piece.color != moved_piece.color and
            not board_copy.is_attacked_by(target_piece.color, square) and
            target_piece.piece_type != chess.PAWN):
            return SimpleTacticalPattern.ATTACK_UNDEFENDED
    
    return None


class SimpleTacticalDetector:
    """간단한 전술 탐지기 클래스"""
    
    def __init__(self):
        pass
    
    def detect_tactical_opportunities(
        self, 
        board: chess.Board, 
        max_opportunities: int = 5
    ) -> List[SimpleTacticalOpportunity]:
        """전술 기회 탐지"""
        return analyze_simple_tactical_opportunities(board, max_opportunities)
    
    def analyze_tactical_usage(
        self,
        board_before: chess.Board,
        move_played: chess.Move,
        best_move: chess.Move = None
    ) -> Dict:
        """전술 활용도 분석"""
        return analyze_tactical_opportunity_usage(board_before, move_played, best_move)