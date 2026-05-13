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
                min_size=1,
                max_size=10
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
            
    async def execute(self, query: str, params: List[Any] = None) -> str:
        """Execute a query that doesn't return results"""
        async with self.pool.acquire() as connection:
            if params:
                return await connection.execute(query, *params)
            else:
                return await connection.execute(query)
                
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
