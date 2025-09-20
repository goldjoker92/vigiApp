/**
 * functions/index.js
 * -------------------------------------------------------------
 * Point d’entrée Functions (v2) — CommonJS
 * - Conserve la compat (exports existants)
 * - Init Firebase Admin (idempotent)
 * - Options globales (région, ressources)
 * - /ping de santé
 * - Lazy-load HTTP handlers (réduit le cold start)
 * - IMPORTANT: export direct des TRIGGERS (pas de lazy wrapper)
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
// L A Z Y   E X P O R T S  (HTTP UNIQUEMENT)
// ----------------------------------------------------------------------------
// Chaque export HTTP est un petit wrapper qui require le module au moment du call.
// Avantages :
//  - Cold start plus léger (pas de chargement massif au boot).
//  - Isolation claire des responsabilités (src/*).
// NB: Ne PAS utiliser ce pattern pour les triggers event-driven.
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

// ---------- NEW: Footprints (HTTP) ----------
exports.getAlertFootprints = (...args) => {
  console.log('[LAZY-LOAD] ./src/footprints -> getAlertFootprints');
  const { getAlertFootprints } = require('./src/footprints');
  return getAlertFootprints(...args);
};

// ============================================================================
// T R I G G E R S   (E X P O R T   D I R E C T)
// ----------------------------------------------------------------------------
// IMPORTANT: Les triggers doivent être exportés DIRECTEMENT pour que la
// plateforme puisse les enregistrer au chargement du module.
// Pas de lazy wrapper ici.
// ============================================================================

// ---------- NEW: Trigger Firestore (fan-out 1 km) ----------
// - onDocumentCreated('publicAlerts/{alertId}')
// - Sélection ≤ 1 km (geohash bbox + Haversine)
// - Envoi FCM multicast
// - Log de diffusion -> collection alertDeliveries
// NB: Le trigger est créé dans ./src/alerts et exporté tel quel ici.
exports.fanoutPublicAlert = require('./src/alerts').fanoutPublicAlert;

// ---------- Fin de déclaration ----------
console.log('[BOOT] Endpoints déclarés:', {
  ping: true,
  purgeAndArchiveOldRequestsAndChats: true,
  sendPublicAlertByCEP: true,
  sendPrivateAlertByGroup: true,
  testFCM: true,
  sendPublicAlertByAddress: true,
  sendPublicAlert: true,
  getAlertFootprints: true,
  fanoutPublicAlert: true, // trigger Firestore (export direct)
});
