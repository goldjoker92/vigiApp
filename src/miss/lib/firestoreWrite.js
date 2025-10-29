// src/miss/lib/firestoreWrite.js
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../firebase'; // ajuste si besoin

// Petit helper: Firestore déteste undefined → on nettoie
function sanitize(obj) {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitize).filter((v) => v !== undefined);
  }
  const out = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === undefined) {
      continue;
    }
    // Firestore n'aime pas NaN / Infinity
    if (typeof v === 'number' && !Number.isFinite(v)) {
      continue;
    }
    out[k] = sanitize(v);
  }
  return out;
}

/**
 * Écrit une seule fois le doc missingCases/{caseId} (idempotent).
 * - Si le doc existe: ne touche à rien, renvoie { existed: true }
 * - Sinon: set avec timestamps serveur
 */
export async function writeMissingCaseOnce(caseId, payload) {
  const id = String(caseId || '').trim();
  if (!id) {
    throw new Error('writeMissingCaseOnce: caseId manquant');
  }

  const ref = doc(db, 'missingCases', id);
  const body = sanitize(payload);

  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) {
      return { id: snap.id, existed: true };
    }
    const now = serverTimestamp();
    tx.set(ref, {
      ...body,
      createdAtSV: now,
      updatedAtSV: now,
    });
    return { id, created: true };
  });
}
