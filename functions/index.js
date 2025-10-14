// ============================================================================
// VigiApp — Functions "default" (alerts, jobs, ACK, uploads)
// ============================================================================

require('module-alias/register'); // alias "@"
require('./bootstrap-config'); // hydrate process.env + logs/env

const { setGlobalOptions } = require('firebase-functions/v2/options');
const { onRequest } = require('firebase-functions/v2/https');

setGlobalOptions({
  region: process.env.HTTP_REGION || 'southamerica-east1',
  cors: true,
  timeoutSeconds: 60,
  memory: '256MiB',
  concurrency: 40,
});

// ---------------------------------------------------------------------------
// Logger JSON uniforme
// ---------------------------------------------------------------------------
function log(level, msg, extra = {}) {
  const line = { ts: new Date().toISOString(), service: 'functions-default', level, msg, ...extra };
  const text = JSON.stringify(line);
  if (level === 'error') {
    console.error(text);
  } else if (level === 'warn') {
    console.warn(text);
  } else {
    console.log(text);
  }
}
log('info', 'Loaded codebase: default');

// ---------------------------------------------------------------------------
// Require helper (tolérant, multi-chemins, même pattern que ton code)
// ---------------------------------------------------------------------------
function safeRequire(paths, exportName = null, required = true) {
  let lastErr = null;
  for (const p of paths) {
    try {
      const m = require(p);
      const mod = exportName ? m?.[exportName] : m;
      if (!mod) {
        throw new Error(`Export "${exportName}" introuvable dans ${p}`);
      }
      log('info', 'Module loaded', { path: p, exportName: exportName || '(module)' });
      return mod;
    } catch (e) {
      lastErr = e;
      log('warn', 'Module load failed, try next', { pathTried: p, error: String(e?.message || e) });
    }
  }
  if (required) {
    log('error', 'All module paths failed', {
      exportName,
      paths,
      error: String(lastErr?.message || lastErr),
    });
    throw lastErr || new Error(`Cannot load ${exportName || 'module'}`);
  }
  log('warn', 'Optional module not loaded', { exportName, paths });
  return null;
}

// ---------------------------------------------------------------------------
// Public Alerts (v2 onRequest) — déjà présent chez toi
// ---------------------------------------------------------------------------
try {
  const sendPublicAlertByAddress = safeRequire(
    ['./src/sendPublicAlertByAddress', './sendPublicAlertByAddress'],
    'sendPublicAlertByAddress',
    true,
  );
  exports.sendPublicAlertByAddress = sendPublicAlertByAddress; // module exporte déjà un onRequest
  log('info', 'Function exported', { fn: 'sendPublicAlertByAddress' });
} catch (e) {
  log('error', 'Export failed', { fn: 'sendPublicAlertByAddress', error: String(e?.message || e) });
  throw e;
}

// ---------------------------------------------------------------------------
// ACK (v2 onRequest) — déjà présent chez toi
// ---------------------------------------------------------------------------
try {
  const ackPublicAlertReceipt = safeRequire(
    ['./src/ackPublicAlert', './ackPublicAlert'],
    'ackPublicAlertReceipt',
    true,
  );
  exports.ackPublicAlertReceipt = ackPublicAlertReceipt; // module exporte déjà un onRequest
  log('info', 'Function exported', { fn: 'ackPublicAlertReceipt' });
} catch (e) {
  log('error', 'Export failed', { fn: 'ackPublicAlertReceipt', error: String(e?.message || e) });
  throw e;
}

// ---------------------------------------------------------------------------
// UPLOAD MISSING CHILD DOC (v2 onRequest) — NOUVEAU
// - Notre module exporte un handler (req,res). Ici on le wrappe en v2 onRequest.
// - CORS global déjà activé via setGlobalOptions({ cors: true }), et le handler
//   gère aussi les OPTIONS pour être robuste côté client.
// ---------------------------------------------------------------------------
try {
  const uploadHandler = safeRequire(
    ['./src/uploads/handleUpload', './uploads/handleUpload'],
    'uploadMissingChildDoc',
    true,
  );
  exports.uploadMissingChildDoc = onRequest(uploadHandler); // wrap v2
  log('info', 'Function exported', { fn: 'uploadMissingChildDoc' });
} catch (e) {
  log('error', 'Export failed', { fn: 'uploadMissingChildDoc', error: String(e?.message || e) });
  throw e;
}

// ---------------------------------------------------------------------------
// Maintenance (optionnel) — même pattern que chez toi
// ---------------------------------------------------------------------------
try {
  const maint = safeRequire(['./src/maintenance', './maintenance'], null, false);
  if (maint?.purgeStaleDevices) {
    exports.purgeStaleDevices = maint.purgeStaleDevices;
  }
  if (maint?.cleanupDeadTokens) {
    exports.cleanupDeadTokens = maint.cleanupDeadTokens;
  }
  log('info', 'Exports ready', { fns: Object.keys(exports) });
} catch (e) {
  log('warn', 'Maintenance exports failed (non-blocking)', { error: String(e?.message || e) });
  log('info', 'Exports ready', { fns: Object.keys(exports) });
}

// Dump env utile au boot (comme ton code)
console.log(
  JSON.stringify({
    boot_env: {
      HTTP_REGION: process.env.HTTP_REGION,
      APP_ENV: process.env.APP_ENV,
      ALERTS_CHAN: process.env.ALERTS_CHAN,
      FCM_SERVER_KEY_len: (process.env.FCM_SERVER_KEY || '').length,
    },
  }),
);
// ❗ Ne rajoute PAS d’exports manuels en bas.
