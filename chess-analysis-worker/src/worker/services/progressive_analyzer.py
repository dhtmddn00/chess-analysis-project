"""
Progressive Analysis Engine
Two-pass analysis system for fast initial results + deep precise analysis
"""

import time
import asyncio
import json
import hashlib
import io
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

from loguru import logger
import chess
import chess.engine
import chess.pgn

from ..models.database import DatabaseClient
from ..models.analysis_types import GameAnalysis
from .engine import StockfishEngine
from .profiler import PlayerProfiler
from .simple_tactical_detector import SimpleTacticalDetector


class AnalysisPhase(Enum):
    SHALLOW = "shallow"  # Pass 1: Quick scan
    DEEP = "deep"        # Pass 2: Precise analysis
    COMPLETE = "complete"


@dataclass
class PositionTag:
    """Tags for positions that need deeper analysis"""
    fen: str
    ply: int
    game_index: int
    reason: str  # "tactical", "swing", "endgame_transition", "blunder"
    priority: int  # 1=highest, 3=lowest
    
    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        return {
            'fen': self.fen,
            'ply': self.ply,
            'game_index': self.game_index,
            'reason': self.reason,
            'priority': self.priority
        }


class ProgressiveAnalyzer:
    """Two-pass progressive analysis system"""
    
    def __init__(self, engine_pool_size: int = 2, db_client: Optional[DatabaseClient] = None):
        self.engine_pool_size = engine_pool_size
        self.db_client = db_client
        self.cache_enabled = db_client is not None
        self._cache_table_available = True
        self.engines: List[StockfishEngine] = []
        self.profiler = PlayerProfiler()
        self.tactical_detector = SimpleTacticalDetector()
        
        # Priority-based analysis configurations
        self.priority_configs = {
            'fast': {
                'shallow': {
                    'depth': 8,
                    'movetime': 0.05,
                    'multipv': 1,
                    'deep_trigger_cp': 70,
                    'opening_skip_ply': 20
                },
                'deep': {
                    'depth': 14,
                    'movetime': 0.35,
                    'multipv': 1,
                    'position_limit': 0
                }
            },
            'balanced': {
                'shallow': {
                    'depth': 10,
                    'movetime': 0.07,
                    'multipv': 1,
                    'deep_trigger_cp': 50,
                    'opening_skip_ply': 16
                },
                'deep': {
                    'depth': 16,
                    'movetime': 0.6,
                    'multipv': 1,
                    'position_limit': 8
                }
            },
            'precise': {
                'shallow': {
                    'depth': 10,
                    'movetime': 0.10,
                    'multipv': 1,
                    'deep_trigger_cp': 35,
                    'opening_skip_ply': 10
                },
                'deep': {
                    'depth': 18,
                    'movetime': 1.2,
                    'multipv': 2,
                    'position_limit': 14
                }
            }
        }
        
        # Default configurations (backwards compatibility)
        self.shallow_config = self.priority_configs['precise']['shallow']
        self.deep_config = self.priority_configs['precise']['deep']
    
    async def initialize(self):
        """Initialize engine pool"""
        logger.info(f"Initializing {self.engine_pool_size} Stockfish engines...")
        
        for i in range(self.engine_pool_size):
            engine = StockfishEngine()
            await engine.start_engine()
            self.engines.append(engine)
            
        logger.info(f"Engine pool initialized with {len(self.engines)} engines")
    
    async def cleanup(self):
        """Cleanup engine pool"""
        for engine in self.engines:
            await engine.stop_engine()
        self.engines.clear()
    
    async def analyze_progressive(
        self,
        job_id: str,
        games: List[Dict[str, Any]],
        username: str,
        progress_callback: Optional[callable] = None,
        priority: str = "precise"
    ) -> Dict[str, Any]:
        """
        Progressive two-pass analysis
        
        Returns intermediate results as they become available
        """
        logger.info(f"Starting progressive analysis for job {job_id}: {len(games)} games, priority: {priority}")
        
        # Set configurations based on priority
        if priority in self.priority_configs:
            self.shallow_config = self.priority_configs[priority]['shallow']
            self.deep_config = self.priority_configs[priority]['deep']
            logger.info(f"Using {priority} mode - shallow: depth {self.shallow_config['depth']}, deep: depth {self.deep_config['depth']}")
        else:
            logger.warning(f"Unknown priority '{priority}', using default 'precise' mode")
            self.shallow_config = self.priority_configs['precise']['shallow']
            self.deep_config = self.priority_configs['precise']['deep']
        
        start_time = time.time()
        results = {
            'job_id': job_id,
            'username': username,
            'total_games': len(games),
            'phase': AnalysisPhase.SHALLOW.value,
            'partials': {},
            'timing': {}
        }
        
        try:
            # Phase 1: Shallow scan (fast results)
            logger.info("Phase 1: Shallow analysis starting...")
            phase1_start = time.time()
            
            shallow_results = await self._shallow_analysis_pass(games, progress_callback)
            
            phase1_duration = time.time() - phase1_start
            results['timing']['shallow_pass'] = phase1_duration
            results['cache'] = shallow_results.get('cache_stats', {})
            results['phase'] = AnalysisPhase.SHALLOW.value
            
            # Generate initial tactical and swing moment insights
            if shallow_results['tagged_positions']:
                tactical_preview = self._generate_tactical_preview(shallow_results)
                swing_preview = self._generate_swing_preview(shallow_results)
                
                results['partials']['tactics'] = {
                    'ready': True,
                    **tactical_preview
                }
                results['partials']['swing_moments'] = {
                    'ready': True, 
                    **swing_preview
                }
                
                if progress_callback:
                    await progress_callback(0.4, results['partials'])
            
            # Phase 2: Deep analysis of tagged positions
            logger.info("Phase 2: Deep analysis starting...")
            phase2_start = time.time()
            
            deep_results = await self._deep_analysis_pass(
                shallow_results['tagged_positions'], 
                progress_callback
            )
            
            phase2_duration = time.time() - phase2_start
            results['timing']['deep_pass'] = phase2_duration
            results['phase'] = AnalysisPhase.DEEP.value
            
            # Phase 3: Generate final profile
            logger.info("Phase 3: Profile generation...")
            phase3_start = time.time()
            
            # Combine shallow + deep results
            combined_analyses = self._combine_analysis_results(shallow_results, deep_results)
            
            # Generate style profile using enhanced data
            profile = await self.profiler.create_profile(
                username, 
                games,  # parsed games
                combined_analyses
            )
            
            # Generate endgame and time management scores
            endgame_result = self._generate_endgame_analysis(combined_analyses, profile)
            time_mgmt_result = self._generate_time_management_analysis(combined_analyses, profile)
            
            results['partials']['endgame'] = {
                'ready': True,
                **endgame_result
            }
            results['partials']['time_mgmt'] = {
                'ready': True,
                **time_mgmt_result
            }
            
            phase3_duration = time.time() - phase3_start
            results['timing']['profile_generation'] = phase3_duration
            
            # Final results
            total_duration = time.time() - start_time
            results['timing']['total'] = total_duration
            results['phase'] = AnalysisPhase.COMPLETE.value
            
            results['summary'] = self._generate_summary(profile, combined_analyses)
            results['profile'] = profile
            results['plan'] = self._generate_training_plan(profile)
            results['game_analyses'] = combined_analyses  # Add game analyses for main.py
            
            if progress_callback:
                await progress_callback(1.0, results['partials'])
            
            logger.info(f"Progressive analysis completed in {total_duration:.1f}s")
            return results
            
        except Exception as e:
            logger.error(f"Progressive analysis failed: {e}", exc_info=True)
            raise
    
    async def _shallow_analysis_pass(
        self, 
        games: List[Dict[str, Any]],
        progress_callback: Optional[callable] = None
    ) -> Dict[str, Any]:
        """Phase 1: Quick shallow analysis to identify key positions"""
        
        tagged_positions: List[PositionTag] = []
        game_summaries = []
        cache_stats = {
            'hits': 0,
            'misses': 0,
            'stores': 0,
            'enabled': self.cache_enabled
        }
        
        for game_idx, game_data in enumerate(games):
            try:
                # game_data is a ParsedGame object, not a dictionary
                if hasattr(game_data, 'game'):
                    game = game_data.game
                elif hasattr(game_data, 'get'):
                    # Fallback for dictionary format
                    pgn = game_data.get('pgn', '')
                    if not pgn:
                        continue
                    game = chess.pgn.read_game(io.StringIO(pgn))
                else:
                    continue
                
                if not game:
                    continue

                pgn_hash = self._pgn_hash_for_game(game)
                cached_summary = await self._load_cached_game_summary(pgn_hash, self.shallow_config['depth'])
                if cached_summary:
                    cached_summary['game_index'] = game_idx
                    game_summaries.append(cached_summary)
                    cache_stats['hits'] += 1
                    if progress_callback and game_idx % 2 == 0:
                        progress = 0.1 + (game_idx / len(games)) * 0.3
                        await progress_callback(progress, {'phase': 'shallow_scan', 'cache': 'hit'})
                    continue
                cache_stats['misses'] += 1
                
                # Initialize board with correct setup for Chess960
                board = game.board()
                
                # For Chess960, check if initial position is set
                if hasattr(game_data, 'info') and hasattr(game_data.info, 'rules'):
                    if game_data.info.rules == 'chess960' and game.headers.get('SetUp') == '1':
                        initial_fen = game.headers.get('FEN')
                        if initial_fen:
                            board = chess.Board(initial_fen)
                
                move_analyses = []
                
                # Analyze each position quickly
                for ply, move in enumerate(game.mainline_moves()):
                    engine = self._get_available_engine()
                    if engine is None:
                        raise RuntimeError("No Stockfish engine available")

                    board_before = board.copy()
                    
                    # Quick analysis using the StockfishEngine's analyze_position method
                    eval_before = await engine.analyze_position(
                        board_before,
                        depth=self.shallow_config['depth'],
                        time_limit=self.shallow_config['movetime']
                    )
                    
                    # Get move notation before making the move
                    move_san = board_before.san(move)
                    move_uci = move.uci()
                    is_check = board_before.gives_check(move)
                    is_capture = board_before.is_capture(move)
                    is_castling = board_before.is_castling(move)
                    is_promotion = move.promotion is not None
                    
                    # Make the move
                    board.push(move)
                    
                    # Quick post-move analysis
                    eval_after = await engine.analyze_position(
                        board,
                        depth=self.shallow_config['depth'],
                        time_limit=self.shallow_config['movetime']
                    )
                    
                    cp_before = self._score_to_cp(engine, eval_before)
                    cp_after = self._score_to_cp(engine, eval_after)
                    cp_loss = self._side_to_move_loss(cp_before, cp_after, board_before.turn)
                    best_eval = None
                    best_move_san = None
                    best_move_uci = None

                    if self._should_refine_move(ply, cp_loss, is_check, is_capture, is_promotion):
                        best_eval, best_move_san, best_move_uci = await self._analyze_best_move(
                            engine,
                            board_before
                        )
                        if best_eval is not None:
                            cp_loss = self._side_to_move_loss(best_eval, cp_after, board_before.turn)
                    cp_loss = max(0, int(cp_loss or 0))
                    
                    move_analysis = {
                        'ply': ply,
                        'move_san': move_san,
                        'move_uci': move_uci,
                        'eval_before': cp_before if cp_before is not None else 0,
                        'eval_after': cp_after if cp_after is not None else 0,
                        'best_eval': best_eval,
                        'best_move_san': best_move_san,
                        'best_move_uci': best_move_uci,
                        'quality': self._quality_from_cp_loss(cp_loss),
                        'centipawn_loss': cp_loss,
                        'win_probability_loss': self._win_probability_loss(cp_before, cp_after, board_before.turn),
                        'is_check': is_check,
                        'is_capture': is_capture,
                        'is_castling': is_castling,
                        'is_promotion': is_promotion
                    }
                    move_analyses.append(move_analysis)
                    
                    # Tag positions for deeper analysis
                    self._tag_interesting_positions(
                        tagged_positions, game_idx, ply, board.fen(), 
                        cp_loss, move, board
                    )
                
                game_summary = {
                    'game_index': game_idx,
                    'move_analyses': move_analyses
                }
                game_summaries.append(game_summary)
                if await self._store_cached_game_summary(pgn_hash, self.shallow_config['depth'], game_summary):
                    cache_stats['stores'] += 1
                
                # Progress update
                if progress_callback and game_idx % 2 == 0:
                    progress = 0.1 + (game_idx / len(games)) * 0.3  # 10-40% for shallow pass
                    await progress_callback(progress, {'phase': 'shallow_scan'})
                    
            except Exception as e:
                logger.warning(f"Shallow analysis failed for game {game_idx}: {e}")
                continue
        
        logger.info(f"Shallow pass complete: {len(tagged_positions)} positions tagged for deep analysis")
        logger.info(f"Game summaries: {len(game_summaries)} games processed")
        
        return {
            'game_summaries': game_summaries,
            'tagged_positions': tagged_positions,
            'cache_stats': cache_stats
        }

    def _pgn_hash_for_game(self, game: chess.pgn.Game) -> str:
        """Create a stable hash from the start position and mainline moves."""
        try:
            start_fen = game.board().fen()
            variant = game.headers.get("Variant", "standard")
            moves = " ".join(move.uci() for move in game.mainline_moves())
            payload = f"{variant}|{start_fen}|{moves}"
        except Exception:
            payload = str(game)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    async def _load_cached_game_summary(self, pgn_hash: str, min_depth: int) -> Optional[Dict[str, Any]]:
        if not self.cache_enabled or not self._cache_table_available:
            return None

        try:
            row = await self.db_client.fetch_one(
                """
                UPDATE pgn_analysis_cache
                SET last_accessed = NOW(),
                    hit_count = hit_count + 1
                WHERE pgn_hash = $1 AND analysis_depth >= $2
                RETURNING move_evaluations
                """,
                [pgn_hash, int(min_depth)]
            )
            if not row:
                return None

            cached = row.get('move_evaluations')
            if isinstance(cached, str):
                cached = json.loads(cached)
            if isinstance(cached, dict):
                return cached.copy()
        except Exception as e:
            self._cache_table_available = False
            logger.warning(f"PGN cache unavailable; continuing without cache: {e}")
        return None

    async def _store_cached_game_summary(self, pgn_hash: str, depth: int, summary: Dict[str, Any]) -> bool:
        if not self.cache_enabled or not self._cache_table_available or not summary.get('move_analyses'):
            return False

        try:
            cache_payload = {
                'move_analyses': summary.get('move_analyses', [])
            }
            await self.db_client.execute(
                """
                INSERT INTO pgn_analysis_cache (pgn_hash, analysis_depth, analysis_mode, move_evaluations)
                VALUES ($1, $2, $3, $4::jsonb)
                ON CONFLICT (pgn_hash) DO UPDATE SET
                    analysis_depth = GREATEST(pgn_analysis_cache.analysis_depth, EXCLUDED.analysis_depth),
                    analysis_mode = EXCLUDED.analysis_mode,
                    move_evaluations = CASE
                        WHEN pgn_analysis_cache.analysis_depth <= EXCLUDED.analysis_depth
                        THEN EXCLUDED.move_evaluations
                        ELSE pgn_analysis_cache.move_evaluations
                    END,
                    last_accessed = NOW()
                """,
                [pgn_hash, int(depth), 'progressive', json.dumps(cache_payload)]
            )
            return True
        except Exception as e:
            self._cache_table_available = False
            logger.warning(f"Failed to store PGN cache; continuing without cache: {e}")
            return False

    def _score_to_cp(self, engine: StockfishEngine, score: Optional[chess.engine.PovScore]) -> Optional[int]:
        try:
            return engine.score_to_centipawn(score)
        except Exception:
            return None

    def _side_to_move_loss(
        self,
        reference_eval: Optional[int],
        actual_eval: Optional[int],
        moving_turn: chess.Color
    ) -> int:
        if reference_eval is None or actual_eval is None:
            return 0
        if moving_turn == chess.WHITE:
            return max(0, reference_eval - actual_eval)
        return max(0, actual_eval - reference_eval)

    def _quality_from_cp_loss(self, cp_loss: int) -> str:
        if cp_loss < 20:
            return 'best'
        if cp_loss < 50:
            return 'good'
        if cp_loss < 100:
            return 'inaccuracy'
        if cp_loss < 300:
            return 'mistake'
        return 'blunder'

    def _should_refine_move(
        self,
        ply: int,
        cp_loss: int,
        is_check: bool,
        is_capture: bool,
        is_promotion: bool
    ) -> bool:
        opening_skip = int(self.shallow_config.get('opening_skip_ply', 0))
        trigger = int(self.shallow_config.get('deep_trigger_cp', 60))

        if is_promotion:
            return True
        if ply >= opening_skip and cp_loss >= trigger:
            return True
        if ply >= opening_skip and (is_check or is_capture) and cp_loss >= max(25, trigger // 2):
            return True
        return False

    async def _analyze_best_move(
        self,
        engine: StockfishEngine,
        board: chess.Board
    ) -> Tuple[Optional[int], Optional[str], Optional[str]]:
        try:
            info = await engine.engine.analyse(
                board,
                limit=chess.engine.Limit(
                    depth=self.deep_config['depth'],
                    time=self.deep_config['movetime']
                ),
                multipv=1
            )
            if isinstance(info, list):
                info = info[0] if info else {}
            pv = info.get('pv', []) if isinstance(info, dict) else []
            best_move = pv[0] if pv else None
            best_eval = self._score_to_cp(engine, info.get('score') if isinstance(info, dict) else None)
            if not best_move:
                return best_eval, None, None
            return best_eval, board.san(best_move), best_move.uci()
        except Exception as e:
            logger.debug(f"Best move refinement skipped: {e}")
            return None, None, None

    def _win_probability(self, eval_cp: Optional[int]) -> Optional[float]:
        if eval_cp is None:
            return None
        bounded_cp = max(-1000, min(1000, eval_cp))
        return 1.0 / (1.0 + pow(10.0, -bounded_cp / 400.0))

    def _win_probability_loss(
        self,
        reference_eval: Optional[int],
        actual_eval: Optional[int],
        moving_turn: chess.Color
    ) -> float:
        reference_probability = self._win_probability(reference_eval)
        actual_probability = self._win_probability(actual_eval)
        if reference_probability is None or actual_probability is None:
            return 0.0
        if moving_turn == chess.WHITE:
            loss = reference_probability - actual_probability
        else:
            loss = actual_probability - reference_probability
        return round(max(0.0, loss) * 100.0, 2)
    
    async def _deep_analysis_pass(
        self,
        tagged_positions: List[PositionTag],
        progress_callback: Optional[callable] = None
    ) -> Dict[str, Any]:
        """Phase 2: Deep analysis of tagged positions"""
        
        if not tagged_positions:
            return {'deep_analyses': []}
        
        # Sort by priority
        tagged_positions.sort(key=lambda x: x.priority)
        position_limit = int(self.deep_config.get('position_limit', len(tagged_positions)))
        if position_limit <= 0:
            logger.info("Standalone deep pass skipped; important moves were refined inline")
            return {'deep_analyses': [], 'skipped': True}
        tagged_positions = tagged_positions[:position_limit]
        
        deep_analyses = []
        
        for idx, position in enumerate(tagged_positions):
            try:
                board = chess.Board(position.fen)
                engine = self._get_available_engine()
                
                # Deep analysis with multiple PVs - use underlying engine
                info = await engine.engine.analyse(
                    board,
                    limit=chess.engine.Limit(
                        depth=self.deep_config['depth'],
                        time=self.deep_config['movetime']
                    ),
                    multipv=self.deep_config['multipv']
                )
                
                deep_analyses.append({
                    'position': position,
                    'analysis': info
                })
                
                # Progress update
                if progress_callback and idx % 5 == 0:
                    progress = 0.4 + (idx / len(tagged_positions)) * 0.4  # 40-80% for deep pass
                    await progress_callback(progress, {'phase': 'deep_analysis', 'position': idx + 1})
                    
            except Exception as e:
                logger.warning(f"Deep analysis failed for position {position.fen}: {e}")
                continue
        
        logger.info(f"Deep analysis complete: {len(deep_analyses)} positions analyzed")
        
        return {'deep_analyses': deep_analyses}
    
    def _tag_interesting_positions(
        self,
        tagged_positions: List[PositionTag],
        game_idx: int,
        ply: int,
        fen: str,
        cp_loss: int,
        move: chess.Move,
        board: chess.Board
    ):
        """Tag positions that need deeper analysis"""
        
        # Large centipawn loss (potential blunders/tactics)
        if cp_loss >= max(100, int(self.shallow_config.get('deep_trigger_cp', 60))):
            tagged_positions.append(PositionTag(
                fen=fen,
                ply=ply,
                game_index=game_idx,
                reason="blunder",
                priority=1
            ))
        
        # Tactical positions (checks, captures, tactics)
        if board.is_check() or move.promotion or len(board.attackers(not board.turn, move.to_square)) > 1:
            tagged_positions.append(PositionTag(
                fen=fen,
                ply=ply,
                game_index=game_idx,
                reason="tactical",
                priority=2
            ))
        
        # Endgame transitions (few pieces remaining)
        piece_count = len([p for p in board.piece_map().values() if p.piece_type != chess.PAWN])
        if piece_count <= 10:
            tagged_positions.append(PositionTag(
                fen=fen,
                ply=ply,
                game_index=game_idx,
                reason="endgame_transition",
                priority=3
            ))
    
    def _get_available_engine(self) -> StockfishEngine:
        """Get next available engine from pool (simple round-robin)"""
        # In a more sophisticated implementation, you'd track engine availability
        return self.engines[0] if self.engines else None
    
    def _generate_tactical_preview(self, shallow_results: Dict[str, Any]) -> Dict[str, Any]:
        """Generate initial tactical insights from shallow pass"""
        tactical_positions = [
            pos for pos in shallow_results['tagged_positions'] 
            if pos.reason == "tactical"
        ]
        
        return {
            'found_tactics': len(tactical_positions),
            'examples': tactical_positions[:3],  # First 3 examples
            'accuracy': 0.85 if tactical_positions else 0.0  # Placeholder
        }
    
    def _generate_swing_preview(self, shallow_results: Dict[str, Any]) -> Dict[str, Any]:
        """Generate initial swing moment insights"""
        swing_positions = [
            pos for pos in shallow_results['tagged_positions']
            if pos.reason == "blunder"
        ]
        
        return {
            'swing_count': len(swing_positions),
            'top_swings': swing_positions[:5],  # Top 5 swing moments
        }
    
    def _combine_analysis_results(self, shallow: Dict[str, Any], deep: Dict[str, Any]) -> List[GameAnalysis]:
        """Combine shallow and deep analysis results"""
        game_summaries = shallow.get('game_summaries', [])
        game_analyses = []
        
        for summary in game_summaries:
            # Extract move analyses for centipawn loss calculation
            move_analyses = summary.get('move_analyses', [])
            
            # Convert move analysis dictionaries to MoveAnalysis objects
            from ..models.analysis_types import MoveAnalysis, MoveQuality
            move_analysis_objects = []
            
            if move_analyses and len(move_analyses) > 0:
                logger.info(f"Sample move data keys: {list(move_analyses[0].keys()) if isinstance(move_analyses[0], dict) else 'Not dict'}")
                logger.info(f"Sample move data: {move_analyses[0] if len(move_analyses) > 0 else 'None'}")
            
            for move_data in move_analyses:
                try:
                    move_san = move_data.get('move_san', '')
                    
                    # Detect tactical moves from SAN notation
                    is_capture = move_data.get('is_capture', 'x' in move_san)
                    is_check = move_data.get('is_check', move_san.endswith('+') or move_san.endswith('#'))
                    is_promotion = move_data.get('is_promotion', '=' in move_san)
                    is_castling = move_data.get('is_castling', move_san in ['O-O', 'O-O-O'])
                    
                    move_analysis = MoveAnalysis(
                        ply=move_data.get('ply', 0),
                        move_san=move_san,
                        move_uci=move_data.get('move_uci'),
                        eval_before=move_data.get('eval_before'),
                        eval_after=move_data.get('eval_after'),
                        best_eval=move_data.get('best_eval'),
                        best_move_san=move_data.get('best_move_san'),
                        best_move_uci=move_data.get('best_move_uci'),
                        quality=MoveQuality(move_data.get('quality', 'good')),
                        centipawn_loss=move_data.get('centipawn_loss', 0),
                        is_check=is_check,
                        is_capture=is_capture,
                        is_castling=is_castling,
                        is_promotion=is_promotion,
                        time_spent=move_data.get('time_spent'),
                        time_left=move_data.get('time_left'),
                        tactical_opportunities=move_data.get('tactical_opportunities'),
                        tactical_motifs=move_data.get('tactical_motifs'),
                        tactical_usage=move_data.get('tactical_usage')
                    )
                    move_analysis_objects.append(move_analysis)
                except Exception as e:
                    logger.warning(f"Failed to convert move analysis: {e}")
                    continue
            
            # Calculate ACPL (Average Centipawn Loss) for white and black
            white_cp_losses = []
            black_cp_losses = []
            
            for move_analysis in move_analyses:
                cp_loss = move_analysis.get('centipawn_loss', 0)
                ply = move_analysis.get('ply', 0)
                
                if ply % 2 == 0:  # White moves (even plies)
                    white_cp_losses.append(cp_loss)
                else:  # Black moves (odd plies)
                    black_cp_losses.append(cp_loss)
            
            # Calculate average centipawn loss
            white_acpl = sum(white_cp_losses) / len(white_cp_losses) if white_cp_losses else 0.0
            black_acpl = sum(black_cp_losses) / len(black_cp_losses) if black_cp_losses else 0.0
            
            # Count errors by centipawn loss thresholds
            white_inaccuracies = sum(1 for cp in white_cp_losses if 20 <= cp < 50)
            white_mistakes = sum(1 for cp in white_cp_losses if 50 <= cp < 100)
            white_blunders = sum(1 for cp in white_cp_losses if cp >= 100)
            
            black_inaccuracies = sum(1 for cp in black_cp_losses if 20 <= cp < 50)
            black_mistakes = sum(1 for cp in black_cp_losses if 50 <= cp < 100)
            black_blunders = sum(1 for cp in black_cp_losses if cp >= 100)
            
            game_analysis = GameAnalysis(
                game_id=f"game_{summary.get('game_index', 0)}",
                white_acpl=white_acpl,
                black_acpl=black_acpl,
                white_inaccuracies=white_inaccuracies,
                white_mistakes=white_mistakes,
                white_blunders=white_blunders,
                black_inaccuracies=black_inaccuracies,
                black_mistakes=black_mistakes,
                black_blunders=black_blunders,
                move_analyses=move_analysis_objects
            )
            
            game_analyses.append(game_analysis)
        
        logger.info(f"Converted {len(game_summaries)} game summaries to {len(game_analyses)} GameAnalysis objects")
        return game_analyses
    
    def _generate_endgame_analysis(self, analyses: List[Any], profile: Any) -> Dict[str, Any]:
        """Generate endgame analysis from combined results"""
        return {
            'score': 82,  # Placeholder - would calculate from actual endgame positions
            'technique_rating': 'Good',
            'key_patterns': ['King and pawn', 'Rook endgame']
        }
    
    def _generate_time_management_analysis(self, analyses: List[Any], profile: Any) -> Dict[str, Any]:
        """Generate time management analysis"""
        return {
            'score': 76,  # Placeholder
            'efficiency_rating': 'Above Average',
            'time_trouble_games': 2
        }
    
    def _generate_summary(self, profile: Any, analyses: List[Any]) -> Dict[str, Any]:
        """Generate analysis summary"""
        return {
            'overall_rating': 'Strong Player',
            'key_strengths': ['Tactical awareness', 'Endgame technique'],
            'improvement_areas': ['Time management', 'Opening preparation']
        }
    
    def _generate_training_plan(self, profile: Any) -> Dict[str, Any]:
        """Generate training plan"""
        return {
            'priority_areas': ['Tactical puzzles', 'Endgame studies'],
            'estimated_improvement': '+150 Elo',
            'time_commitment': '2 hours/week'
        }
