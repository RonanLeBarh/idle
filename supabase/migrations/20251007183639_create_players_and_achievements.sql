/*
  # Create IdleClick Game Database Schema

  ## Tables Created
  
  ### 1. players
  - `id` (uuid, primary key) - Auto-generated player ID
  - `user_id` (uuid, unique) - Supabase auth user ID
  - `display_name` (text) - Player's chosen nickname
  - `best_score_mantisse` (numeric) - Mantissa of best score
  - `best_score_expo` (integer) - Exponent of best score
  - `current_score_mantisse` (numeric) - Mantissa of current score
  - `current_score_expo` (integer) - Exponent of current score
  - `rate_mantisse` (numeric) - Production rate mantissa
  - `rate_expo` (integer) - Production rate exponent
  - `prestige_level` (integer) - Number of prestiges completed
  - `prestige_points` (numeric) - Accumulated prestige currency
  - `generator_level` (integer) - Generator upgrade level
  - `boost_level` (integer) - Boost upgrade level
  - `click_level` (integer) - Click upgrade level
  - `created_at` (timestamptz) - Account creation timestamp
  - `updated_at` (timestamptz) - Last save timestamp

  ### 2. achievements
  - `id` (uuid, primary key) - Achievement ID
  - `key` (text, unique) - Unique achievement identifier
  - `title` (text) - Achievement name
  - `description` (text) - Achievement description
  - `icon` (text) - Icon/emoji for the achievement
  - `threshold` (numeric) - Required value to unlock
  - `category` (text) - Achievement category (score, clicks, upgrades, etc.)

  ### 3. player_achievements
  - `id` (uuid, primary key) - Record ID
  - `player_id` (uuid) - Reference to players table
  - `achievement_id` (uuid) - Reference to achievements table
  - `unlocked_at` (timestamptz) - When achievement was unlocked
  - Unique constraint on (player_id, achievement_id)

  ## Security
  - Enable RLS on all tables
  - Players can only read/write their own data
  - Achievements are readable by all authenticated users
  - Player achievements are readable by all but only writable by owner

  ## Indexes
  - Index on players.user_id for fast lookups
  - Index on leaderboard queries (best_score_expo DESC, best_score_mantisse DESC)
  - Index on player_achievements for efficient queries
*/

-- Create players table
CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text DEFAULT NULL,
  best_score_mantisse numeric DEFAULT 0,
  best_score_expo integer DEFAULT 0,
  current_score_mantisse numeric DEFAULT 0,
  current_score_expo integer DEFAULT 0,
  rate_mantisse numeric DEFAULT 0,
  rate_expo integer DEFAULT 0,
  prestige_level integer DEFAULT 0,
  prestige_points numeric DEFAULT 0,
  generator_level integer DEFAULT 0,
  boost_level integer DEFAULT 0,
  click_level integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create achievements table
CREATE TABLE IF NOT EXISTS achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  icon text DEFAULT '🏆',
  threshold numeric DEFAULT 0,
  category text DEFAULT 'general'
);

-- Create player_achievements junction table
CREATE TABLE IF NOT EXISTS player_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at timestamptz DEFAULT now(),
  UNIQUE(player_id, achievement_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_players_user_id ON players(user_id);
CREATE INDEX IF NOT EXISTS idx_players_leaderboard ON players(best_score_expo DESC, best_score_mantisse DESC);
CREATE INDEX IF NOT EXISTS idx_player_achievements_player ON player_achievements(player_id);
CREATE INDEX IF NOT EXISTS idx_player_achievements_achievement ON player_achievements(achievement_id);

-- Enable RLS
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_achievements ENABLE ROW LEVEL SECURITY;

-- RLS Policies for players table
CREATE POLICY "Users can view all players for leaderboard"
  ON players FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own player record"
  ON players FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own player record"
  ON players FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own player record"
  ON players FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for achievements table
CREATE POLICY "Anyone can view achievements"
  ON achievements FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policies for player_achievements table
CREATE POLICY "Users can view all player achievements"
  ON player_achievements FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own achievements"
  ON player_achievements FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM players
      WHERE players.id = player_achievements.player_id
      AND players.user_id = auth.uid()
    )
  );

-- Insert default achievements
INSERT INTO achievements (key, title, description, icon, threshold, category) VALUES
  ('first_click', 'Premier Clic', 'Clique pour la première fois', '👆', 1, 'clicks'),
  ('score_100', 'Centenaire', 'Atteins 100 points', '💯', 100, 'score'),
  ('score_1k', 'Millionnaire', 'Atteins 1 000 points', '💰', 1000, 'score'),
  ('score_1m', 'Millionnaire', 'Atteins 1 000 000 points', '💎', 1000000, 'score'),
  ('score_1b', 'Milliardaire', 'Atteins 1 000 000 000 points', '👑', 1000000000, 'score'),
  ('generator_10', 'Industriel', 'Achète 10 générateurs', '⚙️', 10, 'upgrades'),
  ('boost_10', 'Surpuissant', 'Achète 10 boosts', '⚡', 10, 'upgrades'),
  ('first_prestige', 'Renaissance', 'Effectue ton premier prestige', '🔄', 1, 'prestige'),
  ('prestige_10', 'Maître du Temps', 'Effectue 10 prestiges', '⏰', 10, 'prestige')
ON CONFLICT (key) DO NOTHING;
