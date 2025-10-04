// functions/index.js
// ============================================================================
// VigiApp — Functions "default" (alerts, jobs, ACK)
// Point d’entrée du codebase: alertes publiques + maintenance + ACK
// - Options globales cohérentes
// - Logger JSON uniforme
// - safeRequire tolérant (src/ -> racine, variantes .cjs)
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
  if (level === 'error') { console.error(text); }
  else if (level === 'warn') { console.warn(text); }
  else { console.log(text); }
}

log('info', 'Loaded codebase: default');

// ---------------------------------------------------------------------------
// Require helper avec fallback (src/ -> racine), tolère .js et .cjs
// ---------------------------------------------------------------------------
function safeRequire(paths, exportName = null, required = true) {
  let mod = null;
  let lastErr = null;

  for (const p of paths) {
    try {
      const m = require(p);
      mod = exportName ? m?.[exportName] : m;
      if (!mod) { throw new Error(`Export "${exportName}" introuvable dans ${p}`); }
      log('info', 'Module loaded', { path: p, exportName: exportName || '(module)' });
      return mod;
    } catch (e) {
      lastErr = e;
      log('warn', 'Module load failed, try next', { pathTried: p, error: String(e?.message || e) });
    }
  }

  if (required) {
    log('error', 'All module paths failed', { exportName, paths, error: String(lastErr?.message || lastErr) });
    throw lastErr || new Error(`Cannot load ${exportName || 'module'}`);
  }

  log('warn', 'Optional module not loaded', { exportName, paths });
  return null;
}

// ---------------------------------------------------------------------------
// Exports — Public Alerts
// ---------------------------------------------------------------------------
try {
  const sendPublicAlertByAddress = safeRequire(
    [
      './src/sendPublicAlertByAddress',
      './sendPublicAlertByAddress',
      './src/sendPublicAlertByAddress.cjs',
      './sendPublicAlertByAddress.cjs',
    ],
    'sendPublicAlertByAddress',
    true
  );
  exports.sendPublicAlertByAddress = sendPublicAlertByAddress;
  log('info', 'Function exported', { fn: 'sendPublicAlertByAddress' });
} catch (e) {
  log('error', 'Export failed', { fn: 'sendPublicAlertByAddress', error: String(e?.message || e) });
  throw e; // fail fast
}

// ---------------------------------------------------------------------------
// Exports — ACK (réception / tap) des alertes publiques
// ---------------------------------------------------------------------------
try {
  const ackPublicAlertReceipt = safeRequire(
    [
      './src/ackPublicAlert',
      './ackPublicAlert',
      './src/ackPublicAlert.cjs',
      './ackPublicAlert.cjs',
    ],
    'ackPublicAlertReceipt',
    true
  );
  exports.ackPublicAlertReceipt = ackPublicAlertReceipt;
  log('info', 'Function exported', { fn: 'ackPublicAlertReceipt' });
} catch (e) {
  log('error', 'Export failed', { fn: 'ackPublicAlertReceipt', error: String(e?.message || e) });
  throw e; // fail fast
}

// ---------------------------------------------------------------------------
// Exports — Maintenance (non bloquant si absent)
// ---------------------------------------------------------------------------
try {
  const maintModule = safeRequire(
    [
      './src/maintenance',
      './maintenance',
      './src/maintenance.cjs',
      './maintenance.cjs',
    ],
    null,
    false
  );

  if (maintModule?.purgeStaleDevices) {
    exports.purgeStaleDevices = maintModule.purgeStaleDevices;
  }
  if (maintModule?.cleanupDeadTokens) {
    exports.cleanupDeadTokens = maintModule.cleanupDeadTokens;
  }

  if (maintModule?.purgeStaleDevices || maintModule?.cleanupDeadTokens) {
    log('info', 'Functions exported', {
      fns: [
        maintModule?.purgeStaleDevices ? 'purgeStaleDevices' : null,
        maintModule?.cleanupDeadTokens ? 'cleanupDeadTokens' : null,
      ].filter(Boolean),
    });
  } else {
    log('warn', 'Maintenance module loaded but no exports found', {});
  }
} catch (e) {
  log('warn', 'Maintenance exports failed (non-blocking)', { error: String(e?.message || e) });
}

// Sanity: liste finale des exports actifs
log('info', 'Exports ready', { fns: Object.keys(exports) });
