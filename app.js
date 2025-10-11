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
  upgradeDefinitions,
  upgradeCost,
  isUpgradeUnlocked,
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
import {
  registerUser,
  loginUser,
  logoutUser,
  getCurrentUser,
  linkSessionToAccount
} from './auth.js';

const els = {
  scoreValue: document.getElementById("scoreValue"),
  rateValue: document.getElementById("rateValue"),
  clickBtn: document.getElementById("clickBtn"),
  resetBtn: document.getElementById("resetBtn"),
  prestigeBtn: document.getElementById("prestigeBtn"),
  shopList: document.getElementById("shopList"),
  leaderboardList: document.getElementById("leaderboardList"),
  achievementsList: document.getElementById("achievementsList"),
  prestigeLevel: document.getElementById("prestigeLevel"),
  prestigePoints: document.getElementById("prestigePoints"),
  debug: document.getElementById("debug"),
  authStatus: document.getElementById("authStatus"),
  authBtn: document.getElementById("authBtn"),
  authModal: document.getElementById("authModal"),
  closeAuthModal: document.getElementById("closeAuthModal"),
  loginForm: document.getElementById("loginForm"),
  registerForm: document.getElementById("registerForm"),
  displayNameInput: document.getElementById("displayNameInput"),
  loginEmail: document.getElementById("loginEmail"),
  loginPassword: document.getElementById("loginPassword"),
  loginBtn: document.getElementById("loginBtn"),
  registerEmail: document.getElementById("registerEmail"),
  registerPassword: document.getElementById("registerPassword"),
  registerPasswordConfirm: document.getElementById("registerPasswordConfirm"),
  registerBtn: document.getElementById("registerBtn"),
  showRegister: document.getElementById("showRegister"),
  showLogin: document.getElementById("showLogin"),
  authMessage: document.getElementById("authMessage"),
  authModalTitle: document.getElementById("authModalTitle")
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
let sessionId = null;
let unlockedAchievementIds = [];
let allAchievements = [];

function getOrCreateSessionId() {
  let sid = localStorage.getItem('idleclick-session-id');
  if (!sid) {
    sid = 'anon_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem('idleclick-session-id', sid);
  }
  return sid;
}

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
  els.shopList.innerHTML = "";

  Object.keys(upgradeDefinitions).forEach(key => {
    if (!isUpgradeUnlocked(state, key)) return;

    const def = upgradeDefinitions[key];
    const upgrade = state.upgrades[key];
    const costNow = upgradeCost(key, upgrade.level);
    const costSci = normalizeSci(toScientificParts(costNow));
    const currentScore = normalizeSci(state.score);

    const wrapper = document.createElement("div");
    wrapper.className = "shop-item";
    wrapper.dataset.key = key;

    const meta = document.createElement("div");
    meta.className = "meta";

    const categoryIcon = {
      'click': '👆',
      'auto': '⚙️',
      'multiplier': '✨'
    }[def.category] || '📦';

    meta.innerHTML = `<div class="title">${categoryIcon} ${def.title} — Niveau ${upgrade.level}</div>
                      <div class="desc">${def.desc}</div>`;

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
        upgrade.level++;
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
  const currentScore = normalizeSci(state.score);
  let hasNewUnlocks = false;

  Object.keys(upgradeDefinitions).forEach(key => {
    const wasVisible = document.querySelector(`[data-key="${key}"]`);
    const isNowUnlocked = isUpgradeUnlocked(state, key);

    if (!wasVisible && isNowUnlocked) {
      hasNewUnlocks = true;
    }
  });

  if (hasNewUnlocks) {
    renderShop();
    return;
  }

  items.forEach((itemEl) => {
    const key = itemEl.dataset.key;
    const upgrade = state.upgrades[key];
    const costNow = upgradeCost(key, upgrade.level);
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
  state.totalClicks = (state.totalClicks || 0) + 1;

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

els.authBtn.addEventListener("click", () => {
  if (userId) {
    handleLogout();
  } else {
    openAuthModal();
  }
});

els.closeAuthModal.addEventListener("click", () => {
  closeAuthModal();
});

els.authModal.addEventListener("click", (e) => {
  if (e.target === els.authModal) {
    closeAuthModal();
  }
});

els.showRegister.addEventListener("click", (e) => {
  e.preventDefault();
  showRegisterForm();
});

els.showLogin.addEventListener("click", (e) => {
  e.preventDefault();
  showLoginForm();
});

els.loginBtn.addEventListener("click", async () => {
  await handleLogin();
});

els.registerBtn.addEventListener("click", async () => {
  await handleRegister();
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

    Object.keys(state.upgrades).forEach(key => {
      state.upgrades[key].level = 0;
    });

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
  if (!playerId) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    cloudUpsert();
  }, 2000);
}

async function manualCloudSave() {
  if (!playerId) {
    alert("Connexion au cloud en cours...");
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
  if (!playerId) return;

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
  if (!playerId) return;

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
    const isHidden = achievement.is_hidden && !unlocked;

    if (isHidden) return;

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

function openAuthModal() {
  els.authModal.classList.remove('hidden');
  showLoginForm();
}

function closeAuthModal() {
  els.authModal.classList.add('hidden');
  clearAuthMessage();
}

function showLoginForm() {
  els.loginForm.classList.remove('hidden');
  els.registerForm.classList.add('hidden');
  els.authModalTitle.textContent = 'Connexion';
  clearAuthMessage();
}

function showRegisterForm() {
  els.loginForm.classList.add('hidden');
  els.registerForm.classList.remove('hidden');
  els.authModalTitle.textContent = 'Créer un compte';
  clearAuthMessage();
}

function showAuthMessage(message, isError = false) {
  els.authMessage.textContent = message;
  els.authMessage.className = `auth-message ${isError ? 'error' : 'success'}`;
}

function clearAuthMessage() {
  els.authMessage.textContent = '';
  els.authMessage.className = 'auth-message';
}

async function handleLogin() {
  const email = els.loginEmail.value.trim();
  const password = els.loginPassword.value;

  if (!email || !password) {
    showAuthMessage('Veuillez remplir tous les champs', true);
    return;
  }

  const result = await loginUser(email, password);

  if (!result.success) {
    showAuthMessage(result.error || 'Erreur de connexion', true);
    return;
  }

  showAuthMessage('✓ Connexion réussie !', false);
  await new Promise(resolve => setTimeout(resolve, 1000));
  closeAuthModal();
}

async function handleRegister() {
  const displayName = sanitizeName(els.displayNameInput.value);
  const email = els.registerEmail.value.trim();
  const password = els.registerPassword.value;
  const passwordConfirm = els.registerPasswordConfirm.value;

  if (!displayName || !email || !password) {
    showAuthMessage('Veuillez remplir tous les champs', true);
    return;
  }

  if (password !== passwordConfirm) {
    showAuthMessage('Les mots de passe ne correspondent pas', true);
    return;
  }

  if (password.length < 6) {
    showAuthMessage('Le mot de passe doit contenir au moins 6 caractères', true);
    return;
  }

  const result = await registerUser(email, password, displayName);

  if (!result.success) {
    showAuthMessage(result.error || 'Erreur lors de la création du compte', true);
    return;
  }

  if (result.needsEmailConfirmation) {
    showAuthMessage('✓ Compte créé ! Vérifiez votre email pour confirmer.', false);
  } else {
    showAuthMessage('✓ Compte créé avec succès !', false);
    await new Promise(resolve => setTimeout(resolve, 1500));
    closeAuthModal();
  }
}

async function handleLogout() {
  if (!confirm('Se déconnecter ? Votre progression restera sauvegardée.')) return;

  await cloudUpsert();

  await logoutUser();

  state = structuredClone(defaultState);
  saveLocal(state);

  userId = null;
  playerId = null;

  updateAuthUI();
  render();

  await initAuthAndCloud();
}

function updateAuthUI() {
  if (userId) {
    els.authStatus.textContent = state.displayName || 'Connecté';
    els.authBtn.textContent = 'Déconnexion';
    els.authBtn.classList.remove('primary');
    els.authBtn.classList.add('danger');
  } else {
    els.authStatus.textContent = 'Session anonyme';
    els.authBtn.textContent = 'Se connecter';
    els.authBtn.classList.remove('danger');
    els.authBtn.classList.add('primary');
  }
}

async function initAuthAndCloud() {
  const currentUser = await getCurrentUser();

  if (currentUser) {
    userId = currentUser.id;

    let { data: player, error } = await supabase
      .from('players')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Failed to load player:', error);
    }

    if (!player) {
      sessionId = getOrCreateSessionId();
      const linkResult = await linkSessionToAccount(sessionId, userId);

      if (linkResult.success) {
        playerId = linkResult.playerId;
        const { data: linkedPlayer } = await supabase
          .from('players')
          .select('*')
          .eq('id', playerId)
          .single();

        player = linkedPlayer;
      } else {
        const { data: newPlayer, error: insertError } = await supabase
          .from('players')
          .insert({
            user_id: userId,
            display_name: currentUser.user_metadata?.display_name || state.displayName,
            best_score_mantisse: state.score.mantisse,
            best_score_expo: state.score.exposant,
            current_score_mantisse: state.score.mantisse,
            current_score_expo: state.score.exposant,
            rate_mantisse: state.ratePerSec.mantisse,
            rate_expo: state.ratePerSec.exposant,
            prestige_level: state.prestigeLevel,
            prestige_points: state.prestigePoints
          })
          .select()
          .single();

        if (insertError) {
          console.error('Failed to create player:', insertError);
          return;
        }

        player = newPlayer;
      }
    }

    playerId = player.id;

    state.displayName = player.display_name || state.displayName;
    state.score = {
      mantisse: player.current_score_mantisse || 0,
      exposant: player.current_score_expo || 0
    };
    state.prestigeLevel = player.prestige_level || 0;
    state.prestigePoints = player.prestige_points || 0;
    state.ratePerSec = computeRatePerSec(state);

    saveLocal(state);
  } else {
    sessionId = getOrCreateSessionId();

    let { data: player, error } = await supabase
      .from('players')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      console.error('Failed to load player:', error);
    }

    if (!player) {
      const { data: newPlayer, error: insertError } = await supabase
        .from('players')
        .insert({
          session_id: sessionId,
          display_name: state.displayName,
          best_score_mantisse: state.score.mantisse,
          best_score_expo: state.score.exposant,
          current_score_mantisse: state.score.mantisse,
          current_score_expo: state.score.exposant,
          rate_mantisse: state.ratePerSec.mantisse,
          rate_expo: state.ratePerSec.exposant,
          prestige_level: state.prestigeLevel,
          prestige_points: state.prestigePoints
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

    if (player.display_name) {
      state.displayName = player.display_name;
      saveLocal(state);
    }
  }

  updateAuthUI();
  render();

  allAchievements = await loadAchievements();
  const playerAchievements = await loadPlayerAchievements(playerId);
  unlockedAchievementIds = playerAchievements.map(pa => pa.achievement_id);

  renderAchievements();
  initLeaderboard();
  scheduleCloudSave();

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      await initAuthAndCloud();
    } else if (event === 'SIGNED_OUT') {
      updateAuthUI();
    }
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
