// src/miss/lib/firestoreWrite.js
// Firestore (SDK modulaire v12) — écriture unique/idempotente dans missingCases
// Corrige l'erreur: `writeMissingCaseOnce is not a function`
// — Export Nommé (ESM) : writeMissingCaseOnce
// — Transaction "write-once": si existe, on ne réécrit pas
// — Métadonnées minimales: createdAt, updatedAt, caseId, version

import { db } from '../../../firebase'; // ⚠️ Ajuste au besoin selon ton arborescence
import { runTransaction, doc, Timestamp } from 'firebase/firestore';

/**
 * Écrit une seule fois un dossier "Missing" sous l'ID donné.
 * - Si le document existe déjà, ne réécrit PAS (renvoie {status:'already_exists'})
 * - Garantit l'atomicité via transaction
 *
 * @param {string} caseId - ID du dossier, ex.: "mc_mh5fh1qa_o4iyt2"
 * @param {object} payload - Objet validé prêt à être persisté (déjà structuré côté UI)
 * @returns {Promise<{status: 'created'|'already_exists', id: string}>}
 */
export async function writeMissingCaseOnce(caseId, payload) {
  if (!caseId || typeof caseId !== 'string') {
    throw new Error('writeMissingCaseOnce: caseId invalide');
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('writeMissingCaseOnce: payload invalide');
  }

  const ref = doc(db, 'missingCases', caseId);

  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) {
      // Ne pas réécrire : on signale simplement
      return { status: 'already_exists', id: caseId };
    }

    const now = Timestamp.now();

    const toWrite = {
      ...payload,
      caseId,
      createdAt: payload?.submitMeta?.submittedAt || now,
      updatedAt: payload?.updatedAt || now,
      version: 1,
    };

    tx.set(ref, toWrite); // création stricte
    return { status: 'created', id: caseId };
  });

  return result;
}

/**
 * Utilitaire: upsert (écrit si absent, met à jour sinon).
 * - Non utilisé par l’écran principal, mais pratique pour scripts/outillage.
 */
export async function upsertMissingCase(caseId, partial) {
  if (!caseId || typeof caseId !== 'string') throw new Error('upsertMissingCase: caseId invalide');
  if (!partial || typeof partial !== 'object') throw new Error('upsertMissingCase: payload invalide');

  const ref = doc(db, 'missingCases', caseId);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const now = Timestamp.now();

    if (!snap.exists()) {
      tx.set(ref, {
        ...partial,
        caseId,
        createdAt: now,
        updatedAt: now,
        version: 1,
      });
      return { status: 'created', id: caseId };
    }

    const prev = snap.data() || {};
    tx.set(ref, { ...prev, ...partial, updatedAt: now }, { merge: false });
    return { status: 'updated', id: caseId };
  });
}
