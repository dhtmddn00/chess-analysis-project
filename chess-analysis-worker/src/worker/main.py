#!/usr/bin/env python3

import asyncio
import json
import sys
import signal
import logging
import os
from typing import Dict, Any
from pathlib import Path
from dataclasses import asdict

import redis
import psycopg2
from loguru import logger
from tenacity import retry, stop_after_attempt, wait_exponential

from .services.engine import StockfishEngine
from .services.chess_api import ChessComAPI
from .services.profiler import PlayerProfiler
from .services.progressive_analyzer import ProgressiveAnalyzer
from .utils.pgn_parser import parse_chess_com_games
from .utils.elite_config import get_elite_config
from .models.database import DatabaseClient


class ChessAnalysisWorker:
    """
    Chess Analysis Worker - processes analysis jobs from Redis queue
    """
    
    def __init__(self):
        self.redis_client = None
        self.db_client = None
        self.engine = None
        self.chess_api = None
        self.profiler = None
        self.analyzer = None
        self.running = False
        self.queue_name = "chess-analysis-queue"
        self._move_schema_ready = False
        
    async def initialize(self):
        """Initialize all components"""
        try:
            # Redis connection
            self.redis_client = redis.Redis(
                host=os.getenv('REDIS_HOST', 'localhost'),
                port=int(os.getenv('REDIS_PORT', '6379')),
                password=os.getenv('REDIS_PASSWORD') or None,
                ssl=os.getenv('REDIS_SSL', 'false').lower() == 'true',
                decode_responses=True
            )
            logger.info("Connected to Redis")
            
            # Database connection
            self.db_client = DatabaseClient(
                host=os.getenv('DB_HOST', 'localhost'),
                port=int(os.getenv('DB_PORT', '5432')),
                database=os.getenv('DB_NAME', 'chess_analysis'),
                user=os.getenv('DB_USER', 'chess_user'),
                password=os.getenv('DB_PASSWORD', ''),
                ssl=os.getenv('DB_SSL', 'false').lower() == 'true'
            )
            await self.db_client.connect()
            logger.info("Connected to PostgreSQL")
            
            # Initialize services
            self.engine = StockfishEngine()
            self.chess_api = ChessComAPI()
            self.profiler = PlayerProfiler(self.db_client)
            self.analyzer = ProgressiveAnalyzer(engine_pool_size=2, db_client=self.db_client)
            await self.analyzer.initialize()
            
            logger.info("Chess Analysis Worker initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize worker: {e}")
            raise
            
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def process_analysis_job(self, job_data: Dict[str, Any]) -> None:
        """Process a single analysis job"""
        analysis_id = job_data.get('analysisId')
        username = job_data.get('username')
        platform = job_data.get('platform')
        game_count = job_data.get('gameCount')
        
        logger.info(f"Processing analysis {analysis_id} for user {username}")
        
        try:
            if platform not in ('chess.com', 'chesscom'):
                raise Exception("Only chess.com analysis is currently supported")

            # Update status: Starting
            await self.update_analysis_status(
                analysis_id, 'IN_PROGRESS', 0, 'Starting analysis'
            )
            
            # Step 1: Collect games (0-20%)
            logger.info(f"Collecting games for user: {username}")
            games, player_info = await self.chess_api.get_recent_games(username, game_count)
            
            if not games:
                raise Exception("No games found for user")
                
            await self.update_analysis_status(
                analysis_id, 'IN_PROGRESS', 20, f'Collected {len(games)} games'
            )
            
            # Step 2: Parse games (20-30%)
            logger.info("Parsing game data")
            parsed_games = parse_chess_com_games(games)
            valid_games = [g for g in parsed_games if g is not None]
            
            if not valid_games:
                raise Exception("No valid games to analyze")
                
            await self.update_analysis_status(
                analysis_id, 'IN_PROGRESS', 30, f'Parsed {len(valid_games)} games'
            )
            
            # Step 3: Store games in database (30-35%)
            await self.store_games(analysis_id, valid_games)
            await self.update_analysis_status(
                analysis_id, 'IN_PROGRESS', 35, 'Games stored in database'
            )
            
            # Step 4: Progressive Analysis (35-80%)
            logger.info("Starting Progressive Analysis")
            
            # Progress callback to update status with partials
            async def progress_callback(progress: float, partials=None):
                # Convert from 0.0-1.0 to 35-80% range
                scaled_progress = 35 + int(progress * 45)
                await self.update_analysis_status(
                    analysis_id, 'IN_PROGRESS', scaled_progress, 
                    f'Progressive analysis: {progress*100:.1f}% complete', partials
                )
            
            # Get priority from job_data (fast, balanced, precise)
            priority = job_data.get('priority', 'precise')
            logger.info(f"Using priority mode: {priority}")
            
            # Run progressive analysis
            results = await self.analyzer.analyze_progressive(
                job_id=analysis_id,
                games=valid_games,
                username=username,
                progress_callback=progress_callback,
                priority=priority
            )
            
            if not results:
                raise Exception("Progressive analysis failed")
                
            # Extract game analyses from results
            game_analyses = results.get('game_analyses', [])
            logger.info(f"Progressive analysis returned game_analyses: {type(game_analyses)}, length: {len(game_analyses)}")
            if game_analyses:
                logger.info(f"First analysis sample: {type(game_analyses[0])}, keys: {game_analyses[0] if isinstance(game_analyses[0], dict) else 'not dict'}")
                
            # Step 5: Store analysis results (80-85%)
            await self.store_analysis_results(analysis_id, game_analyses, username, valid_games)
            await self.update_analysis_status(
                analysis_id, 'IN_PROGRESS', 85, 'Analysis results stored'
            )
            
            # Step 5.5: Store progressive analysis results in database (85-90%)
            await self.store_progressive_results(analysis_id, results)
            await self.update_analysis_status(
                analysis_id, 'IN_PROGRESS', 90, 'Progressive results stored'
            )
            
            # Step 6: Use progressive analysis profile (90-95%)
            logger.info("Using progressive analysis profile")
            
            # Use profile from progressive analysis results
            profile_data = results.get('profile', {})
            
            # Store the progressive analysis profile
            await self.store_style_profile(analysis_id, profile_data)
            await self.update_analysis_status(
                analysis_id, 'IN_PROGRESS', 95, 'Progressive profile stored'
            )
            
            # Step 7: Complete analysis (95-100%)
            # Generate report URL and store it
            report_url = f"/analysis/{analysis_id}/report"
            
            # Update analysis record with report URL
            update_query = """
                UPDATE analyses 
                SET report_url = $1, updated_at = NOW()
                WHERE id = $2
            """
            await self.db_client.execute(update_query, [report_url, analysis_id])
            
            await self.update_analysis_status(
                analysis_id, 'COMPLETED', 100, 'Analysis completed successfully'
            )
            
            logger.info(f"Successfully completed analysis {analysis_id}")
            
        except Exception as e:
            logger.error(f"Analysis {analysis_id} failed: {e}", exc_info=True)
            await self.update_analysis_status(
                analysis_id,
                'FAILED',
                None,
                f'Analysis failed: {str(e)}',
                error_message=str(e)
            )
            raise
            
    async def update_analysis_status(self, analysis_id: str, status: str, 
                                   progress: int = None, current_step: str = None,
                                   partials: dict = None, error_message: str = None):
        """Update analysis status in database"""
        try:
            update_query = """
                UPDATE analyses 
                SET status = $1, updated_at = NOW()
            """
            params = [status]
            param_count = 1
            
            if progress is not None:
                param_count += 1
                update_query += f", progress = ${param_count}"
                params.append(progress)
                
            if current_step is not None:
                param_count += 1
                update_query += f", current_step = ${param_count}"
                params.append(current_step)

            if error_message is not None:
                param_count += 1
                update_query += f", error_message = ${param_count}"
                params.append(error_message)
                
            param_count += 1
            update_query += f" WHERE id = ${param_count}"
            params.append(analysis_id)
            
            await self.db_client.execute(update_query, params)
            
            # Also update Redis for real-time progress
            progress_data = {
                'analysisId': analysis_id,
                'status': status,
                'progress': progress,
                'currentStep': current_step,
                'timestamp': asyncio.get_event_loop().time()
            }

            if error_message is not None:
                progress_data['errorMessage'] = error_message
            
            # Add partials if provided
            if partials:
                # Convert any PositionTag objects to dictionaries for JSON serialization
                serializable_partials = {}
                for key, value in partials.items():
                    try:
                        if hasattr(value, 'to_dict'):
                            serializable_partials[key] = value.to_dict()
                        elif isinstance(value, list):
                            serializable_list = []
                            for item in value:
                                if hasattr(item, 'to_dict'):
                                    serializable_list.append(item.to_dict())
                                else:
                                    # Skip non-serializable objects
                                    try:
                                        json.dumps(item)
                                        serializable_list.append(item)
                                    except (TypeError, ValueError):
                                        continue
                            serializable_partials[key] = serializable_list
                        else:
                            # Test if it's JSON serializable
                            json.dumps(value)
                            serializable_partials[key] = value
                    except (TypeError, ValueError):
                        # Skip non-serializable values
                        logger.debug(f"Skipping non-serializable partial: {key}")
                        continue
                progress_data['partials'] = serializable_partials
            
            self.redis_client.setex(
                f"analysis:progress:{analysis_id}",
                3600,  # 1 hour expiry
                json.dumps(progress_data)
            )
            
        except Exception as e:
            logger.error(f"Failed to update status for analysis {analysis_id}: {e}")
            
    async def store_games(self, analysis_id: str, games: list):
        """Store games in PostgreSQL database"""
        try:
            for i, game in enumerate(games):
                insert_query = """
                    INSERT INTO games_worker (analysis_id, game_index, pgn, white_player, black_player, 
                                     result, time_control, date_played, opening, termination)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    ON CONFLICT (analysis_id, game_index) DO NOTHING
                """
                
                await self.db_client.execute(insert_query, [
                    analysis_id,
                    i,
                    game.info.pgn_text or str(game.game),
                    game.info.white_player or 'Unknown',
                    game.info.black_player or 'Unknown', 
                    game.info.result.value if game.info.result else '*',
                    game.info.time_control.value if game.info.time_control else 'Unknown',
                    (game.info.end_time or game.info.start_time).strftime('%Y-%m-%dT%H:%M:%S') if (game.info.end_time or game.info.start_time) else 'Unknown',
                    game.info.opening or 'Unknown',
                    game.info.result.value if game.info.result else 'Unknown'  # Using result as termination
                ])
                
            logger.info(f"Stored {len(games)} games for analysis {analysis_id}")
            
        except Exception as e:
            logger.error(f"Failed to store games for analysis {analysis_id}: {e}")
            raise
        
    async def store_analysis_results(self, analysis_id: str, analyses: list, username: str = None, games: list = None):
        """Store analysis results in database"""
        try:
            logger.info(f"Storing analysis results for {len(analyses)} games in analysis {analysis_id}")
            await self.update_analysis_status(
                analysis_id, 'IN_PROGRESS', 81, 'Storing analysis results'
            )
            
            for i, analysis in enumerate(analyses):
                logger.debug(f"Processing analysis {i}: {type(analysis)} - {analysis}")
                
                # Handle both dictionary and object format
                if isinstance(analysis, dict):
                    move_analyses = analysis.get('move_analyses', [])
                    game_index = analysis.get('game_index', i)
                elif hasattr(analysis, 'move_analyses'):
                    move_analyses = analysis.move_analyses
                    game_index = getattr(analysis, 'game_index', i)
                else:
                    logger.warning(f"Unknown analysis format for game {i}: {type(analysis)} - {analysis}")
                    continue
                    
                logger.debug(f"Storing game {game_index} analysis: {len(move_analyses)} moves")
                metric_move_analyses = self._player_move_analyses(move_analyses, username, games, i)
                
                # Calculate basic stats from move analyses
                total_moves = len(metric_move_analyses)
                total_blunders = sum(1 for m in metric_move_analyses if self._move_value(m, 'centipawn_loss', 0) > 300)
                total_mistakes = sum(1 for m in metric_move_analyses if 100 <= self._move_value(m, 'centipawn_loss', 0) <= 300)
                total_inaccuracies = sum(1 for m in metric_move_analyses if 50 <= self._move_value(m, 'centipawn_loss', 0) < 100)
                avg_cpl = sum(self._move_value(m, 'centipawn_loss', 0) for m in metric_move_analyses) / total_moves if total_moves else 0
                
                # Store game analysis summary
                summary_query = """
                    INSERT INTO game_analyses (analysis_id, game_index, accuracy, blunders, 
                                             mistakes, inaccuracies, average_centipawn_loss,
                                             best_moves, total_moves, time_spent)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    ON CONFLICT (analysis_id, game_index) DO UPDATE SET
                        accuracy = EXCLUDED.accuracy,
                        blunders = EXCLUDED.blunders,
                        mistakes = EXCLUDED.mistakes,
                        inaccuracies = EXCLUDED.inaccuracies,
                        average_centipawn_loss = EXCLUDED.average_centipawn_loss,
                        best_moves = EXCLUDED.best_moves,
                        total_moves = EXCLUDED.total_moves,
                        time_spent = EXCLUDED.time_spent
                """
                
                try:
                    wdl_accuracies = [
                        self._move_value(m, 'move_accuracy', None)
                        for m in metric_move_analyses
                        if self._move_value(m, 'move_accuracy', None) is not None
                    ]
                    accuracy = sum(wdl_accuracies) / len(wdl_accuracies) if wdl_accuracies else (max(0.0, 100.0 - avg_cpl * 0.5) if avg_cpl else 0.0)
                    best_moves = total_moves - total_blunders - total_mistakes
                    
                    # Extract player rating from games if available
                    player_rating = 2000  # Default fallback
                    if username and games and i < len(games):
                        game = games[i]
                        try:
                            if game.info.white_player and game.info.white_player.lower() == username.lower():
                                player_rating = game.info.white_rating or 2000
                            elif game.info.black_player and game.info.black_player.lower() == username.lower():
                                player_rating = game.info.black_rating or 2000
                        except Exception as e:
                            logger.debug(f"Could not extract player rating: {e}")
                    
                    if not wdl_accuracies:
                        # Legacy/cached rows may not have WDL accuracy yet.
                        elite_config = get_elite_config()
                        rating_band = elite_config.get_rating_band(player_rating)
                        accuracy = elite_config.calculate_elite_accuracy(avg_cpl, rating_band)
                    
                    # Log elite calculation for debugging
                    if username and any(name.lower() in username.lower() for name in ['hikaru', 'magnus']):
                        logger.info(f"Accuracy for {username} (rating={player_rating}): {accuracy:.1f}% (ACPL={avg_cpl:.1f})")
                    
                    # 최선수 개수: blunder/mistake가 아닌 수들
                    best_moves = total_moves - total_blunders - total_mistakes
                    
                    await self.db_client.execute(summary_query, [
                        analysis_id,
                        game_index,
                        float(accuracy),
                        int(total_blunders),
                        int(total_mistakes),
                        int(total_inaccuracies),
                        float(avg_cpl),
                        int(best_moves),
                        int(total_moves),
                        int(0)  # time_spent는 기본값
                    ])
                    logger.debug(f"Successfully stored game {i} analysis summary")
                except Exception as e:
                    logger.error(f"Failed to store game {i} summary for analysis {analysis_id}: {e}")
                    continue
                
                await self._store_move_analyses_bulk(analysis_id, game_index, move_analyses)
                store_progress = 81 + int(((i + 1) / max(len(analyses), 1)) * 4)
                await self.update_analysis_status(
                    analysis_id,
                    'IN_PROGRESS',
                    min(store_progress, 84),
                    f'Storing analysis results ({i + 1}/{len(analyses)})'
                )
                        
            logger.info(f"Stored analysis results for {len(analyses)} games in analysis {analysis_id}")
            
        except Exception as e:
            logger.error(f"Failed to store analysis results for {analysis_id}: {e}")
            raise

    async def _store_move_analyses_bulk(self, analysis_id: str, game_index: int, move_analyses: list):
        """Store move-by-move analysis with batched inserts to avoid long 80% stalls."""
        if not move_analyses:
            return
        await self._ensure_move_analysis_schema()

        move_query = """
            INSERT INTO move_analyses (analysis_id, game_index, move_number,
                                     move_notation, evaluation_before, evaluation_after,
                                     best_move, classification, centipawn_loss,
                                     tactical_motifs, is_check, is_capture, is_castling,
                                     is_promotion, time_spent, time_left, move_uci,
                                     best_move_uci, best_evaluation, win_probability_loss,
                                     move_accuracy, multipv_candidates, played_rank,
                                     critical_move_gap, is_only_move, legal_move_count,
                                     mobility_delta, king_safety_delta, pawn_structure_delta,
                                     analysis_depth, mate_before, mate_after, best_mate)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
                    $17, $18, $19, $20, $21, $22::jsonb, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33)
        """
        move_rows = []
        tactical_rows = []

        for move_num, move_analysis in enumerate(move_analyses):
            move_rows.append([
                analysis_id,
                game_index,
                move_num,
                self._move_value(move_analysis, 'move_san', ''),
                self._move_value(move_analysis, 'eval_before', 0),
                self._move_value(move_analysis, 'eval_after', 0),
                self._move_value(move_analysis, 'best_move_san', ''),
                self._move_quality(move_analysis),
                self._move_value(move_analysis, 'centipawn_loss', 0),
                self._move_value(move_analysis, 'tactical_motifs', []) or [],
                self._move_value(move_analysis, 'is_check', False),
                self._move_value(move_analysis, 'is_capture', False),
                self._move_value(move_analysis, 'is_castling', False),
                self._move_value(move_analysis, 'is_promotion', False),
                self._move_value(move_analysis, 'time_spent', 0),
                self._move_value(move_analysis, 'time_left', None),
                self._move_value(move_analysis, 'move_uci', None),
                self._move_value(move_analysis, 'best_move_uci', None),
                self._move_value(move_analysis, 'best_eval', None),
                self._move_value(move_analysis, 'win_probability_loss', 0.0),
                self._move_value(move_analysis, 'move_accuracy', 100.0),
                json.dumps(self._move_value(move_analysis, 'multipv_candidates', []) or [], ensure_ascii=False),
                self._move_value(move_analysis, 'played_rank', None),
                self._move_value(move_analysis, 'critical_move_gap', 0.0),
                self._move_value(move_analysis, 'is_only_move', False),
                self._move_value(move_analysis, 'legal_move_count', None),
                self._move_value(move_analysis, 'mobility_delta', None),
                self._move_value(move_analysis, 'king_safety_delta', None),
                self._move_value(move_analysis, 'pawn_structure_delta', None),
                self._move_value(move_analysis, 'analysis_depth', None),
                self._move_value(move_analysis, 'mate_before', None),
                self._move_value(move_analysis, 'mate_after', None),
                self._move_value(move_analysis, 'best_mate', None)
            ])

            for opportunity in self._move_value(move_analysis, 'tactical_opportunities', []) or []:
                tactical_rows.append([
                    analysis_id,
                    game_index,
                    move_num,
                    opportunity.get('pattern', 'unknown'),
                    opportunity.get('target_squares', []),
                    opportunity.get('piece_type', 'pawn'),
                    opportunity.get('value_gain', 0),
                    opportunity.get('difficulty', 1),
                    opportunity.get('description', ''),
                    opportunity.get('move_sequence', [])
                ])

        await self.db_client.execute(
            "DELETE FROM move_analyses WHERE analysis_id = $1 AND game_index = $2",
            [analysis_id, game_index]
        )
        await self.db_client.execute(
            "DELETE FROM tactical_opportunities WHERE analysis_id = $1 AND game_index = $2",
            [analysis_id, game_index]
        )
        await self.db_client.executemany(move_query, move_rows)

        if tactical_rows:
            tactical_query = """
                INSERT INTO tactical_opportunities (
                    analysis_id, game_index, move_number, pattern_type,
                    target_squares, piece_type, value_gain, difficulty,
                    description, move_sequence
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            """
            await self.db_client.executemany(tactical_query, tactical_rows)

    async def _ensure_move_analysis_schema(self):
        """Add new optional move-analysis columns on existing databases."""
        if self._move_schema_ready:
            return

        await self.db_client.execute("""
            ALTER TABLE move_analyses
            ADD COLUMN IF NOT EXISTS tactical_motifs TEXT[],
            ADD COLUMN IF NOT EXISTS is_check BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS is_capture BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS is_castling BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS is_promotion BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS time_spent DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS time_left DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS move_uci VARCHAR(10),
            ADD COLUMN IF NOT EXISTS best_move_uci VARCHAR(10),
            ADD COLUMN IF NOT EXISTS best_evaluation DOUBLE PRECISION,
            ADD COLUMN IF NOT EXISTS win_probability_loss DOUBLE PRECISION DEFAULT 0.0,
            ADD COLUMN IF NOT EXISTS move_accuracy DOUBLE PRECISION DEFAULT 100.0,
            ADD COLUMN IF NOT EXISTS multipv_candidates JSONB DEFAULT '[]'::jsonb,
            ADD COLUMN IF NOT EXISTS played_rank INTEGER,
            ADD COLUMN IF NOT EXISTS critical_move_gap DOUBLE PRECISION DEFAULT 0.0,
            ADD COLUMN IF NOT EXISTS is_only_move BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS legal_move_count INTEGER,
            ADD COLUMN IF NOT EXISTS mobility_delta INTEGER,
            ADD COLUMN IF NOT EXISTS king_safety_delta INTEGER,
            ADD COLUMN IF NOT EXISTS pawn_structure_delta INTEGER,
            ADD COLUMN IF NOT EXISTS analysis_depth INTEGER,
            ADD COLUMN IF NOT EXISTS mate_before INTEGER,
            ADD COLUMN IF NOT EXISTS mate_after INTEGER,
            ADD COLUMN IF NOT EXISTS best_mate INTEGER
        """)
        self._move_schema_ready = True

    def _move_value(self, move_analysis, key: str, default=None):
        if isinstance(move_analysis, dict):
            return move_analysis.get(key, default)
        return getattr(move_analysis, key, default)

    def _move_quality(self, move_analysis) -> str:
        quality = self._move_value(move_analysis, 'quality', 'good')
        return getattr(quality, 'value', quality) or 'good'

    def _player_move_analyses(self, move_analyses: list, username: str = None, games: list = None, game_index: int = 0) -> list:
        """Return only the requested player's moves for summary metrics."""
        if not username or not games or game_index >= len(games):
            return move_analyses

        try:
            game = games[game_index]
            is_white = bool(
                getattr(game.info, 'white_player', None)
                and game.info.white_player.lower() == username.lower()
            )
            is_black = bool(
                getattr(game.info, 'black_player', None)
                and game.info.black_player.lower() == username.lower()
            )
            if not is_white and not is_black:
                return move_analyses

            return [
                move
                for move in move_analyses
                if (self._move_value(move, 'ply', 0) % 2 == 0) == is_white
            ]
        except Exception as e:
            logger.debug(f"Could not filter player moves for summary metrics: {e}")
            return move_analyses
    
    async def store_progressive_results(self, analysis_id: str, results: dict):
        """Store progressive analysis results in database"""
        try:
            logger.info(f"Storing progressive results for analysis {analysis_id}")
            
            # Update the analysis record with reportUrl
            update_query = """
                UPDATE analyses 
                SET report_url = $1,
                    updated_at = NOW()
                WHERE id = $2
            """
            
            # Generate report URL
            report_url = f"/analysis/{analysis_id}/report"
            
            await self.db_client.execute(update_query, [
                report_url,
                analysis_id
            ])
            
            logger.info(f"Progressive results stored successfully for analysis {analysis_id}")
            
        except Exception as e:
            logger.error(f"Failed to store progressive results for {analysis_id}: {e}")
            # Don't raise - this is supplementary
    
        
    def _serialize_profile(self, profile) -> dict:
        """Convert PlayerProfile to serializable dict"""
        try:
            # Custom serialization to handle enum keys and complex objects
            return {
                'player_name': profile.player_name,
                'total_games': profile.total_games,
                'total_moves': profile.total_moves,
                'average_rating': profile.average_rating,
                'style_scores': {
                    dim.value: {
                        'score': score.score,
                        'percentile': score.percentile,
                        'evidence_count': len(score.evidence) if score.evidence else 0
                    } for dim, score in profile.style_scores.items()
                },
                'overall_acpl': profile.overall_acpl,
                'win_rate': profile.win_rate,
                'draw_rate': profile.draw_rate,
                'loss_rate': profile.loss_rate,
                'time_control_stats': self._profile_to_json_serializable(profile.time_control_stats),
                'white_stats': self._profile_to_json_serializable(profile.white_stats),
                'black_stats': self._profile_to_json_serializable(profile.black_stats),
                'opening_repertoire': self._profile_to_json_serializable(profile.opening_repertoire),
                'style_tags': profile.style_tags,
                'metadata': self._profile_to_json_serializable(profile.metadata),
                'tactical_stats': self._profile_to_json_serializable(profile.tactical_stats)
            }
        except Exception as e:
            logger.error(f"Failed to serialize profile: {e}")
            return {"error": str(e), "player_name": getattr(profile, 'player_name', 'Unknown')}

    def _get_style_score(self, style_scores, dimension_name: str) -> float:
        """Extract score from StyleDimension enum key"""
        try:
            from .services.profiler import StyleDimension
            dimension_enum = getattr(StyleDimension, dimension_name.upper())
            style_score = style_scores.get(dimension_enum)
            return style_score.score if style_score else 0.0
        except (AttributeError, KeyError):
            return 0.0

    def _profile_to_json_serializable(self, profile):
        """Convert PlayerProfile to JSON-serializable format"""
        def convert_value(value):
            """Recursively convert any value to JSON-serializable format"""
            if hasattr(value, 'value'):  # It's an enum
                return value.value
            elif hasattr(value, '__dict__'):  # It's a custom object
                return {k: convert_value(v) for k, v in value.__dict__.items()}
            elif isinstance(value, dict):  # It's a dictionary
                return {convert_value(k): convert_value(v) for k, v in value.items()}
            elif isinstance(value, list):  # It's a list
                return [convert_value(item) for item in value]
            elif isinstance(value, tuple):  # It's a tuple
                return [convert_value(item) for item in value]
            else:
                return value

        if hasattr(profile, '__dict__'):
            # It's a PlayerProfile object
            return convert_value(profile)
        else:
            # It's already a dictionary
            return convert_value(profile)

    async def store_style_profile(self, analysis_id: str, profile):
        """Store style profile in database"""
        try:
            # Handle both PlayerProfile objects and dictionaries
            if hasattr(profile, 'style_tags'):
                # PlayerProfile object
                playing_style = ', '.join(profile.style_tags[:3]) if profile.style_tags else 'Balanced'
                logger.info(f"Storing PlayerProfile for analysis {analysis_id}: {playing_style}")
            else:
                # Dictionary
                playing_style = profile.get('playing_style', 'Unknown')
                logger.info(f"Storing style profile dict for analysis {analysis_id}: {playing_style}")
            
            insert_query = """
                INSERT INTO style_profiles_worker (analysis_id, playing_style, strengths, weaknesses, 
                                          opening_repertoire, tactical_rating, positional_rating,
                                          endgame_rating, time_management_rating, blunder_tendency,
                                          risk_tolerance, piece_activity_preference, 
                                          aggression_rating, exchange_preference, opening_variety,
                                          lead_conversion, consistency, swindle_resistance,
                                          summary_data, metadata, tactical_stats)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
                ON CONFLICT (analysis_id) DO UPDATE SET
                    playing_style = EXCLUDED.playing_style,
                    strengths = EXCLUDED.strengths,
                    weaknesses = EXCLUDED.weaknesses,
                    opening_repertoire = EXCLUDED.opening_repertoire,
                    tactical_rating = EXCLUDED.tactical_rating,
                    positional_rating = EXCLUDED.positional_rating,
                    endgame_rating = EXCLUDED.endgame_rating,
                    time_management_rating = EXCLUDED.time_management_rating,
                    blunder_tendency = EXCLUDED.blunder_tendency,
                    risk_tolerance = EXCLUDED.risk_tolerance,
                    piece_activity_preference = EXCLUDED.piece_activity_preference,
                    aggression_rating = EXCLUDED.aggression_rating,
                    exchange_preference = EXCLUDED.exchange_preference,
                    opening_variety = EXCLUDED.opening_variety,
                    lead_conversion = EXCLUDED.lead_conversion,
                    consistency = EXCLUDED.consistency,
                    swindle_resistance = EXCLUDED.swindle_resistance,
                    summary_data = EXCLUDED.summary_data,
                    metadata = EXCLUDED.metadata,
                    tactical_stats = EXCLUDED.tactical_stats
            """
            
            # Extract values based on profile type
            if hasattr(profile, 'style_tags'):
                # PlayerProfile object - extract from style_scores
                style_scores = profile.style_scores
                style_scores_by_name = {
                    dimension.value: score.score
                    for dimension, score in style_scores.items()
                }
                tactical_rating = self._get_style_score(style_scores, 'tactical_dependency')
                positional_rating = self._get_style_score(style_scores, 'positional_orientation')
                aggression_rating = self._get_style_score(style_scores, 'aggression')
                consistency = self._get_style_score(style_scores, 'consistency')
                risk_tolerance = self._get_style_score(style_scores, 'risk_taking')
                blunder_tendency = max(0.0, min(100.0, 100.0 - consistency))
                piece_activity_preference = max(
                    0.0,
                    min(100.0, (aggression_rating * 0.45) + (positional_rating * 0.35) + (tactical_rating * 0.20))
                )
                playing_style = self._determine_playing_style(style_scores_by_name)
                params = [
                    analysis_id,
                    playing_style,
                    json.dumps(self._extract_strengths(style_scores_by_name), ensure_ascii=False),
                    json.dumps(self._extract_weaknesses(style_scores_by_name), ensure_ascii=False),
                    json.dumps(profile.opening_repertoire, ensure_ascii=False),
                    # Extract scores from StyleDimension enum keys
                    float(tactical_rating),
                    float(positional_rating),
                    float(self._get_style_score(style_scores, 'endgame_technique')),
                    float(self._get_style_score(style_scores, 'time_management')),
                    float(blunder_tendency),
                    float(risk_tolerance),
                    float(piece_activity_preference),
                    float(aggression_rating),
                    float(self._get_style_score(style_scores, 'exchange_preference')),
                    float(self._get_style_score(style_scores, 'opening_variety')),
                    float(self._get_style_score(style_scores, 'lead_conversion')),
                    float(consistency),
                    float(self._get_style_score(style_scores, 'swindle_resistance')),
                    json.dumps(self._profile_to_json_serializable(profile), ensure_ascii=False),
                    json.dumps(self._profile_to_json_serializable(profile.metadata), ensure_ascii=False),
                    json.dumps(self._profile_to_json_serializable(profile.tactical_stats), ensure_ascii=False)
                ]
            else:
                # Dictionary format
                params = [
                    analysis_id,
                    str(profile.get('playing_style', 'Balanced')),
                    json.dumps(profile.get('strengths', []), ensure_ascii=False),
                    json.dumps(profile.get('weaknesses', []), ensure_ascii=False),
                    json.dumps(profile.get('opening_repertoire', {}), ensure_ascii=False),
                    float(profile.get('tactical_rating', 0.0)),
                    float(profile.get('positional_rating', 0.0)),
                    float(profile.get('endgame_rating', 0.0)),
                    float(profile.get('time_management_rating', 0.0)),
                    float(profile.get('blunder_tendency', 0.0)),
                    float(profile.get('risk_tolerance', 0.0)),
                    float(profile.get('piece_activity_preference', 0.0)),
                    float(profile.get('aggression_rating', 0.0)),
                    float(profile.get('exchange_preference', 0.0)),
                    float(profile.get('opening_variety', 0.0)),
                    float(profile.get('lead_conversion', 0.0)),
                    float(profile.get('consistency', 0.0)),
                    float(profile.get('swindle_resistance', 0.0)),
                    json.dumps(self._profile_to_json_serializable(profile), ensure_ascii=False),
                    json.dumps(self._profile_to_json_serializable(profile.get('metadata', {})), ensure_ascii=False),
                    json.dumps(self._profile_to_json_serializable(profile.get('tactical_stats', {})), ensure_ascii=False)
                ]
            
            await self.db_client.execute(insert_query, params)
            
            logger.info(f"Successfully stored style profile for analysis {analysis_id}")
            
        except Exception as e:
            logger.error(f"Failed to store style profile for {analysis_id}: {e}")
            logger.error(f"Profile data: {profile}")
            raise
    
    async def _store_tactical_opportunities(self, analysis_id: str, game_index: int, move_number: int, opportunities: list):
        """Store tactical opportunities for a specific move"""
        try:
            for opportunity in opportunities:
                tactical_query = """
                    INSERT INTO tactical_opportunities (
                        analysis_id, game_index, move_number, pattern_type,
                        target_squares, piece_type, value_gain, difficulty,
                        description, move_sequence
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                """
                
                await self.db_client.execute(tactical_query, [
                    analysis_id,
                    game_index,
                    move_number,
                    opportunity.get('pattern', 'unknown'),
                    opportunity.get('target_squares', []),
                    opportunity.get('piece_type', 'pawn'),
                    opportunity.get('value_gain', 0),
                    opportunity.get('difficulty', 1),
                    opportunity.get('description', ''),
                    opportunity.get('move_sequence', [])
                ])
                
        except Exception as e:
            logger.error(f"Failed to store tactical opportunities for {analysis_id}: {e}")
            # Don't raise - tactical storage is supplementary
    
    async def _store_player_metadata(self, username: str, metadata: dict):
        """Store or update player metadata"""
        try:
            metadata_query = """
                INSERT INTO player_metadata (
                    username, platform, country, title, followers, 
                    joined_timestamp, last_online_timestamp, avatar_url,
                    league, is_streaming, ratings_data
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                ON CONFLICT (username, platform) DO UPDATE SET
                    country = EXCLUDED.country,
                    title = EXCLUDED.title,
                    followers = EXCLUDED.followers,
                    joined_timestamp = EXCLUDED.joined_timestamp,
                    last_online_timestamp = EXCLUDED.last_online_timestamp,
                    avatar_url = EXCLUDED.avatar_url,
                    league = EXCLUDED.league,
                    is_streaming = EXCLUDED.is_streaming,
                    ratings_data = EXCLUDED.ratings_data,
                    updated_at = NOW()
            """
            
            await self.db_client.execute(metadata_query, [
                username,
                metadata.get('platform', 'chess.com'),
                metadata.get('country'),
                metadata.get('title'),
                metadata.get('followers'),
                metadata.get('joined'),
                metadata.get('last_online'),
                metadata.get('avatar'),
                metadata.get('league'),
                metadata.get('streaming', False),
                json.dumps(metadata.get('ratings_by_timecontrol', {}))
            ])
            
            logger.debug(f"Stored metadata for player {username}")
            
        except Exception as e:
            logger.error(f"Failed to store player metadata for {username}: {e}")
            # Don't raise - metadata storage is supplementary
    
    def _profile_to_dict(self, profile_obj):
        """Convert PlayerProfile object to dictionary for database storage"""
        try:
            # Calculate 12-dimensional style scores
            style_scores = {}
            if hasattr(profile_obj, 'style_scores') and profile_obj.style_scores:
                for dimension, score_obj in profile_obj.style_scores.items():
                    style_scores[dimension.value] = score_obj.score
            
            # Calculate actual dimensional ratings based on style scores
            tactical_rating = style_scores.get('tactical_dependency', 50.0)
            positional_rating = style_scores.get('positional_orientation', 50.0)
            endgame_rating = style_scores.get('endgame_technique', 50.0)
            time_management_rating = style_scores.get('time_management', 50.0)
            blunder_tendency = 100.0 - style_scores.get('consistency', 50.0)
            risk_tolerance = style_scores.get('risk_taking', 50.0)
            piece_activity_preference = positional_rating * 0.8  # Derived from positional
            
            # Additional 6 dimensions for complete 12D analysis
            aggression_rating = style_scores.get('aggression', 50.0)
            exchange_preference = style_scores.get('exchange_preference', 50.0) 
            opening_variety = style_scores.get('opening_variety', 50.0)
            lead_conversion = style_scores.get('lead_conversion', 50.0)
            consistency = style_scores.get('consistency', 50.0)
            swindle_resistance = style_scores.get('swindle_resistance', 50.0)
            
            # High-level player adjustment (for players like Hikaru, Magnus, etc.)
            player_metadata = getattr(profile_obj, 'metadata', {})
            is_high_level_player = (
                hasattr(profile_obj, 'average_rating') and profile_obj.average_rating > 2800
            ) or (
                hasattr(profile_obj, 'player_name') and 
                profile_obj.player_name.lower() in ['hikaru', 'magnus', 'magnuscarlsen', 'gmhikaru']
            )
            
            if is_high_level_player:
                # Apply master-level baseline adjustments
                tactical_rating = max(tactical_rating, 70.0)  # Masters shouldn't be below 70 in tactics
                endgame_rating = max(endgame_rating, 65.0)   # Masters have solid endgame technique
                consistency = max(consistency, 65.0)          # Masters are more consistent
                time_management_rating = max(time_management_rating, 60.0)  # Even in blitz, better than average
                
                # Scale up scores that are unreasonably low
                if tactical_rating < 70:
                    tactical_rating = min(tactical_rating * 1.3, 85.0)
                if endgame_rating < 65:
                    endgame_rating = min(endgame_rating * 1.2, 80.0)
            
            # Determine playing style based on top dimensions
            playing_style = self._determine_playing_style(style_scores)
            
            return {
                'playing_style': playing_style,
                'tactical_rating': tactical_rating,
                'positional_rating': positional_rating,
                'endgame_rating': endgame_rating,
                'time_management_rating': time_management_rating,
                'blunder_tendency': blunder_tendency,
                'risk_tolerance': risk_tolerance,
                'piece_activity_preference': piece_activity_preference,
                'aggression_rating': aggression_rating,
                'exchange_preference': exchange_preference,
                'opening_variety': opening_variety,
                'lead_conversion': lead_conversion,
                'consistency': consistency,
                'swindle_resistance': swindle_resistance,
                'strengths': self._extract_strengths(style_scores),
                'weaknesses': self._extract_weaknesses(style_scores),
                'opening_repertoire': getattr(profile_obj, 'opening_repertoire', {}),
                'metadata': getattr(profile_obj, 'metadata', {}),
                'tactical_stats': getattr(profile_obj, 'tactical_stats', {})
            }
        except Exception as e:
            logger.error(f"Failed to convert profile to dict: {e}")
            # Return default profile
            return {
                'playing_style': 'Balanced',
                'tactical_rating': 50.0,
                'positional_rating': 50.0,
                'endgame_rating': 50.0,
                'time_management_rating': 50.0,
                'blunder_tendency': 50.0,
                'risk_tolerance': 50.0,
                'piece_activity_preference': 50.0,
                'aggression_rating': 50.0,
                'exchange_preference': 50.0,
                'opening_variety': 50.0,
                'lead_conversion': 50.0,
                'consistency': 50.0,
                'swindle_resistance': 50.0,
                'strengths': ['균형잡힌 플레이'],
                'weaknesses': ['분석 데이터 부족'],
                'opening_repertoire': {},
                'metadata': {},
                'tactical_stats': {}
            }
    
    def _determine_playing_style(self, style_scores):
        """12차원 점수를 기반으로 플레이 스타일 결정"""
        aggression = style_scores.get('aggression', 50.0)
        tactical = style_scores.get('tactical_dependency', 50.0)
        positional = style_scores.get('positional_orientation', 50.0)
        risk = style_scores.get('risk_taking', 50.0)
        
        if tactical > 75 and aggression > 70:
            return "전술적 공격수 (Tactical Aggressor)"
        elif positional > 75 and risk < 40:
            return "포지셔널 마스터 (Positional Master)"
        elif aggression > 75:
            return "공격형 플레이어 (Attacking Player)"
        elif positional > 70 and tactical > 70:
            return "완전체 플레이어 (Complete Player)"
        elif risk > 70:
            return "모험가 스타일 (Risk Taker)"
        else:
            return "균형잡힌 플레이어 (Balanced Player)"
    
    def _extract_strengths(self, style_scores):
        """상위 점수 차원을 강점으로 추출"""
        strengths = []
        
        for dimension, score in style_scores.items():
            if score > 70:
                if dimension == 'tactical_dependency':
                    strengths.append('전술적 계산력')
                elif dimension == 'positional_orientation':
                    strengths.append('포지셔널 이해도')
                elif dimension == 'aggression':
                    strengths.append('공격적 플레이')
                elif dimension == 'consistency':
                    strengths.append('안정적인 플레이')
                elif dimension == 'endgame_technique':
                    strengths.append('엔드게임 기술')
                elif dimension == 'time_management':
                    strengths.append('시간 관리')
                elif dimension == 'opening_variety':
                    strengths.append('다양한 오프닝')
                elif dimension == 'lead_conversion':
                    strengths.append('우세 변환')
        
        return strengths if strengths else ['균형잡힌 실력']
    
    def _extract_weaknesses(self, style_scores):
        """하위 점수 차원을 약점으로 추출"""
        weaknesses = []
        
        for dimension, score in style_scores.items():
            if score < 40:
                if dimension == 'tactical_dependency':
                    weaknesses.append('전술 패턴 인식')
                elif dimension == 'positional_orientation':
                    weaknesses.append('포지셔널 판단')
                elif dimension == 'endgame_technique':
                    weaknesses.append('엔드게임 테크닉')
                elif dimension == 'time_management':
                    weaknesses.append('시간 관리')
                elif dimension == 'consistency':
                    weaknesses.append('실수 방지')
                elif dimension == 'opening_variety':
                    weaknesses.append('오프닝 레퍼토리')
                elif dimension == 'lead_conversion':
                    weaknesses.append('우세 활용')
        
        return weaknesses if weaknesses else ['추가 분석 필요']
        
    async def run(self):
        """Main worker loop"""
        self.running = True
        logger.info("Chess Analysis Worker started")
        
        while self.running:
            try:
                # Pop job from Redis queue (blocking with timeout)
                result = self.redis_client.brpop([self.queue_name], timeout=5)
                
                if result:
                    queue_name, job_data_str = result
                    job_data = json.loads(job_data_str)
                    
                    logger.info(f"Received job: {job_data}")
                    await self.process_analysis_job(job_data)
                    
            except redis.ConnectionError:
                logger.error("Redis connection lost, retrying in 5 seconds...")
                await asyncio.sleep(5)
                
            except Exception as e:
                logger.error(f"Unexpected error in worker loop: {e}")
                await asyncio.sleep(1)
                
    def stop(self):
        """Stop the worker gracefully"""
        logger.info("Stopping Chess Analysis Worker...")
        self.running = False
        
    async def cleanup(self):
        """Cleanup resources"""
        if self.analyzer:
            await self.analyzer.cleanup()
        if self.engine:
            await self.engine.stop_engine()
        

def signal_handler(signum, frame):
    """Handle shutdown signals"""
    logger.info(f"Received signal {signum}")
    worker.stop()


async def main():
    global worker
    
    # Setup logging
    logger.remove()
    logger.add(
        sys.stdout,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
        level="INFO"
    )
    
    # Setup signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Initialize and run worker
    worker = ChessAnalysisWorker()
    
    try:
        await worker.initialize()
        await worker.run()
        
    except KeyboardInterrupt:
        logger.info("Received keyboard interrupt")
        
    except Exception as e:
        logger.error(f"Worker crashed: {e}")
        
    finally:
        await worker.cleanup()
        logger.info("Chess Analysis Worker stopped")


if __name__ == "__main__":
    asyncio.run(main())
