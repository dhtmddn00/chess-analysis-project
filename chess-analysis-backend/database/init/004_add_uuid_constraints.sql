-- Add missing foreign key constraints for UUID columns

-- Record this migration
INSERT INTO migration_history (version, description, success) 
SELECT '004', 'Add foreign key constraints for UUID columns', FALSE
WHERE NOT EXISTS (SELECT 1 FROM migration_history WHERE version = '004');

BEGIN;

-- Add foreign key constraints for UUID references
ALTER TABLE game_analyses ADD CONSTRAINT game_analyses_analysis_id_fkey 
  FOREIGN KEY (analysis_id) REFERENCES analyses(id);

ALTER TABLE improvement_plans ADD CONSTRAINT improvement_plans_analysis_id_fkey 
  FOREIGN KEY (analysis_id) REFERENCES analyses(id);

COMMIT;

-- Update migration record
UPDATE migration_history SET success = TRUE WHERE version = '004';