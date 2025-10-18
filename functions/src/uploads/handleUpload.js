/**
 * /src/uploads/handleUpload.js
 * Gen2 onRequest handler compatible multipart/form-data (Expo/RN fetch FormData)
 * - CORS + OPTIONS
 * - Champs attendus: caseId, kind ("photo" | "id" | "linkDoc"), userId, cpfDigits, client, geo
 * - Fichier: field "file"
 * - Stockage: GCS (bucket UPLOAD_BUCKET ou <projectId>.appspot.com)
 * - Idempotency: Firestore collection `uploads_idem` (TTL via field `expireAt`)
 */

const { Storage } = require('@google-cloud/storage');
const Busboy = require('busboy');
const os = require('os');
const fs = require('fs');
const path = require('path');

// --- Firestore (idempotency) -----------------------------------------------
const admin = require('firebase-admin');
if (!admin.apps.length) {
  try { admin.initializeApp(); } catch {}
}
const db = admin.firestore();

// ---- Helpers JSON/CORS -----------------------------------------------------
function json(res, code, data) {
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.status(code).send(JSON.stringify(data));
}
function cors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Idempotency-Key');
}
const LOG = (...a) => console.log('[UPLOAD]', ...a);
const WARN = (...a) => console.warn('[UPLOAD][WARN]', ...a);
const ERR = (...a) => console.error('[UPLOAD][ERR]', ...a);

// ---- Env / Defaults --------------------------------------------------------
const IDEM_COLLECTION = process.env.UPLOAD_IDEM_COLLECTION || 'uploads_idem';
const IDEM_TTL_MIN = Number.parseInt(process.env.UPLOAD_IDEM_TTL_MIN || '15', 10) || 15;
const ALLOWED_MIME = String(process.env.ALLOWED_MIME || 'image/jpeg,image/png,image/webp,image/heic,application/pdf')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const MAX_UPLOAD_MB = Number.parseInt(process.env.UPLOAD_MAX_BYTES ? (Number(process.env.UPLOAD_MAX_BYTES) / (1024*1024)) : '10', 10) || 10;

exports.uploadMissingChildDoc = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') {return res.status(204).end();}
  if (req.method !== 'POST') {return json(res, 405, { ok: false, reason: 'Method Not Allowed' });}

  const idemKey = String(req.get('x-idempotency-key') || '').trim();
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || process.env.PROJECT_ID;
  const bucketName = process.env.UPLOAD_BUCKET || (projectId ? `${projectId}.appspot.com` : null);
  if (!bucketName) {return json(res, 500, { ok: false, reason: 'Missing bucket config' });}

  const storage = new Storage();
  const bucket = storage.bucket(bucketName);

  let caseId = '', kind = '', userId = '', cpfDigits = '', client = null, geo = null;
  let fileMeta = null; // { tmpPath, filename, mime }

  LOG('start', {
    bucket: bucketName, idemKey: idemKey ? 'yes' : 'no',
    limits: { maxMB: MAX_UPLOAD_MB, ttlMin: IDEM_TTL_MIN },
  });

  try {
    const bb = Busboy({ headers: req.headers });

    bb.on('field', (name, val) => {
      if (name === 'caseId') {caseId = String(val || '').trim();}
      else if (name === 'kind') {kind = String(val || '').trim();}
      else if (name === 'userId') {userId = String(val || '').trim();}
      else if (name === 'cpfDigits') {cpfDigits = String(val || '').trim();}
      else if (name === 'client') { try { client = JSON.parse(val); } catch { client = null; } }
      else if (name === 'geo') { try { geo = JSON.parse(val); } catch { geo = null; } }
    });

    bb.on('file', (name, file, info) => {
      if (name !== 'file') { file.resume(); return; }
      const { filename, mimeType } = info || {};
      const safeName = filename || `upload_${Date.now()}`;
      const tmpPath = path.join(os.tmpdir(), `${Date.now()}_${safeName}`);
      const writeStream = fs.createWriteStream(tmpPath);
      file.pipe(writeStream);
      writeStream.on('finish', () => {
        fileMeta = { tmpPath, filename: safeName, mime: mimeType || 'application/octet-stream' };
      });
      writeStream.on('error', (e) => {
        ERR('writeStream error', e?.message || e);
      });
    });

    bb.on('error', (e) => {
      ERR('busboy error', e?.message || e);
      json(res, 400, { ok: false, reason: `Busboy error: ${e?.message || e}` });
    });

    bb.on('finish', async () => {
      // Validations de base
      if (!caseId || !kind) {return json(res, 400, { ok: false, reason: 'Missing caseId/kind' });}
      if (!fileMeta?.tmpPath) {return json(res, 400, { ok: false, reason: 'Missing file' });}

      // Taille (MB)
      try {
        const stat = fs.statSync(fileMeta.tmpPath);
        const sizeMB = stat.size / (1024 * 1024);
        if (sizeMB > MAX_UPLOAD_MB) {
          try { fs.unlinkSync(fileMeta.tmpPath); } catch {}
          return json(res, 413, { ok: false, reason: `File too large (> ${MAX_UPLOAD_MB} MB)` });
        }
      } catch {}

      // MIME
      if (ALLOWED_MIME.length && fileMeta.mime && !ALLOWED_MIME.includes(fileMeta.mime)) {
        try { fs.unlinkSync(fileMeta.tmpPath); } catch {}
        return json(res, 415, { ok: false, reason: `Unsupported MIME (${fileMeta.mime})` });
      }

      // ---- Idempotency: create doc with TTL --------------------------------
      let idemRef = null;
      const now = Date.now();
      const expireAt = new Date(now + IDEM_TTL_MIN * 60 * 1000);
      if (idemKey) {
        try {
          idemRef = db.collection(IDEM_COLLECTION).doc(idemKey);
          await idemRef.create({
            status: 'pending',
            caseId, kind, userId, cpfDigits,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expireAt, // TTL field (Firetore TTL actif via script)
          });
          LOG('idem.create OK', { key: idemKey, expireAt: expireAt.toISOString() });
        } catch (e) {
          // Si doc existe déjà → duplication
          if (String(e?.code) === '6' || /exists/i.test(String(e?.message))) {
            WARN('idem.exists → 409', { key: idemKey });
            try { fs.unlinkSync(fileMeta.tmpPath); } catch {}
            return json(res, 409, { ok: false, reason: 'Duplicate (idempotency)' });
          }
          // Autre erreur Firestore → on log et continue (on ne bloque pas l’upload)
          WARN('idem.create error (non-blocking)', { msg: String(e?.message || e) });
          idemRef = null;
        }
      } else {
        WARN('no X-Idempotency-Key header (server idempotency disabled for this call)');
      }

      // ---- Construction chemin GCS -----------------------------------------
      const ext = (fileMeta.filename.split('.').pop() || '').toLowerCase();
      const guessedExt = ext || (fileMeta.mime.startsWith('image/') ? fileMeta.mime.split('/')[1] : 'bin');
      const ts = new Date().toISOString().replace(/[:.]/g, '');
      const objectPath = `missing/${caseId}/${ts}_${kind}.${guessedExt}`;

      // ---- Upload vers GCS --------------------------------------------------
      try {
        await bucket.upload(fileMeta.tmpPath, {
          destination: objectPath,
          metadata: {
            contentType: fileMeta.mime,
            metadata: {
              caseId, kind, userId, cpfDigits,
              client: client ? JSON.stringify(client) : '',
              geo: geo ? JSON.stringify(geo) : '',
              idemKey: idemKey || '',
            },
          },
        });
      } catch (e) {
        ERR('GCS upload failed', e?.message || e);
        try { fs.unlinkSync(fileMeta.tmpPath); } catch {}
        // On marque l’idempotence en échec (si créée)
        if (idemRef) {
          try {
            await idemRef.set({
              status: 'failed',
              error: String(e?.message || e),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
          } catch {}
        }
        return json(res, 502, { ok: false, reason: `GCS upload failed: ${e?.message || e}` });
      }

      // Nettoyage tmp
      try { fs.unlinkSync(fileMeta.tmpPath); } catch {}

      // ---- URL/paths de retour ---------------------------------------------
      const redactedPath = `gs://${bucketName}/${objectPath}`;
      const redactedUrl = `https://storage.googleapis.com/${bucketName}/${encodeURI(objectPath)}`;

      // ---- Enrichir doc idem (si présent) ----------------------------------
      if (idemRef) {
        try {
          await idemRef.set({
            status: 'stored',
            bucket: bucketName,
            objectPath,
            mime: fileMeta.mime,
            ext: guessedExt,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        } catch (e) {
          WARN('idem.set post-upload error', e?.message || e);
        }
      }

      LOG('ok', { storedAt: objectPath, redactedPath });

      // (Optionnel) écrire un lien en base métier:
      // await writeCaseUploadRecord({ caseId, kind, url: redactedUrl, path: redactedPath, mime: fileMeta.mime, ext: guessedExt, userId });

      return json(res, 200, {
        ok: true,
        redactedUrl,
        redactedPath,
        mime: fileMeta.mime,
        ext: guessedExt,
        storedAt: objectPath,
      });
    });

    req.pipe(bb);
  } catch (e) {
    ERR('server error', e?.stack || e?.message || e);
    return json(res, 500, { ok: false, reason: `Server error: ${e?.message || e}` });
  }
};

// ---------------------------------------------------------------------------
// (Optionnel) Enregistrer le fichier côté métier (Firestore)
// Dé-commente si tu veux alimenter: cases/{caseId}/uploads (subcollection)
// ---------------------------------------------------------------------------
// async function writeCaseUploadRecord({ caseId, kind, url, path, mime, ext, userId }) {
//   try {
//     const ref = db.collection('cases').doc(caseId).collection('uploads').doc();
//     await ref.set({
//       kind, url, path, mime, ext, userId,
//       createdAt: admin.firestore.FieldValue.serverTimestamp(),
//     });
//     LOG('case.upload recorded', { caseId, uploadId: ref.id });
//   } catch (e) {
//     WARN('case.upload record error', e?.message || e);
//   }
// }
