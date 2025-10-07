import { supabase } from './supabase.js';

let cachedAchievements = [];

export async function loadAchievements() {
  const { data, error } = await supabase
    .from('achievements')
    .select('*')
    .order('category', { ascending: true });

  if (error) {
    console.error('Failed to load achievements:', error);
    return [];
  }

  cachedAchievements = data || [];
  return cachedAchievements;
}

export async function loadPlayerAchievements(playerId) {
  const { data, error } = await supabase
    .from('player_achievements')
    .select('achievement_id, unlocked_at')
    .eq('player_id', playerId);

  if (error) {
    console.error('Failed to load player achievements:', error);
    return [];
  }

  return data || [];
}

export async function unlockAchievement(playerId, achievementId) {
  const { error } = await supabase
    .from('player_achievements')
    .insert({
      player_id: playerId,
      achievement_id: achievementId
    });

  if (error && error.code !== '23505') {
    console.error('Failed to unlock achievement:', error);
    return false;
  }

  return true;
}

export function checkAchievements(state, unlockedIds) {
  const toUnlock = [];

  cachedAchievements.forEach(achievement => {
    if (unlockedIds.includes(achievement.id)) return;

    let condition = false;
    const scoreValue = state.score.mantisse * Math.pow(10, state.score.exposant);

    switch (achievement.key) {
      case 'first_click':
        condition = scoreValue > 0;
        break;
      case 'score_100':
        condition = scoreValue >= 100;
        break;
      case 'score_1k':
        condition = scoreValue >= 1000;
        break;
      case 'score_1m':
        condition = scoreValue >= 1000000;
        break;
      case 'score_1b':
        condition = scoreValue >= 1000000000;
        break;
      case 'generator_10':
        condition = state.upgrades.generator.level >= 10;
        break;
      case 'boost_10':
        condition = state.upgrades.boost.level >= 10;
        break;
      case 'first_prestige':
        condition = state.prestigeLevel >= 1;
        break;
      case 'prestige_10':
        condition = state.prestigeLevel >= 10;
        break;
    }

    if (condition) {
      toUnlock.push(achievement);
    }
  });

  return toUnlock;
}
