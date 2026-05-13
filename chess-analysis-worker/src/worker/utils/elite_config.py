"""
Elite Scoring Configuration Manager

Manages bucket-based rating system for accurate evaluation of world-class players.
"""

import yaml
import os
from typing import Dict, Any, Optional
from enum import Enum
from loguru import logger


class RatingBand(Enum):
    """Rating band classifications"""
    B1 = "B1"  # ≤1600
    B2 = "B2"  # 1600-2200  
    B3 = "B3"  # 2200-2600
    B4 = "B4"  # 2600-2900
    B5 = "B5"  # 2900+ (Super-Elite)


class OpponentBand(Enum):
    """Opponent strength classifications"""
    O1 = "O1"  # Weaker (-200+)
    O2 = "O2"  # Similar (±200)
    O3 = "O3"  # Stronger (+200+)


class EliteConfig:
    """Configuration manager for elite scoring system"""
    
    def __init__(self, config_path: str = None):
        if config_path is None:
            # In Docker the config directory lives at /app/config. Locally the
            # same file is under chess-analysis-worker/config.
            config_path = os.path.abspath(os.path.join(
                os.path.dirname(__file__),
                "../../../config/elite_scoring_config.yaml"
            ))
        
        self.config_path = config_path
        self.config = self._load_config()
    
    def _load_config(self) -> Dict[str, Any]:
        """Load configuration from YAML file"""
        try:
            with open(self.config_path, 'r', encoding='utf-8') as f:
                config = yaml.safe_load(f)
            logger.info(f"Loaded elite scoring config v{config.get('version', 'unknown')}")
            return config
        except Exception as e:
            logger.error(f"Failed to load elite config from {self.config_path}: {e}")
            # Return default fallback config
            return self._get_fallback_config()
    
    def _get_fallback_config(self) -> Dict[str, Any]:
        """Fallback configuration if YAML loading fails"""
        return {
            'rating_bands': {
                'B1': {
                    'elo_max': 1600,
                    'accuracy_k': 0.45,
                    'accuracy_alpha': 1.00,
                    'tactical_epsilon': 30,
                    'min_score': 0,
                    'max_score': 100
                },
                'B2': {
                    'elo_min': 1600,
                    'elo_max': 2200,
                    'accuracy_k': 0.40,
                    'accuracy_alpha': 0.95,
                    'tactical_epsilon': 25,
                    'min_score': 0,
                    'max_score': 100
                },
                'B3': {
                    'elo_min': 2200,
                    'elo_max': 2600,
                    'accuracy_k': 0.36,
                    'accuracy_alpha': 0.90,
                    'tactical_epsilon': 20,
                    'min_score': 0,
                    'max_score': 100
                },
                'B4': {
                    'elo_min': 2600,
                    'elo_max': 2900,
                    'accuracy_k': 0.32,
                    'accuracy_alpha': 0.85,
                    'tactical_epsilon': 20,
                    'min_score': 40,
                    'max_score': 98
                },
                'B5': {
                    'elo_min': 2900,
                    'accuracy_k': 0.25,
                    'accuracy_alpha': 0.75,
                    'tactical_epsilon': 15,
                    'min_score': 60,
                    'max_score': 98
                }
            },
            'opponent_bands': {
                'O1': {'weight_multiplier': 0.9},
                'O2': {'weight_multiplier': 1.0},
                'O3': {'weight_multiplier': 1.25}
            },
            'opponent_weighting': {
                'lambda_by_band': {
                    'B1': 0.10,
                    'B2': 0.12,
                    'B3': 0.15,
                    'B4': 0.20,
                    'B5': 0.25
                },
                'max_weight': 1.30
            },
            'time_models': {
                'rapid': {
                    'beta_by_band': {
                        'B1': 4.0,
                        'B2': 3.8,
                        'B3': 3.5,
                        'B4': 3.2,
                        'B5': 3.0
                    }
                }
            },
            'tactics': {
                'miss_penalty_factors': {
                    'B1': 1.0,
                    'B2': 1.0,
                    'B3': 0.9,
                    'B4': 0.7,
                    'B5': 0.6
                }
            },
            'score_caps': {
                'blunder_phase_caps': {
                    'opening': {'B1': 8, 'B2': 6, 'B3': 4, 'B4': 3, 'B5': 2},
                    'middlegame': {'B1': 12, 'B2': 10, 'B3': 8, 'B4': 6, 'B5': 6},
                    'endgame': {'B1': 10, 'B2': 8, 'B3': 6, 'B4': 5, 'B5': 4}
                }
            }
        }
    
    def get_rating_band(self, rating: int) -> RatingBand:
        """Determine rating band based on player rating"""
        if rating <= 1600:
            return RatingBand.B1
        elif rating <= 2200:
            return RatingBand.B2
        elif rating <= 2600:
            return RatingBand.B3
        elif rating <= 2900:
            return RatingBand.B4
        else:
            return RatingBand.B5
    
    def get_opponent_band(self, player_rating: int, opponent_rating: int) -> OpponentBand:
        """Determine opponent strength band"""
        diff = opponent_rating - player_rating
        if diff <= -200:
            return OpponentBand.O1
        elif diff >= 200:
            return OpponentBand.O3
        else:
            return OpponentBand.O2
    
    def get_accuracy_params(self, band: RatingBand) -> tuple[float, float]:
        """Get accuracy calculation parameters for rating band"""
        band_config = self.config['rating_bands'].get(band.value, self._get_fallback_config()['rating_bands'][band.value])
        return band_config['accuracy_k'], band_config['accuracy_alpha']
    
    def get_tactical_epsilon(self, band: RatingBand) -> int:
        """Get tactical evaluation epsilon (error tolerance) for band"""
        band_config = self.config['rating_bands'].get(band.value, self._get_fallback_config()['rating_bands'][band.value])
        return band_config['tactical_epsilon']
    
    def get_score_limits(self, band: RatingBand) -> tuple[int, int]:
        """Get min/max score limits for rating band"""
        band_config = self.config['rating_bands'].get(band.value, self._get_fallback_config()['rating_bands'][band.value])
        return band_config['min_score'], band_config['max_score']
    
    def get_time_beta(self, band: RatingBand, time_control: str) -> float:
        """Get time management beta coefficient"""
        time_config = self.config['time_models'].get(time_control, {})
        beta_by_band = time_config.get('beta_by_band', {})
        return beta_by_band.get(band.value, 3.0)  # Default fallback
    
    def get_opponent_weight(self, player_rating: int, opponent_rating: int, band: RatingBand) -> float:
        """Calculate opponent strength weight multiplier"""
        opponent_band = self.get_opponent_band(player_rating, opponent_rating)
        base_weight = self.config['opponent_bands'][opponent_band.value]['weight_multiplier']
        
        # Additional lambda adjustment for rating difference
        lambda_val = self.config['opponent_weighting']['lambda_by_band'].get(band.value, 0.15)
        rating_diff = opponent_rating - player_rating
        additional_weight = 1 + lambda_val * (rating_diff / 400)
        
        final_weight = base_weight * additional_weight
        max_weight = self.config['opponent_weighting']['max_weight']
        
        return min(final_weight, max_weight)
    
    def get_blunder_cap(self, band: RatingBand, phase: str) -> int:
        """Get blunder penalty cap for rating band and game phase"""
        caps = self.config['score_caps']['blunder_phase_caps'][phase]
        return caps.get(band.value, 10)  # Default fallback
    
    def get_miss_penalty_factor(self, band: RatingBand) -> float:
        """Get tactical miss penalty reduction factor for elite players"""
        factors = self.config['tactics']['miss_penalty_factors']
        return factors.get(band.value, 1.0)
    
    def is_elite_player(self, rating: int, player_name: str = None) -> bool:
        """Check if player qualifies for elite adjustments"""
        if rating >= 2900:
            return True
        
        # Well-known elite player names
        if player_name:
            elite_names = ['hikaru', 'magnus', 'magnuscarlsen', 'gmhikaru', 'carlsen']
            return player_name.lower() in elite_names
        
        return False
    
    def calculate_elite_accuracy(self, avg_cpl: float, band: RatingBand) -> float:
        """Calculate accuracy using elite-optimized formula"""
        k, alpha = self.get_accuracy_params(band)
        min_score, max_score = self.get_score_limits(band)
        
        # New formula: Acc = clip(100 - k * CPL^α, min, max)
        raw_accuracy = 100 - k * (avg_cpl ** alpha)
        
        return max(min_score, min(raw_accuracy, max_score))


# Global config instance
_elite_config = None

def get_elite_config() -> EliteConfig:
    """Get global elite configuration instance"""
    global _elite_config
    if _elite_config is None:
        _elite_config = EliteConfig()
    return _elite_config
