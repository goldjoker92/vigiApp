// ============================================================================
// src/utils/fileHelpers.js
// Mimetype, extensions, renommage, limites
// ============================================================================

const mime = require('mime-types');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_ALLOWED_MIME = process.env.ALLOWED_MIME
  ? process.env.ALLOWED_MIME.split(',').map((s) => s.trim())
  : ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || '15');
const MAX_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

exports.limits = {
  fileSize: MAX_BYTES,
};

exports.isAllowedMime = (m) => DEFAULT_ALLOWED_MIME.includes(m);

exports.extFromMime = (m) => mime.extension(m) || 'bin';

/**
 * Chemins normalisés dans le bucket
 * originals/missingCases/{caseId}/{timestamp}-{kind}-{rand}.{ext}
 * redacted/missingCases/{caseId}/{timestamp}-{kind}-{rand}.{ext}
 */
exports.makePaths = ({ caseId, kind, mime }) => {
  const ext = exports.extFromMime(mime);
  const ts = Date.now();
  const rand = uuidv4().slice(0, 8);
  const base = `missingCases/${caseId}/${ts}-${kind}-${rand}.${ext}`;
  return {
    originalPath: `originals/${base}`,
    redactedPath: `redacted/${base}`,
    ext,
  };
};
