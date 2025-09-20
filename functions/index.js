/**
 * functions/index.js
 * -------------------------------------------------------------
 * Point d’entrée Functions (v2) — CommonJS
 * - Garde tous les exports existants (compatibilité)
 * - Init Firebase Admin (idempotent)
 * - Options globales (région, ressources)
 * - Expose un /ping de santé
 * - Lazy-load des handlers (HTTP/Firestore) pour éviter les cold starts lourds
 * - NEW: expose le trigger Firestore fanoutPublicAlert (onCreate publicAlerts)
 * -------------------------------------------------------------
 */

const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

// ---------- Healthcheck minimal (toujours dispo, pas de lazy-load) ----------
exports.ping = onRequest((req, res) => {
  const ts = Date.now();
  console.log('[PING] ok', { ts, method: req.method, path: req.path });
  res.status(200).json({ ok: true, ts });
});

// ---------- Initialisation Firebase Admin (idempotente) ----------
try {
  admin.initializeApp();
  console.log('[BOOT] Firebase Admin initialisé');
} catch (e) {
  // Sous Functions, un double chargement peut se produire; on log sans casser.
  console.warn('[BOOT] Firebase Admin déjà initialisé ?', e?.message || e);
}

// ---------- Options globales Functions v2 ----------
const REGION = process.env.FUNCTIONS_REGION || 'southamerica-east1';
const MAX_INSTANCES = Number(process.env.FUNCTIONS_MAX_INSTANCES || 10);

setGlobalOptions({
  region: REGION,
  maxInstances: MAX_INSTANCES,
  // memoryMiB: 256, // décommente si besoin
  // timeoutSeconds: 60, // décommente si besoin
});

console.log('[BOOT] Functions v2 configurées', {
  region: REGION,
  maxInstances: MAX_INSTANCES,
  node: process.version,
  env: {
    FIREBASE_CONFIG: !!process.env.FIREBASE_CONFIG,
    GCLOUD_PROJECT: process.env.GCLOUD_PROJECT,
    FUNCTIONS_EMULATOR: !!process.env.FUNCTIONS_EMULATOR,
  },
});

// ============================================================================
// L A Z Y   E X P O R T S
// ----------------------------------------------------------------------------
// Chaque export est une petite fonction qui require le module au moment du call.
// Avantages :
//  - Cold start plus léger (pas de chargement massif au boot).
//  - Moins de timeouts Node 20 lors du chargement.
//  - Isolation claire des responsabilités (src/*).
// ============================================================================

// ---------- Maintenance / purge ----------
exports.purgeAndArchiveOldRequestsAndChats = (...args) => {
  console.log('[LAZY-LOAD] ./src/purge -> purgeAndArchiveOldRequestsAndChats');
  const { purgeAndArchiveOldRequestsAndChats } = require('./src/purge');
  return purgeAndArchiveOldRequestsAndChats(...args);
};

// ---------- Public alerts par CEP (HTTP) ----------
exports.sendPublicAlertByCEP = (...args) => {
  console.log('[LAZY-LOAD] ./src/pushPublic -> sendPublicAlertByCEP');
  const { sendPublicAlertByCEP } = require('./src/pushPublic');
  return sendPublicAlertByCEP(...args);
};

// ---------- Private alerts par groupe (HTTP) ----------
exports.sendPrivateAlertByGroup = (...args) => {
  console.log('[LAZY-LOAD] ./src/pushPrivate -> sendPrivateAlertByGroup');
  const { sendPrivateAlertByGroup } = require('./src/pushPrivate');
  return sendPrivateAlertByGroup(...args);
};

// ---------- Test FCM (HTTP) ----------
exports.testFCM = (...args) => {
  console.log('[LAZY-LOAD] ./src/test -> testFCM');
  const { testFCM } = require('./src/test');
  return testFCM(...args);
};

// ---------- Public alerts par adresse (HTTP) ----------
exports.sendPublicAlertByAddress = (...args) => {
  console.log('[LAZY-LOAD] ./src/pushPublic -> sendPublicAlertByAddress');
  const { sendPublicAlertByAddress } = require('./src/pushPublic');
  return sendPublicAlertByAddress(...args);
};

// ---------- Public alerts générique (HTTP) ----------
exports.sendPublicAlert = (...args) => {
  console.log('[LAZY-LOAD] ./src/pushPublic -> sendPublicAlert');
  const { sendPublicAlert } = require('./src/pushPublic');
  return sendPublicAlert(...args);
};

// ---------- NEW: Trigger Firestore (fan-out 1 km) ----------
// - onDocumentCreated('publicAlerts/{alertId}')
// - Sélection ≤ 1 km (geohash bbox + Haversine)
// - Envoi FCM multicast
// - Log de diffusion -> collection alertDeliveries
// NB: Le code du trigger est dans ./src/alerts (pour rester léger ici)
exports.fanoutPublicAlert = (...args) => {
  console.log('[LAZY-LOAD] ./src/alerts -> fanoutPublicAlert');
  const { fanoutPublicAlert } = require('./src/alerts');
  return fanoutPublicAlert(...args);
};

// ---------- Fin de déclaration ----------
console.log('[BOOT] Endpoints déclarés (lazy mode):', {
  ping: true,
  purgeAndArchiveOldRequestsAndChats: true,
  sendPublicAlertByCEP: true,
  sendPrivateAlertByGroup: true,
  testFCM: true,
  sendPublicAlertByAddress: true,
  sendPublicAlert: true,
  fanoutPublicAlert: true, // le trigger 1 km
});
