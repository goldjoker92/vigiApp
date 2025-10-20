/**
 * Upload multipart -> Google Cloud Storage (MULTER‑FIRST, ULTRA-VERBOSE)
 * - CommonJS (compatible index.js)
 * - Ne RE-PARSE JAMAIS le flux si req.file est présent (évite "Unexpected end of form")
 * - Accepte champs texte via req.body (fournis par Multer)
 */

const crypto = require('crypto');
const { Storage } = require('@google-cloud/storage');

const storage = new Storage();

// ---- Config ----
const DEFAULT_BUCKET =
  process.env.UPLOAD_BUCKET ||
  process.env.FIREBASE_STORAGE_BUCKET ||
  `${process.env.GCLOUD_PROJECT}.appspot.com`;

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

// ---- Logger JSON (même style que index.js) ----
function log(level, msg, extra = {}) {
  const line = { ts: new Date().toISOString(), service: 'upload', level, msg, ...extra };
  const text = JSON.stringify(line);
  if (level === 'error') { console.error(text); }
  else if (level === 'warn') { console.warn(text); }
  else { console.log(text); }
}

// ---- Utils ----
function safeName(name = 'upload') {
  return String(name).replace(/[^\w.\-]+/g, '_').slice(0, 80) || 'upload';
}

function extFromMime(mime) {
  if (!mime) {return 'bin';}
  if (mime === 'image/jpeg') {return 'jpg';}
  if (mime === 'image/png') {return 'png';}
  if (mime === 'image/webp') {return 'webp';}
  if (mime === 'image/heic') {return 'heic';}
  if (mime === 'image/heif') {return 'heif';}
  if (mime === 'application/pdf') {return 'pdf';}
  return 'bin';
}

async function saveBufferToGCS({ buffer, mimetype }, destPath) {
  const bucket = storage.bucket(DEFAULT_BUCKET);
  const fileRef = bucket.file(destPath);
  await fileRef.save(buffer, {
    metadata: { contentType: mimetype },
    resumable: false,
    validation: 'crc32c',
  });
  const [metadata] = await fileRef.getMetadata();
  return {
    bucket: bucket.name,
    path: destPath,
    size: Number(metadata.size) || buffer.length,
    md5: metadata.md5Hash,
    contentType: metadata.contentType,
  };
}

function buildObjectPath({ caseKind = 'child', caseId, kind = 'id_front', ext }) {
  const now = new Date();
  const stamp =
    now.getUTCFullYear() +
    String(now.getUTCMonth() + 1).padStart(2, '0') +
    String(now.getUTCDate()).padStart(2, '0') + '_' +
    String(now.getUTCHours()).padStart(2, '0') +
    String(now.getUTCMinutes()).padStart(2, '0') +
    String(now.getUTCSeconds()).padStart(2, '0');
  return `missing/${caseKind}/${caseId}/${kind}_${stamp}.${ext}`;
}

module.exports = async function handleUpload(req, res) {
  const rid = req._rid || `upl_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
  const t0 = process.hrtime.bigint();
  const idemKey = req.get('x-idempotency-key') || `upl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  // Multer doit avoir rempli req.file et req.body si l'index est correct
  const file = req.file || null;
  const { caseId = '', kind = 'id_front', userId = '', caseKind = 'child' } = req.body || {};

  log('info', 'UPLOAD/START', {
    rid,
    idemKey,
    bucket: DEFAULT_BUCKET,
    hasFile: !!file,
    bodyKeys: Object.keys(req.body || {}),
  });

  try {
    // 1) File obligatoire
    if (!file) {
      log('warn', 'VALIDATION/NO_FILE', { rid });
      return res.status(400).json({ ok: false, error: 'missing_file', msg: 'field "file" is required (multipart/form-data)' });
    }

    // 2) Taille et MIME
    const size = file.size ?? file.buffer?.length ?? 0;
    const mimetype = file.mimetype || 'application/octet-stream';
    if (size <= 0) {
      log('warn', 'VALIDATION/EMPTY_FILE', { rid });
      return res.status(400).json({ ok: false, error: 'empty_file' });
    }
    if (size > MAX_FILE_BYTES) {
      log('warn', 'VALIDATION/FILE_TOO_LARGE', { rid, size, MAX_FILE_BYTES });
      return res.status(413).json({ ok: false, error: 'file_too_large', max: MAX_FILE_BYTES });
    }
    if (!ALLOWED_MIME.has(mimetype)) {
      log('warn', 'VALIDATION/UNSUPPORTED_MIME', { rid, mimetype });
      return res.status(415).json({ ok: false, error: 'unsupported_mime', mimetype });
    }

    // 3) Champs requis
    if (!caseId || !userId) {
      log('warn', 'VALIDATION/MISSING_FIELDS', { rid, caseId: !!caseId, userId: !!userId });
      return res.status(400).json({ ok: false, error: 'missing_fields', msg: 'caseId and userId are required' });
    }

    // 4) Construction chemin + upload
    const ext = extFromMime(mimetype);
    const original = safeName(file.originalname || `upload.${ext}`);
    const object = buildObjectPath({ caseKind, caseId, kind, ext });

    log('info', 'GCS/UPLOAD_BEGIN', { rid, object, mimetype, size });
    const meta = await saveBufferToGCS({ buffer: file.buffer, mimetype, originalname: original }, object);
    log('info', 'GCS/UPLOAD_OK', { rid, object: meta.path, size: meta.size });

    // 5) Réponse OK
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    return res.status(200).json({
      ok: true,
      via: 'multer',
      idempotencyKey: idemKey,
      uploaded: {
        bucket: meta.bucket,
        object: meta.path,
        bytes: meta.size,
        mime: meta.contentType,
        original,
      },
      meta: { caseId, caseKind, kind, userId, ms: Math.round(ms) },
    });
  } catch (err) {
    const code = err?.code === 413 ? 413 : err?.code === 415 ? 415 : 500;
    log(code === 500 ? 'error' : 'warn', 'UPLOAD/ERROR', { rid, code, error: String(err?.message || err) });
    return res.status(code).json({ ok: false, error: String(err?.message || err) });
  }
};
