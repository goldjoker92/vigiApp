// ============================================================================
// VigiApp — Functions "default" (alerts, jobs)
// Export minimal et robuste de la fonction d'alerte publique
// ============================================================================

const { setGlobalOptions } = require('firebase-functions/v2/options');

// ▸ Options globales appliquées à TOUTES les functions de ce codebase
setGlobalOptions({
  region: 'southamerica-east1',
  cors: true,
  timeoutSeconds: 60,
  memory: '256MiB',
  concurrency: 40,
});

// ─────────────────────────────────────────────────────────────────────────────
// Logging util : format uniforme
function log(level, msg, extra = {}) {
  // level: debug|info|warn|error
  const line = {
    ts: new Date().toISOString(),
    service: 'functions-default',
    level,
    msg,
    ...extra,
  };
  const text = JSON.stringify(line);
  if (level === 'error') {
    console.error(text);
  } else if (level === 'warn') {
    console.warn(text);
  } else {
    console.log(text);
  }
}

// Petit "ping" au chargement du code (utile en cold start)
log('info', 'Loaded codebase: default');

// ─────────────────────────────────────────────────────────────────────────────
// Export direct de la Cloud Function v2 déjà créée dans src/sendPublicAlertByAddress
// ⚠️ NE PAS ré-emballer avec un autre onRequest (sinon régressions possibles)
try {
  exports.sendPublicAlertByAddress =
    require('./src/sendPublicAlertByAddress').sendPublicAlertByAddress;
  log('info', 'Function exported', { fn: 'sendPublicAlertByAddress' });
} catch (e) {
  log('error', 'Export failed', { fn: 'sendPublicAlertByAddress', error: String(e?.message || e) });
  // En prod, on préfère échouer fort ici plutôt que déployer une surface partielle
  throw e;
}
