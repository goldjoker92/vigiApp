// functions/index.js
// -------------------------------------------------------------
// Point d'entrée Functions (v2) — init Firebase Admin + exports
// - Pas de régression : on conserve les exports existants
// - Logs de démarrage pour diagnostiquer région/instances
// - Ajout de l’endpoint public par adresse (adresse complète + CEP optionnel)
// -------------------------------------------------------------

const admin = require('firebase-admin');
const { setGlobalOptions } = require('firebase-functions/v2');

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

// ---------- Exports existants (NO REGRESSION) ----------
exports.purgeAndArchiveOldRequestsAndChats =
  require('./src/purge').purgeAndArchiveOldRequestsAndChats;

exports.sendPublicAlertByCEP =
  require('./src/pushPublic').sendPublicAlertByCEP;

exports.sendPrivateAlertByGroup =
  require('./src/pushPrivate').sendPrivateAlertByGroup;

// ---------- Nouveau : HTTP FCM de test ----------
exports.testFCM =
  require('./src/test').testFCM;

// ---------- Nouveau : Public alert par adresse complète ----------
try {
  exports.sendPublicAlertByAddress =
    require('./src/pushPublic').sendPublicAlertByAddress;

  console.log('[BOOT] Endpoints chargés:', {
    purgeAndArchiveOldRequestsAndChats: true,
    sendPublicAlertByCEP: true,
    sendPrivateAlertByGroup: true,
    testFCM: true,
    sendPublicAlertByAddress: true,
  });
} catch (e) {
  console.warn('[BOOT] sendPublicAlertByAddress non disponible:', e?.message || e);
}
