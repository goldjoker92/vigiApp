import { uploadToStorage } from './uploadCore';

const UPLOADERS = '[UPLOADERS]';

function fileExt(fileName) {
  const raw = (fileName || '').split('.').pop() || '';
  const ext = raw.toLowerCase();
  return ext || 'jpg';
}

function normMime(mime) {
  if (!mime) { return 'image/jpeg'; }        // ← braces
  const m = String(mime).toLowerCase();
  if (m.includes('png')) { return 'image/png'; }   // ← braces
  if (m.includes('webp')) { return 'image/webp'; } // ← braces
  return 'image/jpeg';
}

export async function uploadIdFront({ caseId, uri, fileName, mime, onProgress, signal }) {
  console.log(UPLOADERS, 'uploadIdFront/start', { caseId, fileName });
  const ext = fileExt(fileName);
  const path = `missing/${caseId}/id_front.${ext}`;
  const res = await uploadToStorage({ path, uri, mime: normMime(mime), onProgress, signal });
  console.log(UPLOADERS, 'uploadIdFront/success', res.url);
  return res;
}

export async function uploadIdBack({ caseId, uri, fileName, mime, onProgress, signal }) {
  console.log(UPLOADERS, 'uploadIdBack/start', { caseId, fileName });
  const ext = fileExt(fileName);
  const path = `missing/${caseId}/id_back.${ext}`;
  const res = await uploadToStorage({ path, uri, mime: normMime(mime), onProgress, signal });
  console.log(UPLOADERS, 'uploadIdBack/success', res.url);
  return res;
}

export async function uploadLinkFront({ caseId, uri, fileName, mime, onProgress, signal }) {
  console.log(UPLOADERS, 'uploadLinkFront/start', { caseId, fileName });
  const ext = fileExt(fileName);
  const path = `missing/${caseId}/link_front.${ext}`;
  const res = await uploadToStorage({ path, uri, mime: normMime(mime), onProgress, signal });
  console.log(UPLOADERS, 'uploadLinkFront/success', res.url);
  return res;
}

export async function uploadLinkBack({ caseId, uri, fileName, mime, onProgress, signal }) {
  console.log(UPLOADERS, 'uploadLinkBack/start', { caseId, fileName });
  const ext = fileExt(fileName);
  const path = `missing/${caseId}/link_back.${ext}`;
  const res = await uploadToStorage({ path, uri, mime: normMime(mime), onProgress, signal });
  console.log(UPLOADERS, 'uploadLinkBack/success', res.url);
  return res;
}

export async function uploadChildPhoto({ caseId, uri, fileName, mime, onProgress, signal }) {
  console.log(UPLOADERS, 'uploadChildPhoto/start', { caseId, fileName });
  const ext = fileExt(fileName);
  const path = `missing/${caseId}/photo.${ext}`;
  const res = await uploadToStorage({ path, uri, mime: normMime(mime), onProgress, signal });
  console.log(UPLOADERS, 'uploadChildPhoto/success', res.url);
  return res;
}
