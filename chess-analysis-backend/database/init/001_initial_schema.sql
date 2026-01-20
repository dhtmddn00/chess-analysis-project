-- Chess Analysis Service PostgreSQL Schema
-- Migration from SQLite to PostgreSQL

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create migration history table
CREATE TABLE IF NOT EXISTS migration_history (
    id SERIAL PRIMARY KEY,
    version VARCHAR(50) NOT NULL UNIQUE,
    description VARCHAR(200) NOT NULL,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN DEFAULT FALSE,
    error_message TEXT
);

-- Create players table
CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    platform VARCHAR(20) NOT NULL,
    display_name VARCHAR(100),
    country VARCHAR(3),
    title VARCHAR(10),
    joined_date TIMESTAMP WITH TIME ZONE,
    last_online TIMESTAMP WITH TIME ZONE,
    profile_url VARCHAR(200),
    current_rating INTEGER,
    peak_rating INTEGER,
    total_games INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_player_username_platform UNIQUE (username, platform)
);

-- Create indexes for players
CREATE INDEX IF NOT EXISTS idx_player_rating ON players (current_rating);
CREATE INDEX IF NOT EXISTS idx_player_updated ON players (updated_at);
CREATE INDEX IF NOT EXISTS idx_player_platform_username ON players (platform, username);

-- Create cohort baselines table
CREATE TABLE IF NOT EXISTS cohort_baselines (
    id SERIAL PRIMARY KEY,
    platform VARCHAR(20) NOT NULL,
    time_control VARCHAR(20) NOT NULL,
    rating_min INTEGER NOT NULL,
    rating_max INTEGER NOT NULL,
    sample_size INTEGER NOT NULL,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    acpl_mean FLOAT NOT NULL,
    acpl_std FLOAT NOT NULL,
    acpl_percentiles JSONB,
    blunder_rate_mean FLOAT NOT NULL,
    blunder_rate_std FLOAT NOT NULL,
    blunder_rate_percentiles JSONB,
    mistake_rate_mean FLOAT NOT NULL,
    mistake_rate_std FLOAT NOT NULL,
    mistake_rate_percentiles JSONB,
    style_distributions JSONB,
    CONSTRAINT uq_cohort_baseline UNIQUE (platform, time_control, rating_min, rating_max)
);

-- Create indexes for cohort baselines
CREATE INDEX IF NOT EXISTS idx_cohort_platform_time_rating ON cohort_baselines (platform, time_control, rating_min, rating_max);
CREATE INDEX IF NOT EXISTS idx_cohort_updated ON cohort_baselines (last_updated);

-- Create analyses table
CREATE TABLE IF NOT EXISTS analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id INTEGER NOT NULL REFERENCES players(id),
    game_count_requested INTEGER NOT NULL,
    game_count_analyzed INTEGER,
    time_controls JSONB,
    engine_depth INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    progress_percent FLOAT DEFAULT 0.0,
    current_step VARCHAR(100),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    analysis_duration_seconds FLOAT,
    overall_acpl FLOAT,
    win_rate FLOAT,
    total_moves_analyzed INTEGER,
    style_scores JSONB,
    cohort_comparison JSONB,
    key_insights JSONB,
    quick_tips JSONB
);

-- Create indexes for analyses
CREATE INDEX IF NOT EXISTS idx_analysis_created ON analyses (created_at);
CREATE INDEX IF NOT EXISTS idx_analysis_player_status ON analyses (player_id, status);
CREATE INDEX IF NOT EXISTS idx_analysis_status ON analyses (status);

-- Create games table
CREATE TABLE IF NOT EXISTS games (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id),
    external_id VARCHAR(100),
    platform VARCHAR(20) NOT NULL,
    white_player VARCHAR(50) NOT NULL,
    black_player VARCHAR(50) NOT NULL,
    white_rating INTEGER,
    black_rating INTEGER,
    result VARCHAR(10) NOT NULL,
    time_control VARCHAR(20) NOT NULL,
    time_control_seconds INTEGER,
    time_increment INTEGER,
    eco VARCHAR(5),
    opening VARCHAR(200),
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    rated BOOLEAN,
    pgn TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_game_external_platform UNIQUE (external_id, platform)
);

-- Create indexes for games
CREATE INDEX IF NOT EXISTS idx_game_player_time ON games (player_id, end_time);
CREATE INDEX IF NOT EXISTS idx_game_eco ON games (eco);
CREATE INDEX IF NOT EXISTS idx_game_platform_time ON games (platform, end_time);
CREATE INDEX IF NOT EXISTS idx_game_time_control ON games (time_control);

-- Create game analyses table
CREATE TABLE IF NOT EXISTS game_analyses (
    id SERIAL PRIMARY KEY,
    analysis_id UUID NOT NULL REFERENCES analyses(id),
    game_id INTEGER NOT NULL REFERENCES games(id),
    player_color VARCHAR(5) NOT NULL,
    white_acpl FLOAT NOT NULL,
    black_acpl FLOAT NOT NULL,
    player_acpl FLOAT NOT NULL,
    white_inaccuracies INTEGER DEFAULT 0,
    white_mistakes INTEGER DEFAULT 0,
    white_blunders INTEGER DEFAULT 0,
    black_inaccuracies INTEGER DEFAULT 0,
    black_mistakes INTEGER DEFAULT 0,
    black_blunders INTEGER DEFAULT 0,
    opening_moves INTEGER DEFAULT 0,
    middlegame_moves INTEGER DEFAULT 0,
    endgame_moves INTEGER DEFAULT 0,
    white_opening_acpl FLOAT,
    white_middlegame_acpl FLOAT,
    white_endgame_acpl FLOAT,
    black_opening_acpl FLOAT,
    black_middlegame_acpl FLOAT,
    black_endgame_acpl FLOAT,
    key_mistakes JSONB,
    time_analysis JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for game analyses
CREATE INDEX IF NOT EXISTS idx_game_analysis_analysis ON game_analyses (analysis_id);
CREATE INDEX IF NOT EXISTS idx_game_analysis_acpl ON game_analyses (player_acpl);

-- Create improvement plans table
CREATE TABLE IF NOT EXISTS improvement_plans (
    id SERIAL PRIMARY KEY,
    analysis_id UUID NOT NULL REFERENCES analyses(id),
    title VARCHAR(200) NOT NULL,
    duration_weeks INTEGER NOT NULL,
    target_rating_gain INTEGER,
    overall_objectives JSONB,
    key_principles JSONB,
    avoid_habits JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create move analyses table
CREATE TABLE IF NOT EXISTS move_analyses (
    id SERIAL PRIMARY KEY,
    game_analysis_id INTEGER NOT NULL REFERENCES game_analyses(id),
    ply INTEGER NOT NULL,
    move_san VARCHAR(10) NOT NULL,
    move_uci VARCHAR(5),
    eval_before INTEGER,
    eval_after INTEGER,
    best_eval INTEGER,
    best_move_san VARCHAR(10),
    best_move_uci VARCHAR(5),
    quality VARCHAR(20) NOT NULL,
    centipawn_loss INTEGER,
    is_check BOOLEAN DEFAULT FALSE,
    is_capture BOOLEAN DEFAULT FALSE,
    is_castling BOOLEAN DEFAULT FALSE,
    is_promotion BOOLEAN DEFAULT FALSE,
    time_spent FLOAT,
    time_left FLOAT
);

-- Create indexes for move analyses
CREATE INDEX IF NOT EXISTS idx_move_analysis_quality ON move_analyses (quality);
CREATE INDEX IF NOT EXISTS idx_move_analysis_game_ply ON move_analyses (game_analysis_id, ply);

-- Create improvement areas table
CREATE TABLE IF NOT EXISTS improvement_areas (
    id SERIAL PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES improvement_plans(id),
    area_name VARCHAR(100) NOT NULL,
    description TEXT,
    priority VARCHAR(20) NOT NULL,
    current_level VARCHAR(200),
    target_level VARCHAR(200),
    impact_score FLOAT NOT NULL,
    evidence JSONB
);

-- Create indexes for improvement areas
CREATE INDEX IF NOT EXISTS idx_improvement_area_impact ON improvement_areas (impact_score);
CREATE INDEX IF NOT EXISTS idx_improvement_area_priority ON improvement_areas (priority);

-- Create weekly plans table
CREATE TABLE IF NOT EXISTS weekly_plans (
    id SERIAL PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES improvement_plans(id),
    week_number INTEGER NOT NULL,
    theme VARCHAR(200),
    total_time_minutes INTEGER,
    practice_games INTEGER,
    practice_time_control VARCHAR(20),
    practice_focus VARCHAR(200),
    objectives JSONB,
    kpi_targets JSONB
);

-- Create indexes for weekly plans
CREATE INDEX IF NOT EXISTS idx_weekly_plan_week ON weekly_plans (plan_id, week_number);

-- Create training tasks table
CREATE TABLE IF NOT EXISTS training_tasks (
    id SERIAL PRIMARY KEY,
    weekly_plan_id INTEGER NOT NULL REFERENCES weekly_plans(id),
    task_id VARCHAR(50) NOT NULL,
    name VARCHAR(200) NOT NULL,
    training_type VARCHAR(50) NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL,
    frequency_per_week INTEGER NOT NULL,
    instructions JSONB,
    resources JSONB,
    success_metrics JSONB,
    target_improvement VARCHAR(200)
);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for players table
CREATE TRIGGER update_players_updated_at 
    BEFORE UPDATE ON players 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert initial migration record
INSERT INTO migration_history (version, description, executed_at, success) 
VALUES ('001', 'Initial database schema migration from SQLite', CURRENT_TIMESTAMP, TRUE)
ON CONFLICT (version) DO NOTHING;