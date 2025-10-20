// =============================================================================
// VigiApp — Upload handler (multipart) — functions/src/uploads/handleUpload.js
// - Mémoire idempotence (Firestore) + TTL
// - GCS Storage (bucket par défaut ou UPLOAD_BUCKET)
// - Garde-fous MIME / taille (env > valeurs par défaut)
// - Essaie d'utiliser ./redact et ./storage si présents (fallback sinon)
// - Répond au format attendu par le client uploadDocMultipart()
// =============================================================================

const path = require('path');
const crypto = require('crypto');
const { Buffer } = require('buffer');

const admin = require('firebase-admin');

// Init admin (tolérant si déjà fait)
try {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
} catch {}

const db = admin.firestore();
const storage = admin.storage();

// --------- Helpers log JSON compacts ----------------------------------------
function log(level, msg, extra = {}) {
  const line = { ts: new Date().toISOString(), service: 'upload', level, msg, ...extra };
  const txt = JSON.stringify(line);
  if (level === 'error') {
    console.error(txt);
  } else if (level === 'warn') {
    console.warn(txt);
  } else {
    console.log(txt);
  }
}

// --------- Env / limites ----------------------------------------------------
const PROJECT_ID = process.env.PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;

const BUCKET_NAME = process.env.UPLOAD_BUCKET || (PROJECT_ID ? `${PROJECT_ID}.appspot.com` : null);

const UPLOAD_MAX_BYTES = Number(process.env.UPLOAD_MAX_BYTES || 10 * 1024 * 1024); // 10MB par défaut
const ALLOWED_MIME = String(
  process.env.ALLOWED_MIME || 'image/jpeg,image/png,image/webp,image/heic,application/pdf',
)
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const REQUIRE_UPLOAD_AUTH = (process.env.REQUIRE_UPLOAD_AUTH || 'false') === 'true';
const REQUIRE_UPLOAD_IDEM = (process.env.REQUIRE_UPLOAD_IDEM || 'true') === 'true';
const IDEM_TTL_MIN = Number(process.env.UPLOAD_IDEM_TTL_MIN || 15);

const IDEM_COLL = 'uploads_idem';
const IDEM_SECRET = process.env.UPLOAD_IDEM_SECRET || ''; // optionnel (HMAC)

// --------- Optional modules (best-effort) -----------------------------------
function tryRequire(p) {
  try {
    return require(p);
  } catch {
    return null;
  }
}
const redactMod = tryRequire('./redact');
const storageMod = tryRequire('./storage'); // si tu as des wrappers utilitaires

// --------- Utils ------------------------------------------------------------
const extFromNameOrMime = (name = '', mime = '') => {
  const m = String(name)
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/);
  if (m) {
    return m[1];
  }
  if (/jpeg/.test(mime)) {
    return 'jpg';
  }
  if (/png/.test(mime)) {
    return 'png';
  }
  if (/webp/.test(mime)) {
    return 'webp';
  }
  if (/heic/.test(mime)) {
    return 'heic';
  }
  if (/pdf/.test(mime)) {
    return 'pdf';
  }
  return 'bin';
};
const safeJoin = (...parts) =>
  parts.map((s) => String(s || '').replace(/^\/+|\/+$/g, '')).join('/');

function hmacIfAny(s) {
  if (!IDEM_SECRET) {
    return s;
  }
  return crypto.createHmac('sha256', IDEM_SECRET).update(String(s)).digest('hex').slice(0, 40);
}

async function getBucket() {
  if (!BUCKET_NAME) {
    throw new Error('bucket_not_configured');
  }
  return storage.bucket(BUCKET_NAME);
}

async function putFile({ bucket, buffer, destPath, contentType }) {
  const file = bucket.file(destPath);
  await file.save(buffer, {
    contentType,
    resumable: false,
    metadata: { cacheControl: 'private, max-age=0, no-transform' },
  });
  return file;
}

async function makeSignedReadUrl(
  file,
  ttlSeconds = Number(process.env.SIGNED_URL_TTL_SECONDS || 3600),
) {
  try {
    if (storageMod?.getSignedUrl) {
      return await storageMod.getSignedUrl(file, { expiresIn: ttlSeconds });
    }
  } catch (e) {
    log('warn', 'SIGNED_URL/HELPER_FAIL', { err: e?.message || String(e) });
  }
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + ttlSeconds * 1000,
  });
  return url;
}

async function maybeRedactImage(buffer, mime) {
  if (!redactMod?.redactImageBuffer) {
    return { buffer, mime };
  }
  try {
    const { buffer: outBuf, mime: outMime } = await redactMod.redactImageBuffer(buffer, mime);
    return { buffer: outBuf || buffer, mime: outMime || mime };
  } catch (e) {
    log('warn', 'REDACT/FAIL', { err: e?.message || String(e) });
    return { buffer, mime };
  }
}

// --------- Idempotence doc --------------------------------------------------
async function loadIdem(key) {
  if (!key) {
    return null;
  }
  const snap = await db.collection(IDEM_COLL).doc(String(key)).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}
async function saveIdem(key, payload) {
  if (!key) {
    return;
  }
  const expireAt = new Date(Date.now() + IDEM_TTL_MIN * 60 * 1000);
  await db
    .collection(IDEM_COLL)
    .doc(String(key))
    .set(
      { ...payload, expireAt, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
}

// --------- Validation entrée -------------------------------------------------
function fail(res, code, http = 400, extra = {}) {
  log('warn', 'UPLOAD/REJECT', { code, ...extra });
  return res.status(http).json({ ok: false, error: code });
}

// =============================================================================
// MAIN handler (signature: (req, res) => Promise<void>)
// =============================================================================
module.exports = async function handleUpload(req, res) {
  const rid = req._rid || `upl_${Date.now().toString(36)}`;
  const idemHeader = String(req.get('x-idempotency-key') || '').trim();

  // 1) Pré-checks: méthode, auth éventuelle, file présent
  if (req.method !== 'POST') {
    return fail(res, 'method_not_allowed', 405, { rid, method: req.method });
  }
  if (REQUIRE_UPLOAD_AUTH) {
    // Tu peux brancher ici une vérif de token si nécessaire
    // Exemple: const authz = req.get('authorization') || '';
    // if (!authz) return fail(res, 'unauthorized', 401, { rid });
  }
  if (!req.file || !req.file.buffer || !req.file.mimetype) {
    return fail(res, 'file_missing', 400, { rid, hasFile: !!req.file });
  }

  // 2) Idempotence (clé obligatoire seulement si REQUIRE_UPLOAD_IDEM=true)
  if (REQUIRE_UPLOAD_IDEM && !idemHeader) {
    return fail(res, 'missing_idempotency_key', 400, { rid });
  }
  const idemKey = idemHeader ? `idem_${hmacIfAny(idemHeader)}` : '';

  // 3) Si doc idem existe et status=done → renvoyer direct
  if (idemKey) {
    const existing = await loadIdem(idemKey);
    if (existing?.status === 'done' && existing.result) {
      log('info', 'IDEM/HIT_RETURNING', { rid, idemKey });
      return res.status(200).json({ ok: true, ...existing.result });
    }
  }

  // 4) Garde-fous MIME/TAILLE
  const mime = String(req.file.mimetype || '').toLowerCase();
  const size = Number(req.file.size || 0);
  if (size > UPLOAD_MAX_BYTES) {
    return fail(res, 'file_too_large', 413, { rid, size, limit: UPLOAD_MAX_BYTES });
  }
  if (!ALLOWED_MIME.includes(mime)) {
    return fail(res, 'unsupported_mime', 415, { rid, mime, allowed: ALLOWED_MIME });
  }

  // 5) Champs utiles
  const caseId = String(req.body.caseId || '').trim();
  const kind = String(req.body.kind || '').trim(); // 'photo' | 'id' | 'linkDoc'
  const userId = String(req.body.userId || '').trim() || 'anon';

  if (!caseId || !kind) {
    return fail(res, 'missing_fields', 400, { rid, caseId, kind });
  }

  const cpfDigits = String(req.body.cpfDigits || '').replace(/\D/g, '');
  const clientMeta = (() => {
    try {
      return req.body.client ? JSON.parse(req.body.client) : null;
    } catch {
      return null;
    }
  })();

  // 6) Construction des chemins
  const ext = extFromNameOrMime(req.file.originalname || '', mime);
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const ts = now.toISOString().replace(/[:.]/g, '-');

  const base = safeJoin('missing', String(caseId), kind);
  const originalPath = safeJoin(base, `orig_${ts}.${ext}`);
  const redactedPath = safeJoin(base, `redacted_${ts}.${ext}`);

  try {
    const bucket = await getBucket();

    // 7) Upload original
    await putFile({
      bucket,
      buffer: req.file.buffer,
      destPath: originalPath,
      contentType: mime,
    });

    // 8) Redaction (optionnelle). Si pas d’outil, on duplique l’original.
    let redBuf = req.file.buffer;
    let redMime = mime;
    if (mime.startsWith('image/') && redactMod) {
      const r = await maybeRedactImage(req.file.buffer, mime);
      redBuf = r.buffer || req.file.buffer;
      redMime = r.mime || mime;
    }
    await putFile({
      bucket,
      buffer: redBuf,
      destPath: redactedPath,
      contentType: redMime,
    });

    // 9) Signed URL (lecture redacted)
    const redFile = bucket.file(redactedPath);
    const redactedUrl = await makeSignedReadUrl(redFile);

    const result = {
      ok: true,
      redactedUrl,
      originalPath: `gs://${BUCKET_NAME}/${originalPath}`,
      redactedPath: `gs://${BUCKET_NAME}/${redactedPath}`,
      mime,
      ext,
      storedAt: now.toISOString(),
    };

    // 10) Idem save (status=done)
    if (idemKey) {
      await saveIdem(idemKey, {
        status: 'done',
        caseId,
        kind,
        userId,
        cpfDigits,
        clientMeta,
        result,
      });
    }

    log('info', 'UPLOAD/DONE', {
      rid,
      caseId,
      kind,
      bytes: size,
      mime,
      originalPath,
      redactedPath,
    });
    return res.status(200).json(result);
  } catch (e) {
    log('error', 'UPLOAD/ERROR', { rid, error: e?.message || String(e) });
    if (idemKey) {
      await saveIdem(idemKey, {
        status: 'error',
        error: String(e?.message || e),
        caseId,
        kind,
        userId,
      });
    }
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
};
