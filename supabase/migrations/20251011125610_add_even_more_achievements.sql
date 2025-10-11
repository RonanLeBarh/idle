/*
  # Add Even More Hidden Achievements

  ## New Achievements Added
  - More score milestones
  - Upgrade-specific achievements
  - Combo achievements
  - Secret/hidden achievements

  ## Categories
  - Mega scores (1Qi+)
  - Ultra clicks (100K+)
  - Upgrade mastery
  - Speed runs
  - Combos
*/

INSERT INTO achievements (key, title, description, icon, threshold, category, is_hidden) VALUES
  ('score_1qi', 'Quintillionaire', 'Atteins 1e18 points', '🌌', 1000000000000000000, 'score', true),
  ('score_1sx', 'Sextillionaire', 'Atteins 1e21 points', '🌠', 1000000000000000000000, 'score', true),
  
  ('clicks_100k', 'Légende du Clic', 'Effectue 100 000 clics', '💪', 100000, 'clicks', true),
  ('clicks_1m', 'Dieu du Clic', 'Effectue 1 000 000 clics', '👑', 1000000, 'clicks', true),
  
  ('all_basics', 'Base Solide', 'Possède tous les générateurs de base', '🏗️', 1, 'upgrades', false),
  ('all_advanced', 'Technologie Avancée', 'Possède tous les générateurs avancés', '🚀', 1, 'upgrades', true),
  ('mega_clicker', 'Méga-Cliqueur', 'Atteins niveau 50 en Puissance de Clic', '🔥', 50, 'upgrades', false),
  ('factory_master', 'Maître Industriel', 'Atteins niveau 100 en Usine', '🏭', 100, 'upgrades', true),
  
  ('prestige_100', 'Éternel', 'Effectue 100 prestiges', '♾️', 100, 'prestige', true),
  ('prestige_speed', 'Flash Prestige', 'Effectue 3 prestiges en moins de 30 minutes', '⚡', 3, 'speed', true),
  
  ('combo_diversity', 'Arc-en-ciel', 'Possède au moins 15 types d''améliorations', '🌈', 15, 'combo', true),
  ('combo_balanced', 'Équilibre Parfait', 'Possède 10+ niveaux dans 5 améliorations différentes', '⚖️', 5, 'combo', true),
  ('combo_specialist', 'Spécialiste', 'Atteins niveau 100 dans une amélioration', '🎯', 100, 'combo', false),
  
  ('secret_idle', 'Maître du Idle', 'Atteins 1M sans cliquer pendant 5 minutes', '😴', 1000000, 'secret', true),
  ('secret_active', 'Hyperactif', 'Fais 1000 clics en moins de 1 minute', '🏃', 1000, 'secret', true),
  ('secret_balanced_play', 'Équilibriste', 'Atteins 100K avec 50% clics et 50% auto', '🎭', 100000, 'secret', true),
  ('secret_rich', 'Collectionneur', 'Possède tous les types d''améliorations', '💎', 1, 'secret', true),
  ('secret_minimalist', 'Minimaliste', 'Atteins 1M avec moins de 5 types d''améliorations', '🎨', 1000000, 'secret', true),
  ('secret_first_hour', 'Démarrage Rapide', 'Atteins 10K dans la première heure', '🌅', 10000, 'secret', true),
  ('secret_persistent', 'Persistant', 'Joue pendant 10 heures au total', '⏳', 36000, 'secret', true)
ON CONFLICT (key) DO NOTHING;
