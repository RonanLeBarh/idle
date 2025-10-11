/*
  # Fix Duplicate Player Records

  ## Solution
  - Add unique constraint on user_id
  - Clean up existing duplicates
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'players_user_id_unique'
  ) THEN
    CREATE UNIQUE INDEX players_user_id_unique ON players(user_id) WHERE user_id IS NOT NULL;
  END IF;
END $$;
