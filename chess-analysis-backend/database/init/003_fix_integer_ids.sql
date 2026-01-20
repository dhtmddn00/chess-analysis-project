-- Fix data type mismatches: Change only INTEGER ID columns to BIGINT for Long types in JPA
-- UUID columns are already correct

-- Record this migration (only if not already exists)
INSERT INTO migration_history (version, description, success) 
SELECT '003', 'Fix INTEGER ID columns to BIGINT for JPA Long types', FALSE
WHERE NOT EXISTS (SELECT 1 FROM migration_history WHERE version = '003');

BEGIN;

-- Disable foreign key checks temporarily
ALTER TABLE analyses DROP CONSTRAINT IF EXISTS analyses_player_id_fkey;
ALTER TABLE game_analyses DROP CONSTRAINT IF EXISTS game_analyses_analysis_id_fkey;
ALTER TABLE game_analyses DROP CONSTRAINT IF EXISTS game_analyses_game_id_fkey;
ALTER TABLE improvement_plans DROP CONSTRAINT IF EXISTS improvement_plans_analysis_id_fkey;
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_player_id_fkey;

-- Change INTEGER ID columns to BIGINT
-- players.id: INTEGER -> BIGINT
ALTER TABLE players ALTER COLUMN id TYPE BIGINT USING id::bigint;

-- analyses.player_id: INTEGER -> BIGINT (analyses.id is already UUID)
ALTER TABLE analyses ALTER COLUMN player_id TYPE BIGINT USING player_id::bigint;

-- games.id and games.player_id: INTEGER -> BIGINT
ALTER TABLE games ALTER COLUMN id TYPE BIGINT USING id::bigint;
ALTER TABLE games ALTER COLUMN player_id TYPE BIGINT USING player_id::bigint;

-- game_analyses.id and game_analyses.game_id: INTEGER -> BIGINT 
-- (analysis_id should reference analyses.id which is UUID, but currently it's INTEGER)
ALTER TABLE game_analyses ALTER COLUMN id TYPE BIGINT USING id::bigint;
ALTER TABLE game_analyses ALTER COLUMN game_id TYPE BIGINT USING game_id::bigint;
-- Note: game_analyses.analysis_id should be UUID to match analyses.id, but let's first fix INTEGER columns

-- improvement_plans.id: INTEGER -> BIGINT 
-- (analysis_id should reference analyses.id which is UUID, but currently it's INTEGER)
ALTER TABLE improvement_plans ALTER COLUMN id TYPE BIGINT USING id::bigint;
-- Note: improvement_plans.analysis_id should be UUID to match analyses.id, but let's first fix INTEGER columns

-- cohort_baselines.id: INTEGER -> BIGINT
ALTER TABLE cohort_baselines ALTER COLUMN id TYPE BIGINT USING id::bigint;

-- Re-add foreign key constraints for BIGINT columns only
-- Skip constraints involving UUID for now
ALTER TABLE games ADD CONSTRAINT games_player_id_fkey 
  FOREIGN KEY (player_id) REFERENCES players(id);

ALTER TABLE analyses ADD CONSTRAINT analyses_player_id_fkey 
  FOREIGN KEY (player_id) REFERENCES players(id);

-- We'll need to fix UUID reference issues in a separate migration
-- ALTER TABLE game_analyses ADD CONSTRAINT game_analyses_analysis_id_fkey 
--   FOREIGN KEY (analysis_id) REFERENCES analyses(id);
  
ALTER TABLE game_analyses ADD CONSTRAINT game_analyses_game_id_fkey 
  FOREIGN KEY (game_id) REFERENCES games(id);
  
-- ALTER TABLE improvement_plans ADD CONSTRAINT improvement_plans_analysis_id_fkey 
--   FOREIGN KEY (analysis_id) REFERENCES analyses(id);

COMMIT;

-- Update migration record
UPDATE migration_history SET success = TRUE WHERE version = '003';