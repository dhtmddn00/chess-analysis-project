"""
Lichess API 연동 모듈

Lichess Open API를 통해 플레이어 정보와 게임 데이터를 수집합니다.
게임 데이터는 PGN 형식으로 반환되며 기존 chess.com PGN 파서와 호환됩니다.
"""

import asyncio
from typing import List, Dict, Optional, Tuple

import aiohttp
from loguru import logger

from ..config import settings


class LichessAPIError(Exception):
    """Lichess API 관련 예외"""
    pass


class LichessPlayerNotFoundError(LichessAPIError):
    """플레이어를 찾을 수 없음"""
    pass


class LichessRateLimitError(LichessAPIError):
    """Rate limit 초과 예외"""
    pass


class LichessAPI:
    """
    Lichess Open API 클라이언트

    인증 없이 공개 데이터를 수집합니다. Rate limit은 다음 기준입니다:
    - 인증 없음: 분당 60 요청 (일반적 엔드포인트)
    - 게임 export: 초당 20 게임
    """

    BASE_URL = "https://lichess.org"

    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None
        self.headers = {
            "User-Agent": "ChessAnalysisService/1.0",
            "Accept": "application/json",
        }

    async def __aenter__(self):
        await self._ensure_session()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self._close_session()

    async def _ensure_session(self):
        if self.session is None or self.session.closed:
            timeout = aiohttp.ClientTimeout(total=30)
            self.session = aiohttp.ClientSession(
                headers=self.headers,
                timeout=timeout,
            )

    async def _close_session(self):
        if self.session and not self.session.closed:
            await self.session.close()

    async def get_player_info(self, username: str) -> Dict:
        """
        플레이어 기본 정보 조회.

        Returns:
            dict with keys: username, title, perfs, count, profile
        """
        await self._ensure_session()
        url = f"{self.BASE_URL}/api/user/{username}"
        async with self.session.get(url) as resp:
            if resp.status == 404:
                raise LichessPlayerNotFoundError(f"Player not found: {username}")
            if resp.status == 429:
                raise LichessRateLimitError("Lichess rate limit exceeded")
            resp.raise_for_status()
            return await resp.json()

    async def get_recent_games(
        self,
        username: str,
        game_count: int,
        time_control: Optional[str] = None,
    ) -> Tuple[List[Dict], Dict]:
        """
        최근 게임 및 플레이어 정보 반환.

        chess.com API의 반환값과 동일한 인터페이스를 제공합니다:
        - games: PGN 텍스트가 포함된 게임 딕셔너리 목록
        - player_info: 플레이어 메타데이터 딕셔너리

        Args:
            username: Lichess 유저명
            game_count: 가져올 게임 수
            time_control: "rapid" | "blitz" | "bullet" | None(전체)

        Returns:
            (games, player_info) 튜플
        """
        await self._ensure_session()

        # 플레이어 정보와 게임을 병렬로 가져온다
        player_task = asyncio.create_task(self.get_player_info(username))
        games_task  = asyncio.create_task(
            self._fetch_games_pgn(username, game_count, time_control)
        )

        player_info_raw, game_objects = await asyncio.gather(player_task, games_task)

        player_info = self._build_player_info(player_info_raw, username)
        return game_objects, player_info

    async def _fetch_games_pgn(
        self,
        username: str,
        max_games: int,
        time_control: Optional[str],
    ) -> List[Dict]:
        """
        Lichess 게임 export 엔드포인트로 PGN 게임 목록을 가져온다.

        /api/games/user/{username} 는 NDJSON 형식을 반환한다.
        각 줄이 게임 하나의 JSON 객체이며 "pgn" 필드에 PGN 텍스트가 포함된다.
        """
        perf_type_map = {
            "rapid":  "rapid",
            "blitz":  "blitz",
            "bullet": "bullet",
        }
        params = {
            "max":       str(max_games),
            "pgnInJson": "true",   # PGN을 JSON 필드로 포함
            "clocks":    "true",   # 시간 데이터 포함
            "evals":     "false",  # 엔진 평가는 불필요 (자체 분석)
            "opening":   "true",   # 오프닝 ECO 포함
            "moves":     "true",
        }
        if time_control and time_control in perf_type_map:
            params["perfType"] = perf_type_map[time_control]

        url = f"{self.BASE_URL}/api/games/user/{username}"
        headers = {**self.headers, "Accept": "application/x-ndjson"}

        async with self.session.get(url, params=params, headers=headers) as resp:
            if resp.status == 404:
                raise LichessPlayerNotFoundError(f"Player not found: {username}")
            if resp.status == 429:
                raise LichessRateLimitError("Lichess rate limit exceeded")
            resp.raise_for_status()

            games = []
            async for raw_line in resp.content:
                line = raw_line.decode("utf-8").strip()
                if not line:
                    continue
                try:
                    import json
                    game_json = json.loads(line)
                    game_dict = self._lichess_game_to_dict(game_json)
                    if game_dict:
                        games.append(game_dict)
                except Exception as exc:
                    logger.debug(f"Skipping malformed Lichess game: {exc}")

            logger.info(f"Fetched {len(games)} Lichess games for {username}")
            return games

    def _lichess_game_to_dict(self, g: Dict) -> Optional[Dict]:
        """
        Lichess NDJSON 게임 객체를 chess.com 호환 딕셔너리로 변환한다.

        chess.com API 구조를 흉내내어 기존 parse_chess_com_games()에서
        pgn 필드를 직접 읽을 수 있도록 한다.
        """
        pgn_text = g.get("pgn", "")
        if not pgn_text:
            return None

        # Lichess PGN에는 이미 Site/White/Black/Result/ECO/Opening 태그가 포함됨
        # 단, EndTime 태그가 없으므로 UTCDate+UTCTime으로 보강한다
        game_id = g.get("id", "")
        url = f"https://lichess.org/{game_id}"

        return {
            "url":        url,
            "pgn":        pgn_text,
            "time_class": self._perf_to_time_class(g.get("perf", "")),
            "time_control": self._build_time_control(g),
            "rated":      g.get("rated", True),
        }

    @staticmethod
    def _perf_to_time_class(perf: str) -> str:
        """Lichess perf → chess.com time_class 매핑"""
        return {
            "bullet":         "bullet",
            "blitz":          "blitz",
            "rapid":          "rapid",
            "classical":      "rapid",
            "correspondence": "daily",
        }.get(perf, "blitz")

    @staticmethod
    def _build_time_control(g: Dict) -> str:
        """clock 데이터로 chess.com 형식 time_control 문자열 생성"""
        clock = g.get("clock", {})
        initial   = clock.get("initial", 300)
        increment = clock.get("increment", 0)
        return f"{initial}+{increment}"

    @staticmethod
    def _build_player_info(raw: Dict, username: str) -> Dict:
        """Lichess 플레이어 프로파일을 내부 player_info 형식으로 변환"""
        perfs   = raw.get("perfs", {})
        profile = raw.get("profile", {})
        count   = raw.get("count", {})

        ratings = {}
        for tc in ("rapid", "blitz", "bullet"):
            r = perfs.get(tc, {}).get("rating", 0)
            if r:
                ratings[tc] = r

        return {
            "username":  raw.get("username", username),
            "title":     raw.get("title"),
            "country":   profile.get("country") or profile.get("flag"),
            "followers": raw.get("nbFollowers", 0),
            "ratings":   ratings,
            "record": {
                "all":  count.get("all", 0),
                "win":  count.get("win", 0),
                "loss": count.get("loss", 0),
                "draw": count.get("draw", 0),
            },
            "platform": "lichess",
        }
