// ============================================================================
// functions/src/utils/logger.js
// Logger JSON homogène (info/warn/error) + helpers
// - API: log(msg, extra?), warn(msg, extra?), err(msg, extra?)
// - Ajoute ts, lvl, mod (module), msg et fusionne extra
// - Support traceId/spanId si fournis dans extra
// - Fournit logger.child(mod) pour préfixer le module automatiquement
// ============================================================================

const nowIso = () => new Date().toISOString();

function out(level, mod, msg, extra = {}) {
  try {
    const line = {
      ts: nowIso(),
      lvl: level, // "info" | "warn" | "error"
      mod: mod || 'app', // nom du module (ex: 'upload', 'storage', 'redact')
      msg: String(msg || ''),
      ...extra, // ex: { traceId, spanId, path, mime, size, ... }
    };
    const text = JSON.stringify(line);
    if (level === 'error') {
      console.error(text);
    } else if (level === 'warn') {
      console.warn(text);
    } else {
      console.log(text);
    }
  } catch {
    // Fallback minimal si JSON.stringify casse sur un objet circulaire
    const safe = `[${nowIso()}][${mod || 'app'}][${level.toUpperCase()}] ${String(msg)} ${safeKVs(extra)}`;
    if (level === 'error') {
      console.error(safe);
    } else if (level === 'warn') {
      console.warn(safe);
    } else {
      console.log(safe);
    }
  }
}

// Transforme un objet en "k=v k2=v2" tolérant
function safeKVs(obj) {
  try {
    if (!obj || typeof obj !== 'object') {
      return '';
    }
    return Object.entries(obj)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(' ');
  } catch {
    return '';
  }
}

// Logger de base (module par défaut "app")
function make(mod) {
  return {
    log: (msg, extra) => out('info', mod, msg, extra),
    warn: (msg, extra) => out('warn', mod, msg, extra),
    err: (msg, extra) => out('error', mod, msg, extra),
    child: (childMod) => make(childMod || mod),
  };
}

// Exports par défaut (module "app")
const base = make('app');

exports.log = base.log;
exports.warn = base.warn;
exports.err = base.err;
exports.child = base.child;

// Liste courte: loggers préfixés utiles
exports.uploadLogger = make('upload');
exports.storageLogger = make('storage');
exports.redactLogger = make('redact');
