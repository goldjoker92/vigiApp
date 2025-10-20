// scripts/ttl-smoke-test.js
// Crée un doc dans uploads_idem avec expireAt dans 3 min
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
} // default creds
const db = admin.firestore();

(async () => {
  const key = 'mc_smoke_' + Date.now();
  const now = new Date();
  const expireAt = new Date(now.getTime() + 3 * 60 * 1000); // +3 min

  await db
    .collection('uploads_idem')
    .doc(key)
    .set({
      key,
      createdAt: admin.firestore.Timestamp.fromDate(now),
      expireAt: admin.firestore.Timestamp.fromDate(expireAt),
      note: 'TTL smoke test',
    });

  console.log('[SMOKE] Doc créé', { key, expireAt: expireAt.toISOString() });
  console.log('[SMOKE] Attends ~3–10 min puis vérifie qu’il disparaît.');
  process.exit(0);
})().catch((e) => {
  console.error('[SMOKE] Échec', e);
  process.exit(1);
});
