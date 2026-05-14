-- Chess Analysis Database Schema
-- PostgreSQL initialization script

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Analyses table
CREATE TABLE IF NOT EXISTS analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) NOT NULL,
    platform VARCHAR(20) NOT NULL DEFAULT 'chess.com',
    game_count INTEGER NOT NULL DEFAULT 20,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    progress INTEGER DEFAULT 0,
    current_step TEXT,
    error_message TEXT,
    report_url TEXT,
    short_link TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Games table
CREATE TABLE IF NOT EXISTS games (
    id BIGSERIAL PRIMARY KEY,
    game_id VARCHAR(100) UNIQUE NOT NULL,
    analysis_id UUID REFERENCES analyses(id) ON DELETE CASCADE,
    white_player VARCHAR(50) NOT NULL,
    black_player VARCHAR(50) NOT NULL,
    result VARCHAR(10),
    time_control VARCHAR(20),
    pgn TEXT,
    played_at TIMESTAMP,
    player_color VARCHAR(5),
    player_rating INTEGER,
    opponent_rating INTEGER,
    analysis_status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Game analysis results table
CREATE TABLE IF NOT EXISTS game_analysis_results (
    id BIGSERIAL PRIMARY KEY,
    game_id BIGINT REFERENCES games(id) ON DELETE CASCADE,
    average_centipawn_loss DOUBLE PRECISION,
    accuracy_percentage DOUBLE PRECISION,
    blunders_count INTEGER DEFAULT 0,
    mistakes_count INTEGER DEFAULT 0,
    inaccuracies_count INTEGER DEFAULT 0,
    best_moves_count INTEGER DEFAULT 0,
    excellent_moves_count INTEGER DEFAULT 0,
    good_moves_count INTEGER DEFAULT 0,
    opening_accuracy DOUBLE PRECISION,
    middlegame_accuracy DOUBLE PRECISION,
    endgame_accuracy DOUBLE PRECISION,
    time_usage_efficiency DOUBLE PRECISION,
    move_analysis_json JSONB
);

-- Style profiles table
CREATE TABLE IF NOT EXISTS style_profiles (
    id BIGSERIAL PRIMARY KEY,
    analysis_id UUID REFERENCES analyses(id) ON DELETE CASCADE,
    aggression DOUBLE PRECISION,
    tactical_dependency DOUBLE PRECISION,
    risk_taking DOUBLE PRECISION,
    positional_orientation DOUBLE PRECISION,
    exchange_preference DOUBLE PRECISION,
    opening_variety DOUBLE PRECISION,
    book_deviation DOUBLE PRECISION,
    lead_conversion DOUBLE PRECISION,
    endgame_technique DOUBLE PRECISION,
    time_management DOUBLE PRECISION,
    consistency DOUBLE PRECISION,
    swindle_resistance DOUBLE PRECISION,
    overall_strength DOUBLE PRECISION,
    style_category VARCHAR(50),
    insights_json JSONB,
    recommendations_json JSONB
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_analyses_username_platform ON analyses(username, platform);
CREATE INDEX IF NOT EXISTS idx_analyses_status ON analyses(status);
CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses(created_at);
CREATE INDEX IF NOT EXISTS idx_analyses_short_link ON analyses(short_link);
CREATE INDEX IF NOT EXISTS idx_games_analysis_id ON games(analysis_id);
CREATE INDEX IF NOT EXISTS idx_games_game_id ON games(game_id);
CREATE INDEX IF NOT EXISTS idx_game_analysis_results_game_id ON game_analysis_results(game_id);
CREATE INDEX IF NOT EXISTS idx_style_profiles_analysis_id ON style_profiles(analysis_id);

-- Additional tables for Worker storage
-- Games table (modified for Worker compatibility)
CREATE TABLE IF NOT EXISTS games_worker (
    id BIGSERIAL PRIMARY KEY,
    analysis_id UUID REFERENCES analyses(id) ON DELETE CASCADE,
    game_index INTEGER NOT NULL,
    pgn TEXT NOT NULL,
    white_player VARCHAR(100),
    black_player VARCHAR(100),
    result VARCHAR(10),
    time_control VARCHAR(50),
    date_played VARCHAR(20),
    opening VARCHAR(200),
    termination VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(analysis_id, game_index)
);

-- Game analyses table (for detailed analysis data)
CREATE TABLE IF NOT EXISTS game_analyses (
    id BIGSERIAL PRIMARY KEY,
    analysis_id UUID REFERENCES analyses(id) ON DELETE CASCADE,
    game_index INTEGER NOT NULL,
    accuracy DOUBLE PRECISION DEFAULT 0.0,
    blunders INTEGER DEFAULT 0,
    mistakes INTEGER DEFAULT 0,
    inaccuracies INTEGER DEFAULT 0,
    average_centipawn_loss DOUBLE PRECISION DEFAULT 0.0,
    best_moves INTEGER DEFAULT 0,
    total_moves INTEGER DEFAULT 0,
    time_spent INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(analysis_id, game_index)
);

-- Move analyses table (move-by-move analysis)
CREATE TABLE IF NOT EXISTS move_analyses (
    id BIGSERIAL PRIMARY KEY,
    analysis_id UUID REFERENCES analyses(id) ON DELETE CASCADE,
    game_index INTEGER NOT NULL,
    move_number INTEGER NOT NULL,
    move_notation VARCHAR(20),
    evaluation_before DOUBLE PRECISION DEFAULT 0,
    evaluation_after DOUBLE PRECISION DEFAULT 0,
    best_move VARCHAR(20),
    classification VARCHAR(20) DEFAULT 'good',
    centipawn_loss INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Style profiles table (modified for Worker)
CREATE TABLE IF NOT EXISTS style_profiles_worker (
    id BIGSERIAL PRIMARY KEY,
    analysis_id UUID REFERENCES analyses(id) ON DELETE CASCADE,
    playing_style VARCHAR(50) DEFAULT 'Balanced',
    strengths JSONB DEFAULT '[]'::jsonb,
    weaknesses JSONB DEFAULT '[]'::jsonb,
    opening_repertoire JSONB DEFAULT '{}'::jsonb,
    tactical_rating DOUBLE PRECISION DEFAULT 0.0,
    positional_rating DOUBLE PRECISION DEFAULT 0.0,
    endgame_rating DOUBLE PRECISION DEFAULT 0.0,
    time_management_rating DOUBLE PRECISION DEFAULT 0.0,
    blunder_tendency DOUBLE PRECISION DEFAULT 0.0,
    risk_tolerance DOUBLE PRECISION DEFAULT 0.0,
    piece_activity_preference DOUBLE PRECISION DEFAULT 0.0,
    summary_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(analysis_id)
);

-- Create indexes for new tables
CREATE INDEX IF NOT EXISTS idx_games_worker_analysis_id ON games_worker(analysis_id);
CREATE INDEX IF NOT EXISTS idx_game_analyses_analysis_id ON game_analyses(analysis_id);
CREATE INDEX IF NOT EXISTS idx_move_analyses_analysis_id ON move_analyses(analysis_id);
CREATE INDEX IF NOT EXISTS idx_move_analyses_game ON move_analyses(analysis_id, game_index);
CREATE INDEX IF NOT EXISTS idx_style_profiles_worker_analysis_id ON style_profiles_worker(analysis_id);

-- Enhanced columns used by the current Python worker
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
ADD COLUMN IF NOT EXISTS best_evaluation DOUBLE PRECISION;

ALTER TABLE style_profiles_worker
ADD COLUMN IF NOT EXISTS aggression_rating DOUBLE PRECISION DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS exchange_preference DOUBLE PRECISION DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS opening_variety DOUBLE PRECISION DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS lead_conversion DOUBLE PRECISION DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS consistency DOUBLE PRECISION DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS swindle_resistance DOUBLE PRECISION DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS tactical_stats JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS cohort_percentiles JSONB DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS player_metadata (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    platform VARCHAR(20) NOT NULL DEFAULT 'chess.com',
    country VARCHAR(10),
    title VARCHAR(20),
    followers INTEGER,
    joined_timestamp BIGINT,
    last_online_timestamp BIGINT,
    avatar_url TEXT,
    league VARCHAR(50),
    is_streaming BOOLEAN DEFAULT FALSE,
    stats_collected_at TIMESTAMP DEFAULT NOW(),
    ratings_data JSONB DEFAULT '{}'::jsonb,
    UNIQUE(username, platform),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tactical_opportunities (
    id BIGSERIAL PRIMARY KEY,
    analysis_id UUID REFERENCES analyses(id) ON DELETE CASCADE,
    game_index INTEGER NOT NULL,
    move_number INTEGER NOT NULL,
    pattern_type VARCHAR(30) NOT NULL,
    target_squares TEXT[],
    piece_type VARCHAR(10),
    value_gain INTEGER DEFAULT 0,
    difficulty INTEGER DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
    description TEXT,
    move_sequence TEXT[],
    was_executed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cohort_data (
    id BIGSERIAL PRIMARY KEY,
    rating_range VARCHAR(20) NOT NULL,
    time_control VARCHAR(20) NOT NULL,
    platform VARCHAR(20) NOT NULL DEFAULT 'chess.com',
    sample_size INTEGER DEFAULT 0,
    aggression_mean DOUBLE PRECISION DEFAULT 50.0,
    aggression_std DOUBLE PRECISION DEFAULT 15.0,
    tactical_dependency_mean DOUBLE PRECISION DEFAULT 50.0,
    tactical_dependency_std DOUBLE PRECISION DEFAULT 15.0,
    risk_taking_mean DOUBLE PRECISION DEFAULT 50.0,
    risk_taking_std DOUBLE PRECISION DEFAULT 15.0,
    positional_orientation_mean DOUBLE PRECISION DEFAULT 50.0,
    positional_orientation_std DOUBLE PRECISION DEFAULT 15.0,
    exchange_preference_mean DOUBLE PRECISION DEFAULT 50.0,
    exchange_preference_std DOUBLE PRECISION DEFAULT 15.0,
    opening_variety_mean DOUBLE PRECISION DEFAULT 50.0,
    opening_variety_std DOUBLE PRECISION DEFAULT 15.0,
    book_deviation_mean DOUBLE PRECISION DEFAULT 50.0,
    book_deviation_std DOUBLE PRECISION DEFAULT 15.0,
    lead_conversion_mean DOUBLE PRECISION DEFAULT 50.0,
    lead_conversion_std DOUBLE PRECISION DEFAULT 15.0,
    endgame_technique_mean DOUBLE PRECISION DEFAULT 50.0,
    endgame_technique_std DOUBLE PRECISION DEFAULT 15.0,
    time_management_mean DOUBLE PRECISION DEFAULT 50.0,
    time_management_std DOUBLE PRECISION DEFAULT 15.0,
    consistency_mean DOUBLE PRECISION DEFAULT 50.0,
    consistency_std DOUBLE PRECISION DEFAULT 15.0,
    swindle_resistance_mean DOUBLE PRECISION DEFAULT 50.0,
    swindle_resistance_std DOUBLE PRECISION DEFAULT 15.0,
    avg_acpl DOUBLE PRECISION DEFAULT 0.0,
    avg_accuracy DOUBLE PRECISION DEFAULT 0.0,
    avg_blunders_per_game DOUBLE PRECISION DEFAULT 0.0,
    avg_mistakes_per_game DOUBLE PRECISION DEFAULT 0.0,
    avg_tactical_opportunities DOUBLE PRECISION DEFAULT 0.0,
    last_updated TIMESTAMP DEFAULT NOW(),
    UNIQUE(rating_range, time_control, platform)
);

CREATE TABLE IF NOT EXISTS training_recommendations (
    id BIGSERIAL PRIMARY KEY,
    analysis_id UUID REFERENCES analyses(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,
    priority INTEGER DEFAULT 1 CHECK (priority BETWEEN 1 AND 5),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    specific_focus TEXT[],
    difficulty_level INTEGER DEFAULT 1 CHECK (difficulty_level BETWEEN 1 AND 5),
    estimated_elo_gain INTEGER DEFAULT 0,
    time_investment_hours INTEGER DEFAULT 1,
    resources JSONB DEFAULT '[]'::jsonb,
    evidence_games TEXT[],
    evidence_moves TEXT[],
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pgn_analysis_cache (
    pgn_hash VARCHAR(64) PRIMARY KEY,
    analysis_depth INTEGER NOT NULL DEFAULT 0,
    analysis_mode VARCHAR(20) NOT NULL DEFAULT 'progressive',
    move_evaluations JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    last_accessed TIMESTAMP DEFAULT NOW(),
    hit_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS site_view_totals (
    id INTEGER PRIMARY KEY DEFAULT 1,
    total_views BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT site_view_totals_singleton CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS site_visit_days (
    visit_date DATE NOT NULL,
    visitor_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (visit_date, visitor_hash)
);

CREATE INDEX IF NOT EXISTS idx_player_metadata_username_platform ON player_metadata(username, platform);
CREATE INDEX IF NOT EXISTS idx_tactical_opportunities_analysis_game ON tactical_opportunities(analysis_id, game_index);
CREATE INDEX IF NOT EXISTS idx_tactical_opportunities_pattern ON tactical_opportunities(pattern_type);
CREATE INDEX IF NOT EXISTS idx_cohort_data_rating_tc ON cohort_data(rating_range, time_control);
CREATE INDEX IF NOT EXISTS idx_training_recommendations_analysis_id ON training_recommendations(analysis_id);
CREATE INDEX IF NOT EXISTS idx_training_recommendations_priority ON training_recommendations(priority DESC);
CREATE INDEX IF NOT EXISTS idx_pgn_analysis_cache_last_accessed ON pgn_analysis_cache(last_accessed DESC);
CREATE INDEX IF NOT EXISTS idx_site_visit_days_created_at ON site_visit_days(created_at DESC);

INSERT INTO cohort_data (rating_range, time_control, platform, sample_size) VALUES
('800-1000', 'blitz', 'chess.com', 1000),
('1000-1200', 'blitz', 'chess.com', 1000),
('1200-1400', 'blitz', 'chess.com', 1000),
('1400-1600', 'blitz', 'chess.com', 1000),
('1600-1800', 'blitz', 'chess.com', 1000),
('1800-2000', 'blitz', 'chess.com', 1000),
('2000-2200', 'blitz', 'chess.com', 1000),
('800-1000', 'rapid', 'chess.com', 1000),
('1000-1200', 'rapid', 'chess.com', 1000),
('1200-1400', 'rapid', 'chess.com', 1000),
('1400-1600', 'rapid', 'chess.com', 1000),
('1600-1800', 'rapid', 'chess.com', 1000),
('1800-2000', 'rapid', 'chess.com', 1000),
('2000-2200', 'rapid', 'chess.com', 1000),
('800-1000', 'bullet', 'chess.com', 500),
('1000-1200', 'bullet', 'chess.com', 500),
('1200-1400', 'bullet', 'chess.com', 500),
('1400-1600', 'bullet', 'chess.com', 500),
('1600-1800', 'bullet', 'chess.com', 500),
('1800-2000', 'bullet', 'chess.com', 500),
('2000-2200', 'bullet', 'chess.com', 500)
ON CONFLICT (rating_range, time_control, platform) DO NOTHING;
