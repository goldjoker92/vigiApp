/**
 * scripts/ttl-poller.js
 * Vérifie toutes les 20s si un doc dans uploads_idem existe encore.
 * Permet de passer la clé en argument:
 *
 *   node -r dotenv/config scripts/ttl-poller.js mc_smoke_1760761548012
 *
 * Si pas d'argument: utilise une valeur par défaut.
 */

const admin = require('firebase-admin');

// Initialise firebase-admin si pas déjà fait.
if (!admin.apps.length) {
  admin.initializeApp();
}

// Récupère l'argument CLI pour la docKey
// Ex: node ttl-poller.js my_key
const argKey = process.argv[2];
const docKey = argKey || 'mc_smoke_1760761548012';
const collection = 'uploads_idem';

const INTERVAL_MS = 20_000; // 20 secondes

async function checkOnce() {
  const ref = db.collection(collection).doc(docKey);
  const snap = await ref.get();
  if (snap.exists) {
    console.log(`[TTL POLLER] ${docKey} existe encore → waiting…`);
    return true;
  } else {
    console.log(`[TTL POLLER] ${docKey} a été supprimé ✅`);
    return false;
  }
}

async function main() {
  console.log(`[TTL POLLER] Start polling every ${INTERVAL_MS / 1000}s for doc: ${docKey}`);
  const exists = await checkOnce();
  if (!exists) {
    console.log('[TTL POLLER] Déjà supprimé, on stop.');
    process.exit(0);
  }

  const intervalId = setInterval(async () => {
    const stillExists = await checkOnce();
    if (!stillExists) {
      clearInterval(intervalId);
      console.log('[TTL POLLER] Fin: doc supprimé.');
      process.exit(0);
    }
  }, INTERVAL_MS);
}

const db = admin.firestore();
main().catch((err) => {
  console.error('[TTL POLLER] Erreur', err);
  process.exit(1);
});
