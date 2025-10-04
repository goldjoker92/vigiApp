/** Throttle simple par clé en ms. */
const last = new Map();
export function throttle(key, intervalMs) {
  const now = Date.now();
  const prev = last.get(key) || 0;
  if (now - prev < intervalMs) {return false;}
  last.set(key, now);
  return true;
}
