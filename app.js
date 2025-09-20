// app.js (ES module)
// Jeu idle/incrémental avec sauvegarde locale + Firebase et classement global.
// Remplace la CONFIG Firebase plus bas puis déploie sur GitHub Pages.

// ----- Firebase (v9 modular via CDN) -----
import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

// ----- Config Firebase -----
import { firebaseConfig } from './firebaseConfig.js';

// Initialisation conditionnelle (permet d'héberger même sans config remplie)
let app, auth, db;
let firebaseEnabled = true;
try {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "REPLACE_ME") {
    firebaseEnabled = false;
    console.warn("Firebase config manquante. Le jeu tournera en local uniquement.");
  } else {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (e) {
  firebaseEnabled = false;
  console.warn("Firebase non initialisé. Mode local seulement.", e);
}

// ----- Sélecteurs UI -----
const els = {
  scoreValue: document.getElementById("scoreValue"),
  rateValue: document.getElementById("rateValue"),
  clickBtn: document.getElementById("clickBtn"),
  saveCloudBtn: document.getElementById("saveCloudBtn"),
  resetBtn: document.getElementById("resetBtn"),
  shopList: document.getElementById("shopList"),
  leaderboardList: document.getElementById("leaderboardList"),
  displayNameInput: document.getElementById("displayNameInput"),
  saveNameBtn: document.getElementById("saveNameBtn"),
  debug: document.getElementById("debug")
};

// --- DEBUG LOG ---
function debugLog(...args) {
  console.log(...args);
  if (els.debug) {
    els.debug.textContent += args.join(" ") + "\n";
  }
}

// ----- Mantisse/Exposant -----
function toScientificParts(num) {
  if (num === 0) return { mantisse: 0, exposant: 0 };
  const exp = Math.floor(Math.log10(Math.abs(num)));
  const mantisse = num / Math.pow(10, exp);
  return { mantisse, exposant: exp };
}
function fromScientificParts(m, e) {
  return m * Math.pow(10, e);
}
function normalizeSci(sci) {
  if (sci.mantisse === 0) return { mantisse: 0, exposant: 0 };
  let m = sci.mantisse;
  let e = sci.exposant;
  while (Math.abs(m) >= 10) { m /= 10; e++; }
  while (Math.abs(m) < 1 && m !== 0) { m *= 10; e--; }
  return { mantisse: m, exposant: e };
}
function addSci(a, b) {
  if (a.mantisse === 0) return { ...b };
  if (b.mantisse === 0) return { ...a };
  if (a.exposant > b.exposant) {
    const diff = a.exposant - b.exposant;
    return normalizeSci({ mantisse: a.mantisse + b.mantisse / Math.pow(10, diff), exposant: a.exposant });
  } else {
    const diff = b.exposant - a.exposant;
    return normalizeSci({ mantisse: a.mantisse / Math.pow(10, diff) + b.mantisse, exposant: b.exposant });
  }
}
function subSci(a, b) {
  return addSci(a, { mantisse: -b.mantisse, exposant: b.exposant });
}
function compareSci(a, b) {
  if (a.exposant > b.exposant) return 1;
  if (a.exposant < b.exposant) return -1;
  if (a.mantisse > b.mantisse) return 1;
  if (a.mantisse < b.mantisse) return -1;
  return 0;
}

// ----- Formatage -----
const units = ["", "k", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc"];
function formatSci(sci) {
  if (sci.mantisse === 0) return "0";
  let tier = Math.floor(sci.exposant / 3);
  if (tier < 0) tier = 0; // ✅ empêche les index négatifs
  if (tier < units.length) {
    const scaled = fromScientificParts(sci.mantisse, sci.exposant - tier * 3);
    return scaled.toFixed(scaled < 10 ? 2 : scaled < 100 ? 1 : 0) + units[tier];
  }
  return sci.mantisse.toFixed(2) + "e" + sci.exposant;
}

// ----- État du jeu -----
const GAME_VERSION = 1.0; // Incrémentez si le modèle de données change
const SAVE_KEY = "idleclick-save-v" + GAME_VERSION;
console.log("Jeu version", GAME_VERSION);

const defaultState = {
  score: { mantisse: 0, exposant: 0 },
  totalEarned: { mantisse: 0, exposant: 0 },
  ratePerSec: { mantisse: 0, exposant: 0 },
  upgrades: {
    generator: { level: 0, baseCost: 10, costMult: 1.15, baseRate: 0.2 },
    boost:     { level: 0, baseCost: 50, costMult: 1.25, multiplierPerLevel: 1.5 },
    click:     { level: 0, baseCost: 20, costMult: 1.18, clickGain: 1 }
  },
  displayName: null
};

let state = loadLocal() || structuredClone(defaultState);
let uid = null;

// ----- Helpers -----
function upgradeCost(u) {
  return Math.floor(u.baseCost * Math.pow(u.costMult, u.level));
}

function computeRatePerSec(s) {
  const gen = s.upgrades.generator;
  const boost = s.upgrades.boost;
  const mult = Math.pow(boost.multiplierPerLevel, boost.level) || 1;
  return normalizeSci(toScientificParts(gen.level * gen.baseRate * mult));
}

function computeClickGain(s) {
  const c = s.upgrades.click;
  const boost = s.upgrades.boost;
  const mult = Math.pow(boost.multiplierPerLevel, boost.level) || 1;
  return normalizeSci(toScientificParts((1 + c.level * c.clickGain) * mult));
}

function saveLocal() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch {}
}
function loadLocal() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function resetLocal() {
  localStorage.removeItem(SAVE_KEY);
}

// ----- Rendu -----
function render() {
  els.scoreValue.textContent = formatSci(state.score);
  els.rateValue.textContent = formatSci(state.ratePerSec) + " / sec";
  renderShop()
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
      debugLog("Avant achat", normalizeSci(state.score), normalizeSci(costSci), u.level);
      if (compareSci(normalizeSci(state.score), costSci) >= 0) {
        state.score = subSci(state.score, costSci);
        u.level++;
        state.ratePerSec = computeRatePerSec(state);
        debugLog("Après achat", normalizeSci(state.score), u.level);
        saveLocal();
        scheduleCloudSave();
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

// ----- Boucle de jeu -----
let lastTs = performance.now();

function tick(now) {
  const dt = (now - lastTs) / 1000;
  lastTs = now;

  const gain = normalizeSci(toScientificParts(fromScientificParts(state.ratePerSec.mantisse, state.ratePerSec.exposant) * dt));
  if (compareSci(gain, { mantisse: 0, exposant: 0 }) > 0) {
    state.score = addSci(state.score, gain);
    state.totalEarned = addSci(state.totalEarned, gain);
    els.scoreValue.textContent = formatSci(state.score);
    els.rateValue.textContent = formatSci(state.ratePerSec) + " / sec";
    updateShopState(); // ✅ rafraîchit juste l’état visuel
  }

  requestAnimationFrame(tick);
}



// ----- Interactions -----
els.clickBtn.addEventListener("click", () => {
  const add = computeClickGain(state);
  state.score = addSci(state.score, add);
  state.totalEarned = addSci(state.totalEarned, add);
  saveLocal();
  scheduleCloudSave();
  render();
});

els.resetBtn.addEventListener("click", () => {
  if (!confirm("Réinitialiser ta progression locale et cloud ?")) return;
  state = structuredClone(defaultState);
  saveLocal();
  resetCloud().finally(() => {
    render();
  });
});

els.saveCloudBtn.addEventListener("click", () => {
  manualCloudSave();
});

els.saveNameBtn.addEventListener("click", async () => {
  const name = sanitizeName(els.displayNameInput.value);
  state.displayName = name || null;
  saveLocal();
  if (auth && uid) {
    try {
      await updateProfile(auth.currentUser, { displayName: state.displayName || null });
    } catch {}
    await cloudUpsert();
  }
  alert("Pseudo enregistré.");
});

function sanitizeName(x) {
  if (!x) return "";
  return x.replace(/[^\p{L}\p{N}_\- ]/gu, "").trim().slice(0, 16);
}

// ----- Sauvegarde Cloud -----
let saveTimer = null;
function scheduleCloudSave() {
  if (!firebaseEnabled || !uid) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    cloudUpsert();
  }, 2000);
}

async function manualCloudSave() {
  if (!firebaseEnabled || !uid) {
    debugLog("⛔ Sauvegarde cloud annulée : pas connecté à Firebase.");
    alert("Cloud non connecté. La sauvegarde locale fonctionne.");
    return;
  }
  debugLog("💾 Sauvegarde cloud manuelle demandée...");
  try {
    await cloudUpsert();
    debugLog("✅ Sauvegarde cloud terminée.");
    alert("Sauvegarde Cloud effectuée avec succès !");
  } catch (err) {
    console.error("Erreur lors de la sauvegarde cloud :", err);
    debugLog("⛔ Erreur lors de la sauvegarde cloud :", err.code || err.message);
    alert("Impossible de sauvegarder dans le cloud : " + (err.code || err.message));
  }
}

async function cloudUpsert() {
  if (!db || !uid) {
    debugLog("⛔ CloudUpsert annulé : pas de connexion Firebase ou UID.");
    return;
  }

  const ref = doc(db, "players", uid);
  const snap = await getDoc(ref);

  const bestScoreLocal = compareSci(state.score, snap.exists()
    ? { mantisse: snap.data().bestScoreMantisse || 0, exposant: snap.data().bestScoreExpo || 0 }
    : { mantisse: 0, exposant: 0 }) >= 0
    ? state.score
    : { mantisse: snap.data().bestScoreMantisse || 0, exposant: snap.data().bestScoreExpo || 0 };

  const payload = {
    displayName: state.displayName || null,
    bestScoreMantisse: bestScoreLocal.mantisse,
    bestScoreExpo: bestScoreLocal.exposant,
    rateMantisse: state.ratePerSec.mantisse,
    rateExpo: state.ratePerSec.exposant,
    updatedAt: serverTimestamp()
  };

  debugLog("📤 Envoi vers Firestore :", JSON.stringify(payload));

  try {
    if (snap.exists()) {
      await updateDoc(ref, payload);
      debugLog("✅ Score mis à jour dans Firestore");
    } else {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp()
      });
      debugLog("✅ Nouveau document créé dans Firestore");
    }
  } catch (err) {
    console.error("Erreur Firestore :", err);
    debugLog("⛔ Erreur Firestore :", err.code || err.message);
    alert("Impossible de sauvegarder dans le cloud : " + (err.code || err.message));
  }
}

async function resetCloud() {
  if (!db || !uid) return;
  const ref = doc(db, "players", uid);
  await setDoc(ref, {
    displayName: state.displayName || null,
    bestScoreMantisse: 0,
    bestScoreExpo: 0,
    rateMantisse: 0,
    rateExpo: 0,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  });
}
// ----- Leaderboard -----
function initLeaderboard() {
  if (!db) return;
  const q = query(collection(db, "players"), orderBy("bestScoreExpo", "desc"), limit(10));
  onSnapshot(q, (snap) => {
    const rows = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      rows.push({
        name: d.displayName || "Anonyme",
        score: { mantisse: d.bestScoreMantisse || 0, exposant: d.bestScoreExpo || 0 }
      });
    });
    renderLeaderboard(rows);
  });
}

function renderLeaderboard(rows) {
  els.leaderboardList.innerHTML = "";
  rows.forEach((r, idx) => {
    const li = document.createElement("li");
    li.textContent = `#${idx + 1} — ${r.name}: ${formatSci(r.score)}`;
    els.leaderboardList.appendChild(li);
  });
}

// ----- Auth anonyme + profil cloud -----
async function initAuthAndCloud() {
  if (!firebaseEnabled) {
    console.info("Mode local uniquement. Le leaderboard ne sera pas chargé.");
    return;
  }
  try {
    await signInAnonymously(auth);
    onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      uid = user.uid;

      // Charger pseudo local si existant
      if (state.displayName) {
        els.displayNameInput.value = state.displayName;
        try { await updateProfile(user, { displayName: state.displayName }); } catch {}
      } else if (user.displayName) {
        state.displayName = sanitizeName(user.displayName);
        els.displayNameInput.value = state.displayName || "";
        saveLocal();
      }

      // Lecture du doc cloud
      try {
        const ref = doc(db, "players", uid);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(ref, {
            displayName: state.displayName || null,
            bestScoreMantisse: state.score.mantisse,
            bestScoreExpo: state.score.exposant,
            rateMantisse: state.ratePerSec.mantisse,
            rateExpo: state.ratePerSec.exposant,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      } catch (e) {
        console.warn("Lecture/écriture Firestore échouée :", e);
      }

      initLeaderboard();
      scheduleCloudSave();
    });
  } catch (e) {
    console.warn("Auth anonyme impossible. Mode local uniquement.", e);
  }
}

// ----- Init -----
function init() {
  // Recalcule la production au chargement
  state.ratePerSec = computeRatePerSec(state);

  // Pré-remplir pseudo
  if (state.displayName) {
    els.displayNameInput.value = state.displayName;
  }

  // Lancer la boucle
  render();
  requestAnimationFrame((ts) => {
    lastTs = ts;
    requestAnimationFrame(tick);
  });

  // Sauvegarde locale périodique
  setInterval(saveLocal, 5000);

  // Sauvegarde cloud périodique
  setInterval(scheduleCloudSave, 15000);

  // Firebase
  initAuthAndCloud();
}

init();
