// ============================================================================
// app/platform_services/missingCases.js
// Service plate-forme Missing Cases (enfant disparu)
// - Expose getOrCreateDraftChildCase pour le front
// - Trace client → collection pushTraces (non bloquant, best-effort)
// - Log homogène, erreurs attrapées, pas de throw côté UI
// ============================================================================

import { db, auth } from '../firebase';
import {
  addDoc,
  collection,
  serverTimestamp,
} from 'firebase/firestore';

// On s’appuie sur la logique consolidée du helper
import {
  getOrCreateDraftChildCase as _getOrCreateDraftChildCase,
  logMC as _log,
  warnMC as _warn,
} from '../src/miss/lib/helpers';

const LOG_PREFIX = '[MISSING_CHILD][SERVICE]';

// ---------------------------------------------------------------------------
// Tracing best-effort : écritures append-only dans pushTraces
// ---------------------------------------------------------------------------
async function pushClientTrace({ traceId, step, data }) {
  try {
    if (!traceId) {return;}
    await addDoc(collection(db, 'pushTraces'), {
      traceId,
      step,
      data: data || null,
      ts: serverTimestamp(),
      who: auth?.currentUser?.uid || 'anon',
      feature: 'missing_child',
      level: 'info',
      version: 1,
    });
  } catch (e) {
    // best-effort: ne bloque jamais
    console.log(`${LOG_PREFIX} [TRACE][SKIP]`, e?.message || String(e));
  }
}

// ---------------------------------------------------------------------------
// API publique: création/réutilisation d’un DRAFT enfant
// ---------------------------------------------------------------------------
/**
 * Crée/récupère un DRAFT de type CHILD (TTL 12h par défaut).
 * Renvoie { caseId } (string vide si refus/erreur).
 *
 * @param {Object} opts
 *  - user?: { uid, apelido?, username? } (par défaut currentUser)
 *  - ttlHours?: number (12 par défaut)
 *  - uiColor?: string (par défaut rouge)
 *  - radius_m?: number (par défaut 3000)
 *  - traceId?: string (optionnel, utilisé si fourni)
 */
export async function getOrCreateDraftChildCase(opts = {}) {
  const {
    user = { uid: auth?.currentUser?.uid || 'anon' },
    ttlHours = 12,
    uiColor = '#FF3B30',
    radius_m = 3000,
    traceId,
  } = opts;

  const localTrace = traceId || `trace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  _log('[SERVICE][ENTRY]', { uid: user?.uid, ttlHours, radius_m, traceId: localTrace });

  await pushClientTrace({
    traceId: localTrace,
    step: 'SVC_CHILD_DRAFT_ENTRY',
    data: { uid: user?.uid, ttlHours, radius_m },
  });

  try {
    const res = await _getOrCreateDraftChildCase({ user, ttlHours, uiColor, radius_m });
    const ok = !!res?.caseId;
    _log('[SERVICE][RESULT]', { ok, caseId: res?.caseId, traceId: localTrace });

    await pushClientTrace({
      traceId: localTrace,
      step: ok ? 'SVC_CHILD_DRAFT_OK' : 'SVC_CHILD_DRAFT_EMPTY',
      data: { caseId: res?.caseId || '' },
    });

    return { caseId: res?.caseId || '' };
  } catch (e) {
    _warn('[SERVICE][ERR]', e?.message || String(e));

    await pushClientTrace({
      traceId: localTrace,
      step: 'SVC_CHILD_DRAFT_ERR',
      data: { error: e?.message || String(e) },
    });

    // Jamais d’exception vers l’UI
    return { caseId: '' };
  }
}

export default {
  getOrCreateDraftChildCase,
};
