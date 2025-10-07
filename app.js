import { supabase } from './supabase.js';
import {
  toScientificParts,
  fromScientificParts,
  normalizeSci,
  addSci,
  subSci,
  compareSci,
  formatSci,
  sanitizeName
} from './utils.js';
import {
  defaultState,
  upgradeCost,
  computeRatePerSec,
  computeClickGain,
  canPrestige,
  calculatePrestigeGain,
  saveLocal,
  loadLocal
} from './gameState.js';
import {
  loadAchievements,
  loadPlayerAchievements,
  unlockAchievement,
  checkAchievements
} from './achievements.js';

const els = {
  scoreValue: document.getElementById("scoreValue"),
  rateValue: document.getElementById("rateValue"),
  clickBtn: document.getElementById("clickBtn"),
  saveCloudBtn: document.getElementById("saveCloudBtn"),
  resetBtn: document.getElementById("resetBtn"),
  prestigeBtn: document.getElementById("prestigeBtn"),
  shopList: document.getElementById("shopList"),
  leaderboardList: document.getElementById("leaderboardList"),
  displayNameInput: document.getElementById("displayNameInput"),
  saveNameBtn: document.getElementById("saveNameBtn"),
  achievementsList: document.getElementById("achievementsList"),
  prestigeLevel: document.getElementById("prestigeLevel"),
  prestigePoints: document.getElementById("prestigePoints"),
  debug: document.getElementById("debug")
};

function debugLog(...args) {
  console.log(...args);
  if (els.debug) {
    els.debug.textContent += args.join(" ") + "\n";
  }
}

let state = loadLocal() || structuredClone(defaultState);
let userId = null;
let playerId = null;
let unlockedAchievementIds = [];
let allAchievements = [];

function render() {
  els.scoreValue.textContent = formatSci(state.score);
  els.rateValue.textContent = formatSci(state.ratePerSec) + " / sec";

  if (els.prestigeLevel) {
    els.prestigeLevel.textContent = state.prestigeLevel;
  }
  if (els.prestigePoints) {
    els.prestigePoints.textContent = state.prestigePoints;
  }

  renderShop();
  updatePrestigeButton();
}

function renderShop() {
  const items = [
    { key: "generator", title: "Générateur", desc: "Produit passivement." },
    { key: "boost", title: "Boost", desc: "Multiplie la production." },
    { key: "click", title: "Clic+", desc: "Augmente le gain par clic." }
  ];

  els.shopList.innerHTML = "";

  items.forEach(item => {
    const u = state.upgrades[item.key];
    const costNow = upgradeCost(u);
    const costSci = normalizeSci(toScientificParts(costNow));
    const currentScore = normalizeSci(state.score);

    const wrapper = document.createElement("div");
    wrapper.className = "shop-item";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.innerHTML = `<div class="title">${item.title} — Niveau ${u.level}</div>
                      <div class="desc">${item.desc}</div>`;

    const buy = document.createElement("div");
    buy.className = "buy";

    const costEl = document.createElement("div");
    costEl.className = "desc";
    costEl.textContent = `Coût: ${formatSci(costSci)}`;
    costEl.style.color = compareSci(currentScore, costSci) < 0 ? "#ff6b6b" : "var(--muted)";

    const btn = document.createElement("button");
    btn.className = "btn primary";
    btn.textContent = "Acheter";
    btn.disabled = compareSci(currentScore, costSci) < 0;

    btn.addEventListener("click", () => {
      if (compareSci(normalizeSci(state.score), costSci) >= 0) {
        state.score = subSci(state.score, costSci);
        u.level++;
        state.ratePerSec = computeRatePerSec(state);
        saveLocal(state);
        scheduleCloudSave();
        checkAndUnlockAchievements();
        render();
      }
    });

    buy.appendChild(costEl);
    buy.appendChild(btn);
    wrapper.appendChild(meta);
    wrapper.appendChild(buy);
    els.shopList.appendChild(wrapper);
  });
}

function updateShopState() {
  const items = els.shopList.querySelectorAll(".shop-item");
  const keys = ["generator", "boost", "click"];
  const currentScore = normalizeSci(state.score);

  items.forEach((itemEl, idx) => {
    const u = state.upgrades[keys[idx]];
    const costNow = upgradeCost(u);
    const costSci = normalizeSci(toScientificParts(costNow));

    const costEl = itemEl.querySelector(".desc");
    const btn = itemEl.querySelector("button");

    costEl.textContent = `Coût: ${formatSci(costSci)}`;
    costEl.style.color = compareSci(currentScore, costSci) < 0 ? "#ff6b6b" : "var(--muted)";
    btn.disabled = compareSci(currentScore, costSci) < 0;
  });
}

function updatePrestigeButton() {
  if (!els.prestigeBtn) return;

  const canDo = canPrestige(state);
  const gain = calculatePrestigeGain(state);

  els.prestigeBtn.disabled = !canDo;

  if (canDo) {
    els.prestigeBtn.innerHTML = `Prestige<br><span style="font-size:12px">+${gain} points</span>`;
  } else {
    els.prestigeBtn.innerHTML = `Prestige<br><span style="font-size:12px">Requis: 1B</span>`;
  }
}

let lastTs = performance.now();

function tick(now) {
  const dt = (now - lastTs) / 1000;
  lastTs = now;

  const gain = normalizeSci(toScientificParts(fromScientificParts(state.ratePerSec.mantisse, state.ratePerSec.exposant) * dt));
  if (compareSci(gain, { mantisse: 0, exposant: 0 }) > 0) {
    state.score = addSci(state.score, gain);
    state.totalEarned = addSci(state.totalEarned, gain);
    els.scoreValue.textContent = formatSci(state.score);
    updateShopState();
    updatePrestigeButton();
  }

  requestAnimationFrame(tick);
}

els.clickBtn.addEventListener("click", () => {
  const add = computeClickGain(state);
  state.score = addSci(state.score, add);
  state.totalEarned = addSci(state.totalEarned, add);

  els.clickBtn.classList.add('pulse');
  setTimeout(() => els.clickBtn.classList.remove('pulse'), 100);

  saveLocal(state);
  scheduleCloudSave();
  checkAndUnlockAchievements();
  render();
});

els.resetBtn.addEventListener("click", async () => {
  if (!confirm("Réinitialiser ta progression locale et cloud ?")) return;
  state = structuredClone(defaultState);
  saveLocal(state);
  await resetCloud();
  render();
});

els.saveCloudBtn.addEventListener("click", () => {
  manualCloudSave();
});

els.saveNameBtn.addEventListener("click", async () => {
  const name = sanitizeName(els.displayNameInput.value);
  state.displayName = name || null;
  saveLocal(state);

  if (userId && playerId) {
    await cloudUpsert();
  }

  alert("Pseudo enregistré.");
});

if (els.prestigeBtn) {
  els.prestigeBtn.addEventListener("click", async () => {
    if (!canPrestige(state)) return;

    const gain = calculatePrestigeGain(state);

    if (!confirm(`Prestige: Réinitialiser la progression pour gagner ${gain} points de prestige?\n\nLes points de prestige augmentent ta production de 50% par niveau.`)) {
      return;
    }

    state.prestigeLevel++;
    state.prestigePoints += gain;
    state.score = { mantisse: 0, exposant: 0 };
    state.totalEarned = { mantisse: 0, exposant: 0 };
    state.upgrades.generator.level = 0;
    state.upgrades.boost.level = 0;
    state.upgrades.click.level = 0;
    state.ratePerSec = computeRatePerSec(state);

    saveLocal(state);
    await cloudUpsert();
    checkAndUnlockAchievements();
    render();

    showNotification(`🔄 Prestige réussi ! +${gain} points`);
  });
}

let saveTimer = null;

function scheduleCloudSave() {
  if (!userId) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    cloudUpsert();
  }, 2000);
}

async function manualCloudSave() {
  if (!userId) {
    alert("Cloud non connecté. La sauvegarde locale fonctionne.");
    return;
  }

  try {
    await cloudUpsert();
    alert("Sauvegarde Cloud effectuée !");
  } catch (err) {
    console.error("Erreur lors de la sauvegarde cloud:", err);
    alert("Impossible de sauvegarder dans le cloud.");
  }
}

async function cloudUpsert() {
  if (!userId || !playerId) return;

  const payload = {
    display_name: state.displayName || null,
    best_score_mantisse: state.score.mantisse,
    best_score_expo: state.score.exposant,
    current_score_mantisse: state.score.mantisse,
    current_score_expo: state.score.exposant,
    rate_mantisse: state.ratePerSec.mantisse,
    rate_expo: state.ratePerSec.exposant,
    prestige_level: state.prestigeLevel,
    prestige_points: state.prestigePoints,
    generator_level: state.upgrades.generator.level,
    boost_level: state.upgrades.boost.level,
    click_level: state.upgrades.click.level,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('players')
    .update(payload)
    .eq('id', playerId);

  if (error) {
    console.error('Failed to save to cloud:', error);
  }
}

async function resetCloud() {
  if (!userId || !playerId) return;

  const { error } = await supabase
    .from('players')
    .update({
      best_score_mantisse: 0,
      best_score_expo: 0,
      current_score_mantisse: 0,
      current_score_expo: 0,
      rate_mantisse: 0,
      rate_expo: 0,
      prestige_level: 0,
      prestige_points: 0,
      generator_level: 0,
      boost_level: 0,
      click_level: 0,
      updated_at: new Date().toISOString()
    })
    .eq('id', playerId);

  if (error) {
    console.error('Failed to reset cloud:', error);
  }
}

function initLeaderboard() {
  const channel = supabase
    .channel('leaderboard')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'players' },
      () => {
        loadLeaderboard();
      }
    )
    .subscribe();

  loadLeaderboard();
}

async function loadLeaderboard() {
  const { data, error } = await supabase
    .from('players')
    .select('display_name, best_score_mantisse, best_score_expo')
    .order('best_score_expo', { ascending: false })
    .order('best_score_mantisse', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Failed to load leaderboard:', error);
    return;
  }

  renderLeaderboard(data || []);
}

function renderLeaderboard(rows) {
  els.leaderboardList.innerHTML = "";
  rows.forEach((r, idx) => {
    const li = document.createElement("li");
    const score = { mantisse: r.best_score_mantisse || 0, exposant: r.best_score_expo || 0 };
    li.textContent = `#${idx + 1} — ${r.display_name || "Anonyme"}: ${formatSci(score)}`;
    els.leaderboardList.appendChild(li);
  });
}

async function renderAchievements() {
  if (!els.achievementsList) return;

  els.achievementsList.innerHTML = "";

  allAchievements.forEach(achievement => {
    const unlocked = unlockedAchievementIds.includes(achievement.id);

    const item = document.createElement("div");
    item.className = `achievement-item ${unlocked ? 'unlocked' : 'locked'}`;

    item.innerHTML = `
      <div class="achievement-icon">${achievement.icon}</div>
      <div class="achievement-info">
        <div class="achievement-title">${achievement.title}</div>
        <div class="achievement-desc">${achievement.description}</div>
      </div>
      ${unlocked ? '<div class="achievement-check">✓</div>' : ''}
    `;

    els.achievementsList.appendChild(item);
  });
}

async function checkAndUnlockAchievements() {
  if (!playerId || allAchievements.length === 0) return;

  const toUnlock = checkAchievements(state, unlockedAchievementIds);

  for (const achievement of toUnlock) {
    const success = await unlockAchievement(playerId, achievement.id);
    if (success) {
      unlockedAchievementIds.push(achievement.id);
      showNotification(`🏆 ${achievement.title} débloqué !`);
    }
  }

  if (toUnlock.length > 0) {
    renderAchievements();
  }
}

function showNotification(message) {
  const notif = document.createElement('div');
  notif.className = 'notification';
  notif.textContent = message;
  document.body.appendChild(notif);

  setTimeout(() => notif.classList.add('show'), 10);
  setTimeout(() => {
    notif.classList.remove('show');
    setTimeout(() => notif.remove(), 300);
  }, 3000);
}

async function initAuthAndCloud() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    console.error('Session error:', sessionError);
  }

  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.error('Anonymous sign in failed:', error);
      return;
    }
  }

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (!session?.user) return;

    userId = session.user.id;

    let { data: player, error } = await supabase
      .from('players')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Failed to load player:', error);
      return;
    }

    if (!player) {
      const { data: newPlayer, error: insertError } = await supabase
        .from('players')
        .insert({
          user_id: userId,
          display_name: state.displayName,
          best_score_mantisse: state.score.mantisse,
          best_score_expo: state.score.exposant,
          current_score_mantisse: state.score.mantisse,
          current_score_expo: state.score.exposant,
          rate_mantisse: state.ratePerSec.mantisse,
          rate_expo: state.ratePerSec.exposant,
          prestige_level: state.prestigeLevel,
          prestige_points: state.prestigePoints,
          generator_level: state.upgrades.generator.level,
          boost_level: state.upgrades.boost.level,
          click_level: state.upgrades.click.level
        })
        .select()
        .single();

      if (insertError) {
        console.error('Failed to create player:', insertError);
        return;
      }

      player = newPlayer;
    }

    playerId = player.id;

    if (state.displayName) {
      els.displayNameInput.value = state.displayName;
    } else if (player.display_name) {
      state.displayName = player.display_name;
      els.displayNameInput.value = player.display_name;
      saveLocal(state);
    }

    allAchievements = await loadAchievements();
    const playerAchievements = await loadPlayerAchievements(playerId);
    unlockedAchievementIds = playerAchievements.map(pa => pa.achievement_id);

    renderAchievements();
    initLeaderboard();
    scheduleCloudSave();
  });
}

function init() {
  state.ratePerSec = computeRatePerSec(state);

  if (state.displayName) {
    els.displayNameInput.value = state.displayName;
  }

  render();
  requestAnimationFrame((ts) => {
    lastTs = ts;
    requestAnimationFrame(tick);
  });

  setInterval(() => saveLocal(state), 5000);
  setInterval(scheduleCloudSave, 15000);

  initAuthAndCloud();
}

init();
