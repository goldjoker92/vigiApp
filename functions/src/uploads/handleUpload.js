// ============================================================================
// src/uploads/handleUpload.js
// HTTP handler (Express-like) pour upload multipart (multer)
// - Champs attendus: caseId, kind ('id'|'linkDoc'|'photo'), userId?, cpfDigits?, geo?
// - Fichier: field name "file"
// - Idempotency: header "X-Idempotency-Key" (+ Firestore uploadOps)
// ============================================================================

const multer = require('multer');
const { log, warn, err } = require('@/utils/logger');
const { isAllowedMime, limits, makePaths } = require('@/utils/fileHelpers');
const { writeOriginal, writeRedacted, getGsUrl } = require('./storage');
const { getExistingOp, saveOp } = require('@/utils/idempotency');

// Multer en mémoire (pas de fichier temporaire disque)
const upload = multer({
  storage: multer.memoryStorage(),
  limits,
});

const allowCORS = (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Idempotency-Key');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true;
  }
  return false;
};

exports.uploadMissingChildDoc = async function uploadMissingChildDoc(req, res) {
  try {
    if (allowCORS(req, res)) {
      return;
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    // parse multipart via multer
    upload.single('file')(req, res, async (mErr) => {
      if (mErr) {
        warn('multer error', mErr?.message || mErr);
        return res.status(400).json({ ok: false, error: 'Invalid upload (multer).' });
      }

      const idem = String(req.header('X-Idempotency-Key') || '').trim();
      const existed = await getExistingOp(idem);
      if (idem && existed) {
        return res.status(200).json(existed.response || existed);
      }

      const {
        caseId,
        kind,
        userId,
        cpfDigits: _cpfDigits,
        client: _client,
        geo: _geo,
      } = req.body || {};
      const file = req.file;

      // Guards
      if (!caseId || !kind || !file) {
        return res.status(400).json({ ok: false, error: 'Missing params (caseId/kind/file).' });
      }
      if (!isAllowedMime(file.mimetype)) {
        return res.status(415).json({ ok: false, error: `Unsupported mime: ${file.mimetype}` });
      }

      // Logs input
      log('upload in', {
        caseId,
        kind,
        userId: userId || 'anon',
        mime: file.mimetype,
        size: file.size,
        idem: idem || null,
      });

      // Génère chemins
      const { originalPath, redactedPath, ext } = makePaths({
        caseId,
        kind,
        mime: file.mimetype,
      });

      // Ecrit original
      await writeOriginal(file.buffer, file.mimetype, originalPath);

      // Ecrit redacted (pixelate image; pdf passe tel quel)
      await writeRedacted(file.buffer, file.mimetype, redactedPath);

      const response = {
        ok: true,
        redactedUrl: getGsUrl(redactedPath),
        originalPath,
        redactedPath,
        mime: file.mimetype,
        ext,
        storedAt: Date.now(),
      };

      // Idempotency record
      if (idem) {
        await saveOp(idem, { response, caseId, kind, userId: userId || null });
      }

      return res.status(200).json(response);
    });
  } catch (e) {
    err('upload handler fatal', e?.message || e);
    return res.status(500).json({ ok: false, error: 'Internal error.' });
  }
};
