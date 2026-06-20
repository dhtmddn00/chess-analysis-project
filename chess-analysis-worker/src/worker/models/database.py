import asyncio
import asyncpg
from typing import List, Dict, Any, Optional
from loguru import logger


class DatabaseClient:
    """Async PostgreSQL database client for the worker"""
    
    def __init__(self, host: str, port: int, database: str, user: str, password: str, ssl: bool = False):
        self.host = host
        self.port = port
        self.database = database
        self.user = user
        self.password = password
        self.ssl = ssl
        self.pool = None
        
    async def connect(self):
        """Create database connection pool"""
        try:
            self.pool = await asyncpg.create_pool(
                host=self.host,
                port=self.port,
                database=self.database,
                user=self.user,
                password=self.password,
                ssl="require" if self.ssl else None,
                min_size=0,
                max_size=10,
                max_inactive_connection_lifetime=60,
            )
            logger.info("Database connection pool created")
            
        except Exception as e:
            logger.error(f"Failed to create database pool: {e}")
            raise
            
    async def close(self):
        """Close database connection pool"""
        if self.pool:
            await self.pool.close()
            logger.info("Database connection pool closed")

    async def healthcheck(self) -> bool:
        """Return True if the pool can execute a trivial query, False otherwise."""
        try:
            async with self.pool.acquire() as connection:
                await connection.fetchval("SELECT 1")
            return True
        except Exception as e:
            logger.warning(f"Database healthcheck failed: {e}")
            return False

    async def ensure_connected(self) -> None:
        """Re-create the pool if the healthcheck fails (stale connections after DB restart)."""
        if not await self.healthcheck():
            logger.warning("Database pool unhealthy — reconnecting")
            try:
                await self.pool.close()
            except Exception:
                pass
            await self.connect()

    async def execute(self, query: str, params: List[Any] = None) -> str:
        """Execute a query that doesn't return results"""
        async with self.pool.acquire() as connection:
            if params:
                return await connection.execute(query, *params)
            else:
                return await connection.execute(query)

    async def executemany(self, query: str, rows: List[List[Any]]) -> None:
        """Execute one prepared statement for many rows."""
        if not rows:
            return

        async with self.pool.acquire() as connection:
            await connection.executemany(query, rows)
                
    async def fetch_one(self, query: str, params: List[Any] = None) -> Optional[Dict[str, Any]]:
        """Fetch a single row"""
        async with self.pool.acquire() as connection:
            if params:
                row = await connection.fetchrow(query, *params)
            else:
                row = await connection.fetchrow(query)
                
            return dict(row) if row else None
            
    async def fetch_all(self, query: str, params: List[Any] = None) -> List[Dict[str, Any]]:
        """Fetch multiple rows"""
        async with self.pool.acquire() as connection:
            if params:
                rows = await connection.fetch(query, *params)
            else:
                rows = await connection.fetch(query)
                
            return [dict(row) for row in rows]
