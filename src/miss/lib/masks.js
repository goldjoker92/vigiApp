// src/miss/lib/masks.js
// ------------------------------------------------------------------
// Masques entrée utilisateur (React Native):
//  - Date de naissance: auto-slash "DD/MM/AAAA" (max 10 chars)
//  - CPF: "000.000.000-00" (max 14 chars), tolérant pendant la saisie
// ------------------------------------------------------------------

const onlyDigits = (s = '') => String(s).replace(/\D/g, '');

// ---------------------- DOB (DD/MM/AAAA) --------------------------
export function maskDOB(input = '') {
  const d = onlyDigits(input).slice(0, 8); // 8 digits max
  const len = d.length;

  if (len <= 2) {
    return d;
  } // D, DD
  if (len <= 4) {
    return `${d.slice(0, 2)}/${d.slice(2)}`;
  } // DD/MM
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`; // DD/MM/AAAA
}

/**
 * Normalise une date partielle en BR si possible (pad zéro sur D/M).
 * Ne "corrige" pas la validité calendrier ici (c’est un masque, pas un parseur strict).
 */
export function normalizeDOBBR(input = '') {
  const s = String(input || '').trim();
  const ddmmyyyy = s.replace(/\D/g, '');
  if (ddmmyyyy.length < 4) {
    return maskDOB(s);
  } // trop court -> retourne tel quel masqué

  let d = ddmmyyyy.slice(0, 2);
  let m = ddmmyyyy.slice(2, 4);
  let y = ddmmyyyy.slice(4, 8);

  // padding léger (ex: "1/2/2015" -> "01/02/2015")
  if (d.length === 1) {
    d = `0${d}`;
  }
  if (m.length === 1) {
    m = `0${m}`;
  }

  return [d, m, y].filter(Boolean).join('/');
}

// ----------------------- CPF (###.###.###-##) ---------------------
export function formatCPFfromDigits(digits = '') {
  const d = onlyDigits(digits).slice(0, 11); // 11 digits max
  const p1 = d.slice(0, 3);
  const p2 = d.slice(3, 6);
  const p3 = d.slice(6, 9);
  const p4 = d.slice(9, 11);

  let out = p1;
  if (p2) {
    out += `.${p2}`;
  }
  if (p3) {
    out += `.${p3}`;
  }
  if (p4) {
    out += `-${p4}`;
  }
  return out;
}

/** Masque live CPF, tolérant si l’utilisateur colle du texte mixte */
export function maskCPF(input = '') {
  return formatCPFfromDigits(input);
}

// Helpers exportés si besoin ailleurs
export function onlyDigitsStr(s) {
  return onlyDigits(s);
}
