// src/miss/age/agePolicy.js
// ----------------------------------------------------------------------------
// VigiApp — Age Policy (child) : calcul d'éligibilité (JS pur)
// Règles V1 — Option A (tolérance année civile) :
//  1) < 12 ans aujourd’hui -> OK
//  2) 12 ans aujourd’hui -> OK
//  3) 13 ans dans l’année en cours -> OK jusqu’au 31/12 de l’année courante
//  4) sinon -> KO
//
// Entrée: computeAgeEligibility(dobBR: "DD/MM/YYYY", today?: Date)
// Sortie: { ok, status, years, birthYear, cutoffDateISO, msg }
// Tracing: [AGE/POLICY]
// ----------------------------------------------------------------------------

const NS = '[AGE/POLICY]';

const clamp = (n, a, b) => Math.min(Math.max(n, a), b);

export function parseDobBR(dobBR) {
  try {
    const raw = String(dobBR || '').trim();
    if (!raw) {
      return { ok: false };
    }
    const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) {
      return { ok: false };
    }
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = Number(m[3]);
    if (y < 1900) {
      return { ok: false };
    }
    if (mo < 1 || mo > 12) {
      return { ok: false };
    }
    const daysInMonth = new Date(y, mo, 0).getDate();
    if (d < 1 || d > daysInMonth) {
      return { ok: false };
    }
    const today = new Date();
    const iso = new Date(y, mo - 1, d);
    if (iso.getTime() > today.getTime()) {
      return { ok: false };
    }
    return { ok: true, y, m: mo, d };
  } catch (e) {
    console.warn(NS, 'parseDobBR error', String(e));
    return { ok: false };
  }
}

export function toISODate(y, m, d) {
  const mm = String(clamp(m, 1, 12)).padStart(2, '0');
  const dd = String(clamp(d, 1, 31)).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

function fullYearsBetween(a, b) {
  // âge en années pleines à la date 'a' pour naissance 'b'
  let years = a.getFullYear() - b.getFullYear();
  const aMonthDay = a.getMonth() * 32 + a.getDate();
  const bMonthDay = b.getMonth() * 32 + b.getDate();
  if (aMonthDay < bMonthDay) {
    years -= 1;
  }
  return years;
}

export function computeAgeEligibility(dobBR, todayIn) {
  const today = todayIn || new Date();
  const year = today.getFullYear();

  const parsed = parseDobBR(dobBR);
  if (!parsed.ok) {
    return {
      ok: false,
      status: dobBR ? 'INVALID' : 'MISSING',
      years: null,
      birthYear: null,
      cutoffDateISO: `${year}-12-31`,
      msg: dobBR
        ? '⚠️ Data de nascimento inválida (DD/MM/AAAA).'
        : '⚠️ Informe a data de nascimento.',
    };
  }
  const birth = new Date(parsed.y, parsed.m - 1, parsed.d);
  const years = fullYearsBetween(today, birth);
  const birthYear = birth.getFullYear();

  if (years < 12) {
    console.log(NS, 'eligibility UNDER_12', { years, birthYear });
    return {
      ok: true,
      status: 'UNDER_12',
      years,
      birthYear,
      cutoffDateISO: `${year}-12-31`,
      msg: 'Elegível: menor de 12 anos.',
    };
  }
  if (years === 12) {
    console.log(NS, 'eligibility AGE_12', { years, birthYear });
    return {
      ok: true,
      status: 'AGE_12',
      years,
      birthYear,
      cutoffDateISO: `${year}-12-31`,
      msg: 'Elegível: 12 anos.',
    };
  }
  // Tolérance année civile : a/fait 13 ANS cette année -> OK jusqu’au 31/12
  if (years >= 13 && birthYear === year - 13) {
    console.log(NS, 'eligibility AGE_13_TOL', { years, birthYear });
    return {
      ok: true,
      status: 'AGE_13_TOL',
      years,
      birthYear,
      cutoffDateISO: `${year}-12-31`,
      msg: `Elegível até 31/12/${year} (faz/fez 13 em ${year}).`,
    };
  }

  console.log(NS, 'eligibility OVER_LIMIT', { years, birthYear });
  return {
    ok: false,
    status: 'OVER_LIMIT',
    years,
    birthYear,
    cutoffDateISO: `${year}-12-31`,
    msg: '🚫 Caso de criança: elegível até 12 anos ou 13 neste ano (até 31/12).',
  };
}
