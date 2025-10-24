// uploadCore.native.js — robuste (Android/iOS), évite Blob/ArrayBuffer et gère content://
// Dépendances: @react-native-firebase/storage, @react-native-firebase/auth, expo-file-system

import storage from '@react-native-firebase/storage';
import auth from '@react-native-firebase/auth';
import * as FileSystem from 'expo-file-system';

const NS = '[UPLOAD_CORE_NATIVE]';

const log = (...a) => console.log(NS, ...a);
const warn = (...a) => console.warn(NS, ...a);
const err = (...a) => console.error(NS, ...a);

function normMime(mime) {
  if (!mime) {return 'image/jpeg';}
  const m = String(mime).toLowerCase();
  if (m.includes('png')) {return 'image/png';}
  if (m.includes('webp')) {return 'image/webp';}
  if (m.includes('jpg') || m.includes('jpeg')) {return 'image/jpeg';}
  if (m.includes('heic') || m.includes('heif')) {return 'image/heic';}
  if (m.includes('mp4') || m.includes('video')) {return 'video/mp4';}
  return 'application/octet-stream';
}
function extFrom(fileName, mime) {
  const n = String(fileName || '').toLowerCase();
  if (n.endsWith('.png')) {return 'png';}
  if (n.endsWith('.webp')) {return 'webp';}
  if (n.endsWith('.heic') || n.endsWith('.heif')) {return 'heic';}
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) {return 'jpg';}
  if (n.endsWith('.mp4')) {return 'mp4';}
  const m = String(mime || '').toLowerCase();
  if (m.includes('png')) {return 'png';}
  if (m.includes('webp')) {return 'webp';}
  if (m.includes('heic') || m.includes('heif')) {return 'heic';}
  if (m.includes('jpeg') || m.includes('jpg')) {return 'jpg';}
  if (m.includes('mp4') || m.includes('video')) {return 'mp4';}
  return 'jpg';
}

async function ensureAuth() {
  const cur = auth().currentUser;
  if (cur) {return cur;}
  try {
    const cred = await auth().signInAnonymously();
    log('auth anon OK', cred?.user?.uid);
    return cred.user;
  } catch (e) {
    if (String(e?.code || '').includes('auth/admin-restricted-operation')) {
      warn('auth anon OFF (console Firebase) → ok si user déjà loggé');
      return auth().currentUser || null;
    }
    warn('auth anon fail', e?.code || '', e?.message || String(e));
    return auth().currentUser || null;
  }
}

// Matérialise un content:// en file:// (cache) si nécessaire
async function materializeToFile(uri, fileName, mime) {
  if (!uri) {return uri;}
  if (uri.startsWith('file://')) {return uri;}
  try {
    const ext = extFrom(fileName, mime);
    const dest = `${FileSystem.cacheDirectory}upload_${Date.now()}.${ext}`;
    log('materialize copy →', { from: uri.slice(0, 40) + '…', to: dest });
    await FileSystem.copyAsync({ from: uri, to: dest });
    return dest;
  } catch (e) {
    warn('materialize fail, fallback to original', e?.message || String(e));
    return uri; // on tente quand même l’upload direct
  }
}

/**
 * Upload (putFile) avec progress + abort, tolérant aux content://
 * @param {Object} p
 * @param {string} p.path   ex: 'missing/<caseId>/id_front.jpg'
 * @param {string} p.uri    ex: 'file:///...' ou 'content://...'
 * @param {string} [p.mime] ex: 'image/jpeg'
 * @param {(pct:number)=>void} [p.onProgress]
 * @param {AbortSignal} [p.signal]
 */
export async function uploadToStorage({ path, uri, mime, onProgress, signal }) {
  if (!path || !uri) {throw new Error('UPLOAD_ARGS_MISSING');}

  const contentType = normMime(mime);
  log('begin', { path, mime: contentType, uri: uri.slice(0, 40) + (uri.length > 40 ? '…' : '') });

  await ensureAuth();

  // 1) Essaye direct
  let usedUri = uri;
  let tempFile = null;

  const doPut = async (useUri) => {
    const ref = storage().ref(path);
    const task = ref.putFile(useUri, {
      contentType,
      cacheControl: 'public,max-age=31536000,immutable',
    });

    let aborted = false;
    const abort = () => {
      if (!aborted) {
        aborted = true;
        try {
          task.cancel();
        } catch {}
        warn('upload cancelled');
      }
    };
    if (signal) {
      if (signal.aborted) {
        abort();
        throw new Error('AbortError');
      }
      signal.addEventListener('abort', abort, { once: true });
    }

    return new Promise((resolve, reject) => {
      const unsub = task.on(
        'state_changed',
        (snap) => {
          const pct = snap.totalBytes
            ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
            : 0;
          onProgress && onProgress(pct);
        },
        (e) => {
          unsub();
          err('error', { code: e?.code, msg: e?.message || String(e) });
          reject(e);
        },
        async () => {
          try {
            unsub();
            const ref = storage().ref(path);
            const url = await ref.getDownloadURL();
            log('success', url);
            resolve({ url });
          } catch (e) {
            err('getDownloadURL/error', e?.message || String(e));
            reject(e);
          }
        },
      );
    });
  };

  try {
    // tentative 1: uri tel quel
    return await doPut(usedUri);
  } catch (e1) {
    // si content://, retente après copie en cache
    if (String(usedUri).startsWith('content://')) {
      try {
        tempFile = await materializeToFile(usedUri, null, contentType);
        if (tempFile && tempFile.startsWith('file://')) {
          log('retry with cache file', tempFile);
          const r = await doPut(tempFile);
          // nettoyage best-effort
          try {
            await FileSystem.deleteAsync(tempFile, { idempotent: true });
          } catch {}
          return r;
        }
      } catch (e2) {
        warn('retry(materialize) failed', e2?.message || String(e2));
      }
    }
    throw e1; // propage l’erreur d’origine si on n’a pas pu sauver
  }
}
