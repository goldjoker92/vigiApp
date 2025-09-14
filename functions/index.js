const admin = require('firebase-admin');
const { setGlobalOptions } = require('firebase-functions/v2');

admin.initializeApp();

setGlobalOptions({
  // Mets la région qui t’arrange (BR conseillé)
  region: process.env.FUNCTIONS_REGION || 'southamerica-east1',
  maxInstances: 10,
});

// 👉 modules dans functions/src/
exports.purgeAndArchiveOldRequestsAndChats =
  require('./src/purge').purgeAndArchiveOldRequestsAndChats;
exports.sendPublicAlertByCEP = require('./src/pushPublic').sendPublicAlertByCEP;
exports.sendPrivateAlertByGroup = require('./src/pushPrivate').sendPrivateAlertByGroup;
