// uploadCore.web.js — SDK web, uploadString(data_url) (ok pour navigateur)
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getStorage, ref, uploadString, getDownloadURL } from 'firebase/storage';
import { app } from '../../../firebase';

const NS = '[UPLOAD_CORE_WEB]';

function normMime(mime) {
  if (!mime) {
    return 'image/jpeg';
  }
  const m = String(mime).toLowerCase();
  if (m.includes('png')) {
    return 'image/png';
  }
  if (m.includes('webp')) {
    return 'image/webp';
  }
  if (m.includes('jpg') || m.includes('jpeg')) {
    return 'image/jpeg';
  }
  if (m.includes('heic') || m.includes('heif')) {
    return 'image/heic';
  }
  if (m.includes('mp4') || m.includes('video')) {
    return 'video/mp4';
  }
  return 'application/octet-stream';
}

async function ensureAuth() {
  const auth = getAuth(app);
  if (auth.currentUser) {
    return auth.currentUser;
  }
  try {
    const cred = await signInAnonymously(auth);
    console.log(NS, 'auth anon OK', cred?.user?.uid);
    return cred.user;
  } catch (e) {
    if (String(e?.code || '').includes('auth/admin-restricted-operation')) {
      console.warn(NS, 'auth anon OFF → ok si user déjà loggé');
      return auth.currentUser || null;
    }
    console.warn(NS, 'auth anon fail', e?.code || '', e?.message || String(e));
    return auth.currentUser || null;
  }
}

/**
 * Ici, on attend une dataURL directe côté web (ex: Canvas ou FileReader)
 * Pour RN, ce fichier n’est pas utilisé (voir .native.js)
 */
export async function uploadToStorage({ path, uri, mime, onProgress }) {
  if (!path || !uri) {
    throw new Error('UPLOAD_ARGS_MISSING');
  }

  await ensureAuth();

  const storage = getStorage(app);
  const r = ref(storage, path);
  const contentType = normMime(mime);

  // uri doit être une data URL côté web (data:<ct>;base64,...)
  if (!String(uri).startsWith('data:')) {
    throw new Error('WEB_EXPECTS_DATA_URL');
  }

  onProgress && onProgress(5);
  await uploadString(r, uri, 'data_url', {
    contentType,
    cacheControl: 'public,max-age=31536000,immutable',
  });
  onProgress && onProgress(95);
  const url = await getDownloadURL(r);
  onProgress && onProgress(100);
  return { url, path, contentType };
}
