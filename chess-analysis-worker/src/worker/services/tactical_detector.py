"""
전술 기회 탐지 엔진

체스 포지션에서 다양한 전술적 기회를 탐지하고 분석합니다.
포크, 핀, 스큐어, 디스커버드 어택 등의 패턴을 식별합니다.
"""

import chess
import chess.engine
from typing import List, Dict, Optional, Tuple, Set
from dataclasses import dataclass
from enum import Enum

from loguru import logger
from ..models.analysis_types import MoveAnalysis, Evidence


class TacticalPattern(Enum):
    """전술 패턴 타입"""
    FORK = "fork"
    PIN = "pin"
    SKEWER = "skewer"
    DISCOVERED_ATTACK = "discovered_attack"
    DOUBLE_ATTACK = "double_attack"
    DEFLECTION = "deflection"
    DECOY = "decoy"
    BACK_RANK_MATE = "back_rank_mate"
    SACRIFICE = "sacrifice"
    ZUGZWANG = "zugzwang"
    TRAPPED_PIECE = "trapped_piece"
    WEAK_SQUARE = "weak_square"


@dataclass
class TacticalOpportunity:
    """탐지된 전술적 기회"""
    pattern: TacticalPattern
    square: chess.Square
    target_squares: List[chess.Square]
    piece_type: chess.PieceType
    value_gain: int  # 예상 material gain (centipawn)
    difficulty: int  # 1-5 (1=easy to spot, 5=very hard)
    description: str
    move_sequence: List[chess.Move]  # 실행 순서


class TacticalDetector:
    """
    전술 기회 탐지기
    
    체스 포지션을 분석하여 다양한 전술 패턴을 식별하고
    그 가치와 난이도를 평가합니다.
    """
    
    def __init__(self):
        # 기물 가치 (centipawn)
        self.piece_values = {
            chess.PAWN: 100,
            chess.KNIGHT: 320,
            chess.BISHOP: 330,
            chess.ROOK: 500,
            chess.QUEEN: 900,
            chess.KING: 0  # 특별 처리
        }
    
    def detect_all_opportunities(
        self, 
        board: chess.Board,
        depth: int = 2
    ) -> List[TacticalOpportunity]:
        """
        포지션에서 모든 전술 기회 탐지
        
        Args:
            board: 분석할 보드 포지션
            depth: 탐색 깊이
            
        Returns:
            탐지된 전술 기회 리스트
        """
        opportunities = []
        
        try:
            # 각 전술 패턴 탐지
            opportunities.extend(self._detect_forks(board))
            opportunities.extend(self._detect_pins(board))
            opportunities.extend(self._detect_skewers(board))
            opportunities.extend(self._detect_discovered_attacks(board))
            opportunities.extend(self._detect_double_attacks(board))
            opportunities.extend(self._detect_deflections(board))
            opportunities.extend(self._detect_back_rank_patterns(board))
            opportunities.extend(self._detect_sacrifices(board, depth))
            opportunities.extend(self._detect_trapped_pieces(board))
            opportunities.extend(self._detect_weak_squares(board))
            
            # 가치순으로 정렬
            opportunities.sort(key=lambda x: x.value_gain, reverse=True)
            
        except Exception as e:
            logger.error(f"전술 기회 탐지 중 오류: {e}")
        
        return opportunities
    
    def _detect_forks(self, board: chess.Board) -> List[TacticalOpportunity]:
        """포크 패턴 탐지"""
        forks = []
        color = board.turn
        
        # 모든 법적 수 검사
        for move in board.legal_moves:
            board_copy = board.copy()
            board_copy.push(move)
            
            # 이동한 기물의 공격 대상 확인
            attacking_square = move.to_square
            attacking_piece = board_copy.piece_at(attacking_square)
            
            if not attacking_piece or attacking_piece.color != color:
                continue
            
            # 공격하는 모든 적 기물 확인
            attacked_squares = []
            total_value = 0
            
            for square in chess.SQUARES:
                target_piece = board_copy.piece_at(square)
                if (target_piece and 
                    target_piece.color != color and
                    board_copy.is_attacked_by(color, square)):
                    
                    attacked_squares.append(square)
                    total_value += self.piece_values.get(target_piece.piece_type, 0)
            
            # 포크 조건: 2개 이상의 적 기물을 동시에 공격
            if len(attacked_squares) >= 2:
                # 킹을 공격하는 경우는 더 가치있음
                has_king_attack = any(
                    board_copy.piece_at(sq) and board_copy.piece_at(sq).piece_type == chess.KING
                    for sq in attacked_squares
                )
                
                value_gain = min(total_value // 2, 500)  # 실제로는 일부만 얻을 수 있음
                if has_king_attack:
                    value_gain += 200  # 킹 공격 보너스
                
                difficulty = self._calculate_fork_difficulty(attacking_piece.piece_type, attacked_squares)
                
                forks.append(TacticalOpportunity(
                    pattern=TacticalPattern.FORK,
                    square=attacking_square,
                    target_squares=attacked_squares,
                    piece_type=attacking_piece.piece_type,
                    value_gain=value_gain,
                    difficulty=difficulty,
                    description=f"{chess.piece_name(attacking_piece.piece_type)} 포크 ({len(attacked_squares)}개 기물 공격)",
                    move_sequence=[move]
                ))
        
        return forks
    
    def _detect_pins(self, board: chess.Board) -> List[TacticalOpportunity]:
        """핀 패턴 탐지"""
        pins = []
        color = board.turn
        
        # 상대 킹 위치
        enemy_king_square = board.king(not color)
        if enemy_king_square is None:
            return pins
        
        # 슬라이딩 피스로 핀 가능성 탐지
        sliding_pieces = [chess.BISHOP, chess.ROOK, chess.QUEEN]
        
        for piece_type in sliding_pieces:
            our_pieces = list(board.pieces(piece_type, color))
            
            for piece_square in our_pieces:
                # 이 기물이 적 킹과 같은 선상에 있는지 확인
                if self._are_aligned(piece_square, enemy_king_square):
                    # 사이에 있는 기물들 확인
                    between_squares = list(chess.between(piece_square, enemy_king_square))
                    
                    # 사이에 정확히 하나의 적 기물이 있으면 핀
                    enemy_pieces_between = []
                    for sq in between_squares:
                        piece = board.piece_at(sq)
                        if piece and piece.color != color:
                            enemy_pieces_between.append((sq, piece))
                    
                    if len(enemy_pieces_between) == 1:
                        pinned_square, pinned_piece = enemy_pieces_between[0]
                        
                        # 핀된 기물의 가치
                        value_gain = self.piece_values.get(pinned_piece.piece_type, 0)
                        
                        # 절대 핀인지 상대 핀인지 판단
                        is_absolute = pinned_piece.piece_type != chess.KING
                        difficulty = 2 if is_absolute else 4
                        
                        pins.append(TacticalOpportunity(
                            pattern=TacticalPattern.PIN,
                            square=piece_square,
                            target_squares=[pinned_square, enemy_king_square],
                            piece_type=piece_type,
                            value_gain=value_gain // 2,  # 핀은 즉시 획득이 아님
                            difficulty=difficulty,
                            description=f"{chess.piece_name(pinned_piece.piece_type)} 핀",
                            move_sequence=[]
                        ))
        
        return pins
    
    def _detect_skewers(self, board: chess.Board) -> List[TacticalOpportunity]:
        """스큐어 패턴 탐지"""
        skewers = []
        color = board.turn
        
        # 슬라이딩 피스로 스큐어 탐지
        sliding_pieces = [chess.BISHOP, chess.ROOK, chess.QUEEN]
        
        for move in board.legal_moves:
            moved_piece = board.piece_at(move.from_square)
            if not moved_piece or moved_piece.piece_type not in sliding_pieces:
                continue
            
            board_copy = board.copy()
            board_copy.push(move)
            
            # 이동 후 위치에서 공격하는 적 기물들 확인
            attack_squares = self._get_sliding_attacks(
                board_copy, move.to_square, moved_piece.piece_type, color
            )
            
            # 같은 선상에 2개 이상의 적 기물이 있으면 스큐어 가능성
            enemy_pieces_on_line = []
            for sq in attack_squares:
                piece = board_copy.piece_at(sq)
                if piece and piece.color != color:
                    enemy_pieces_on_line.append((sq, piece))
            
            if len(enemy_pieces_on_line) >= 2:
                # 가장 가치 높은 기물부터 정렬
                enemy_pieces_on_line.sort(
                    key=lambda x: self.piece_values.get(x[1].piece_type, 0), 
                    reverse=True
                )
                
                front_square, front_piece = enemy_pieces_on_line[0]
                back_square, back_piece = enemy_pieces_on_line[1]
                
                # 앞의 기물이 더 가치가 높으면 스큐어
                if (self.piece_values.get(front_piece.piece_type, 0) > 
                    self.piece_values.get(back_piece.piece_type, 0)):
                    
                    value_gain = self.piece_values.get(back_piece.piece_type, 0)
                    
                    skewers.append(TacticalOpportunity(
                        pattern=TacticalPattern.SKEWER,
                        square=move.to_square,
                        target_squares=[front_square, back_square],
                        piece_type=moved_piece.piece_type,
                        value_gain=value_gain,
                        difficulty=3,
                        description=f"{chess.piece_name(front_piece.piece_type)}를 통한 {chess.piece_name(back_piece.piece_type)} 스큐어",
                        move_sequence=[move]
                    ))
        
        return skewers
    
    def _detect_discovered_attacks(self, board: chess.Board) -> List[TacticalOpportunity]:
        """디스커버드 어택 탐지"""
        discovered_attacks = []
        color = board.turn
        
        for move in board.legal_moves:
            # 기물 이동으로 다른 기물의 공격선이 열리는지 확인
            board_before = board.copy()
            board_after = board.copy()
            board_after.push(move)
            
            moved_piece = board_before.piece_at(move.from_square)
            if not moved_piece:
                continue
            
            # 이동 전후 공격받는 적 기물 비교
            attacked_before = self._get_all_attacked_squares(board_before, color)
            attacked_after = self._get_all_attacked_squares(board_after, color)
            
            # 새로 공격받게 된 고가치 적 기물 찾기
            new_attacks = attacked_after - attacked_before
            valuable_targets = []
            
            for sq in new_attacks:
                piece = board_after.piece_at(sq)
                if (piece and piece.color != color and 
                    piece.piece_type in [chess.QUEEN, chess.ROOK, chess.KING]):
                    valuable_targets.append((sq, piece))
            
            if valuable_targets:
                total_value = sum(
                    self.piece_values.get(piece.piece_type, 0) 
                    for _, piece in valuable_targets
                )
                
                discovered_attacks.append(TacticalOpportunity(
                    pattern=TacticalPattern.DISCOVERED_ATTACK,
                    square=move.from_square,
                    target_squares=[sq for sq, _ in valuable_targets],
                    piece_type=moved_piece.piece_type,
                    value_gain=min(total_value // 2, 400),
                    difficulty=4,
                    description=f"디스커버드 어택 ({len(valuable_targets)}개 기물)",
                    move_sequence=[move]
                ))
        
        return discovered_attacks
    
    def _detect_double_attacks(self, board: chess.Board) -> List[TacticalOpportunity]:
        """이중 공격 탐지 (포크와 다른 패턴)"""
        double_attacks = []
        color = board.turn
        
        for move in board.legal_moves:
            board_copy = board.copy()
            board_copy.push(move)
            
            # 한 번에 여러 위협을 만드는지 확인
            threats = []
            
            # 체크 + 다른 공격
            if board_copy.is_check():
                threats.append("check")
            
            # 캡처 위협
            for sq in chess.SQUARES:
                piece = board_copy.piece_at(sq)
                if (piece and piece.color != color and
                    board_copy.is_attacked_by(color, sq)):
                    threats.append(f"attack_{chess.square_name(sq)}")
            
            # 2개 이상의 서로 다른 위협이면 이중 공격
            if len(set(threats)) >= 2:
                value_gain = len(threats) * 50  # 위협 개수에 비례
                
                double_attacks.append(TacticalOpportunity(
                    pattern=TacticalPattern.DOUBLE_ATTACK,
                    square=move.to_square,
                    target_squares=[],
                    piece_type=board.piece_at(move.from_square).piece_type,
                    value_gain=value_gain,
                    difficulty=3,
                    description=f"이중 공격 ({len(threats)}개 위협)",
                    move_sequence=[move]
                ))
        
        return double_attacks
    
    def _detect_deflections(self, board: chess.Board) -> List[TacticalOpportunity]:
        """디플렉션 패턴 탐지"""
        deflections = []
        color = board.turn
        
        # 적의 중요한 수비 기물을 끌어내는 패턴
        for move in board.legal_moves:
            if not board.is_capture(move):
                continue
            
            captured_piece = board.piece_at(move.to_square)
            if not captured_piece or captured_piece.color == color:
                continue
            
            board_copy = board.copy()
            board_copy.push(move)
            
            # 캡처 후 새로 취약해진 적 기물들 확인
            newly_vulnerable = self._find_newly_vulnerable_pieces(board, board_copy, not color)
            
            if newly_vulnerable:
                total_value = sum(
                    self.piece_values.get(piece_type, 0) 
                    for _, piece_type in newly_vulnerable
                )
                
                deflections.append(TacticalOpportunity(
                    pattern=TacticalPattern.DEFLECTION,
                    square=move.to_square,
                    target_squares=[sq for sq, _ in newly_vulnerable],
                    piece_type=board.piece_at(move.from_square).piece_type,
                    value_gain=total_value,
                    difficulty=4,
                    description=f"디플렉션 ({len(newly_vulnerable)}개 기물 취약)",
                    move_sequence=[move]
                ))
        
        return deflections
    
    def _detect_back_rank_patterns(self, board: chess.Board) -> List[TacticalOpportunity]:
        """백 랭크 패턴 탐지"""
        patterns = []
        color = board.turn
        enemy_color = not color
        
        # 적 킹의 백 랭크 확인
        enemy_king_square = board.king(enemy_color)
        if enemy_king_square is None:
            return patterns
        
        back_rank = 0 if enemy_color == chess.BLACK else 7
        
        # 적 킹이 백 랭크에 있고 앞에 폰들이 막고 있는지 확인
        if chess.square_rank(enemy_king_square) == back_rank:
            king_file = chess.square_file(enemy_king_square)
            
            # 킹 앞의 폰들 확인
            pawn_rank = 1 if enemy_color == chess.BLACK else 6
            blocking_pawns = 0
            
            for file_offset in [-1, 0, 1]:
                check_file = king_file + file_offset
                if 0 <= check_file <= 7:
                    pawn_square = chess.square(check_file, pawn_rank)
                    piece = board.piece_at(pawn_square)
                    if piece and piece.piece_type == chess.PAWN and piece.color == enemy_color:
                        blocking_pawns += 1
            
            # 백 랭크 메이트 기회 탐지
            if blocking_pawns >= 2:
                for move in board.legal_moves:
                    moved_piece = board.piece_at(move.from_square)
                    if moved_piece and moved_piece.piece_type in [chess.ROOK, chess.QUEEN]:
                        
                        board_copy = board.copy()
                        board_copy.push(move)
                        
                        if chess.square_rank(move.to_square) == back_rank:
                            patterns.append(TacticalOpportunity(
                                pattern=TacticalPattern.BACK_RANK_MATE,
                                square=move.to_square,
                                target_squares=[enemy_king_square],
                                piece_type=moved_piece.piece_type,
                                value_gain=1000,  # 메이트는 최고 가치
                                difficulty=2,
                                description="백 랭크 메이트 위협",
                                move_sequence=[move]
                            ))
        
        return patterns
    
    def _detect_sacrifices(self, board: chess.Board, depth: int) -> List[TacticalOpportunity]:
        """희생 기회 탐지 (간단한 버전)"""
        sacrifices = []
        color = board.turn
        
        for move in board.legal_moves:
            if not board.is_capture(move):
                continue
            
            moved_piece = board.piece_at(move.from_square)
            captured_piece = board.piece_at(move.to_square)
            
            if not moved_piece or not captured_piece:
                continue
            
            # 가치 교환이 불리한 경우 (희생)
            moved_value = self.piece_values.get(moved_piece.piece_type, 0)
            captured_value = self.piece_values.get(captured_piece.piece_type, 0)
            
            if moved_value > captured_value + 100:  # 100cp 이상 손해
                board_copy = board.copy()
                board_copy.push(move)
                
                # 희생 후 새로운 공격 기회 확인
                new_attacks = len([
                    sq for sq in chess.SQUARES
                    if (board_copy.piece_at(sq) and 
                        board_copy.piece_at(sq).color != color and
                        board_copy.is_attacked_by(color, sq))
                ])
                
                if new_attacks >= 2:  # 여러 공격 기회 생성
                    sacrifices.append(TacticalOpportunity(
                        pattern=TacticalPattern.SACRIFICE,
                        square=move.to_square,
                        target_squares=[],
                        piece_type=moved_piece.piece_type,
                        value_gain=new_attacks * 100 - (moved_value - captured_value),
                        difficulty=5,
                        description=f"{chess.piece_name(moved_piece.piece_type)} 희생",
                        move_sequence=[move]
                    ))
        
        return sacrifices
    
    def _detect_trapped_pieces(self, board: chess.Board) -> List[TacticalOpportunity]:
        """갇힌 기물 탐지"""
        trapped = []
        color = board.turn
        enemy_color = not color
        
        # 적 기물들의 이동성 확인
        for square in chess.SQUARES:
            piece = board.piece_at(square)
            if not piece or piece.color != enemy_color:
                continue
            
            # 이 기물이 갈 수 있는 합법적 수 계산
            legal_moves_for_piece = [
                move for move in board.legal_moves
                if move.from_square == square
            ]
            
            # 고가치 기물이 거의 움직일 수 없으면 갇힌 상태
            if (piece.piece_type in [chess.QUEEN, chess.ROOK, chess.BISHOP, chess.KNIGHT] and
                len(legal_moves_for_piece) <= 1):
                
                trapped.append(TacticalOpportunity(
                    pattern=TacticalPattern.TRAPPED_PIECE,
                    square=square,
                    target_squares=[square],
                    piece_type=piece.piece_type,
                    value_gain=self.piece_values.get(piece.piece_type, 0) // 2,
                    difficulty=2,
                    description=f"갇힌 {chess.piece_name(piece.piece_type)}",
                    move_sequence=[]
                ))
        
        return trapped
    
    def _detect_weak_squares(self, board: chess.Board) -> List[TacticalOpportunity]:
        """약점 스퀘어 탐지"""
        weak_squares = []
        color = board.turn
        enemy_color = not color
        
        # 적진의 중요한 스퀘어 중 방어가 약한 곳들
        important_squares = []
        
        # 적 킹 주변
        enemy_king_square = board.king(enemy_color)
        if enemy_king_square is not None:
            for king_adjacent in chess.SquareSet.from_square(enemy_king_square).tolist():
                important_squares.append(king_adjacent)
        
        for square in important_squares:
            if board.piece_at(square) is None:  # 빈 스퀘어
                # 우리가 공격할 수 있고 적이 방어하지 못하는가?
                we_attack = board.is_attacked_by(color, square)
                they_defend = board.is_attacked_by(enemy_color, square)
                
                if we_attack and not they_defend:
                    weak_squares.append(TacticalOpportunity(
                        pattern=TacticalPattern.WEAK_SQUARE,
                        square=square,
                        target_squares=[square],
                        piece_type=chess.PAWN,  # 임의값
                        value_gain=100,
                        difficulty=3,
                        description=f"약점 스퀘어 {chess.square_name(square)}",
                        move_sequence=[]
                    ))
        
        return weak_squares
    
    # 헬퍼 메서드들
    def _calculate_fork_difficulty(
        self, 
        piece_type: chess.PieceType, 
        target_squares: List[chess.Square]
    ) -> int:
        """포크의 난이도 계산"""
        if piece_type == chess.KNIGHT:
            return 2  # 나이트 포크는 비교적 쉬움
        elif piece_type == chess.PAWN:
            return 1  # 폰 포크는 매우 쉬움
        else:
            return min(3 + len(target_squares) // 2, 5)
    
    def _are_aligned(self, sq1: chess.Square, sq2: chess.Square) -> bool:
        """두 스퀘어가 일직선상에 있는지 확인"""
        return (chess.square_rank(sq1) == chess.square_rank(sq2) or
                chess.square_file(sq1) == chess.square_file(sq2) or
                abs(chess.square_rank(sq1) - chess.square_rank(sq2)) == 
                abs(chess.square_file(sq1) - chess.square_file(sq2)))
    
    def _get_sliding_attacks(
        self, 
        board: chess.Board, 
        square: chess.Square, 
        piece_type: chess.PieceType,
        color: chess.Color
    ) -> List[chess.Square]:
        """슬라이딩 피스의 공격 스퀘어들"""
        attacks = []
        
        if piece_type == chess.ROOK or piece_type == chess.QUEEN:
            # 수직/수평 공격 - 방향별로 탐지
            directions = [
                (0, 1), (0, -1), (1, 0), (-1, 0)  # 상하좌우
            ]
            rank = chess.square_rank(square)
            file = chess.square_file(square)
            
            for dr, df in directions:
                for i in range(1, 8):
                    new_rank = rank + dr * i
                    new_file = file + df * i
                    
                    if 0 <= new_rank < 8 and 0 <= new_file < 8:
                        target_square = chess.square(new_file, new_rank)
                        attacks.append(target_square)
                        
                        if board.piece_at(target_square):  # 기물이 있으면 멈춤
                            break
                    else:
                        break
        
        if piece_type == chess.BISHOP or piece_type == chess.QUEEN:
            # 대각선 공격
            diagonals = [
                (1, 1), (1, -1), (-1, 1), (-1, -1)
            ]
            rank = chess.square_rank(square)
            file = chess.square_file(square)
            
            for dr, df in diagonals:
                r, f = rank + dr, file + df
                while 0 <= r <= 7 and 0 <= f <= 7:
                    target_sq = chess.square(f, r)
                    attacks.append(target_sq)
                    if board.piece_at(target_sq):
                        break
                    r, f = r + dr, f + df
        
        return attacks
    
    def _get_all_attacked_squares(
        self, 
        board: chess.Board, 
        color: chess.Color
    ) -> Set[chess.Square]:
        """특정 색상이 공격하는 모든 스퀘어"""
        attacked = set()
        
        for square in chess.SQUARES:
            if board.is_attacked_by(color, square):
                attacked.add(square)
        
        return attacked
    
    def _find_newly_vulnerable_pieces(
        self, 
        board_before: chess.Board, 
        board_after: chess.Board, 
        target_color: chess.Color
    ) -> List[Tuple[chess.Square, chess.PieceType]]:
        """수 이후 새로 취약해진 기물들"""
        vulnerable = []
        
        for square in chess.SQUARES:
            piece = board_after.piece_at(square)
            if not piece or piece.color != target_color:
                continue
            
            # 이전에는 안전했지만 이후에는 공격받는 기물
            safe_before = not board_before.is_attacked_by(not target_color, square)
            attacked_after = board_after.is_attacked_by(not target_color, square)
            
            if safe_before and attacked_after:
                vulnerable.append((square, piece.piece_type))
        
        return vulnerable


def analyze_tactical_opportunities(
    board: chess.Board,
    move_analysis: MoveAnalysis = None
) -> List[TacticalOpportunity]:
    """
    포지션의 전술 기회 분석 편의 함수
    
    Args:
        board: 분석할 보드
        move_analysis: 연관된 수 분석 (선택사항)
        
    Returns:
        탐지된 전술 기회들
    """
    detector = TacticalDetector()
    return detector.detect_all_opportunities(board)


def create_tactical_evidence(
    opportunity: TacticalOpportunity,
    game_id: str,
    ply: int
) -> Evidence:
    """전술 기회를 Evidence 객체로 변환"""
    return Evidence(
        game_id=game_id,
        ply=ply,
        move_san=", ".join(move.uci() for move in opportunity.move_sequence) if opportunity.move_sequence else "",
        description=f"{opportunity.pattern.value}: {opportunity.description}",
        impact_score=min(opportunity.value_gain / 100.0, 3.0),
        context={
            'pattern': opportunity.pattern.value,
            'value_gain': opportunity.value_gain,
            'difficulty': opportunity.difficulty,
            'target_squares': [chess.square_name(sq) for sq in opportunity.target_squares]
        }
    )