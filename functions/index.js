// functions/index.js
// -------------------------------------------------------------
// Point d'entrée Functions (v2) — init Firebase Admin + exports
// - Pas de régression : on conserve les exports existants
// - Lazy-require des modules src/* pour éviter les timeouts Node 20
// - Logs de démarrage pour diagnostiquer région/instances
// - Ajout de l’endpoint public par adresse (adresse complète + CEP optionnel)
// -------------------------------------------------------------
const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

// ---------- Healthcheck minimal (toujours dispo) ----------
exports.ping = onRequest((req, res) => {
  res.status(200).json({ ok: true, ts: Date.now() });
});

// ---------- Init Admin ----------
try {
  admin.initializeApp();
  console.log('[BOOT] Firebase Admin initialisé');
} catch (e) {
  console.warn('[BOOT] Firebase Admin déjà initialisé ?', e?.message || e);
}

// ---------- Options globales ----------
const REGION = process.env.FUNCTIONS_REGION || 'southamerica-east1';
setGlobalOptions({
  region: REGION,
  maxInstances: 10,
});
console.log('[BOOT] Functions v2 configurées', { region: REGION, maxInstances: 10 });

// ---------- Lazy-exports des endpoints ----------
// Chaque require est exécuté seulement quand la fonction est appelée
// => évite les blocages au boot sous Node 20

exports.purgeAndArchiveOldRequestsAndChats = (...args) => {
  console.log('[LAZY-LOAD] ./src/purge -> purgeAndArchiveOldRequestsAndChats');
  const { purgeAndArchiveOldRequestsAndChats } = require('./src/purge');
  return purgeAndArchiveOldRequestsAndChats(...args);
};

exports.sendPublicAlertByCEP = (...args) => {
  console.log('[LAZY-LOAD] ./src/pushPublic -> sendPublicAlertByCEP');
  const { sendPublicAlertByCEP } = require('./src/pushPublic');
  return sendPublicAlertByCEP(...args);
};

exports.sendPrivateAlertByGroup = (...args) => {
  console.log('[LAZY-LOAD] ./src/pushPrivate -> sendPrivateAlertByGroup');
  const { sendPrivateAlertByGroup } = require('./src/pushPrivate');
  return sendPrivateAlertByGroup(...args);
};

exports.testFCM = (...args) => {
  console.log('[LAZY-LOAD] ./src/test -> testFCM');
  const { testFCM } = require('./src/test');
  return testFCM(...args);
};

// ---------- Nouveaux endpoints publics ----------
exports.sendPublicAlertByAddress = (...args) => {
  console.log('[LAZY-LOAD] ./src/pushPublic -> sendPublicAlertByAddress');
  const { sendPublicAlertByAddress } = require('./src/pushPublic');
  return sendPublicAlertByAddress(...args);
};

exports.sendPublicAlert = (...args) => {
  console.log('[LAZY-LOAD] ./src/pushPublic -> sendPublicAlert');
  const { sendPublicAlert } = require('./src/pushPublic');
  return sendPublicAlert(...args);
};

// ---------- Log de fin de boot ----------
console.log('[BOOT] Endpoints déclarés (lazy mode):', {
  purgeAndArchiveOldRequestsAndChats: true,
  sendPublicAlertByCEP: true,
  sendPrivateAlertByGroup: true,
  testFCM: true,
  sendPublicAlertByAddress: true,
  sendPublicAlert: true,
});
