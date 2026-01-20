-- Enhanced Chess Analysis Database Schema
-- Adds support for player metadata, tactical analysis, and cohort normalization

-- Player metadata table
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

-- Tactical opportunities table
CREATE TABLE IF NOT EXISTS tactical_opportunities (
    id BIGSERIAL PRIMARY KEY,
    analysis_id UUID REFERENCES analyses(id) ON DELETE CASCADE,
    game_index INTEGER NOT NULL,
    move_number INTEGER NOT NULL,
    pattern_type VARCHAR(30) NOT NULL, -- fork, pin, skewer, etc.
    target_squares TEXT[], -- array of square names
    piece_type VARCHAR(10), -- piece making the tactical move
    value_gain INTEGER DEFAULT 0, -- centipawn gain
    difficulty INTEGER DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
    description TEXT,
    move_sequence TEXT[], -- UCI moves for execution
    was_executed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Enhanced move analyses with tactical data
ALTER TABLE move_analyses 
ADD COLUMN IF NOT EXISTS tactical_motifs TEXT[], -- array of tactical patterns
ADD COLUMN IF NOT EXISTS is_check BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_capture BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_castling BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_promotion BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS time_spent DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS time_left DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS move_uci VARCHAR(10),
ADD COLUMN IF NOT EXISTS best_move_uci VARCHAR(10),
ADD COLUMN IF NOT EXISTS best_evaluation DOUBLE PRECISION;

-- Enhanced style profiles with metadata and tactical stats
ALTER TABLE style_profiles_worker 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS tactical_stats JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS cohort_percentiles JSONB DEFAULT '{}'::jsonb;

-- Cohort data for normalization (rating groups, time controls)
CREATE TABLE IF NOT EXISTS cohort_data (
    id BIGSERIAL PRIMARY KEY,
    rating_range VARCHAR(20) NOT NULL, -- '1200-1400', '1400-1600', etc.
    time_control VARCHAR(20) NOT NULL, -- 'blitz', 'rapid', 'bullet'
    platform VARCHAR(20) NOT NULL DEFAULT 'chess.com',
    sample_size INTEGER DEFAULT 0,
    -- Style dimension statistics
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
    -- Performance statistics
    avg_acpl DOUBLE PRECISION DEFAULT 0.0,
    avg_accuracy DOUBLE PRECISION DEFAULT 0.0,
    avg_blunders_per_game DOUBLE PRECISION DEFAULT 0.0,
    avg_mistakes_per_game DOUBLE PRECISION DEFAULT 0.0,
    avg_tactical_opportunities DOUBLE PRECISION DEFAULT 0.0,
    last_updated TIMESTAMP DEFAULT NOW(),
    UNIQUE(rating_range, time_control, platform)
);

-- Training recommendations table
CREATE TABLE IF NOT EXISTS training_recommendations (
    id BIGSERIAL PRIMARY KEY,
    analysis_id UUID REFERENCES analyses(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL, -- 'tactical', 'positional', 'endgame', etc.
    priority INTEGER DEFAULT 1 CHECK (priority BETWEEN 1 AND 5),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    specific_focus TEXT[], -- array of specific areas
    difficulty_level INTEGER DEFAULT 1 CHECK (difficulty_level BETWEEN 1 AND 5),
    estimated_elo_gain INTEGER DEFAULT 0,
    time_investment_hours INTEGER DEFAULT 1,
    resources JSONB DEFAULT '[]'::jsonb, -- links, book recommendations, etc.
    evidence_games TEXT[], -- game references supporting this recommendation
    evidence_moves TEXT[], -- specific move references
    created_at TIMESTAMP DEFAULT NOW()
);

-- Game insights table (for detailed analysis insights)
CREATE TABLE IF NOT EXISTS game_insights (
    id BIGSERIAL PRIMARY KEY,
    analysis_id UUID REFERENCES analyses(id) ON DELETE CASCADE,
    game_index INTEGER NOT NULL,
    insight_type VARCHAR(50) NOT NULL, -- 'missed_tactic', 'good_decision', 'time_trouble', etc.
    ply INTEGER NOT NULL, -- move number where insight applies
    title VARCHAR(200),
    description TEXT,
    impact_score DOUBLE PRECISION DEFAULT 0.0, -- how significant this insight is
    improvement_suggestion TEXT,
    related_pattern VARCHAR(50), -- tactical pattern if applicable
    evidence_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Performance tracking over time
CREATE TABLE IF NOT EXISTS performance_tracking (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    platform VARCHAR(20) NOT NULL DEFAULT 'chess.com',
    analysis_date DATE NOT NULL,
    rating_range VARCHAR(20),
    time_control VARCHAR(20),
    games_analyzed INTEGER DEFAULT 0,
    avg_acpl DOUBLE PRECISION DEFAULT 0.0,
    avg_accuracy DOUBLE PRECISION DEFAULT 0.0,
    blunders_per_game DOUBLE PRECISION DEFAULT 0.0,
    mistakes_per_game DOUBLE PRECISION DEFAULT 0.0,
    tactical_opportunities_found INTEGER DEFAULT 0,
    tactical_opportunities_executed INTEGER DEFAULT 0,
    style_vector JSONB DEFAULT '{}'::jsonb, -- 12-dimensional style scores
    UNIQUE(username, platform, analysis_date)
);

-- Create additional indexes for performance
CREATE INDEX IF NOT EXISTS idx_player_metadata_username_platform ON player_metadata(username, platform);
CREATE INDEX IF NOT EXISTS idx_tactical_opportunities_analysis_game ON tactical_opportunities(analysis_id, game_index);
CREATE INDEX IF NOT EXISTS idx_tactical_opportunities_pattern ON tactical_opportunities(pattern_type);
CREATE INDEX IF NOT EXISTS idx_cohort_data_rating_tc ON cohort_data(rating_range, time_control);
CREATE INDEX IF NOT EXISTS idx_training_recommendations_analysis_id ON training_recommendations(analysis_id);
CREATE INDEX IF NOT EXISTS idx_training_recommendations_priority ON training_recommendations(priority DESC);
CREATE INDEX IF NOT EXISTS idx_game_insights_analysis_game ON game_insights(analysis_id, game_index);
CREATE INDEX IF NOT EXISTS idx_game_insights_type ON game_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_performance_tracking_user_date ON performance_tracking(username, platform, analysis_date);

-- Insert default cohort data for common rating ranges
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

-- Create materialized view for fast cohort lookups
CREATE MATERIALIZED VIEW IF NOT EXISTS cohort_percentiles AS
SELECT 
    rating_range,
    time_control,
    platform,
    -- Create percentile functions for each dimension
    aggression_mean, aggression_std,
    tactical_dependency_mean, tactical_dependency_std,
    risk_taking_mean, risk_taking_std,
    positional_orientation_mean, positional_orientation_std,
    exchange_preference_mean, exchange_preference_std,
    opening_variety_mean, opening_variety_std,
    book_deviation_mean, book_deviation_std,
    lead_conversion_mean, lead_conversion_std,
    endgame_technique_mean, endgame_technique_std,
    time_management_mean, time_management_std,
    consistency_mean, consistency_std,
    swindle_resistance_mean, swindle_resistance_std,
    avg_acpl,
    avg_accuracy,
    sample_size
FROM cohort_data;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cohort_percentiles_unique 
ON cohort_percentiles(rating_range, time_control, platform);

-- Refresh function for materialized view
CREATE OR REPLACE FUNCTION refresh_cohort_percentiles()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW cohort_percentiles;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update cohort data timestamp
CREATE OR REPLACE FUNCTION update_cohort_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_cohort_timestamp
    BEFORE UPDATE ON cohort_data
    FOR EACH ROW
    EXECUTE FUNCTION update_cohort_timestamp();

-- Comments for documentation
COMMENT ON TABLE player_metadata IS 'Stores Chess.com player profile information and ratings history';
COMMENT ON TABLE tactical_opportunities IS 'Records all tactical patterns detected during analysis';
COMMENT ON TABLE cohort_data IS 'Statistical data for different rating groups used for percentile calculations';
COMMENT ON TABLE training_recommendations IS 'Personalized training recommendations based on analysis results';
COMMENT ON TABLE game_insights IS 'Detailed insights and learning opportunities from individual games';
COMMENT ON TABLE performance_tracking IS 'Historical performance tracking for progress monitoring';