// src/miss/lib/uploaders.js
// Uploadeurs “missing/*” pour VigiApp (RNFirebase Storage)
// - Construit les chemins et content-types proprement
// - Garde la même API qu’avant (onProgress, signal, etc.)

import { uploadToStorage } from './uploadCore';

const NS = '[UPLOADERS]';

// ----------------------------------------------
// Helpers
// ----------------------------------------------
function extFromFileName(fileName) {
  const raw = (fileName || '').split('/').pop() || '';
  const ext = raw.includes('.') ? raw.split('.').pop() : '';
  return (ext || '').toLowerCase();
}
function extFromMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('png')) {return 'png';}
  if (m.includes('webp')) {return 'webp';}
  if (m.includes('heic')) {return 'heic';}
  if (m.includes('jpeg') || m.includes('jpg')) {return 'jpg';}
  if (m.includes('mp4')) {return 'mp4';}
  return '';
}
function pickExt(fileName, mime) {
  return extFromFileName(fileName) || extFromMime(mime) || 'jpg';
}
function pickMime(mime, fileName) {
  if (mime) {return String(mime);}
  const ext = extFromFileName(fileName);
  if (ext === 'png') {return 'image/png';}
  if (ext === 'webp') {return 'image/webp';}
  if (ext === 'heic' || ext === 'heif') {return 'image/heic';}
  if (ext === 'mp4') {return 'video/mp4';}
  return 'image/jpeg';
}
function sanitizeId(v) {
  return String(v || '').replace(/[^\w\-]+/g, '_');
}

// ----------------------------------------------
// Mapping fichiers par “kind”
// ----------------------------------------------
const FILE_NAMES = {
  photo:      'photo',       // photo principale de l’enfant/animal/objet
  id_front:   'id_front',    // doc responsable (recto)
  id_back:    'id_back',     // doc responsable (verso)
  link_front: 'link_front',  // doc de l’enfant (recto ou unique)
  link_back:  'link_back',   // doc de l’enfant (verso)
};

// ----------------------------------------------
// Core wrapper
// ----------------------------------------------
async function doUpload(kind, { caseId, uri, fileName, mime, onProgress, signal }) {
  const safeCaseId = sanitizeId(caseId);
  const base = FILE_NAMES[kind] || kind || 'file';
  const ext = pickExt(fileName, mime);
  const ct  = pickMime(mime, fileName);

  const path = `missing/${safeCaseId}/${base}.${ext}`;

  console.log(NS, `${kind}/start`, { caseId: safeCaseId, fileName });
  const res = await uploadToStorage({ path, uri, mime: ct, onProgress, signal });
  console.log(NS, `${kind}/success`, res?.url);
  return res;
}

// ----------------------------------------------
// Exports (API inchangée)
// ----------------------------------------------
export async function uploadIdFront(params) {
  return doUpload('id_front', params);
}

export async function uploadIdBack(params) {
  return doUpload('id_back', params);
}

export async function uploadLinkFront(params) {
  return doUpload('link_front', params);
}

export async function uploadLinkBack(params) {
  return doUpload('link_back', params);
}

export async function uploadChildPhoto(params) {
  // alias “photo principale”
  return doUpload('photo', params);
}
