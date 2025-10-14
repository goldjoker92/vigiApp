// ============================================================================
// src/uploads/storage.js
// E/S vers Firebase Storage via admin.storage().bucket()
// - writeBuffer(path) pour originals/
// - writeRedacted(path) pour redacted/ (pixelate si image)
// - getGsUrl(path) -> "gs://bucket/path"
// ============================================================================

const admin = require('firebase-admin');
const { pixelate } = require('./redact');
const { log } = require('@/utils/logger');

const bucket = admin.storage().bucket(); // default bucket du projet

exports.writeOriginal = async (buffer, mime, path) => {
  const file = bucket.file(path);
  await file.save(buffer, {
    contentType: mime,
    resumable: false,
    metadata: { cacheControl: 'private, max-age=0' },
  });
  log('original saved', path);
  return file;
};

exports.writeRedacted = async (buffer, mime, path) => {
  const file = bucket.file(path);
  const redactedBuff = await pixelate(buffer, mime);
  await file.save(redactedBuff, {
    contentType: mime,
    resumable: false,
    metadata: { cacheControl: 'public, max-age=3600' },
  });
  log('redacted saved', path);
  return file;
};

exports.getGsUrl = (path) => {
  const b = bucket.name;
  return `gs://${b}/${path}`;
};
