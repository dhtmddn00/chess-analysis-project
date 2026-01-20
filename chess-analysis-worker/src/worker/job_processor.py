"""
Analysis Job Processor
Handles progressive analysis jobs from Redis queue
"""

import asyncio
import json
import time
from typing import Dict, Any, Optional

from loguru import logger
from redis.asyncio import Redis

from .services.progressive_analyzer import ProgressiveAnalyzer
from .services.chess_com_fetcher import ChessComGameFetcher
from .models.database import DatabaseClient


class AnalysisJobProcessor:
    """Processes analysis jobs with progressive updates"""
    
    def __init__(self, redis_client: Redis, db_client: DatabaseClient):
        self.redis = redis_client
        self.db = db_client
        self.analyzer = ProgressiveAnalyzer(engine_pool_size=2)
        self.game_fetcher = ChessComGameFetcher()
        
        # Redis keys
        self.job_queue = "analysis:queue"
        self.job_status_prefix = "job:"
        self.job_partials_prefix = "job:partials:"
        
    async def initialize(self):
        """Initialize the processor"""
        await self.analyzer.initialize()
        logger.info("Analysis job processor initialized")
    
    async def cleanup(self):
        """Cleanup resources"""
        await self.analyzer.cleanup()
    
    async def process_jobs(self):
        """Main job processing loop"""
        logger.info("Starting job processing loop...")
        
        while True:
            try:
                # Pop job from queue (blocking with timeout)
                result = await self.redis.blpop(self.job_queue, timeout=5)
                
                if not result:
                    continue  # Timeout, check again
                
                queue_name, job_data = result
                job_meta = json.loads(job_data)
                
                logger.info(f"Processing job {job_meta['jobId']}")
                
                # Process the job
                await self._process_single_job(job_meta)
                
            except Exception as e:
                logger.error(f"Error in job processing loop: {e}", exc_info=True)
                await asyncio.sleep(1)
    
    async def _process_single_job(self, job_meta: Dict[str, Any]):
        """Process a single analysis job"""
        job_id = job_meta['jobId']
        
        try:
            # Update status to running
            await self._update_job_status(job_id, 'running', 0.0)
            
            # Fetch games
            logger.info(f"Fetching games for {job_meta['username']} from {job_meta['platform']}")
            
            games = await self._fetch_games(job_meta)
            
            if not games:
                await self._fail_job(job_id, "No games found for analysis")
                return
            
            # Progress callback to update Redis
            async def progress_callback(progress: float, partials: Optional[Dict[str, Any]] = None):
                await self._update_job_progress(job_id, progress, partials)
            
            # Run progressive analysis
            priority = job_meta.get('priority', 'precise')  # Default to precise if not specified
            results = await self.analyzer.analyze_progressive(
                job_id=job_id,
                games=games,
                username=job_meta['username'],
                progress_callback=progress_callback,
                priority=priority
            )
            
            # Complete the job
            await self._complete_job(job_id, results)
            
        except Exception as e:
            logger.error(f"Job {job_id} failed: {e}", exc_info=True)
            await self._fail_job(job_id, str(e))
    
    async def _fetch_games(self, job_meta: Dict[str, Any]) -> list:
        """Fetch games for analysis"""
        platform = job_meta['platform']
        username = job_meta['username']
        n = job_meta.get('n', 10)
        
        if platform == 'chesscom':
            return await self.game_fetcher.fetch_recent_games(username, n)
        elif platform == 'lichess':
            # TODO: Implement Lichess fetcher
            raise NotImplementedError("Lichess fetching not yet implemented")
        else:
            raise ValueError(f"Unsupported platform: {platform}")
    
    async def _update_job_status(self, job_id: str, status: str, progress: float):
        """Update job status in Redis"""
        try:
            status_key = f"{self.job_status_prefix}{job_id}"
            
            # Get current status
            current_json = await self.redis.get(status_key)
            if not current_json:
                logger.warning(f"Job {job_id} status not found")
                return
            
            current_status = json.loads(current_json)
            current_status.update({
                'status': status,
                'progress': progress,
                'updatedAt': time.time()
            })
            
            # Update with 2-hour TTL
            await self.redis.setex(
                status_key,
                7200,  # 2 hours
                json.dumps(current_status)
            )
            
        except Exception as e:
            logger.error(f"Failed to update job status {job_id}: {e}")
    
    async def _update_job_progress(
        self, 
        job_id: str, 
        progress: float, 
        partials: Optional[Dict[str, Any]] = None
    ):
        """Update job progress and partial results"""
        try:
            # Update main status
            await self._update_job_status(job_id, 'running', progress)
            
            # Update partials if provided
            if partials:
                partials_key = f"{self.job_partials_prefix}{job_id}"
                
                # Get current partials
                current_partials_json = await self.redis.get(partials_key)
                current_partials = {}
                if current_partials_json:
                    current_partials = json.loads(current_partials_json)
                
                # Merge updates
                current_partials.update(partials)
                
                # Save with 2-hour TTL
                await self.redis.setex(
                    partials_key,
                    7200,
                    json.dumps(current_partials)
                )
            
            logger.debug(f"Updated job {job_id} progress: {progress:.1%}")
            
        except Exception as e:
            logger.error(f"Failed to update job progress {job_id}: {e}")
    
    async def _complete_job(self, job_id: str, results: Dict[str, Any]):
        """Mark job as completed with final results"""
        try:
            status_key = f"{self.job_status_prefix}{job_id}"
            
            # Get current status
            current_json = await self.redis.get(status_key)
            if not current_json:
                logger.warning(f"Job {job_id} status not found for completion")
                return
            
            current_status = json.loads(current_json)
            current_status.update({
                'status': 'done',
                'progress': 1.0,
                'completedAt': time.time(),
                'summary': results.get('summary'),
                'profile': results.get('profile'),
                'plan': results.get('plan'),
                'timing': results.get('timing'),
                'analysisVersion': '2025.08.elite'
            })
            
            # Extend TTL for completed jobs (24 hours)
            await self.redis.setex(
                status_key,
                86400,  # 24 hours
                json.dumps(current_status)
            )
            
            logger.info(f"Job {job_id} completed successfully")
            
        except Exception as e:
            logger.error(f"Failed to complete job {job_id}: {e}")
    
    async def _fail_job(self, job_id: str, error: str):
        """Mark job as failed"""
        try:
            status_key = f"{self.job_status_prefix}{job_id}"
            
            # Get current status
            current_json = await self.redis.get(status_key)
            if not current_json:
                logger.warning(f"Job {job_id} status not found for failure")
                return
            
            current_status = json.loads(current_json)
            current_status.update({
                'status': 'failed',
                'error': error,
                'failedAt': time.time()
            })
            
            # Keep failed jobs for 6 hours
            await self.redis.setex(
                status_key,
                21600,  # 6 hours
                json.dumps(current_status)
            )
            
            logger.error(f"Job {job_id} failed: {error}")
            
        except Exception as e:
            logger.error(f"Failed to mark job {job_id} as failed: {e}")


# Entry point for worker processes
async def run_job_processor():
    """Run the job processor"""
    
    # Initialize Redis and DB connections
    redis_client = Redis.from_url("redis://localhost:6379", decode_responses=True)
    db_client = DatabaseClient()  # Your DB client
    
    processor = AnalysisJobProcessor(redis_client, db_client)
    
    try:
        await processor.initialize()
        await processor.process_jobs()  # This runs forever
    except KeyboardInterrupt:
        logger.info("Shutting down job processor...")
    finally:
        await processor.cleanup()
        await redis_client.close()


if __name__ == "__main__":
    asyncio.run(run_job_processor())