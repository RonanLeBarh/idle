import { toScientificParts, normalizeSci } from './utils.js';

export const GAME_VERSION = 1.2;
const SAVE_KEY = `idleclick-save-v${GAME_VERSION}`;

export const upgradeDefinitions = {
  clickPower: {
    title: "Puissance de Clic",
    desc: "Augmente le gain par clic",
    baseCost: 10,
    costMult: 1.15,
    baseValue: 1,
    unlockAt: { type: 'start' },
    category: 'click'
  },
  autoClicker: {
    title: "Auto-Clicker",
    desc: "Clique automatiquement",
    baseCost: 100,
    costMult: 1.2,
    baseValue: 0.5,
    unlockAt: { type: 'score', value: 50 },
    category: 'auto'
  },
  factory: {
    title: "Usine",
    desc: "Production passive",
    baseCost: 500,
    costMult: 1.18,
    baseValue: 2,
    unlockAt: { type: 'score', value: 200 },
    category: 'auto'
  },
  laboratory: {
    title: "Laboratoire",
    desc: "Recherche avancée",
    baseCost: 2500,
    costMult: 1.22,
    baseValue: 10,
    unlockAt: { type: 'score', value: 1000 },
    category: 'auto'
  },
  quantumCore: {
    title: "Coeur Quantique",
    desc: "Technologie quantique",
    baseCost: 15000,
    costMult: 1.25,
    baseValue: 50,
    unlockAt: { type: 'score', value: 5000 },
    category: 'auto'
  },
  timeMachine: {
    title: "Machine Temporelle",
    desc: "Manipulation du temps",
    baseCost: 100000,
    costMult: 1.28,
    baseValue: 250,
    unlockAt: { type: 'score', value: 50000 },
    category: 'auto'
  },
  dimensionalRift: {
    title: "Faille Dimensionnelle",
    desc: "Énergie interdimensionnelle",
    baseCost: 1000000,
    costMult: 1.3,
    baseValue: 1500,
    unlockAt: { type: 'score', value: 500000 },
    category: 'auto'
  },
  clickMultiplier: {
    title: "Multiplicateur de Clic",
    desc: "Double le gain de clic",
    baseCost: 200,
    costMult: 2.0,
    baseValue: 2,
    unlockAt: { type: 'upgrade', upgrade: 'clickPower', level: 5 },
    category: 'multiplier'
  },
  autoMultiplier: {
    title: "Multiplicateur Auto",
    desc: "Double la production auto",
    baseCost: 5000,
    costMult: 2.5,
    baseValue: 2,
    unlockAt: { type: 'upgrade', upgrade: 'factory', level: 10 },
    category: 'multiplier'
  },
  globalMultiplier: {
    title: "Multiplicateur Global",
    desc: "Double toute la production",
    baseCost: 50000,
    costMult: 3.0,
    baseValue: 2,
    unlockAt: { type: 'prestige', level: 1 },
    category: 'multiplier'
  },
  supercharger: {
    title: "Surcharge",
    desc: "Boost exponentiel temporaire",
    baseCost: 250000,
    costMult: 3.5,
    baseValue: 1.5,
    unlockAt: { type: 'prestige', level: 3 },
    category: 'multiplier'
  }
};

export const defaultState = {
  score: { mantisse: 0, exposant: 0 },
  totalEarned: { mantisse: 0, exposant: 0 },
  totalClicks: 0,
  ratePerSec: { mantisse: 0, exposant: 0 },
  prestigeLevel: 0,
  prestigePoints: 0,
  upgrades: {},
  displayName: null,
  achievements: []
};

Object.keys(upgradeDefinitions).forEach(key => {
  defaultState.upgrades[key] = { level: 0 };
});

export function upgradeCost(upgradeKey, level) {
  const def = upgradeDefinitions[upgradeKey];
  return Math.floor(def.baseCost * Math.pow(def.costMult, level));
}

export function isUpgradeUnlocked(state, upgradeKey) {
  const def = upgradeDefinitions[upgradeKey];
  const unlock = def.unlockAt;

  if (unlock.type === 'start') return true;

  if (unlock.type === 'score') {
    const currentScore = state.score.mantisse * Math.pow(10, state.score.exposant);
    return currentScore >= unlock.value;
  }

  if (unlock.type === 'upgrade') {
    const requiredUpgrade = state.upgrades[unlock.upgrade];
    return requiredUpgrade && requiredUpgrade.level >= unlock.level;
  }

  if (unlock.type === 'prestige') {
    return state.prestigeLevel >= unlock.level;
  }

  return false;
}

export function computeRatePerSec(state) {
  let total = 0;
  const prestigeMult = 1 + (state.prestigeLevel * 0.5);

  Object.keys(upgradeDefinitions).forEach(key => {
    const def = upgradeDefinitions[key];
    const upgrade = state.upgrades[key];

    if (def.category === 'auto' && upgrade.level > 0) {
      total += upgrade.level * def.baseValue;
    }
  });

  let clickMult = 1;
  let autoMult = 1;
  let globalMult = 1;
  let superchargeMult = 1;

  Object.keys(upgradeDefinitions).forEach(key => {
    const def = upgradeDefinitions[key];
    const upgrade = state.upgrades[key];

    if (def.category === 'multiplier' && upgrade.level > 0) {
      const mult = Math.pow(def.baseValue, upgrade.level);

      if (key === 'autoMultiplier') autoMult *= mult;
      else if (key === 'globalMultiplier') globalMult *= mult;
      else if (key === 'supercharger') superchargeMult *= mult;
    }
  });

  total = total * autoMult * globalMult * superchargeMult * prestigeMult;

  return normalizeSci(toScientificParts(total));
}

export function computeClickGain(state) {
  let total = 1;
  const prestigeMult = 1 + (state.prestigeLevel * 0.5);

  Object.keys(upgradeDefinitions).forEach(key => {
    const def = upgradeDefinitions[key];
    const upgrade = state.upgrades[key];

    if (def.category === 'click' && upgrade.level > 0) {
      total += upgrade.level * def.baseValue;
    }
  });

  let clickMult = 1;
  let globalMult = 1;
  let superchargeMult = 1;

  Object.keys(upgradeDefinitions).forEach(key => {
    const def = upgradeDefinitions[key];
    const upgrade = state.upgrades[key];

    if (def.category === 'multiplier' && upgrade.level > 0) {
      const mult = Math.pow(def.baseValue, upgrade.level);

      if (key === 'clickMultiplier') clickMult *= mult;
      else if (key === 'globalMultiplier') globalMult *= mult;
      else if (key === 'supercharger') superchargeMult *= mult;
    }
  });

  total = total * clickMult * globalMult * superchargeMult * prestigeMult;

  return normalizeSci(toScientificParts(total));
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
    if (!raw) return null;

    const loaded = JSON.parse(raw);

    Object.keys(upgradeDefinitions).forEach(key => {
      if (!loaded.upgrades[key]) {
        loaded.upgrades[key] = { level: 0 };
      }
    });

    if (!loaded.totalClicks) loaded.totalClicks = 0;

    return loaded;
  } catch {
    return null;
  }
}

export function resetLocal() {
  localStorage.removeItem(SAVE_KEY);
}
