/*
  # Add More Hidden Achievements

  ## Changes
  - Add 15+ new hidden achievements
  - Cover multiple categories: clicks, upgrades, speed, secrets
  - Add is_hidden column to achievements table

  ## New Achievement Categories
  - Click milestones (10, 100, 1000, 10000 clicks)
  - Speed achievements (reach score in time)
  - Upgrade diversity (own multiple different upgrades)
  - Secret achievements (hidden conditions)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'achievements' AND column_name = 'is_hidden'
  ) THEN
    ALTER TABLE achievements ADD COLUMN is_hidden boolean DEFAULT false;
  END IF;
END $$;

INSERT INTO achievements (key, title, description, icon, threshold, category, is_hidden) VALUES
  ('clicks_10', 'Cliqueur Débutant', 'Effectue 10 clics', '👆', 10, 'clicks', false),
  ('clicks_100', 'Cliqueur Confirmé', 'Effectue 100 clics', '✌️', 100, 'clicks', false),
  ('clicks_1000', 'Cliqueur Expert', 'Effectue 1 000 clics', '👏', 1000, 'clicks', false),
  ('clicks_10000', 'Maître Cliqueur', 'Effectue 10 000 clics', '🙌', 10000, 'clicks', false),
  
  ('upgrade_variety_3', 'Diversification', 'Possède au moins 3 types d''améliorations', '🎨', 3, 'upgrades', false),
  ('upgrade_variety_5', 'Collectionneur', 'Possède au moins 5 types d''améliorations', '🎯', 5, 'upgrades', false),
  ('upgrade_variety_8', 'Encyclopédiste', 'Possède au moins 8 types d''améliorations', '📚', 8, 'upgrades', false),
  
  ('multiplier_master', 'Maître des Multiplicateurs', 'Possède tous les multiplicateurs', '✖️', 1, 'upgrades', false),
  ('automation_king', 'Roi de l''Automatisation', 'Possède tous les générateurs automatiques', '🤖', 1, 'upgrades', false),
  
  ('score_1t', 'Trillionaire', 'Atteins 1 000 000 000 000 points', '💰', 1000000000000, 'score', false),
  ('score_1qa', 'Quadrillionaire', 'Atteins 1e15 points', '💎', 1000000000000000, 'score', true),
  
  ('fast_1k', 'Vitesse Éclair', 'Atteins 1 000 points en moins de 2 minutes', '⚡', 1000, 'speed', true),
  ('fast_1m', 'Supersonique', 'Atteins 1 000 000 points en moins de 10 minutes', '🚀', 1000000, 'speed', true),
  
  ('prestige_5', 'Vétéran', 'Effectue 5 prestiges', '🎖️', 5, 'prestige', false),
  ('prestige_25', 'Légende', 'Effectue 25 prestiges', '👑', 25, 'prestige', true),
  ('prestige_50', 'Immortel', 'Effectue 50 prestiges', '🌟', 50, 'prestige', true),
  
  ('secret_patient', 'Patience Infinie', 'Laisse le jeu tourner pendant 1 heure', '⏰', 3600, 'secret', true),
  ('secret_no_click', 'Sans les Mains', 'Atteins 10 000 points sans améliorer le clic', '🙈', 10000, 'secret', true),
  ('secret_clicker_only', 'Puriste du Clic', 'Atteins 1 000 points uniquement en cliquant', '🖱️', 1000, 'secret', true)
ON CONFLICT (key) DO NOTHING;
