-- Fix data type mismatches between PostgreSQL schema and JPA entities
-- Change INTEGER columns to BIGINT for Long types in JPA

-- Record this migration (only if not already exists)
INSERT INTO migration_history (version, description, success) 
SELECT '002', 'Fix data type mismatches: INTEGER to BIGINT for ID columns', FALSE
WHERE NOT EXISTS (SELECT 1 FROM migration_history WHERE version = '002');

BEGIN;

-- Disable foreign key checks temporarily
ALTER TABLE analyses DROP CONSTRAINT IF EXISTS analyses_player_id_fkey;
ALTER TABLE game_analyses DROP CONSTRAINT IF EXISTS game_analyses_analysis_id_fkey;
ALTER TABLE game_analyses DROP CONSTRAINT IF EXISTS game_analyses_game_id_fkey;
ALTER TABLE improvement_plans DROP CONSTRAINT IF EXISTS improvement_plans_analysis_id_fkey;
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_player_id_fkey;

-- Change players.id from INTEGER to BIGINT
ALTER TABLE players ALTER COLUMN id TYPE BIGINT USING id::bigint;

-- Change analyses.id and analyses.player_id from INTEGER to BIGINT  
ALTER TABLE analyses ALTER COLUMN id TYPE BIGINT USING id::bigint;
ALTER TABLE analyses ALTER COLUMN player_id TYPE BIGINT USING player_id::bigint;

-- Change games.id and games.player_id from INTEGER to BIGINT
ALTER TABLE games ALTER COLUMN id TYPE BIGINT USING id::bigint;
ALTER TABLE games ALTER COLUMN player_id TYPE BIGINT USING player_id::bigint;

-- Change game_analyses.id, game_analyses.analysis_id, game_analyses.game_id from INTEGER to BIGINT
ALTER TABLE game_analyses ALTER COLUMN id TYPE BIGINT USING id::bigint;
ALTER TABLE game_analyses ALTER COLUMN analysis_id TYPE BIGINT USING analysis_id::bigint; 
ALTER TABLE game_analyses ALTER COLUMN game_id TYPE BIGINT USING game_id::bigint;

-- Change improvement_plans.id and improvement_plans.analysis_id from INTEGER to BIGINT
ALTER TABLE improvement_plans ALTER COLUMN id TYPE BIGINT USING id::bigint;
ALTER TABLE improvement_plans ALTER COLUMN analysis_id TYPE BIGINT USING analysis_id::bigint;

-- Change cohort_baselines.id from INTEGER to BIGINT
ALTER TABLE cohort_baselines ALTER COLUMN id TYPE BIGINT USING id::bigint;

-- Re-add foreign key constraints
ALTER TABLE analyses ADD CONSTRAINT analyses_player_id_fkey 
  FOREIGN KEY (player_id) REFERENCES players(id);
  
ALTER TABLE game_analyses ADD CONSTRAINT game_analyses_analysis_id_fkey 
  FOREIGN KEY (analysis_id) REFERENCES analyses(id);
  
ALTER TABLE game_analyses ADD CONSTRAINT game_analyses_game_id_fkey 
  FOREIGN KEY (game_id) REFERENCES games(id);
  
ALTER TABLE improvement_plans ADD CONSTRAINT improvement_plans_analysis_id_fkey 
  FOREIGN KEY (analysis_id) REFERENCES analyses(id);
  
ALTER TABLE games ADD CONSTRAINT games_player_id_fkey 
  FOREIGN KEY (player_id) REFERENCES players(id);

COMMIT;

-- Update migration record
UPDATE migration_history SET success = TRUE WHERE version = '002';