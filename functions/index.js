/**
 * VigiApp — Cloud Functions (Node 20, CJS)
 * Agrégateur des exports (ne contient pas de logique métier).
 * On garde des noms d'exports IDENTIQUES pour éviter toute régression.
 */

const functions = require("firebase-functions");

// Options globales pour tout le code (région + limites)
functions.setGlobalOptions({
  region: "us-central1",
  maxInstances: 10,
});

// Exports modulaires (les noms DOIVENT rester identiques)
exports.purgeAndArchiveOldRequestsAndChats = require("./src/purge").purgeAndArchiveOldRequestsAndChats;
exports.sendPublicAlertByCEP            = require("./src/pushPublic").sendPublicAlertByCEP;
exports.sendPrivateAlertByGroup         = require("./src/pushPrivate").sendPrivateAlertByGroup;
