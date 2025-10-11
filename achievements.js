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
      case 'score_1t':
        condition = scoreValue >= 1000000000000;
        break;
      case 'score_1qa':
        condition = scoreValue >= 1e15;
        break;
      case 'generator_10':
        condition = state.upgrades.generator?.level >= 10;
        break;
      case 'boost_10':
        condition = state.upgrades.boost?.level >= 10;
        break;
      case 'first_prestige':
        condition = state.prestigeLevel >= 1;
        break;
      case 'prestige_5':
        condition = state.prestigeLevel >= 5;
        break;
      case 'prestige_10':
        condition = state.prestigeLevel >= 10;
        break;
      case 'prestige_25':
        condition = state.prestigeLevel >= 25;
        break;
      case 'prestige_50':
        condition = state.prestigeLevel >= 50;
        break;
      case 'clicks_10':
        condition = (state.totalClicks || 0) >= 10;
        break;
      case 'clicks_100':
        condition = (state.totalClicks || 0) >= 100;
        break;
      case 'clicks_1000':
        condition = (state.totalClicks || 0) >= 1000;
        break;
      case 'clicks_10000':
        condition = (state.totalClicks || 0) >= 10000;
        break;
      case 'upgrade_variety_3':
        condition = Object.values(state.upgrades).filter(u => u.level > 0).length >= 3;
        break;
      case 'upgrade_variety_5':
        condition = Object.values(state.upgrades).filter(u => u.level > 0).length >= 5;
        break;
      case 'upgrade_variety_8':
        condition = Object.values(state.upgrades).filter(u => u.level > 0).length >= 8;
        break;
      case 'multiplier_master':
        condition = ['clickMultiplier', 'autoMultiplier', 'globalMultiplier'].every(k => state.upgrades[k]?.level > 0);
        break;
      case 'automation_king':
        condition = ['autoClicker', 'factory', 'laboratory', 'quantumCore', 'timeMachine', 'dimensionalRift'].every(k => state.upgrades[k]?.level > 0);
        break;
      case 'score_1qi':
        condition = scoreValue >= 1e18;
        break;
      case 'score_1sx':
        condition = scoreValue >= 1e21;
        break;
      case 'clicks_100k':
        condition = (state.totalClicks || 0) >= 100000;
        break;
      case 'clicks_1m':
        condition = (state.totalClicks || 0) >= 1000000;
        break;
      case 'all_basics':
        condition = ['clickPower', 'autoClicker', 'factory'].every(k => state.upgrades[k]?.level > 0);
        break;
      case 'all_advanced':
        condition = ['laboratory', 'quantumCore', 'timeMachine', 'dimensionalRift', 'antimatterReactor', 'neuralNetwork'].every(k => state.upgrades[k]?.level > 0);
        break;
      case 'mega_clicker':
        condition = state.upgrades.clickPower?.level >= 50;
        break;
      case 'factory_master':
        condition = state.upgrades.factory?.level >= 100;
        break;
      case 'prestige_100':
        condition = state.prestigeLevel >= 100;
        break;
      case 'combo_diversity':
        condition = Object.values(state.upgrades).filter(u => u.level > 0).length >= 15;
        break;
      case 'combo_balanced':
        condition = Object.values(state.upgrades).filter(u => u.level >= 10).length >= 5;
        break;
      case 'combo_specialist':
        condition = Object.values(state.upgrades).some(u => u.level >= 100);
        break;
      case 'secret_rich':
        condition = Object.values(state.upgrades).filter(u => u.level > 0).length >= Object.keys(state.upgrades).length - 2;
        break;
      case 'secret_minimalist':
        condition = scoreValue >= 1000000 && Object.values(state.upgrades).filter(u => u.level > 0).length < 5;
        break;
    }

    if (condition) {
      toUnlock.push(achievement);
    }
  });

  return toUnlock;
}
