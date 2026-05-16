"""
Chess.com API 연동 모듈

Chess.com Public Data API를 통해 플레이어 정보와 게임 데이터를 수집합니다.
"""

import asyncio
import json
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from urllib.parse import urljoin

import aiohttp
from loguru import logger

from ..config import settings


class ChessComAPIError(Exception):
    """Chess.com API 관련 예외"""
    pass


class RateLimitError(ChessComAPIError):
    """Rate limit 초과 예외"""
    pass


class PlayerNotFoundError(ChessComAPIError):
    """플레이어를 찾을 수 없음"""
    pass


class ChessComAPI:
    """
    Chess.com Public Data API 클라이언트
    
    Chess.com의 공개 API를 통해 플레이어 정보와 게임 데이터를 수집합니다.
    Rate limiting과 에러 처리를 포함합니다.
    """
    
    def __init__(self):
        self.base_url = settings.chesscom_api_base_url
        self.rate_limit = settings.chesscom_rate_limit
        self.timeout = settings.chesscom_timeout
        self.session: Optional[aiohttp.ClientSession] = None
        self._last_request_time = 0
        self._request_count = 0
        self._request_times: List[float] = []
        
        # User-Agent 설정 (API 사용 예의)
        self.headers = {
            'User-Agent': 'ChessAnalysisService/1.0 (https://github.com/your-repo/chess-analyzer)',
            'Accept': 'application/json',
        }
    
    async def __aenter__(self):
        """Async context manager 진입"""
        await self._ensure_session()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager 종료"""
        await self._close_session()
    
    async def _ensure_session(self):
        """HTTP 세션 생성"""
        if self.session is None or self.session.closed:
            import ssl
            import os
            timeout = aiohttp.ClientTimeout(total=self.timeout)
            # 운영 환경에서 SSL 검증을 끄면 Chess.com 응답이 중간자 공격으로 변조될 수 있다.
            # VERIFY_SSL=false 는 로컬 개발 디버깅 전용이며 운영에서는 절대 사용 금지.
            verify_ssl = os.getenv('VERIFY_SSL', 'true').lower() != 'false'
            connector = aiohttp.TCPConnector(ssl=verify_ssl)
            self.session = aiohttp.ClientSession(
                headers=self.headers,
                timeout=timeout,
                connector=connector
            )
    
    async def _close_session(self):
        """HTTP 세션 종료"""
        if self.session and not self.session.closed:
            await self.session.close()
    
    async def _rate_limit_check(self):
        """Rate limit 체크 및 대기"""
        current_time = asyncio.get_event_loop().time()
        
        # 1분 이전의 요청들 제거
        cutoff_time = current_time - 60
        self._request_times = [t for t in self._request_times if t > cutoff_time]
        
        # Rate limit 체크
        if len(self._request_times) >= self.rate_limit:
            wait_time = 60 - (current_time - self._request_times[0])
            if wait_time > 0:
                logger.info(f"Rate limit 대기: {wait_time:.1f}초")
                await asyncio.sleep(wait_time)
                # 대기 후 재귀 호출
                return await self._rate_limit_check()
        
        # 요청 시간 기록
        self._request_times.append(current_time)
    
    async def _make_request(self, endpoint: str, retries: int = 3) -> Dict:
        """HTTP 요청 실행 - requests 라이브러리 사용 (임시 수정)"""
        import requests
        import asyncio
        from urllib.parse import urljoin
        
        await self._rate_limit_check()
        # URL 제대로 생성하기
        if not endpoint.startswith('/'):
            endpoint = '/' + endpoint
        url = self.base_url + endpoint
        
        def sync_request():
            try:
                import os
                # 운영 환경에서 SSL 검증을 끄면 Chess.com 응답이 중간자 공격으로 변조될 수 있다.
                # VERIFY_SSL=false 는 로컬 개발 디버깅 전용이며 운영에서는 절대 사용 금지.
                verify_ssl = os.getenv('VERIFY_SSL', 'true').lower() != 'false'
                logger.debug(f"API 요청: {url}")
                response = requests.get(
                    url,
                    headers=self.headers,
                    timeout=self.timeout,
                    verify=verify_ssl
                )
                
                if response.status_code == 404:
                    raise PlayerNotFoundError(f"플레이어 또는 데이터를 찾을 수 없음: {endpoint}")
                elif response.status_code == 429:
                    raise RateLimitError("Rate limit 초과")
                elif response.status_code >= 400:
                    raise ChessComAPIError(f"API 요청 실패 (HTTP {response.status_code}): {response.text}")
                
                return response.json()
            except requests.exceptions.RequestException as e:
                raise ChessComAPIError(f"HTTP 요청 실패: {e}")
        
        # 동기 함수를 비동기로 실행
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, sync_request)
    
    async def _make_request_old(self, endpoint: str, retries: int = 3) -> Dict:
        """기존 aiohttp 방식 (사용 안함)"""
        await self._ensure_session()
        await self._rate_limit_check()
        
        url = urljoin(self.base_url, endpoint.lstrip('/'))
        
        for attempt in range(retries + 1):
            try:
                logger.debug(f"API 요청: {url}")
                async with self.session.get(url) as response:
                    
                    if response.status == 429:
                        # Rate limit 초과
                        retry_after = int(response.headers.get('Retry-After', 60))
                        if attempt < retries:
                            logger.warning(f"Rate limit 초과, {retry_after}초 대기")
                            await asyncio.sleep(retry_after)
                            continue
                        else:
                            raise RateLimitError("Rate limit 초과")
                    
                    elif response.status == 404:
                        raise PlayerNotFoundError(f"플레이어 또는 데이터를 찾을 수 없음: {endpoint}")
                    
                    elif response.status >= 400:
                        error_text = await response.text()
                        raise ChessComAPIError(
                            f"API 요청 실패 (HTTP {response.status}): {error_text}"
                        )
                    
                    # 성공적인 응답
                    data = await response.json()
                    logger.debug(f"API 응답 수신: {len(str(data))} bytes")
                    return data
                    
            except aiohttp.ClientError as e:
                if attempt < retries:
                    wait_time = 2 ** attempt  # 지수 백오프
                    logger.warning(f"요청 실패, {wait_time}초 후 재시도: {e}")
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    raise ChessComAPIError(f"HTTP 요청 실패: {e}")
        
        raise ChessComAPIError("최대 재시도 횟수 초과")
    
    async def get_player_info(self, username: str) -> Dict:
        """
        플레이어 기본 정보 조회
        
        Args:
            username: Chess.com 사용자명
            
        Returns:
            플레이어 정보 딕셔너리
        """
        endpoint = f"/player/{username}"
        return await self._make_request(endpoint)
    
    async def get_player_stats(self, username: str) -> Dict:
        """
        플레이어 통계 정보 조회
        
        Args:
            username: Chess.com 사용자명
            
        Returns:
            플레이어 통계 딕셔너리
        """
        endpoint = f"/player/{username}/stats"
        return await self._make_request(endpoint)
    
    async def get_game_archives(self, username: str) -> List[str]:
        """
        플레이어의 게임 아카이브 URL 목록 조회
        
        Args:
            username: Chess.com 사용자명
            
        Returns:
            월별 아카이브 URL 리스트 (최신순)
        """
        endpoint = f"/player/{username}/games/archives"
        data = await self._make_request(endpoint)
        
        # URL 리스트를 최신순으로 정렬
        archives = data.get('archives', [])
        archives.sort(reverse=True)  # 최신 월이 먼저
        
        return archives
    
    async def get_monthly_games(self, username: str, year: int, month: int) -> List[Dict]:
        """
        특정 월의 게임 데이터 조회
        
        Args:
            username: Chess.com 사용자명
            year: 연도
            month: 월
            
        Returns:
            게임 데이터 리스트
        """
        endpoint = f"/player/{username}/games/{year:04d}/{month:02d}"
        data = await self._make_request(endpoint)
        
        return data.get('games', [])
    
    async def get_recent_games(self, username: str, game_count: int = 10) -> Tuple[List[Dict], Dict]:
        """
        최신 게임 데이터 수집
        
        Chess.com은 "최근 N게임" API가 없으므로 월별 아카이브에서 
        최신 월부터 역순으로 탐색하여 필요한 만큼 수집합니다.
        
        Args:
            username: Chess.com 사용자명
            game_count: 수집할 게임 수 (최대 settings.max_game_count)
            
        Returns:
            (게임 데이터 리스트, 플레이어 정보)
        """
        # 게임 수 제한
        game_count = min(game_count, settings.max_game_count)
        
        # 플레이어 정보와 아카이브 동시 요청
        player_info_task = self.get_player_info(username)
        archives_task = self.get_game_archives(username)
        
        player_info, archive_urls = await asyncio.gather(
            player_info_task, archives_task
        )
        
        if not archive_urls:
            logger.warning(f"플레이어 {username}의 게임 아카이브가 없습니다")
            return [], player_info
        
        # 최신 월부터 게임 수집
        collected_games = []
        
        for archive_url in archive_urls:
            if len(collected_games) >= game_count:
                break
            
            # URL에서 년/월 추출
            # 예: https://api.chess.com/pub/player/username/games/2024/01
            try:
                parts = archive_url.rstrip('/').split('/')
                year, month = int(parts[-2]), int(parts[-1])
            except (ValueError, IndexError):
                logger.warning(f"잘못된 아카이브 URL 형식: {archive_url}")
                continue
            
            try:
                monthly_games = await self.get_monthly_games(username, year, month)
                
                # 최신 게임부터 추가 (시간순 역정렬)
                monthly_games.sort(
                    key=lambda g: g.get('end_time', 0), 
                    reverse=True
                )
                
                for game in monthly_games:
                    if len(collected_games) >= game_count:
                        break
                    collected_games.append(game)
                
                logger.info(f"{year}/{month:02d}: {len(monthly_games)}게임 중 "
                          f"{min(len(monthly_games), game_count - len(collected_games) + len([g for g in monthly_games if g in collected_games]))}게임 수집")
                
            except ChessComAPIError as e:
                logger.warning(f"{year}/{month:02d} 데이터 수집 실패: {e}")
                continue
        
        logger.info(f"총 {len(collected_games)}개 게임 수집 완료")
        
        return collected_games, player_info
    
    async def get_games_by_date_range(
        self, 
        username: str, 
        start_date: datetime, 
        end_date: datetime
    ) -> List[Dict]:
        """
        날짜 범위로 게임 데이터 수집
        
        Args:
            username: Chess.com 사용자명
            start_date: 시작 날짜
            end_date: 종료 날짜
            
        Returns:
            해당 기간의 게임 데이터 리스트
        """
        all_games = []
        current_date = start_date
        
        while current_date <= end_date:
            try:
                monthly_games = await self.get_monthly_games(
                    username, current_date.year, current_date.month
                )
                
                # 날짜 필터링
                filtered_games = []
                for game in monthly_games:
                    game_time = datetime.fromtimestamp(game.get('end_time', 0))
                    if start_date <= game_time <= end_date:
                        filtered_games.append(game)
                
                all_games.extend(filtered_games)
                logger.info(f"{current_date.strftime('%Y/%m')}: {len(filtered_games)}게임 수집")
                
            except ChessComAPIError as e:
                logger.warning(f"{current_date.strftime('%Y/%m')} 데이터 수집 실패: {e}")
            
            # 다음 달로 이동
            if current_date.month == 12:
                current_date = current_date.replace(year=current_date.year + 1, month=1)
            else:
                current_date = current_date.replace(month=current_date.month + 1)
        
        # 시간순 정렬
        all_games.sort(key=lambda g: g.get('end_time', 0), reverse=True)
        return all_games


# 편의 함수들
async def get_player_recent_games(username: str, game_count: int = 10) -> Tuple[List[Dict], Dict]:
    """
    플레이어의 최근 게임 데이터를 간편하게 가져오는 함수
    
    Args:
        username: Chess.com 사용자명
        game_count: 수집할 게임 수
        
    Returns:
        (게임 데이터 리스트, 플레이어 정보)
    """
    async with ChessComAPI() as api:
        return await api.get_recent_games(username, game_count)


async def get_player_info_simple(username: str) -> Dict:
    """
    플레이어 기본 정보를 간편하게 가져오는 함수
    
    Args:
        username: Chess.com 사용자명
        
    Returns:
        플레이어 정보
    """
    async with ChessComAPI() as api:
        return await api.get_player_info(username)