"""
Stockfish 체스 엔진 연동 모듈

Stockfish 엔진을 사용하여 체스 게임을 분석하고
각 수의 평가값, 최선수, 실수 등을 계산합니다.
"""

import asyncio
import chess
import chess.engine
from typing import List, Dict, Optional, Tuple, Union
from dataclasses import dataclass
from enum import Enum
import time

from loguru import logger
from ..config import settings, get_stockfish_path
from ..utils.pgn_parser import ParsedGame
from ..models.analysis_types import MoveQuality, MoveAnalysis, GameAnalysis




class StockfishEngine:
    """
    Stockfish 엔진 래퍼 클래스
    
    체스 게임 분석을 위한 Stockfish 엔진 인터페이스를 제공합니다.
    """
    
    def __init__(self):
        self.engine_path = get_stockfish_path()
        self.engine: Optional[chess.engine.SimpleEngine] = None
        self._is_running = False
        
        # 엔진 설정
        self.options = {
            'Threads': settings.stockfish_threads,
            'Hash': settings.stockfish_memory,
            'UCI_Chess960': False,
            'MultiPV': 1  # 최선수만 분석
        }
    
    async def __aenter__(self):
        """Async context manager 진입"""
        await self.start_engine()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager 종료"""
        await self.stop_engine()
    
    async def start_engine(self):
        """엔진 시작"""
        if self._is_running:
            return
        
        try:
            # 엔진 시작
            transport, self.engine = await chess.engine.popen_uci(self.engine_path)
            
            # 옵션 설정
            for option, value in self.options.items():
                try:
                    await self.engine.configure({option: value})
                except chess.engine.EngineError as e:
                    logger.warning(f"엔진 옵션 설정 실패 {option}={value}: {e}")
            
            self._is_running = True
            logger.info(f"Stockfish 엔진 시작됨: {self.engine_path}")
            
        except Exception as e:
            logger.error(f"Stockfish 엔진 시작 실패: {e}")
            raise
    
    async def stop_engine(self):
        """엔진 종료"""
        if self.engine and self._is_running:
            try:
                await self.engine.quit()
                self._is_running = False
                logger.info("Stockfish 엔진 종료됨")
            except Exception as e:
                logger.warning(f"엔진 종료 중 오류: {e}")
    
    async def analyze_position(
        self, 
        board: chess.Board, 
        depth: int = None,
        time_limit: float = None
    ) -> Optional[chess.engine.PovScore]:
        """
        보드 포지션 분석
        
        Args:
            board: 분석할 보드 포지션
            depth: 분석 깊이
            time_limit: 시간 제한 (초)
            
        Returns:
            포지션 평가값 (백의 관점)
        """
        if not self._is_running:
            await self.start_engine()
        
        try:
            # 분석 제한 설정
            limit = chess.engine.Limit()
            if depth:
                limit.depth = depth
            if time_limit:
                limit.time = time_limit
            
            # 분석 실행
            info = await self.engine.analyse(board, limit)
            return info.get('score')
            
        except Exception as e:
            logger.error(f"포지션 분석 오류: {e}")
            return None
    
    async def get_best_move(
        self, 
        board: chess.Board, 
        depth: int = None,
        time_limit: float = None
    ) -> Tuple[Optional[chess.Move], Optional[List[chess.Move]]]:
        """
        최선수와 주요 변형 획득
        
        Args:
            board: 분석할 보드 포지션
            depth: 분석 깊이
            time_limit: 시간 제한 (초)
            
        Returns:
            (최선수, 주요 변형)
        """
        if not self._is_running:
            await self.start_engine()
        
        try:
            # 분석 제한 설정
            limit = chess.engine.Limit()
            if depth:
                limit.depth = depth
            if time_limit:
                limit.time = time_limit
            
            # 분석 실행
            result = await self.engine.play(board, limit)
            info = await self.engine.analyse(board, limit)
            
            best_move = result.move
            pv = info.get('pv', [])
            
            return best_move, pv
            
        except Exception as e:
            logger.error(f"최선수 분석 오류: {e}")
            return None, []
    
    def score_to_centipawn(self, score: chess.engine.PovScore) -> Optional[int]:
        """
        엔진 스코어를 센티폰으로 변환
        
        Args:
            score: 엔진 평가 점수
            
        Returns:
            센티폰 값 (백의 관점, 메이트는 ±9999)
        """
        if score is None:
            return None
        
        # 백의 관점으로 변환
        white_pov_score = score.white()
        
        if white_pov_score.is_mate():
            mate_in = white_pov_score.mate()
            if mate_in > 0:
                return 9999 - mate_in
            else:
                return -9999 - mate_in
        else:
            # cp 속성을 통해 센티폰 값 접근
            return white_pov_score.score(mate_score=9999)
    
    async def analyze_move(
        self, 
        board_before: chess.Board,
        move: chess.Move,
        depth: int = settings.stockfish_depth_quick
    ) -> MoveAnalysis:
        """
        개별 수 분석
        
        Args:
            board_before: 착수 전 보드
            move: 분석할 수
            depth: 분석 깊이
            
        Returns:
            수 분석 결과
        """
        ply = board_before.fullmove_number * 2 - (2 if board_before.turn == chess.WHITE else 1)
        
        # 수의 기본 정보
        move_san = board_before.san(move)
        is_check = board_before.gives_check(move)
        is_capture = board_before.is_capture(move)
        is_castling = board_before.is_castling(move)
        is_promotion = move.promotion is not None
        
        # 착수 전 평가
        eval_before_score = await self.analyze_position(board_before, depth=depth)
        eval_before = self.score_to_centipawn(eval_before_score)
        
        # 최선수 획득
        best_move, best_pv = await self.get_best_move(board_before, depth=depth)
        
        # 착수 후 평가
        board_after = board_before.copy()
        board_after.push(move)
        eval_after_score = await self.analyze_position(board_after, depth=depth)
        eval_after = self.score_to_centipawn(eval_after_score)
        
        # 최선수 후 평가 (비교용)
        best_eval = None
        best_move_san = None
        if best_move:
            board_best = board_before.copy()
            board_best.push(best_move)
            best_eval_score = await self.analyze_position(board_best, depth=depth)
            best_eval = self.score_to_centipawn(best_eval_score)
            best_move_san = board_before.san(best_move)
        
        # 센티폰 손실 계산
        centipawn_loss = 0
        if eval_after is not None and best_eval is not None:
            # 현재 플레이어 관점에서 계산
            if board_before.turn == chess.WHITE:
                centipawn_loss = max(0, best_eval - eval_after)
            else:
                centipawn_loss = max(0, eval_after - best_eval)
        
        # 수의 품질 평가
        quality = self._evaluate_move_quality(centipawn_loss, eval_before, eval_after, best_eval)
        
        return MoveAnalysis(
            ply=ply,
            move_san=move_san,
            move_uci=move.uci() if move else None,
            eval_before=eval_before,
            eval_after=eval_after,
            best_eval=best_eval,
            best_move_san=best_move_san,
            best_move_uci=best_move.uci() if best_move else None,
            quality=quality,
            centipawn_loss=centipawn_loss,
            is_check=is_check,
            is_capture=is_capture,
            is_castling=is_castling,
            is_promotion=is_promotion,
            time_spent=None  # PGN에서 추출해서 따로 설정
        )
    
    def _evaluate_move_quality(
        self, 
        centipawn_loss: int, 
        eval_before: Optional[int],
        eval_after: Optional[int], 
        best_eval: Optional[int]
    ) -> MoveQuality:
        """
        수의 품질 평가
        
        Args:
            centipawn_loss: 센티폰 손실
            eval_before: 착수 전 평가
            eval_after: 착수 후 평가
            best_eval: 최선수 후 평가
            
        Returns:
            수의 품질 등급
        """
        # 메이트 놓침 체크
        if (best_eval is not None and abs(best_eval) > 9000 and
            eval_after is not None and abs(eval_after) < 9000):
            return MoveQuality.MATE_MISS
        
        # 센티폰 손실 기준으로 품질 평가
        if centipawn_loss >= settings.blunder_threshold_cp:
            return MoveQuality.BLUNDER
        elif centipawn_loss >= settings.mistake_threshold_cp:
            return MoveQuality.MISTAKE
        elif centipawn_loss >= settings.inaccuracy_threshold_cp:
            return MoveQuality.INACCURACY
        elif centipawn_loss <= 5:
            return MoveQuality.BEST
        else:
            return MoveQuality.GOOD
    
    async def analyze_game(
        self, 
        parsed_game: ParsedGame,
        depth: int = settings.stockfish_depth_quick,
        progress_callback: Optional[callable] = None
    ) -> GameAnalysis:
        """
        전체 게임 분석
        
        Args:
            parsed_game: 파싱된 게임 데이터
            depth: 분석 깊이
            progress_callback: 진행률 콜백 함수
            
        Returns:
            게임 분석 결과
        """
        logger.info(f"게임 분석 시작: {parsed_game.info.white_player} vs {parsed_game.info.black_player}")
        start_time = time.time()
        
        move_analyses = []
        boards = parsed_game.board_history[:-1]  # 마지막 보드는 게임 종료 후
        moves = []
        
        # 수 목록 추출
        node = parsed_game.game
        while node.variations:
            node = node.variation(0)
            moves.append(node.move)
        
        total_moves = len(moves)
        
        # 각 수 분석
        for i, (board, move) in enumerate(zip(boards, moves)):
            try:
                move_analysis = await self.analyze_move(board, move, depth)
                
                # 시간 정보 추가 (PGN에서 추출된 경우)
                if i < len(parsed_game.move_times):
                    move_analysis.time_spent = parsed_game.move_times[i]
                
                move_analyses.append(move_analysis)
                
                # 진행률 콜백
                if progress_callback:
                    progress = (i + 1) / total_moves
                    progress_callback(progress)
                
                # 매 10수마다 로그
                if (i + 1) % 10 == 0:
                    logger.debug(f"분석 진행률: {i+1}/{total_moves}")
                    
            except Exception as e:
                logger.error(f"수 {i+1} 분석 오류: {e}")
                continue
        
        # 통계 계산
        analysis = self._calculate_game_statistics(parsed_game, move_analyses)
        
        elapsed_time = time.time() - start_time
        logger.info(f"게임 분석 완료: {total_moves}수, {elapsed_time:.1f}초 소요")
        
        return analysis
    
    def _calculate_game_statistics(
        self, 
        parsed_game: ParsedGame, 
        move_analyses: List[MoveAnalysis]
    ) -> GameAnalysis:
        """게임 통계 계산"""
        
        # 백/흑 수 분리
        white_moves = [ma for ma in move_analyses if ma.ply % 2 == 0]
        black_moves = [ma for ma in move_analyses if ma.ply % 2 == 1]
        
        # ACPL 계산
        white_acpl = sum(ma.centipawn_loss for ma in white_moves) / max(1, len(white_moves))
        black_acpl = sum(ma.centipawn_loss for ma in black_moves) / max(1, len(black_moves))
        
        # 실수 통계
        white_stats = self._count_move_qualities(white_moves)
        black_stats = self._count_move_qualities(black_moves)
        
        # 게임 페이즈 구분
        opening_end = min(settings.opening_max_ply, len(move_analyses))
        middlegame_end = min(settings.middlegame_max_ply, len(move_analyses))
        
        opening_moves = move_analyses[:opening_end]
        middlegame_moves = move_analyses[opening_end:middlegame_end]
        endgame_moves = move_analyses[middlegame_end:]
        
        # 페이즈별 ACPL
        phase_acpl = self._calculate_phase_acpl(opening_moves, middlegame_moves, endgame_moves)
        
        # Generate a simple, safe game ID
        game_id = f"game_{parsed_game.info.game_id}"
        
        return GameAnalysis(
            game_id=game_id,
            move_analyses=move_analyses,
            white_acpl=white_acpl,
            black_acpl=black_acpl,
            white_inaccuracies=white_stats['inaccuracies'],
            white_mistakes=white_stats['mistakes'],
            white_blunders=white_stats['blunders'],
            black_inaccuracies=black_stats['inaccuracies'],
            black_mistakes=black_stats['mistakes'],
            black_blunders=black_stats['blunders'],
            opening_moves=len(opening_moves),
            middlegame_moves=len(middlegame_moves),
            endgame_moves=len(endgame_moves),
            **phase_acpl
        )
    
    def _count_move_qualities(self, moves: List[MoveAnalysis]) -> Dict[str, int]:
        """수 품질별 개수 계산"""
        counts = {
            'inaccuracies': 0,
            'mistakes': 0,
            'blunders': 0
        }
        
        for move in moves:
            if move.quality == MoveQuality.INACCURACY:
                counts['inaccuracies'] += 1
            elif move.quality == MoveQuality.MISTAKE:
                counts['mistakes'] += 1
            elif move.quality == MoveQuality.BLUNDER:
                counts['blunders'] += 1
        
        return counts
    
    def _calculate_phase_acpl(
        self, 
        opening_moves: List[MoveAnalysis],
        middlegame_moves: List[MoveAnalysis],
        endgame_moves: List[MoveAnalysis]
    ) -> Dict[str, float]:
        """페이즈별 ACPL 계산"""
        def phase_acpl(moves: List[MoveAnalysis], color: chess.Color) -> float:
            filtered_moves = [
                ma for ma in moves 
                if (ma.ply % 2 == 0) == (color == chess.WHITE)
            ]
            if not filtered_moves:
                return 0.0
            return sum(ma.centipawn_loss for ma in filtered_moves) / len(filtered_moves)
        
        return {
            'white_opening_acpl': phase_acpl(opening_moves, chess.WHITE),
            'white_middlegame_acpl': phase_acpl(middlegame_moves, chess.WHITE),
            'white_endgame_acpl': phase_acpl(endgame_moves, chess.WHITE),
            'black_opening_acpl': phase_acpl(opening_moves, chess.BLACK),
            'black_middlegame_acpl': phase_acpl(middlegame_moves, chess.BLACK),
            'black_endgame_acpl': phase_acpl(endgame_moves, chess.BLACK),
        }


# 편의 함수들
async def analyze_single_game(parsed_game: ParsedGame, depth: int = None) -> GameAnalysis:
    """단일 게임 분석 편의 함수"""
    depth = depth or settings.stockfish_depth_quick
    
    async with StockfishEngine() as engine:
        return await engine.analyze_game(parsed_game, depth)


async def analyze_multiple_games(
    parsed_games: List[ParsedGame], 
    depth: int = None,
    progress_callback: Optional[callable] = None
) -> List[GameAnalysis]:
    """여러 게임 분석 편의 함수"""
    depth = depth or settings.stockfish_depth_quick
    analyses = []
    
    async with StockfishEngine() as engine:
        for i, game in enumerate(parsed_games):
            try:
                analysis = await engine.analyze_game(game, depth)
                analyses.append(analysis)
                
                if progress_callback:
                    progress_callback(i + 1, len(parsed_games))
                    
            except Exception as e:
                logger.error(f"게임 {i+1} 분석 실패: {e}")
                continue
    
    return analyses