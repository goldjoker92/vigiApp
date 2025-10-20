import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

let cache = { ts: 0, forbidden: [] };
const CACHE_MS = 10 * 60 * 1000;

export async function getRuntimeConfig() {
  const now = Date.now();
  if (now - cache.ts < CACHE_MS) {
    return cache;
  }

  const snap = await getDoc(doc(db, 'admin/config'));
  const data = snap.exists() ? snap.data() : {};
  cache = { ts: now, forbidden: data.forbiddenAliases || [] };
  return cache;
}

export function forbiddenTermSignals(text) {
  const baseForbidden = ['facção', 'milícia', 'polícia', 'milicia', 'faccao', 'policia'];
  const t = text.toLowerCase();
  const matches = [];
  for (const w of baseForbidden.concat(cache.forbidden || [])) {
    if (t.includes(w)) {
      matches.push(w);
    }
  }
  return matches;
}
