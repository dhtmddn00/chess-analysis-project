"""
Redis client configuration and queue management for Chess Analysis Service
"""

import os
import json
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import redis
from rq import Queue, Worker
from loguru import logger
from .config import settings


# Redis connection configuration
REDIS_CONFIG = {
    'host': os.getenv('REDIS_HOST', 'localhost'),
    'port': int(os.getenv('REDIS_PORT', 6379)),
    'db': int(os.getenv('REDIS_DB', 0)),
    'decode_responses': True,
    'socket_timeout': 30,
    'socket_connect_timeout': 10,
    'retry_on_timeout': True,
    'health_check_interval': 30
}

class RedisClient:
    """Redis client wrapper for Chess Analysis Service"""
    
    def __init__(self):
        self.redis = None
        self.analysis_queue = None
        self._connect()
    
    def _connect(self) -> bool:
        """Connect to Redis server"""
        try:
            self.redis = redis.Redis(**REDIS_CONFIG)
            
            # Test connection
            self.redis.ping()
            
            # Initialize queue
            self.analysis_queue = Queue('analysis', connection=self.redis)
            
            logger.info(f"Connected to Redis at {REDIS_CONFIG['host']}:{REDIS_CONFIG['port']}")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            return False
    
    def is_connected(self) -> bool:
        """Check if Redis is connected"""
        try:
            if self.redis:
                self.redis.ping()
                return True
        except:
            pass
        return False
    
    def reconnect(self) -> bool:
        """Reconnect to Redis"""
        logger.info("Attempting to reconnect to Redis...")
        return self._connect()
    
    # Cache operations
    def set_cache(self, key: str, value: Any, expire: int = 3600) -> bool:
        """Set cache value with expiration"""
        try:
            if not self.is_connected():
                if not self.reconnect():
                    return False
            
            # Serialize complex objects to JSON
            if isinstance(value, (dict, list)):
                value = json.dumps(value, default=str)
            
            return self.redis.setex(key, expire, value)
        except Exception as e:
            logger.error(f"Failed to set cache {key}: {e}")
            return False
    
    def get_cache(self, key: str) -> Optional[Any]:
        """Get cache value"""
        try:
            if not self.is_connected():
                if not self.reconnect():
                    return None
            
            value = self.redis.get(key)
            if value is None:
                return None
            
            # Try to deserialize JSON
            try:
                return json.loads(value)
            except:
                return value
        except Exception as e:
            logger.error(f"Failed to get cache {key}: {e}")
            return None
    
    def delete_cache(self, key: str) -> bool:
        """Delete cache value"""
        try:
            if not self.is_connected():
                if not self.reconnect():
                    return False
            
            return bool(self.redis.delete(key))
        except Exception as e:
            logger.error(f"Failed to delete cache {key}: {e}")
            return False
    
    def clear_cache_pattern(self, pattern: str) -> int:
        """Clear cache keys matching pattern"""
        try:
            if not self.is_connected():
                if not self.reconnect():
                    return 0
            
            keys = self.redis.keys(pattern)
            if keys:
                return self.redis.delete(*keys)
            return 0
        except Exception as e:
            logger.error(f"Failed to clear cache pattern {pattern}: {e}")
            return 0
    
    # Queue operations
    def enqueue_analysis(self, analysis_id: str, player_data: Dict[str, Any], 
                        options: Dict[str, Any] = None) -> Optional[str]:
        """Enqueue analysis job"""
        try:
            if not self.is_connected():
                if not self.reconnect():
                    return None
            
            job_data = {
                'analysis_id': analysis_id,
                'player_data': player_data,
                'options': options or {},
                'enqueued_at': datetime.utcnow().isoformat()
            }
            
            # Enqueue with timeout (30 minutes)
            job = self.analysis_queue.enqueue(
                'chess_analysis_worker.process_analysis',
                job_data,
                job_timeout=1800,  # 30 minutes
                job_id=f"analysis_{analysis_id}"
            )
            
            logger.info(f"Enqueued analysis job {analysis_id}: {job.id}")
            return job.id
        except Exception as e:
            logger.error(f"Failed to enqueue analysis {analysis_id}: {e}")
            return None
    
    def get_job_status(self, job_id: str) -> Dict[str, Any]:
        """Get job status"""
        try:
            if not self.is_connected():
                if not self.reconnect():
                    return {'status': 'unknown', 'error': 'Redis not connected'}
            
            from rq.job import Job
            job = Job.fetch(job_id, connection=self.redis)
            
            status_info = {
                'status': job.get_status(),
                'created_at': job.created_at.isoformat() if job.created_at else None,
                'started_at': job.started_at.isoformat() if job.started_at else None,
                'ended_at': job.ended_at.isoformat() if job.ended_at else None,
                'progress': job.meta.get('progress', 0),
                'current_step': job.meta.get('current_step', ''),
                'result': job.result if job.is_finished else None,
                'error': str(job.exc_info) if job.is_failed else None
            }
            
            return status_info
        except Exception as e:
            logger.error(f"Failed to get job status {job_id}: {e}")
            return {'status': 'unknown', 'error': str(e)}
    
    def cancel_job(self, job_id: str) -> bool:
        """Cancel a job"""
        try:
            if not self.is_connected():
                if not self.reconnect():
                    return False
            
            from rq.job import Job
            job = Job.fetch(job_id, connection=self.redis)
            job.cancel()
            
            logger.info(f"Cancelled job {job_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to cancel job {job_id}: {e}")
            return False
    
    def get_queue_info(self) -> Dict[str, Any]:
        """Get queue information"""
        try:
            if not self.is_connected():
                if not self.reconnect():
                    return {'status': 'disconnected'}
            
            return {
                'status': 'connected',
                'pending_jobs': len(self.analysis_queue),
                'failed_jobs': len(self.analysis_queue.failed_job_registry),
                'workers': len(Worker.all(connection=self.redis))
            }
        except Exception as e:
            logger.error(f"Failed to get queue info: {e}")
            return {'status': 'error', 'error': str(e)}
    
    # Rate limiting
    def is_rate_limited(self, key: str, limit: int, window: int) -> bool:
        """Check if rate limit is exceeded"""
        try:
            if not self.is_connected():
                if not self.reconnect():
                    return False  # Allow if can't check
            
            current = self.redis.get(key)
            if current is None:
                # First request
                self.redis.setex(key, window, 1)
                return False
            
            count = int(current)
            if count >= limit:
                return True
            
            # Increment counter
            self.redis.incr(key)
            return False
        except Exception as e:
            logger.error(f"Failed to check rate limit {key}: {e}")
            return False  # Allow if can't check
    
    # Health check
    def health_check(self) -> Dict[str, Any]:
        """Comprehensive health check"""
        try:
            # Connection test
            if not self.is_connected():
                return {
                    'status': 'unhealthy',
                    'error': 'Redis connection failed',
                    'timestamp': datetime.utcnow().isoformat()
                }
            
            # Performance test
            start_time = datetime.utcnow()
            test_key = f"health_check:{start_time.timestamp()}"
            self.redis.set(test_key, "test", ex=10)
            value = self.redis.get(test_key)
            self.redis.delete(test_key)
            response_time = (datetime.utcnow() - start_time).total_seconds()
            
            if value != "test":
                return {
                    'status': 'unhealthy',
                    'error': 'Redis read/write test failed',
                    'timestamp': datetime.utcnow().isoformat()
                }
            
            # Queue health
            queue_info = self.get_queue_info()
            
            return {
                'status': 'healthy',
                'response_time_ms': round(response_time * 1000, 2),
                'queue_info': queue_info,
                'timestamp': datetime.utcnow().isoformat()
            }
        except Exception as e:
            return {
                'status': 'unhealthy',
                'error': str(e),
                'timestamp': datetime.utcnow().isoformat()
            }


# Global Redis client instance
redis_client = RedisClient()


def get_redis_client() -> RedisClient:
    """Get the global Redis client instance"""
    return redis_client