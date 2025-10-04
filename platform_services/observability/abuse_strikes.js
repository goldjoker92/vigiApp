// platform_services/observability/abuse_strikes.js
// -------------------------------------------------------------
// Strikes/bloqueio local (memória do processo)
// - 3 erros => bloqueio 6h
// - reset do contador após aplicar bloqueio
// - mensagens neutras (sem dizer o motivo exato)
// -------------------------------------------------------------

const userStrikes = new Map(); // userId -> { count, last, blockedUntil }

export function addStrike(userId) {
  if (!userId) {return;}
  const now = Date.now();
  const rec = userStrikes.get(userId) || { count: 0, last: now, blockedUntil: 0 };
  rec.count += 1;
  rec.last = now;

  if (rec.count >= 3) {
    // Bloqueio 6h e zera o contador
    rec.blockedUntil = now + 6 * 3600 * 1000;
    rec.count = 0;
  }
  userStrikes.set(userId, rec);
}

export function isBlocked(userId) {
  if (!userId) {return false;}
  const rec = userStrikes.get(userId);
  if (!rec) {return false;}
  return Date.now() < rec.blockedUntil;
}

// Para debug/logs eventuais
export function getStrikeState(userId) {
  const rec = userStrikes.get(userId) || { count: 0, last: 0, blockedUntil: 0 };
  return { ...rec };
}

export const abuseState = { addStrike, isBlocked, getStrikeState };
