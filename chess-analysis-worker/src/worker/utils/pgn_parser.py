"""
PGN 파싱 유틸리티 모듈

Chess.com API에서 받은 게임 데이터를 파싱하고 
python-chess 라이브러리를 사용해 분석 가능한 형태로 변환합니다.
"""

import io
import re
from datetime import datetime
from typing import List, Dict, Optional, Tuple, Any, Union
from dataclasses import dataclass
from enum import Enum

import chess
import chess.pgn
from loguru import logger


class GameResult(Enum):
    """게임 결과"""
    WHITE_WIN = "1-0"
    BLACK_WIN = "0-1"
    DRAW = "1/2-1/2"
    UNKNOWN = "*"


class TimeControl(Enum):
    """시간 제어 유형"""
    BULLET = "bullet"
    BLITZ = "blitz"
    RAPID = "rapid"
    DAILY = "daily"
    UNKNOWN = "unknown"


@dataclass
class GameInfo:
    """게임 기본 정보"""
    site: str
    game_id: str
    white_player: str
    black_player: str
    white_rating: int
    black_rating: int
    result: GameResult
    time_control: TimeControl
    time_control_seconds: int
    time_increment: int
    eco: Optional[str] = None
    opening: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    rules: str = "chess"
    rated: bool = True
    pgn_text: Optional[str] = None


@dataclass
class ParsedGame:
    """파싱된 게임 데이터"""
    info: GameInfo
    game: chess.pgn.Game
    board_history: List[chess.Board]
    move_times: List[Optional[float]]  # 각 수 이후 남은 시간 (초)
    move_evaluations: List[Optional[int]]  # 엔진 평가값 (centipawn)
    

class PGNParser:
    """
    PGN 데이터 파서
    
    Chess.com API 응답과 PGN 문자열을 파싱하여
    분석 가능한 데이터 구조로 변환합니다.
    """
    
    @staticmethod
    def parse_time_control(time_control_str: str) -> Tuple[TimeControl, int, int]:
        """
        시간 제어 문자열 파싱
        
        Args:
            time_control_str: 시간 제어 문자열 (예: "600+5", "180", "1/259200")
            
        Returns:
            (시간 제어 유형, 기본 시간(초), 증분(초))
        """
        if not time_control_str:
            return TimeControl.UNKNOWN, 0, 0
        
        # Daily 게임 패턴: "1/86400" (하루 단위)
        if "/" in time_control_str:
            parts = time_control_str.split("/")
            if len(parts) == 2:
                try:
                    days = int(parts[0])
                    return TimeControl.DAILY, days * 86400, 0
                except ValueError:
                    pass
        
        # 일반적인 시간 제어: "600+5", "180+0", "300"
        match = re.match(r"(\d+)(?:\+(\d+))?", time_control_str)
        if match:
            base_time = int(match.group(1))
            increment = int(match.group(2) or 0)
            
            # 시간 유형 분류
            total_estimated_time = base_time + increment * 40  # 평균 40수 가정
            
            if total_estimated_time < 180:  # 3분 미만
                time_type = TimeControl.BULLET
            elif total_estimated_time < 600:  # 10분 미만
                time_type = TimeControl.BLITZ
            elif total_estimated_time < 1800:  # 30분 미만
                time_type = TimeControl.RAPID
            else:
                time_type = TimeControl.DAILY
            
            return time_type, base_time, increment
        
        return TimeControl.UNKNOWN, 0, 0
    
    @staticmethod
    def parse_chess_com_game(game_data: Dict) -> Optional[GameInfo]:
        """
        Chess.com API 게임 데이터를 GameInfo로 변환
        
        Args:
            game_data: Chess.com API 응답의 게임 데이터
            
        Returns:
            GameInfo 객체 (파싱 실패시 None)
        """
        try:
            # 필수 필드 확인
            required_fields = ['white', 'black', 'pgn', 'time_control', 'rated']
            if not all(field in game_data for field in required_fields):
                logger.warning(f"필수 필드 누락: {list(game_data.keys())}")
                return None
            
            # 플레이어 정보
            white_info = game_data['white']
            black_info = game_data['black']
            
            # 시간 제어 파싱
            time_control, base_time, increment = PGNParser.parse_time_control(
                game_data.get('time_control', '')
            )
            
            # 게임 결과 파싱
            pgn_text = game_data['pgn']
            result_match = re.search(r'\[Result "([^"]+)"\]', pgn_text)
            result_str = result_match.group(1) if result_match else "*"
            
            try:
                result = GameResult(result_str)
            except ValueError:
                result = GameResult.UNKNOWN
            
            # ECO/Opening 정보 추출
            eco_match = re.search(r'\[ECO "([^"]+)"\]', pgn_text)
            eco = eco_match.group(1) if eco_match else None
            
            opening_match = re.search(r'\[Opening "([^"]+)"\]', pgn_text)
            opening = opening_match.group(1) if opening_match else None
            if not opening:
                eco_url_match = re.search(r'\[ECOUrl "([^"]+)"\]', pgn_text)
                if eco_url_match:
                    opening_slug = eco_url_match.group(1).rstrip('/').split('/')[-1]
                    opening_slug = opening_slug.split('...')[0]
                    opening = opening_slug.replace('-', ' ')
            
            # 시간 정보
            start_time = None
            end_time = None
            
            if 'start_time' in game_data:
                start_time = datetime.fromtimestamp(game_data['start_time'])
            
            if 'end_time' in game_data:
                end_time = datetime.fromtimestamp(game_data['end_time'])
            
            return GameInfo(
                site="Chess.com",
                game_id=game_data.get('uuid', ''),
                white_player=white_info.get('username', ''),
                black_player=black_info.get('username', ''),
                white_rating=white_info.get('rating', 0),
                black_rating=black_info.get('rating', 0),
                result=result,
                time_control=time_control,
                time_control_seconds=base_time,
                time_increment=increment,
                eco=eco,
                opening=opening,
                start_time=start_time,
                end_time=end_time,
                rated=game_data.get('rated', True),
                pgn_text=pgn_text
            )
            
        except Exception as e:
            logger.error(f"Chess.com 게임 데이터 파싱 오류: {e}")
            return None
    
    @staticmethod
    def parse_pgn_text(pgn_text: str) -> Optional[chess.pgn.Game]:
        """
        PGN 텍스트를 chess.pgn.Game 객체로 파싱
        
        Args:
            pgn_text: PGN 형식의 게임 데이터
            
        Returns:
            chess.pgn.Game 객체 (파싱 실패시 None)
        """
        try:
            pgn_io = io.StringIO(pgn_text)
            game = chess.pgn.read_game(pgn_io)
            return game
        except Exception as e:
            logger.error(f"PGN 파싱 오류: {e}")
            return None
    
    @staticmethod
    def extract_move_times(game: chess.pgn.Game) -> List[Optional[float]]:
        """
        PGN에서 각 수 이후 남은 시간 추출
        
        Args:
            game: chess.pgn.Game 객체
            
        Returns:
            각 수 이후 남은 시간 리스트 (초 단위, 없으면 None)
        """
        move_times = []
        node = game
        
        while node.variations:
            node = node.variation(0)
            
            # 주석에서 시간 정보 추출 ([%clk 0:05:30] 형식)
            time_seconds = None
            if node.comment:
                time_match = re.search(r'\[%clk (\d+):(\d+):(\d+)\]', node.comment)
                if time_match:
                    hours, minutes, seconds = map(int, time_match.groups())
                    time_seconds = hours * 3600 + minutes * 60 + seconds
            
            move_times.append(time_seconds)
        
        return move_times
    
    @staticmethod
    def extract_board_history(game: chess.pgn.Game) -> List[chess.Board]:
        """
        게임의 모든 보드 상태 추출
        
        Args:
            game: chess.pgn.Game 객체
            
        Returns:
            각 수 이후의 보드 상태 리스트
        """
        board_history = []
        board = game.board()
        board_history.append(board.copy())
        
        node = game
        while node.variations:
            node = node.variation(0)
            board.push(node.move)
            board_history.append(board.copy())
        
        return board_history
    
    @classmethod
    def parse_full_game(cls, game_data: Dict) -> Optional[ParsedGame]:
        """
        Chess.com 게임 데이터를 완전히 파싱
        
        Args:
            game_data: Chess.com API 게임 데이터
            
        Returns:
            ParsedGame 객체 (파싱 실패시 None)
        """
        # 기본 정보 파싱
        game_info = cls.parse_chess_com_game(game_data)
        if not game_info or not game_info.pgn_text:
            return None
        
        # PGN 파싱
        pgn_game = cls.parse_pgn_text(game_info.pgn_text)
        if not pgn_game:
            return None
        
        # 보드 히스토리와 시간 정보 추출
        board_history = cls.extract_board_history(pgn_game)
        move_times = cls.extract_move_times(pgn_game)
        
        # 초기 평가값은 빈 리스트 (엔진 분석에서 채워짐)
        move_evaluations = [None] * len(board_history)
        
        return ParsedGame(
            info=game_info,
            game=pgn_game,
            board_history=board_history,
            move_times=move_times,
            move_evaluations=move_evaluations
        )
    
    @staticmethod
    def filter_games_by_criteria(
        games: List[ParsedGame], 
        target_player: str,
        time_controls: Optional[List[TimeControl]] = None,
        rated_only: bool = True,
        min_moves: int = 10
    ) -> List[ParsedGame]:
        """
        게임 필터링
        
        Args:
            games: 파싱된 게임 리스트
            target_player: 분석 대상 플레이어
            time_controls: 허용할 시간 제어 리스트 (None이면 모두 허용)
            rated_only: 레이팅 게임만 필터링할지 여부
            min_moves: 최소 수 개수
            
        Returns:
            필터링된 게임 리스트
        """
        filtered_games = []
        
        for game in games:
            # 대상 플레이어 체크
            if (game.info.white_player.lower() != target_player.lower() and 
                game.info.black_player.lower() != target_player.lower()):
                continue
            
            # 레이팅 게임 체크
            if rated_only and not game.info.rated:
                continue
            
            # 시간 제어 체크
            if time_controls and game.info.time_control not in time_controls:
                continue
            
            # 최소 수 체크
            if len(game.board_history) < min_moves:
                continue
            
            # 중도 포기 등 비정상 게임 체크
            if game.info.result == GameResult.UNKNOWN:
                continue
            
            filtered_games.append(game)
        
        return filtered_games
    
    @staticmethod
    def get_player_color(game: ParsedGame, player_username: str) -> Optional[chess.Color]:
        """
        특정 플레이어의 색깔 반환
        
        Args:
            game: 파싱된 게임
            player_username: 플레이어 사용자명
            
        Returns:
            플레이어 색깔 (chess.WHITE 또는 chess.BLACK, 없으면 None)
        """
        username_lower = player_username.lower()
        
        if game.info.white_player.lower() == username_lower:
            return chess.WHITE
        elif game.info.black_player.lower() == username_lower:
            return chess.BLACK
        else:
            return None
    
    @staticmethod
    def extract_opening_moves(game: ParsedGame, max_moves: int = 15) -> List[str]:
        """
        오프닝 수순 추출 (대수 표기법)
        
        Args:
            game: 파싱된 게임
            max_moves: 추출할 최대 수 개수
            
        Returns:
            오프닝 수순 리스트 (예: ["e4", "e5", "Nf3"])
        """
        moves = []
        node = game.game
        move_count = 0
        
        while node.variations and move_count < max_moves:
            node = node.variation(0)
            move_san = game.board_history[move_count].san(node.move)
            moves.append(move_san)
            move_count += 1
        
        return moves


# 편의 함수들
def parse_chess_com_games(games_data: List[Dict]) -> List[ParsedGame]:
    """
    Chess.com 게임 데이터 리스트를 한 번에 파싱
    
    Args:
        games_data: Chess.com API 게임 데이터 리스트
        
    Returns:
        파싱된 게임 리스트
    """
    parsed_games = []
    
    logger.info(f"Parsing {len(games_data)} games, type: {type(games_data)}")
    logger.info(f"Games data sample: {games_data}")
    
    # Handle tuple of lists structure
    if isinstance(games_data, tuple) and len(games_data) > 0:
        games_data = games_data[0] if isinstance(games_data[0], list) else list(games_data)
        logger.info(f"Converted tuple to list, new type: {type(games_data)}, length: {len(games_data)}")
    
    for i, game_data in enumerate(games_data):
        logger.debug(f"Game {i}: type={type(game_data)}, sample={str(game_data)[:200]}")
        
        # Handle nested list structure if present
        if isinstance(game_data, list) and len(game_data) > 0:
            game_data = game_data[0]
            logger.debug(f"Unwrapped nested list, new type: {type(game_data)}")
            
        parsed_game = PGNParser.parse_full_game(game_data)
        if parsed_game:
            parsed_games.append(parsed_game)
        else:
            logger.warning(f"게임 파싱 실패: {game_data.get('uuid', 'unknown')}")
    
    logger.info(f"총 {len(games_data)}개 중 {len(parsed_games)}개 게임 파싱 성공")
    return parsed_games


def analyze_time_controls(games: List[ParsedGame]) -> Dict[TimeControl, int]:
    """
    시간 제어별 게임 수 통계
    
    Args:
        games: 파싱된 게임 리스트
        
    Returns:
        시간 제어별 게임 수 딕셔너리
    """
    time_control_counts = {}
    
    for game in games:
        tc = game.info.time_control
        time_control_counts[tc] = time_control_counts.get(tc, 0) + 1
    
    return time_control_counts
