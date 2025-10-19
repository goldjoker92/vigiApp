/**
 * Upload multipart -> Google Cloud Storage (ULTRA-VERBOSE)
 * - CommonJS (compatible avec index.js)
 * - Logs détaillés: entrée, parsing, tailles, GCS, sortie
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Storage } = require('@google-cloud/storage');
const Busboy = require('busboy');

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

// ---- Logger JSON local (même style que index.js) ----
function log(level, msg, extra = {}) {
  const line = { ts: new Date().toISOString(), service: 'upload', level, msg, ...extra };
  const text = JSON.stringify(line);
  if (level === 'error') {console.error(text);}
  else if (level === 'warn') {console.warn(text);}
  else {console.log(text);}
}

// ---- Utils ----
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

function tmpFilepath(ext = 'bin') {
  const name = `upl_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
  return path.join(os.tmpdir(), name);
}

function rmSilent(p) { try { fs.unlinkSync(p); } catch {} }

// ---- Multipart parsing (ultra-logué) ----
function parseMultipart(req, rid) {
  return new Promise((resolve, reject) => {
    const ct = String(req.headers['content-type'] || '');
    if (!ct.toLowerCase().startsWith('multipart/form-data')) {
      log('warn', 'PARSE/CT_INVALID', { rid, contentType: ct });
      return reject(Object.assign(new Error('bad_content_type'), { code: 415 }));
    }

    const busboy = Busboy({
      headers: req.headers,
      limits: { fileSize: MAX_FILE_BYTES, files: 1 },
    });

    const fields = {};
    let fileInfo = null;
    let fileTooLarge = false;

    log('info', 'PARSE/START', { rid, limits: { MAX_FILE_BYTES } });

    busboy.on('field', (name, val, info) => {
      // Garder une trace concise (évite de dump des payloads géants)
      fields[name] = val;
      log('info', 'PARSE/FIELD', { rid, name, valueLen: String(val ?? '').length, encoding: info?.encoding });
    });

    busboy.on('file', (name, file, info) => {
      const { filename, mimeType, encoding } = info;
      log('info', 'PARSE/FILE_BEGIN', { rid, field: name, filename, mimeType, encoding });

      if (!ALLOWED_MIME.has(mimeType)) {
        log('warn', 'PARSE/UNSUPPORTED_MIME', { rid, mimeType });
        file.resume();
        return reject(Object.assign(new Error(`unsupported_mime ${mimeType}`), { code: 415 }));
      }

      const ext = extFromMime(mimeType);
      const tmp = tmpFilepath(ext);
      const writeStream = fs.createWriteStream(tmp);

      let bytes = 0;
      file.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > MAX_FILE_BYTES) {
          fileTooLarge = true;
          log('warn', 'PARSE/FILE_TOO_LARGE_STREAM', { rid, bytes, MAX_FILE_BYTES });
          file.unpipe(writeStream);
          writeStream.destroy();
          file.resume();
        }
      });

      file.pipe(writeStream);

      writeStream.on('finish', () => {
        if (fileTooLarge) {
          rmSilent(tmp);
          return reject(Object.assign(new Error('file_too_large'), { code: 413 }));
        }
        fileInfo = {
          tmp,
          bytes,
          mimeType,
          ext,
          fieldName: name,
          originalName: filename || 'upload',
        };
        log('info', 'PARSE/FILE_DONE', { rid, bytes, mimeType, tmp });
      });

      writeStream.on('error', (err) => {
        rmSilent(tmp);
        log('error', 'PARSE/WRITE_ERROR', { rid, error: String(err?.message || err) });
        reject(err);
      });
    });

    busboy.on('error', (err) => {
      log('error', 'PARSE/ERROR', { rid, error: String(err?.message || err) });
      reject(err);
    });

    busboy.on('finish', () => {
      log('info', 'PARSE/FINISH', { rid, fieldsCount: Object.keys(fields).length, hasFile: !!fileInfo });
      resolve({ fields, fileInfo });
    });

    req.pipe(busboy);
  });
}

// ---- Upload GCS (logué) ----
async function uploadToGCS(localPath, { caseId, kind, userId, caseKind, mimeType, ext }, rid) {
  const bucket = storage.bucket(DEFAULT_BUCKET);
  const now = new Date();
  const stamp =
    now.getUTCFullYear() +
    String(now.getUTCMonth() + 1).padStart(2, '0') +
    String(now.getUTCDate()).padStart(2, '0') + '_' +
    String(now.getUTCHours()).padStart(2, '0') +
    String(now.getUTCMinutes()).padStart(2, '0') +
    String(now.getUTCSeconds()).padStart(2, '0');

  const _caseKind = caseKind || 'child';
  const object = `missing/${_caseKind}/${caseId}/${kind || 'id_front'}_${stamp}.${ext}`;

  log('info', 'GCS/UPLOAD_BEGIN', { rid, bucket: bucket.name, object, mimeType });

  await bucket.upload(localPath, {
    destination: object,
    metadata: {
      contentType: mimeType,
      metadata: {
        caseId, kind, userId,
        caseKind: _caseKind,
        uploadedAt: new Date().toISOString(),
      },
    },
  });

  log('info', 'GCS/UPLOAD_OK', { rid, bucket: bucket.name, object });
  return { bucket: bucket.name, object };
}

// ---- Handler principal ----
module.exports = async function handleUpload(req, res) {
  // Recycle le requestId généré par index.js si présent, sinon crée un local
  const rid = req._rid || `upl_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
  const t0 = process.hrtime.bigint();

  const idemKey =
    req.get('x-idempotency-key') ||
    `upl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  log('info', 'UPLOAD/START', {
    rid,
    idemKey,
    ip: req.ip,
    ua: req.headers['user-agent'],
    ctype: req.headers['content-type'],
    clen: req.headers['content-length'],
    bucket: DEFAULT_BUCKET,
  });

  let tmpToCleanup = null;

  try {
    // 1) Parse multipart
    const { fields, fileInfo } = await parseMultipart(req, rid);

    // trace champs reçus (sans dump le contenu)
    const caseId = String(fields.caseId || '').trim();
    const kind = String(fields.kind || '').trim();
    const userId = String(fields.userId || '').trim();
    const caseKind = String(fields.caseKind || '').trim();

    log('info', 'FIELDS/RECEIVED', {
      rid,
      keys: Object.keys(fields),
      caseId_present: !!caseId,
      kind_present: !!kind,
      userId_present: !!userId,
      caseKind_value: caseKind || '(default child)',
    });

    if (!fileInfo) {
      log('warn', 'VALIDATION/NO_FILE', { rid });
      return res.status(400).json({ ok: false, error: 'missing_file', msg: 'form-data field "file" is required' });
    }

    if (!caseId || !kind || !userId) {
      tmpToCleanup = fileInfo.tmp;
      log('warn', 'VALIDATION/MISSING_FIELDS', {
        rid, caseId: !!caseId, kind: !!kind, userId: !!userId,
      });
      rmSilent(tmpToCleanup);
      return res.status(400).json({
        ok: false,
        error: 'missing_fields',
        msg: 'caseId, kind, userId are required',
      });
    }

    // 2) Upload GCS
    tmpToCleanup = fileInfo.tmp;
    const gcs = await uploadToGCS(fileInfo.tmp, {
      caseId, kind, userId, caseKind,
      mimeType: fileInfo.mimeType, ext: fileInfo.ext,
    }, rid);

    // 3) Cleanup local
    rmSilent(tmpToCleanup);
    tmpToCleanup = null;

    // 4) Réponse OK
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    log('info', 'UPLOAD/DONE', {
      rid,
      ms: Math.round(ms),
      bytes: fileInfo.bytes,
      mime: fileInfo.mimeType,
      bucket: gcs.bucket,
      object: gcs.object,
    });

    return res.status(200).json({
      ok: true,
      idempotencyKey: idemKey,
      uploaded: {
        bucket: gcs.bucket,
        object: gcs.object,
        bytes: fileInfo.bytes,
        mime: fileInfo.mimeType,
      },
      meta: { caseId, kind, userId, caseKind: caseKind || 'child', ms: Math.round(ms) },
    });

  } catch (err) {
    const code = err?.code === 413 ? 413 : err?.code === 415 ? 415 : 500;
    log(code === 500 ? 'error' : 'warn', 'UPLOAD/ERROR', { rid, code, error: String(err?.message || err) });

    // cleanup si besoin
    if (tmpToCleanup) {rmSilent(tmpToCleanup);}

    return res.status(code).json({
      ok: false,
      error: String(err?.message || err),
    });
  }
};
