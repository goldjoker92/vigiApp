// platform_services/observability/abuse_strikes.js
// ============================================================================
// Strikes / bloqueio local (mémoire du process) — observabilité++
// ----------------------------------------------------------------------------
// RÈGLES (inchangées):
// - 3 erreurs => bloqueio de 6h
// - reset du compteur immédiatement après blocage
// - messages neutres côté produit
//
// AJOUTS (sans régression):
// - Compteur global + snapshot des users BLOQUÉS (id, name, apelido, countdown)
// - Répertoire user optionnel (pour enrichir sans PII forcé côté module)
// - GC (purge) des entrées expirées/stales
// - Logs/trace activables (DEBUG + traceId)
// - Tri custom: par blockedUntil (ASC/DESC) et par name (ASC/DESC)
// ----------------------------------------------------------------------------
// API ORIGINALE (inchangée):
//   addStrike(userId)
//   isBlocked(userId) -> boolean
//   getStrikeState(userId) -> { count, last, blockedUntil }
//   abuseState = { addStrike, isBlocked, getStrikeState }
//
// EXPORTS SUPPLÉMENTAIRES (optionnels):
//   setAbuseDebug(on)
//   setAbuseTraceContext(traceId)
//   getBlockTimeLeftMs(userId)
//   getBlockTimeLeftHuman(userId)
//   registerUserMeta(userId, { name?, apelido? })
//   bulkRegisterUserMeta([{ userId, name?, apelido? }, ...])
//   getBlockedUsersCount()
//   getBlockedUsersSnapshot()                              // tri par défaut: leftMs DESC
//   getBlockedUsersSnapshotByBlockedUntil(order='asc')     // NEW
//   getBlockedUsersSnapshotByName(order='asc')             // NEW
//   runAbuseGCPass()
//   startAbuseGC({ intervalMs? })
//   stopAbuseGC()
// ============================================================================

const BLOCK_MS = 6 * 3600 * 1000; // 6h
const STRIKE_THRESHOLD = 3;
const STALE_TTL_MS = 24 * 3600 * 1000; // 24h sans activité -> purge

const userStrikes = new Map();   // userId -> { count, last, blockedUntil }
const userDirectory = new Map(); // userId -> { name?: string, apelido?: string }

let DEBUG = false;
let TRACE_ID = null;
let GC_TIMER = null;

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------
function safeUID(u) {
  if (u === null) {return 'null';}
  try {
    const s = String(u);
    return s.length > 64 ? s.slice(0, 6) + '…' + s.slice(-4) : s;
  } catch {
    return '[invalid_uid]';
  }
}

function log(...args) {
  if (!DEBUG) {return;}
  if (TRACE_ID) {console.log('[ABUSE][STRIKES]', `{trace:${TRACE_ID}}`, ...args);}
  else {console.log('[ABUSE][STRIKES]', ...args);}
}

function fmtMs(ms) {
  if (ms <= 0) {return '0s';}
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (h) {parts.push(`${h}h`);}
  if (m) {parts.push(`${m}m`);}
  if (sec || parts.length === 0) {parts.push(`${sec}s`);}
  return parts.join(' ');
}

function snapshot(userId) {
  const rec = userStrikes.get(userId);
  if (!rec) {return { count: 0, last: 0, blockedUntil: 0 };}
  return { count: rec.count, last: rec.last, blockedUntil: rec.blockedUntil };
}

function timeLeftMs(userId) {
  const now = Date.now();
  const rec = userStrikes.get(userId);
  if (!rec) {return 0;}
  return Math.max(0, (rec.blockedUntil || 0) - now);
}

function normStr(s) {
  return (s || '').toString().trim().toLowerCase();
}

function compareOrder(a, b, order = 'asc') {
  return order === 'desc' ? b - a : a - b;
}

function compareLocale(a, b, order = 'asc') {
  const r = a.localeCompare(b, undefined, { sensitivity: 'base' });
  return order === 'desc' ? -r : r;
}

// ---------------------------------------------------------------------------
// Métadonnées optionnelles (name, apelido) pour snapshots enrichis
// ---------------------------------------------------------------------------
export function registerUserMeta(userId, meta = {}) {
  if (!userId) {return;}
  const cur = userDirectory.get(userId) || {};
  const next = { ...cur };
  if (typeof meta.name === 'string') {next.name = meta.name;}
  if (typeof meta.apelido === 'string') {next.apelido = meta.apelido;}
  userDirectory.set(userId, next);
  log('registerUserMeta', { userId: safeUID(userId), meta: next });
}

export function bulkRegisterUserMeta(list = []) {
  let added = 0;
  for (const it of list) {
    if (!it || !it.userId) {continue;}
    registerUserMeta(it.userId, { name: it.name, apelido: it.apelido });
    added++;
  }
  log('bulkRegisterUserMeta', { count: added });
  return added;
}

// ---------------------------------------------------------------------------
// API inchangée
// ---------------------------------------------------------------------------
export function addStrike(userId) {
  if (!userId) {
    log('addStrike: skip (userId falsy)');
    return;
  }
  const uid = safeUID(userId);
  const now = Date.now();
  const rec = userStrikes.get(userId) || { count: 0, last: now, blockedUntil: 0 };

  rec.count += 1;
  rec.last = now;

  log('addStrike: +1', { userId: uid, count: rec.count, last: rec.last });

  if (rec.count >= STRIKE_THRESHOLD) {
    rec.blockedUntil = now + BLOCK_MS;
    log('addStrike: threshold reached -> BLOCK', {
      userId: uid,
      blockedUntil: rec.blockedUntil,
      ttl: fmtMs(BLOCK_MS),
    });
    rec.count = 0;
  }

  userStrikes.set(userId, rec);
}

export function isBlocked(userId) {
  if (!userId) {
    log('isBlocked: falsy userId -> false');
    return false;
  }
  const uid = safeUID(userId);
  const rec = userStrikes.get(userId);
  if (!rec) {
    log('isBlocked: no record', { userId: uid, blocked: false });
    return false;
  }
  const blocked = Date.now() < rec.blockedUntil;
  if (blocked) {
    const left = timeLeftMs(userId);
    log('isBlocked: YES', { userId: uid, leftMs: left, leftHuman: fmtMs(left) });
  } else {
    log('isBlocked: NO', { userId: uid });
  }
  return blocked;
}

export function getStrikeState(userId) {
  const s = snapshot(userId);
  log('getStrikeState', {
    userId: safeUID(userId),
    ...s,
    now: Date.now(),
    blocked: Date.now() < (s.blockedUntil || 0),
    leftMs: Math.max(0, (s.blockedUntil || 0) - Date.now()),
  });
  return s;
}

export const abuseState = { addStrike, isBlocked, getStrikeState };

// ---------------------------------------------------------------------------
// Observabilité / Admin
// ---------------------------------------------------------------------------
export function setAbuseDebug(on) {
  DEBUG = !!on;
  log('debug toggled', { DEBUG });
}

export function setAbuseTraceContext(traceId) {
  TRACE_ID = traceId ? String(traceId) : null;
  log('trace context set', { TRACE_ID });
}

export function getBlockTimeLeftMs(userId) {
  const left = timeLeftMs(userId);
  log('getBlockTimeLeftMs', { userId: safeUID(userId), leftMs: left, leftHuman: fmtMs(left) });
  return left;
}

export function getBlockTimeLeftHuman(userId) {
  const left = timeLeftMs(userId);
  const human = fmtMs(left);
  log('getBlockTimeLeftHuman', { userId: safeUID(userId), human });
  return human;
}

export function getBlockedUsersCount() {
  const now = Date.now();
  let n = 0;
  for (const [, rec] of userStrikes) {
    if (now < (rec.blockedUntil || 0)) {n++;}
  }
  log('getBlockedUsersCount', { count: n });
  return n;
}

/**
 * Snapshot par défaut (tri leftMs DESC — comme avant)
 * -> [{ userId, name?, apelido?, blockedUntil, leftMs, leftHuman }]
 */
export function getBlockedUsersSnapshot() {
  const now = Date.now();
  const out = [];
  for (const [userId, rec] of userStrikes) {
    if (now < (rec.blockedUntil || 0)) {
      const meta = userDirectory.get(userId) || {};
      const left = Math.max(0, rec.blockedUntil - now);
      out.push({
        userId,
        name: meta.name || undefined,
        apelido: meta.apelido || undefined,
        blockedUntil: rec.blockedUntil,
        leftMs: left,
        leftHuman: fmtMs(left),
      });
    }
  }
  // tri par temps restant décroissant (comportement historique)
  out.sort((a, b) => b.leftMs - a.leftMs);
  log('getBlockedUsersSnapshot', { count: out.length, sort: 'leftMs DESC (default)' });
  return out;
}

/**
 * NEW: Snapshot trié par échéance (blockedUntil) ASC/DESC.
 * order: 'asc' | 'desc' (default 'asc')
 */
export function getBlockedUsersSnapshotByBlockedUntil(order = 'asc') {
  const list = getBlockedUsersSnapshot(); // déjà enrichi
  list.sort((a, b) => compareOrder(a.blockedUntil, b.blockedUntil, order));
  log('getBlockedUsersSnapshotByBlockedUntil', { count: list.length, order });
  return list;
}

/**
 * NEW: Snapshot trié par name (puis apelido, puis userId) ASC/DESC.
 * - Normalise: name -> apelido -> userId (string)
 * - Utilise localeCompare, fallback robuste.
 */
export function getBlockedUsersSnapshotByName(order = 'asc') {
  const list = getBlockedUsersSnapshot(); // déjà enrichi
  list.sort((a, b) => {
    const aName = normStr(a.name) || normStr(a.apelido) || String(a.userId);
    const bName = normStr(b.name) || normStr(b.apelido) || String(b.userId);
    // tri principal: nom
    const cmp = compareLocale(aName, bName, order);
    if (cmp !== 0) {return cmp;}
    // tie-breaker: blockedUntil (plus proche d'abord si ASC, inverse si DESC)
    const blockedCmp = compareOrder(a.blockedUntil, b.blockedUntil, order);
    if (blockedCmp !== 0) {return blockedCmp;}
    // dernier tie-breaker: userId pour stabilité
    return compareLocale(String(a.userId), String(b.userId), 'asc');
  });
  log('getBlockedUsersSnapshotByName', { count: list.length, order });
  return list;
}

// ---------------------------------------------------------------------------
// GC (Purge) — évite la croissance infinie de la Map
// ---------------------------------------------------------------------------
export function runAbuseGCPass() {
  const now = Date.now();
  let scanned = 0;
  let removed = 0;
  for (const [userId, rec] of userStrikes) {
    scanned++;
    const blocked = now < (rec.blockedUntil || 0);
    const stale = !blocked && rec.count === 0 && now - (rec.last || 0) > STALE_TTL_MS;
    if (stale) {
      userStrikes.delete(userId);
      removed++;
      log('GC: removed stale entry', { userId: safeUID(userId) });
      // On garde userDirectory tel quel (peut servir en admin/dash).
    }
  }
  const kept = scanned - removed;
  log('GC pass done', { scanned, removed, kept });
  return { scanned, removed, kept };
}

export function startAbuseGC(opts = {}) {
  const intervalMs = Math.max(30_000, Number(opts.intervalMs) || 10 * 60_000); // ≥30s, défaut 10min
  if (GC_TIMER) {
    clearInterval(GC_TIMER);
    GC_TIMER = null;
  }
  GC_TIMER = setInterval(() => {
    try {
      runAbuseGCPass();
    } catch (e) {
      log('GC error:', e?.message || String(e));
    }
  }, intervalMs);
  log('GC started', { intervalMs });
  return { intervalMs };
}

export function stopAbuseGC() {
  if (GC_TIMER) {
    clearInterval(GC_TIMER);
    GC_TIMER = null;
    log('GC stopped');
  }
}
