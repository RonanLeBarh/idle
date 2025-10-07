import { toScientificParts, normalizeSci } from './utils.js';

export const GAME_VERSION = 1.1;
const SAVE_KEY = `idleclick-save-v${GAME_VERSION}`;

export const defaultState = {
  score: { mantisse: 0, exposant: 0 },
  totalEarned: { mantisse: 0, exposant: 0 },
  ratePerSec: { mantisse: 0, exposant: 0 },
  prestigeLevel: 0,
  prestigePoints: 0,
  upgrades: {
    generator: { level: 0, baseCost: 10, costMult: 1.15, baseRate: 0.2 },
    boost: { level: 0, baseCost: 50, costMult: 1.25, multiplierPerLevel: 1.5 },
    click: { level: 0, baseCost: 20, costMult: 1.18, clickGain: 1 }
  },
  displayName: null,
  achievements: []
};

export function upgradeCost(u) {
  return Math.floor(u.baseCost * Math.pow(u.costMult, u.level));
}

export function computeRatePerSec(state) {
  const gen = state.upgrades.generator;
  const boost = state.upgrades.boost;
  const prestigeMult = 1 + (state.prestigeLevel * 0.5);
  const mult = Math.pow(boost.multiplierPerLevel, boost.level) || 1;
  return normalizeSci(toScientificParts(gen.level * gen.baseRate * mult * prestigeMult));
}

export function computeClickGain(state) {
  const c = state.upgrades.click;
  const boost = state.upgrades.boost;
  const prestigeMult = 1 + (state.prestigeLevel * 0.5);
  const mult = Math.pow(boost.multiplierPerLevel, boost.level) || 1;
  return normalizeSci(toScientificParts((1 + c.level * c.clickGain) * mult * prestigeMult));
}

export function canPrestige(state) {
  return state.score.exposant >= 9 || (state.score.exposant === 8 && state.score.mantisse >= 10);
}

export function calculatePrestigeGain(state) {
  if (!canPrestige(state)) return 0;
  const scoreValue = state.score.mantisse * Math.pow(10, state.score.exposant);
  return Math.floor(Math.sqrt(scoreValue / 1e9));
}

export function saveLocal(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save locally:', err);
  }
}

export function loadLocal() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function resetLocal() {
  localStorage.removeItem(SAVE_KEY);
}
