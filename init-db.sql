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

-- Insert sample data for testing
INSERT INTO analyses (id, username, platform, game_count, status, progress, current_step, created_at, updated_at) 
VALUES 
    ('550e8400-e29b-41d4-a716-446655440000', 'testuser', 'chess.com', 10, 'COMPLETED', 100, 'Analysis completed', NOW() - INTERVAL '1 day', NOW())
ON CONFLICT (id) DO NOTHING;