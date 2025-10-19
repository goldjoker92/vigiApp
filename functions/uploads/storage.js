// ============================================================================
// functions/src/uploads/storage.js
// GCS via Firebase Admin (robuste aux manques de deps logger/redact)
// - writeOriginal(buffer, mime, path, {traceId, spanId})
// - writeRedacted(buffer, mime, path, {traceId, spanId}) -> { signedUrl }
// - getGsUrl(path), getHttpUrl(path), getReadSignedUrl(path, opts), getBucketName()
// ============================================================================

const admin = require('firebase-admin');

// ---------- Logger tolérant (fallback console JSON) --------------------------
let _log = null, _warn = null, _err = null;
try {
  const { log, warn, err } = require('../utils/logger');
  _log = log; _warn = warn; _err = err;
} catch {
  const nowIso = () => new Date().toISOString();
  const out = (lvl, msg, extra={}) => {
    const line = JSON.stringify({ ts: nowIso(), lvl, mod: 'storage', msg, ...extra });
    if (lvl === 'error') {console.error(line);}
    else if (lvl === 'warn') {console.warn(line);}
    else {console.log(line);}
  };
  _log = (msg, extra) => out('info', msg, extra);
  _warn = (msg, extra) => out('warn', msg, extra);
  _err = (msg, extra) => out('error', msg, extra);
}

// ---------- Redaction/pixelisation tolérante (fallback no-op) ---------------
let _pixelate = null;
try {
  // Doit exporter: pixelate(buffer, mime, ctx?) -> Buffer
  _pixelate = require('./redact').pixelate;
} catch {
  _pixelate = async (buffer, _mime, _ctx) => buffer; // no-op si module absent
}

// ---------- Config -----------------------------------------------------------
const DEFAULT_TTL_SEC = parseInt(process.env.SIGNED_URL_TTL_SECONDS || '600', 10) || 600;

// Résolution explicite du bucket si possible (UPLOAD_BUCKET > PROJECT_ID.appspot.com)
function resolveBucketName() {
  const explicit = process.env.UPLOAD_BUCKET || process.env.STORAGE_BUCKET;
  if (explicit) {return explicit;}
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || process.env.PROJECT_ID;
  return projectId ? `${projectId}.appspot.com` : null;
}

const BUCKET_NAME = resolveBucketName();
if (!BUCKET_NAME) {
  _warn('no explicit bucket provided; using admin.storage().bucket() default');
}
const bucket = BUCKET_NAME ? admin.storage().bucket(BUCKET_NAME) : admin.storage().bucket();

// ---------- Helpers URL ------------------------------------------------------
function getBucketName() {
  return (bucket && (bucket.name || bucket.id)) ? (bucket.name || bucket.id).replace(/^gs:\/\//, '') : '';
}

function getGsUrl(p) {
  return `gs://${getBucketName()}/${String(p).replace(/^\/+/, '')}`;
}

function getHttpUrl(p) {
  return `https://storage.googleapis.com/${getBucketName()}/${encodeURI(String(p).replace(/^\/+/, ''))}`;
}

async function getReadSignedUrl(p, opts = {}) {
  const ttlSeconds = Number.isFinite(opts.ttlSeconds) ? opts.ttlSeconds : DEFAULT_TTL_SEC;
  const dispName = (opts.fileNameForDownload || '').trim().replace(/"/g, '');
  try {
    const file = bucket.file(String(p).replace(/^\/+/, ''));
    const cfg = {
      action: 'read',
      expires: Date.now() + ttlSeconds * 1000,
      version: 'v4',
    };
    if (dispName) {
      // Attention: pour v4, on utilise "response-content-disposition" via "extensionHeaders" n’est pas supporté;
      // getSignedUrl gère `promptSaveAs`/`responseDisposition` côté v2/v4 nouvelle API.
      cfg.responseDisposition = `inline; filename="${dispName}"`;
    }
    const [url] = await file.getSignedUrl(cfg);
    _log('signed_url_ok', { path: p, ttlSeconds });
    return url;
  } catch (e) {
    _err('signed_url_failed', { path: p, error: String(e?.message || e) });
    return null;
  }
}

// ---------- Écritures --------------------------------------------------------
async function writeOriginal(buffer, mime, p, trace = {}) {
  const file = bucket.file(String(p).replace(/^\/+/, ''));
  const { traceId = null, spanId = null } = trace || {};
  try {
    await file.save(buffer, {
      resumable: false,
      validation: false,
      metadata: {
        contentType: mime || 'application/octet-stream',
        cacheControl: 'private, max-age=0',
        metadata: { traceId, spanId, kind: 'original' },
      },
    });
    _log('original_saved', {
      path: p, mime, bucket: getBucketName(), size: buffer?.length || null, traceId, spanId,
    });
    return { ok: true, path: p };
  } catch (e) {
    _err('original_save_failed', { path: p, mime, bucket: getBucketName(), error: String(e?.message || e), traceId, spanId });
    throw e;
  }
}

async function writeRedacted(buffer, mime, p, trace = {}) {
  const file = bucket.file(String(p).replace(/^\/+/, ''));
  const { traceId = null, spanId = null } = trace || {};
  try {
    // Pixelate si dispo, sinon no-op
    const redacted = await _pixelate(buffer, mime, { traceId, spanId });
    await file.save(redacted, {
      resumable: false,
      validation: false,
      metadata: {
        contentType: mime || 'application/octet-stream',
        cacheControl: 'public, max-age=3600',
        metadata: { traceId, spanId, kind: 'redacted' },
      },
    });
    _log('redacted_saved', {
      path: p, mime, bucket: getBucketName(), size: redacted?.length || null, traceId, spanId,
    });

    const signedUrl = await getReadSignedUrl(p, { ttlSeconds: DEFAULT_TTL_SEC });
    return { ok: true, path: p, signedUrl };
  } catch (e) {
    _err('redacted_save_failed', { path: p, mime, bucket: getBucketName(), error: String(e?.message || e), traceId, spanId });
    throw e;
  }
}

// ---------- Exports ----------------------------------------------------------
module.exports = {
  writeOriginal,
  writeRedacted,
  getGsUrl,
  getHttpUrl,
  getReadSignedUrl,
  getBucketName,
};
