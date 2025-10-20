// ============================================================================
// app/src/miss/lib/helpers.js
// Helpers génériques + DRAFT CHILD (TTL 12h + dédup + rate-limit)
// Logs homogènes via logMC/warnMC
// ============================================================================

// ---------------------------------------------------------------------------
// String helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Firebase
// ---------------------------------------------------------------------------
import {
  addDoc,
  collection,
  getDocs,
  limit as qLimit,
  query,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';

// Depuis app/src/miss/lib/helpers.js → app/firebase.js
import { db, auth } from '../../../firebase';

export const onlyDigits = (v) => String(v || '').replace(/\D/g, '');

export const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '');

export const toTitleCase = (s) =>
  String(s || '')
    .toLowerCase()
    .split(' ')
    .map((w) => capitalize(w))
    .join(' ');

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
export const todayISO = () => new Date().toISOString().slice(0, 10);

export const formatDateISOToBR = (iso) => {
  if (!iso) {
    return '';
  }
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
};

export const formatDateBRToISO = (br) => {
  if (!br) {
    return '';
  }
  const [d, m, y] = String(br).split('/');
  return `${y}-${m}-${d}`;
};

// Âge (BR DD/MM/YYYY) – tolérance 13 ans jusqu'au 31/12
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
  const passed =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!passed) {
    age--;
  }
  if (age === 13 && today.getFullYear() === birth.getFullYear() + 13) {
    return 12.9;
  }
  return age;
};

// ---------------------------------------------------------------------------
// Location helpers
// ---------------------------------------------------------------------------
export const isValidUF = (uf) => /^[A-Z]{2}$/.test(String(uf || '').trim());

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------
export const logMC = (...args) => console.log('[MISSING_CHILD][HELPERS]', ...args);
export const warnMC = (...args) => console.warn('[MISSING_CHILD][HELPERS] ⚠️', ...args);

// ---------------------------------------------------------------------------
// Draft CHILD — garde-fous
// ---------------------------------------------------------------------------
const MISSING_DRAFT_TTL_HOURS = 12;
const MAX_ACTIVE_DRAFTS_PER_USER = 3;
const MIN_SECONDS_BETWEEN_DRAFTS = 45;

const newTraceId = () =>
  `trace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const tsPlusHours = (h) => Timestamp.fromDate(new Date(Date.now() + h * 3600 * 1000));

/** Recherche un DRAFT réutilisable (encore valide). */
async function findReusableDraftChild(uid) {
  const col = collection(db, 'missingCases');
  const q = query(col, where('createdBy', '==', uid), where('status', '==', 'DRAFT'), qLimit(3));
  logMC('[REUSE][QUERY]', { uid });
  const snap = await getDocs(q);
  if (snap.empty) {
    return null;
  }

  for (const doc of snap.docs) {
    const data = doc.data();
    const exp = data?.expiresAt;
    const ok = !exp || exp.toMillis() > Date.now();
    logMC('[REUSE][CANDIDATE]', { id: doc.id, ok, status: data?.status });
    if (ok) {
      return { caseId: doc.id };
    }
  }
  return null;
}

/** Vérifie quotas/ratelimit avant création d’un DRAFT. */
async function canCreateDraftChildCase(uid) {
  const col = collection(db, 'missingCases');
  const q = query(col, where('createdBy', '==', uid), where('status', '==', 'DRAFT'), qLimit(10));
  logMC('[GUARDS][QUERY]', { uid });
  const snap = await getDocs(q);
  const docs = snap.docs || [];

  const active = docs.filter((d) => {
    const exp = d.data()?.expiresAt;
    return !exp || exp.toMillis() > Date.now();
  });
  logMC('[GUARDS][ACTIVE_COUNT]', active.length);

  if (active.length >= MAX_ACTIVE_DRAFTS_PER_USER) {
    warnMC('[GUARDS][BLOCK]', 'too_many_active_drafts');
    return { ok: false, reason: 'too_many_active_drafts' };
  }

  const lastCreatedAt = docs
    .map((d) => d.data()?.createdAt?.toMillis?.() ?? 0)
    .reduce((a, b) => Math.max(a, b), 0);

  if (lastCreatedAt && Date.now() - lastCreatedAt < MIN_SECONDS_BETWEEN_DRAFTS * 1000) {
    warnMC('[GUARDS][BLOCK]', 'rate_limited_recent', {
      sinceMs: Date.now() - lastCreatedAt,
    });
    return { ok: false, reason: 'rate_limited_recent' };
  }
  return { ok: true };
}

/**
 * Crée ou réutilise un DRAFT CHILD.
 * - Déduplication : réutilise un DRAFT actif s’il existe.
 * - Rate-limit : >=45s entre deux créations.
 * - Quota : max 3 DRAFTs actifs par user.
 * - TTL : expiresAt = now + 12h (GC Firestore à config côté console règles/TTL).
 *
 * @returns {Promise<{caseId: string}>} caseId vide si garde-fous bloquent.
 */
export async function getOrCreateDraftChildCase({
  user,
  uiColor = '#FF3B30',
  radius_m = 3000,
  ttlHours = MISSING_DRAFT_TTL_HOURS,
} = {}) {
  const uid = user?.uid || auth?.currentUser?.uid || 'anon';
  const traceId = newTraceId();
  logMC('[ENTRY]', { uid, traceId });

  // 1) Réutilisation si possible
  try {
    const reuse = await findReusableDraftChild(uid);
    if (reuse) {
      logMC('[REUSE][OK]', { ...reuse, traceId });
      return reuse;
    }
  } catch (e) {
    warnMC('[REUSE][ERR]', e?.message || String(e));
  }

  // 2) Garde-fous (quota & rate-limit)
  try {
    const guard = await canCreateDraftChildCase(uid);
    if (!guard.ok) {
      warnMC('[GUARDS][DENY]', guard);
      return { caseId: '' };
    }
  } catch (e) {
    warnMC('[GUARDS][ERR]', e?.message || String(e));
    return { caseId: '' };
  }

  // 3) Création
  try {
    const payload = {
      createdBy: uid,
      createdAt: serverTimestamp(),
      expiresAt: tsPlusHours(ttlHours), // TTL Firestore activée sur ce champ
      status: 'DRAFT',
      caseType: 'CHILD',
      flowOrigin: 'missing_start',
      entryTraceId: traceId,
      color: uiColor,
      radius_m,
      userSnap: { apelido: user?.apelido || '', username: user?.username || '' },
      gc_hint: 'auto_12h_if_incomplete',
      version: 1,
    };
    logMC('[ADD_DOC][missingCases]', payload);
    const ref = await addDoc(collection(db, 'missingCases'), payload);
    logMC('[ADD_DOC][OK]', { caseId: ref.id, traceId });
    return { caseId: ref.id };
  } catch (e) {
    warnMC('[ADD_DOC][ERR]', e?.message || String(e));
    return { caseId: '' };
  }
}
