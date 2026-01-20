-- Sample data for development and testing

-- Insert sample cohort baselines for different rating ranges
INSERT INTO cohort_baselines (
    platform, time_control, rating_min, rating_max, sample_size,
    acpl_mean, acpl_std, blunder_rate_mean, blunder_rate_std, mistake_rate_mean, mistake_rate_std,
    acpl_percentiles, blunder_rate_percentiles, mistake_rate_percentiles, style_distributions
) VALUES 
-- Beginner level (800-1200)
('chess.com', 'blitz', 800, 1200, 10000, 
 120.5, 25.0, 8.5, 2.1, 15.2, 3.5,
 '{"p25": 105, "p50": 118, "p75": 135, "p90": 155, "p95": 175}',
 '{"p25": 7.2, "p50": 8.3, "p75": 9.8, "p90": 11.5, "p95": 13.2}',
 '{"p25": 12.8, "p50": 15.0, "p75": 17.5, "p90": 20.2, "p95": 22.8}',
 '{"aggression": 0.45, "positional": 0.35, "tactical": 0.6, "endgame": 0.25}'
),

-- Intermediate level (1200-1600)
('chess.com', 'blitz', 1200, 1600, 15000,
 85.2, 18.5, 5.8, 1.5, 11.3, 2.8,
 '{"p25": 72, "p50": 83, "p75": 96, "p90": 112, "p95": 125}',
 '{"p25": 4.8, "p50": 5.6, "p75": 6.8, "p90": 8.2, "p95": 9.5}',
 '{"p25": 9.2, "p50": 11.0, "p75": 13.2, "p90": 15.8, "p95": 17.9}',
 '{"aggression": 0.52, "positional": 0.48, "tactical": 0.72, "endgame": 0.38}'
),

-- Advanced level (1600-2000)
('chess.com', 'blitz', 1600, 2000, 12000,
 62.8, 14.2, 3.5, 1.1, 7.8, 2.1,
 '{"p25": 53, "p50": 61, "p75": 71, "p90": 82, "p95": 92}',
 '{"p25": 2.8, "p50": 3.4, "p75": 4.2, "p90": 5.1, "p95": 6.0}',
 '{"p25": 6.2, "p50": 7.5, "p75": 9.1, "p90": 11.0, "p95": 12.8}',
 '{"aggression": 0.58, "positional": 0.65, "tactical": 0.82, "endgame": 0.55}'
),

-- Expert level (2000+)
('chess.com', 'blitz', 2000, 2400, 5000,
 45.3, 10.8, 2.1, 0.8, 4.9, 1.5,
 '{"p25": 38, "p50": 44, "p75": 51, "p90": 58, "p95": 65}',
 '{"p25": 1.5, "p50": 2.0, "p75": 2.6, "p90": 3.2, "p95": 3.8}',
 '{"p25": 3.8, "p50": 4.7, "p75": 5.8, "p90": 6.9, "p95": 8.1}',
 '{"aggression": 0.62, "positional": 0.78, "tactical": 0.88, "endgame": 0.72}'
),

-- Rapid time control baselines
('chess.com', 'rapid', 1200, 1600, 8000,
 75.5, 16.2, 4.8, 1.3, 9.2, 2.4,
 '{"p25": 64, "p50": 74, "p75": 85, "p90": 98, "p95": 108}',
 '{"p25": 3.9, "p50": 4.6, "p75": 5.5, "p90": 6.8, "p95": 7.9}',
 '{"p25": 7.5, "p50": 8.9, "p75": 10.6, "p90": 12.8, "p95": 14.5}',
 '{"aggression": 0.48, "positional": 0.55, "tactical": 0.75, "endgame": 0.42}'
);

-- Insert migration record for sample data
INSERT INTO migration_history (version, description, executed_at, success) 
VALUES ('002', 'Sample cohort baseline data for development', CURRENT_TIMESTAMP, TRUE)
ON CONFLICT (version) DO NOTHING;