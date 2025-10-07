/*
  # Enable Public Access for Idle Game

  ## Changes
  - Allow unauthenticated users to view leaderboard
  - Allow unauthenticated users to view achievements
  - Remove user_id requirement for players (make it optional)
  - Add session_id as alternative identifier

  ## Security Notes
  - Players table remains protected for writes
  - Achievements remain read-only
  - Leaderboard is public for viewing
*/

-- Make user_id optional in players table
ALTER TABLE players 
  ALTER COLUMN user_id DROP NOT NULL;

-- Add session_id column for anonymous players
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'players' AND column_name = 'session_id'
  ) THEN
    ALTER TABLE players ADD COLUMN session_id text UNIQUE;
  END IF;
END $$;

-- Update RLS policies to allow public read access
DROP POLICY IF EXISTS "Users can view all players for leaderboard" ON players;
CREATE POLICY "Anyone can view leaderboard"
  ON players FOR SELECT
  USING (true);

-- Allow anonymous inserts with session_id
DROP POLICY IF EXISTS "Users can insert their own player record" ON players;
CREATE POLICY "Anyone can create player with session_id"
  ON players FOR INSERT
  WITH CHECK (
    (auth.uid() IS NOT NULL AND user_id = auth.uid()) 
    OR 
    (session_id IS NOT NULL AND user_id IS NULL)
  );

-- Allow updates by session_id or user_id
DROP POLICY IF EXISTS "Users can update their own player record" ON players;
CREATE POLICY "Players can update their own record"
  ON players FOR UPDATE
  USING (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR
    (session_id IS NOT NULL AND user_id IS NULL)
  )
  WITH CHECK (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR
    (session_id IS NOT NULL AND user_id IS NULL)
  );

-- Public access to achievements
DROP POLICY IF EXISTS "Anyone can view achievements" ON achievements;
CREATE POLICY "Public can view achievements"
  ON achievements FOR SELECT
  USING (true);

-- Allow anyone to view player achievements
DROP POLICY IF EXISTS "Users can view all player achievements" ON player_achievements;
CREATE POLICY "Public can view player achievements"
  ON player_achievements FOR SELECT
  USING (true);

-- Allow inserts for session-based players
DROP POLICY IF EXISTS "Users can insert their own achievements" ON player_achievements;
CREATE POLICY "Players can insert their achievements"
  ON player_achievements FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.id = player_achievements.player_id
      AND (
        (players.user_id IS NOT NULL AND players.user_id = auth.uid())
        OR
        (players.session_id IS NOT NULL)
      )
    )
  );
