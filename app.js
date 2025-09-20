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
  saveNameBtn: document.getElementById("saveNameBtn")
};

// ----- Modèle de données du jeu -----
const GAME_VERSION = 1;
const SAVE_KEY = "idleclick-save-v" + GAME_VERSION;

const defaultState = {
  score: 0,
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
let state = loadLocal() || defaultState;
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
  const baseRate = gen.level * gen.baseRate;
  return baseRate * mult;
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
    {
      key: "generator",
      title: "Générateur",
      desc: "Produit passivement au fil du temps.",
      // lead-in labels in strings are UI; compute in JS
    },
    {
      key: "boost",
      title: "Boost",
      desc: "Multiplie toute la production.",
    },
    {
      key: "click",
      title: "Clic+",
      desc: "Augmente le gain par clic manuel.",
    }
  ];
  els.shopList.innerHTML = "";
  items.forEach(item => {
    const u = state.upgrades[item.key];
    const cost = upgradeCost(u);

    const wrapper = document.createElement("div");
    wrapper.className = "shop-item";

    const meta = document.createElement("div");
    meta.className = "meta";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = `${item.title} — Niveau ${u.level}`;
    const desc = document.createElement("div");
    desc.className = "desc";
    // Affiche l’effet spécifique
    let effect = "";
    if (item.key === "generator") effect = `+${u.baseRate}/sec par niveau`;
    if (item.key === "boost") effect = `x${state.upgrades.boost.multiplierPerLevel} par niveau`;
    if (item.key === "click") effect = `+${u.clickGain} par niveau (multiplié par Boost)`;
    desc.textContent = `${item.desc} Effet: ${effect}.`;
    meta.appendChild(title);
    meta.appendChild(desc);

    const buy = document.createElement("div");
    buy.className = "buy";
    const costEl = document.createElement("div");
    costEl.className = "desc";
    costEl.textContent = `Coût: ${formatNumber(cost)}`;
    costEl.style.color = state.score < cost ? "#ff6b6b" : "var(--muted)";


    const btn = document.createElement("button");
    btn.className = "btn primary";
    btn.textContent = "Acheter";
    btn.disabled = state.score < cost;
    btn.addEventListener("click", () => {
      if (Math.floor(state.score) >= cost) {
        state.score -= cost;
        u.level += 1;
        state.ratePerSec = computeRatePerSec(state);
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

// ----- Boucle de jeu -----
let lastTs = performance.now();
function tick(now) {
  const dt = (now - lastTs) / 1000; // secondes
  lastTs = now;

  // Gagne passif
  const gain = state.ratePerSec * dt;
  if (gain > 0) {
    state.score += gain;
    state.totalEarned += gain;
  }

  render();
  requestAnimationFrame(tick);
}

// ----- Interactions -----
els.clickBtn.addEventListener("click", () => {
  console.log("Avant achat", state.score, cost, u.level);
  if (Math.floor(state.score) >= cost) {
    state.score -= cost;
    u.level++;
    state.ratePerSec = computeRatePerSec(state);
    console.log("Après achat", state.score, u.level);
    saveLocal();
    scheduleCloudSave();
    render();
  }
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
    alert("Cloud non connecté. La sauvegarde locale fonctionne.");
    return;
  }
  await cloudUpsert();
  alert("Sauvegarde Cloud effectuée.");
}

async function cloudUpsert() {
  if (!db || !uid) return;
  const ref = doc(db, "players", uid);
  const snap = await getDoc(ref);
  const bestScore = Math.max(
    Math.floor(state.score),
    (snap.exists() && (snap.data().bestScore || 0)) || 0
  );
  const payload = {
    displayName: state.displayName || null,
    bestScore: bestScore,
    updatedAt: serverTimestamp()
  };
  if (snap.exists()) {
    await updateDoc(ref, payload);
  } else {
    await setDoc(ref, {
      ...payload,
      createdAt: serverTimestamp()
    });
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
    const li = document.createElement("li");
    li.textContent = `#${idx + 1} — ${r.name}: ${formatNumber(r.score)}`;
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
