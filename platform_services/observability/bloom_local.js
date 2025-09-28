/**
 * Mini “Bloom-like” local: Set en mémoire (process) + clé volatile.
 * Suffit pour éviter de renvoyer 100x le même terme en 1 session.
 */
const mem = new Set();
export function bloomSeen(k) { return mem.has(k); }
export function bloomRemember(k) { mem.add(k); }
