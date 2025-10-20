/**
 * Envoie de signaux anonymisés pour nouveaux lexèmes (argot/insultes).
 * - Aucun texte clair n’est transmis (hash SHA-256 + salt de build).
 * - Anti-spam local via Bloom + throttle.
 * - Scope léger (city/UF) optionnel.
 */
import { sha256Hex, getBuildSaltId } from './privacy_hash';
import { normalizeToken, isWeirdToken } from './text_norm';
import { bloomSeen, bloomRemember } from './bloom_local';
// Make sure throttle.js exists in the same directory, or update the path if it's elsewhere
import { throttle } from './throttle';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase_functions';

const sendSignals = httpsCallable(functions, 'modSignals_ingest');

export async function reportNewLexemesRaw(text, meta) {
  try {
    const toks = tokenize(text);
    const candidates = [];
    for (const tok of toks) {
      const n = normalizeToken(tok);
      if (!n || n.length < 2) {
        continue;
      }
      if (!isWeirdToken(n)) {
        continue;
      } // heuristique: OOV/leet/obfus
      const key = `lex:${n}`;
      if (bloomSeen(key)) {
        continue;
      } // déjà vu localement
      bloomRemember(key);
      const h = await sha256Hex(n); // jamais de clair
      candidates.push({ h, len: n.length });
    }
    if (!candidates.length) {
      return;
    }
    if (!throttle('modSignals', 30_000)) {
      return;
    } // 1 payload / 30s

    const noise = Math.random() < 0.5 ? -1 : 1;
    const payload = {
      ver: 1,
      ts: Date.now(),
      salts: getBuildSaltId(), // id du salt (pas la valeur)
      items: candidates.map((c) => ({ h: c.h, l: c.len, c: 1 + noise })),
      hints: { cat: meta?.catHint || 'unknown' },
      scope: { city: meta?.city || null, uf: meta?.uf || null },
    };
    await sendSignals(payload);
  } catch {
    /* swallow */
  }
}

function tokenize(t = '') {
  return (
    String(t)
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .match(/\p{L}[\p{L}\p{N}_-]{0,30}/gu) || []
  );
}
