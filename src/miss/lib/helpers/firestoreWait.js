// src/miss/lib/helpers/firestoreWait.js
// Attente d’un snapshot confirmé par le serveur (pas cache, pas pending writes)

import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../../firebase'; // ⚠️ ajuste le chemin selon ton arbo

/**
 * Attend le premier snapshot *confirmé* serveur de missingCases/{caseId}.
 * On résout uniquement quand:
 *  - le doc existe
 *  - !hasPendingWrites
 *  - !fromCache
 *
 * @param {string} caseId
 * @param {number} [timeoutMs=4000]
 * @returns {Promise<object>} données du document
 */
export function waitForServerCommit(caseId, timeoutMs = 4000) {
  const ref = doc(db, 'missingCases', caseId);
  return new Promise((resolve, reject) => {
    let unsub;
    const timer = setTimeout(() => {
      try { unsub && unsub(); } catch {}
      reject(new Error('postWrite_readback_timeout'));
    }, timeoutMs);

    unsub = onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (snap) => {
        const meta = snap.metadata || {};
        // On ne valide QUE quand c’est bien côté serveur (pas cache, pas pending)
        if (snap.exists() && !meta.hasPendingWrites && !meta.fromCache) {
          clearTimeout(timer);
          try { unsub && unsub(); } catch {}
          resolve(snap.data());
        }
      },
      (err) => {
        clearTimeout(timer);
        try { unsub && unsub(); } catch {}
        reject(err);
      }
    );
  });
}
