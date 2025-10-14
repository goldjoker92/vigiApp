// ============================================================================
// src/utils/idempotency.js
// Guard idempotent côté serveur, via Firestore (collection uploadOps)
// - stocke la réponse résumée de l'upload pour rejouer en lecture seule
// ============================================================================

const admin = require('firebase-admin');
const { log } = require('./logger');

const OPS_COLL = 'uploadOps'; // Firestore collection

/**
 * getExistingOp(idemKey) → retourne doc existant si déjà traité
 */
exports.getExistingOp = async (idemKey) => {
  if (!idemKey) {
    return null;
  }
  const ref = admin.firestore().collection(OPS_COLL).doc(idemKey);
  const snap = await ref.get();
  if (!snap.exists) {
    return null;
  }
  const data = snap.data();
  log('idempotency hit', idemKey);
  return data;
};

/**
 * saveOp(idemKey, payload) → garde une trace minimaliste
 */
exports.saveOp = async (idemKey, payload) => {
  if (!idemKey) {
    return;
  }
  const ref = admin.firestore().collection(OPS_COLL).doc(idemKey);
  await ref.set(
    {
      ...payload,
      idemKey,
      savedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  log('idempotency saved', idemKey);
};
