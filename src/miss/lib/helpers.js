// ============================================================================
// /app/missing-child/lib/helpers.js
// Utilitaires communs pour MissingChild (helpers génériques)
// Commentaires MIX (FR + EN technique)
// ============================================================================

// ---------------------------------------------------------------------------
// String helpers
// ---------------------------------------------------------------------------

/**
 * Supprime tout sauf les chiffres (ex: CPF, téléphone)
 */
export const onlyDigits = (v) => String(v || '').replace(/\D/g, '');

/**
 * Première lettre en majuscule, le reste en minuscule
 */
export const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '');

/**
 * Met en Title Case (prénom, ville…)
 */
export const toTitleCase = (s) =>
  String(s || '')
    .toLowerCase()
    .split(' ')
    .map((w) => capitalize(w))
    .join(' ');

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Retourne aujourd’hui au format YYYY-MM-DD
 */
export const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Convertit ISO (YYYY-MM-DD) → BR (DD/MM/YYYY)
 */
export const formatDateISOToBR = (iso) => {
  if (!iso) {
    return '';
  }
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
};

/**
 * Convertit BR (DD/MM/YYYY) → ISO (YYYY-MM-DD)
 */
export const formatDateBRToISO = (br) => {
  if (!br) {
    return '';
  }
  const [d, m, y] = String(br).split('/');
  return `${y}-${m}-${d}`;
};

/**
 * Calcule âge d’après une date de naissance (BR DD/MM/YYYY)
 * Règle business: ≤12 ans, tolérance jusqu’au 31/12 de l’année des 13 ans
 */
export const calcAgeFromDateBR = (dobBR) => {
  if (!dobBR) {
    return null;
  }
  const [d, m, y] = dobBR.split('/').map((x) => parseInt(x, 10));
  if (!d || !m || !y) {
    return null;
  }

  const birth = new Date(y, m - 1, d);
  const today = new Date();

  let age = today.getFullYear() - birth.getFullYear();

  // Si anniversaire pas encore passé cette année, on corrige
  const hasBirthdayPassed =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());

  if (!hasBirthdayPassed) {
    age--;
  }

  // ⚠️ Tolérance : si l’enfant a 13 ans mais dans l’année courante, on tolère
  if (age === 13 && today.getFullYear() === birth.getFullYear() + 13) {
    return 12.9; // pseudo valeur = encore toléré
  }

  return age;
};

// ---------------------------------------------------------------------------
// Location helpers
// ---------------------------------------------------------------------------

/**
 * Vérifie un UF brésilien (2 lettres majuscules)
 */
export const isValidUF = (uf) => /^[A-Z]{2}$/.test(String(uf || '').trim());

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

/**
 * Log homogène MissingChild
 */
export const logMC = (...args) => console.log('[MISSING_CHILD][HELPERS]', ...args);

export const warnMC = (...args) => console.warn('[MISSING_CHILD][HELPERS] ⚠️', ...args);
