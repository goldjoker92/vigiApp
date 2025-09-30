// ============================================================================
// VigiApp — Functions "default" (alerts, jobs)
// Point d’entrée du codebase: alertes publiques + maintenance
// ============================================================================
const { setGlobalOptions } = require('firebase-functions/v2/options');

setGlobalOptions({
  region: 'southamerica-east1',
  cors: true,
  timeoutSeconds: 60,
  memory: '256MiB',
  concurrency: 40,
});

// Logger JSON uniforme
function log(level, msg, extra = {}) {
  const line = { ts: new Date().toISOString(), service: 'functions-default', level, msg, ...extra };
  const text = JSON.stringify(line);
  if (level === 'error') {console.error(text);}
  else if (level === 'warn') {console.warn(text);}
  else {console.log(text);}
}

log('info', 'Loaded codebase: default');

// ── Exports
try {
  exports.sendPublicAlertByAddress =
    require('./src/sendPublicAlertByAddress').sendPublicAlertByAddress;
  log('info', 'Function exported', { fn: 'sendPublicAlertByAddress' });
} catch (e) {
  log('error', 'Export failed', { fn: 'sendPublicAlertByAddress', error: String(e?.message || e) });
  throw e; // fail fast: pas de déploiement partiel
}

try {
  const maint = require('./src/maintenance');
  exports.purgeStaleDevices = maint.purgeStaleDevices;
  exports.cleanupDeadTokens = maint.cleanupDeadTokens;
  log('info', 'Functions exported', { fns: ['purgeStaleDevices', 'cleanupDeadTokens'] });
} catch (e) {
  log('warn', 'Maintenance exports failed', { error: String(e?.message || e) });
  // Non-bloquant
}
