// functions/index.js
const admin = require('firebase-admin');
const { setGlobalOptions } = require('firebase-functions/v2');

admin.initializeApp();

setGlobalOptions({
  region: process.env.FUNCTIONS_REGION || 'southamerica-east1',
  maxInstances: 10,
});

// existants
exports.purgeAndArchiveOldRequestsAndChats =
  require('./src/purge').purgeAndArchiveOldRequestsAndChats;
exports.sendPublicAlertByCEP = require('./src/pushPublic').sendPublicAlertByCEP;
exports.sendPrivateAlertByGroup = require('./src/pushPrivate').sendPrivateAlertByGroup;

// 👉 nouveau: test HTTP FCM
exports.testFCM = require('./src/test').testFCM;
