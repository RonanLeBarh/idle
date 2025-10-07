export function toScientificParts(num) {
  if (num === 0) return { mantisse: 0, exposant: 0 };
  const exp = Math.floor(Math.log10(Math.abs(num)));
  const mantisse = num / Math.pow(10, exp);
  return { mantisse, exposant: exp };
}

export function fromScientificParts(m, e) {
  return m * Math.pow(10, e);
}

export function normalizeSci(sci) {
  if (sci.mantisse === 0) return { mantisse: 0, exposant: 0 };
  let m = sci.mantisse;
  let e = sci.exposant;
  while (Math.abs(m) >= 10) { m /= 10; e++; }
  while (Math.abs(m) < 1 && m !== 0) { m *= 10; e--; }
  return { mantisse: m, exposant: e };
}

export function addSci(a, b) {
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

export function subSci(a, b) {
  return addSci(a, { mantisse: -b.mantisse, exposant: b.exposant });
}

export function compareSci(a, b) {
  if (a.exposant > b.exposant) return 1;
  if (a.exposant < b.exposant) return -1;
  if (a.mantisse > b.mantisse) return 1;
  if (a.mantisse < b.mantisse) return -1;
  return 0;
}

const units = ["", "k", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc"];

export function formatSci(sci) {
  if (sci.mantisse === 0) return "0";
  let tier = Math.floor(sci.exposant / 3);
  if (tier < 0) tier = 0;
  if (tier < units.length) {
    const scaled = fromScientificParts(sci.mantisse, sci.exposant - tier * 3);
    return scaled.toFixed(scaled < 10 ? 2 : scaled < 100 ? 1 : 0) + units[tier];
  }
  return sci.mantisse.toFixed(2) + "e" + sci.exposant;
}

export function sanitizeName(x) {
  if (!x) return "";
  return x.replace(/[^\p{L}\p{N}_\- ]/gu, "").trim().slice(0, 16);
}
