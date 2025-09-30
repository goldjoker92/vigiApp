// ============================================================================
// VigiApp — Maintenance (purge devices obsolètes + ménage deadTokens)
// Exécute 1x/jour. Met active=false si updatedAt > 30j.
// Supprime les deadTokens vieux de 90j (si tu veux garder l’historique plus court).
// ============================================================================
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

try {
  admin.app();
} catch {
  admin.initializeApp();
}

const REGION = 'southamerica-east1';
const STALE_DEVICE_DAYS = 30;
const DEADTOKEN_DAYS = 90;

exports.purgeStaleDevices = onSchedule(
  { schedule: 'every 24 hours', timeZone: 'America/Fortaleza', region: REGION },
  async () => {
    const db = admin.firestore();
    const cutoff = Date.now() - STALE_DEVICE_DAYS * 86400000;

    const snap = await db.collection('devices').where('active', '==', true).get();

    let deactivated = 0;
    for (const doc of snap.docs) {
      const d = doc.data();
      const t = d?.updatedAt?.toMillis?.() ?? 0;
      if (t && t < cutoff) {
        await doc.ref.set({ active: false }, { merge: true });
        deactivated++;
      }
    }
    console.log('[MAINT] purgeStaleDevices', { scanned: snap.size, deactivated });
  },
);

exports.cleanupDeadTokens = onSchedule(
  { schedule: 'every 24 hours', timeZone: 'America/Fortaleza', region: REGION },
  async () => {
    const db = admin.firestore();
    const cutoff = Date.now() - DEADTOKEN_DAYS * 86400000;

    // Si tu as activé l’écriture dans deadTokens dans enqueueDLQ()
    const snap = await db.collection('deadTokens').orderBy('ts', 'asc').limit(1000).get();
    let removed = 0;
    for (const doc of snap.docs) {
      const t = doc.data()?.ts?.toMillis?.() ?? 0;
      if (t && t < cutoff) {
        await doc.ref.delete();
        removed++;
      }
    }
    console.log('[MAINT] cleanupDeadTokens', { scanned: snap.size, removed });
  },
);
// ============================================================================
