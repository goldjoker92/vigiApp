// functions/src/index.js
// ============================================================================
// VigiApp — Cloud Functions (clean, v2, sans anciens handlers d'upload)
// Garde: verifyGuardian, sendPublicAlertByAddress
// ============================================================================

const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');

// Région par défaut (aligne avec tes URLs existantes)
setGlobalOptions({ region: 'southamerica-east1' });

// ⚠️ Adapte ces chemins à tes fichiers RÉELS
const verifyGuardianHandler = require('./verifyGuardian');
const sendPublicAlertByAddressHandler = require('./alerts/sendPublicAlertByAddress');

// Exports (avec CORS autorisé)
exports.verifyGuardian = onRequest({ cors: true }, verifyGuardianHandler);
exports.sendPublicAlertByAddress = onRequest({ cors: true }, sendPublicAlertByAddressHandler);
