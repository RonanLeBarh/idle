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
const firebaseConfig = {
  apiKey: "AIzaSyDJwHqJdmUKayrxTnHrcGHcCLCm9lmOtMY",
  authDomain: "idleclick-5fc91.firebaseapp.com",
  projectId: "idleclick-5fc91",
  storageBucket: "idleclick-5fc91.firebasestorage.app",
  messagingSenderId: "166564180674",
  appId: "1:166564180674:web:75dce2c2eb0cc6556fc15b"
};

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

// Convertit un nombre en mantisse + exposant
function toScientificParts(num) {
  if (num === 0) return { mantisse: 0, exposant: 0 };
  const exp = Math.floor(Math.log10(Math.abs(num)));
  const mantisse = num / Math.pow(10, exp);
  return { mantisse, exposant: exp };
}

// Reconvertit mantisse + exposant en nombre
function fromScientificParts(mantisse, exposant) {
  return mantisse * Math.pow(10, exposant);
}

// ----- Modèle de données du jeu -----
const GAME_VERSION = 0.13; // Incrémentez si le modèle de données change
const SAVE_KEY = "idleclick-save-v" + GAME_VERSION;
console.log("Jeu version", GAME_VERSION);

// État par défaut
const defaultState = {
  score: 10000,
  totalEarned: 0,
  // Ticks par seconde convertis en per-sec
  ratePerSec: 0,
  upgrades: {
    // Générateurs: produisent passivement
    generator: { level: 0, baseCost: 10, costMult: 1.15, baseRate: 0.2 }, // 0.2/sec
    // Boost: multiplie la production totale
    boost:     { level: 0, baseCost: 50, costMult: 1.25, multiplierPerLevel: 1.5 },
    // Click: augmente le clic manuel
    click:     { level: 0, baseCost: 20, costMult: 1.18, clickGain: 1 }
  },
  displayName: null,
  lastSaveAt: null,
  createdAt: Date.now()
};

// ----- État runtime -----
let state = loadLocal() || structuredClone(defaultState);
let uid = null; // défini après Auth anonyme

// ----- Helpers -----
function formatNumber(n) {
  if (n < 1000) return n.toFixed(0);
  const units = ["k", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc"];
  let u = -1;
  let num = n;
  while (num >= 1000 && u < units.length - 1) {
    num /= 1000;
    u++;
  }
  return num.toFixed(num < 10 ? 2 : num < 100 ? 1 : 0) + units[u];
}

function upgradeCost(u) {
  // coût = baseCost * costMult^level
  return Math.floor(u.baseCost * Math.pow(u.costMult, u.level));
}

function computeRatePerSec(s) {
  const gen = s.upgrades.generator;
  const boost = s.upgrades.boost;
  const mult = Math.pow(boost.multiplierPerLevel, boost.level) || 1;
  return gen.level * gen.baseRate * mult;
}

function computeClickGain(s) {
  const c = s.upgrades.click;
  const boost = s.upgrades.boost;
  const mult = Math.pow(boost.multiplierPerLevel, boost.level) || 1;
  return (1 + c.level * c.clickGain) * mult;
}

function saveLocal() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {}
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function resetLocal() {
  localStorage.removeItem(SAVE_KEY);
}

// ----- UI rendering -----
function render() {
  els.scoreValue.textContent = formatNumber(state.score);
  els.rateValue.textContent = (state.ratePerSec).toFixed(2);
  renderShop();
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
    costEl.textContent = `Coût: ${formatNumber(costNow)}`;
    costEl.style.color = Math.floor(state.score) < costNow ? "#ff6b6b" : "var(--muted)";

    const btn = document.createElement("button");
    btn.className = "btn primary";
    btn.textContent = "Acheter";
    btn.disabled = Math.floor(state.score) < costNow;

    // ✅ Listener bien attaché AVANT insertion dans le DOM
    btn.addEventListener("click", () => {
      debugLog("Avant achat", state.score, costNow, u.level);
      if (Math.floor(state.score) >= costNow) {
        state.score -= costNow;
        u.level++;
        state.ratePerSec = computeRatePerSec(state);
        debugLog("Après achat", state.score, u.level);
        saveLocal();
        scheduleCloudSave();
        renderScore();
        renderShop(); // on rafraîchit la boutique uniquement ici
      }
    });


    buy.appendChild(costEl);
    buy.appendChild(btn);
    wrapper.appendChild(meta);
    wrapper.appendChild(buy);
    els.shopList.appendChild(wrapper);
  });
}


// ----- Boucle de jeu -----
let lastTs = performance.now();
function renderScore() {
  els.scoreValue.textContent = formatNumber(state.score);
  els.rateValue.textContent = state.ratePerSec.toFixed(2);
}

function tick(now) {
  const dt = (now - lastTs) / 1000;
  lastTs = now;

  const gain = state.ratePerSec * dt;
  if (gain > 0) {
    state.score += gain;
    state.totalEarned += gain;
    renderScore();
  }

  requestAnimationFrame(tick);
}

// Au démarrage
renderScore();
renderShop();
requestAnimationFrame((ts) => {
  lastTs = ts;
  requestAnimationFrame(tick);
});


// ----- Interactions -----
els.clickBtn.addEventListener("click", () => {
  const add = computeClickGain(state);
  state.score += add;
  state.totalEarned += add;
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
      // Pas obligatoire, mais sympa d’avoir displayName dans Auth aussi
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

// ----- Sauvegarde Cloud (Firestore) -----
// On enregistre un document par utilisateur dans "players/{uid}".
// Champs: displayName, bestScore, updatedAt, createdAt
let saveTimer = null;
function scheduleCloudSave() {
  if (!firebaseEnabled || !uid) return;
  // Sauvegarde 2s après la dernière action
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
    await cloudUpsert(); // utilise la version corrigée avec arrondi et logs
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

  // On prend le meilleur score entre local et cloud
  const bestScoreLocal = Math.max(state.score, snap.exists() ? fromScientificParts(snap.data().bestScoreMantisse || 0, snap.data().bestScoreExpo || 0) : 0);

  // Conversion en mantisse/exposant
  const scoreParts = toScientificParts(bestScoreLocal);
  const rateParts = toScientificParts(state.ratePerSec);

  const payload = {
    displayName: state.displayName || null,
    bestScoreMantisse: scoreParts.mantisse,
    bestScoreExpo: scoreParts.exposant,
    rateMantisse: rateParts.mantisse,
    rateExpo: rateParts.exposant,
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
    bestScore: 0,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  });
}

// ----- Leaderboard (live) -----
function initLeaderboard() {
  if (!db) return;
  const q = query(collection(db, "players"), orderBy("bestScore", "desc"), limit(10));
  onSnapshot(q, (snap) => {
    const rows = [];
    snap.forEach((doc) => {
      const d = doc.data();
      rows.push({
        name: d.displayName || "Anonyme",
        score: d.bestScore || 0
      });
    });
    renderLeaderboard(rows);
  });
}

function renderLeaderboard(rows) {
  els.leaderboardList.innerHTML = "";
  rows.forEach((r, idx) => {
    const scoreValue = fromScientificParts(r.bestScoreMantisse || 0, r.bestScoreExpo || 0);
    const li = document.createElement("li");
    li.textContent = `#${idx + 1} — ${r.name}: ${formatNumber(scoreValue)}`;
    els.leaderboardList.appendChild(li);
  });
}


// ----- Auth anonyme + chargement du profil cloud -----
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

      // Charger un pseudo local si existant
      if (state.displayName) {
        els.displayNameInput.value = state.displayName;
        try { await updateProfile(user, { displayName: state.displayName }); } catch {}
      } else if (user.displayName) {
        state.displayName = sanitizeName(user.displayName);
        els.displayNameInput.value = state.displayName || "";
        saveLocal();
      }

      // Récupérer meilleur score pour ne pas le perdre
      try {
        const ref = doc(db, "players", uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const d = snap.data();
          // On ne remplace pas ta progression locale, on ne fait que lire le bestScore
          // et l’utiliser pour l’affichage (via leaderboard). La progression locale continue.
        } else {
          await setDoc(ref, {
            displayName: state.displayName || null,
            bestScore: Math.floor(state.score),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      } catch (e) {
        console.warn("Lecture/écriture Firestore échouée (continuation en local):", e);
      }

      initLeaderboard();
      scheduleCloudSave();
    });
  } catch (e) {
    console.warn("Auth anonyme impossible. Mode local uniquement.", e);
  }
}

// ----- Démarrage -----
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

  // Sauvegarde périodique locale
  setInterval(() => {
    saveLocal();
  }, 5000);

  // Sauvegarde cloud périodique si connecté
  setInterval(() => {
    scheduleCloudSave();
  }, 15000);

  // Firebase
  initAuthAndCloud();
}

init();
