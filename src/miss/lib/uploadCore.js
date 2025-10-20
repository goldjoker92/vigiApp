// uploadCore.js — Upload natif Firebase Storage (RNFirebase)
// Dépendances: @react-native-firebase/app, @react-native-firebase/storage, @react-native-firebase/auth
// Notes:
//  - Active "Anonyme" dans Firebase Auth si tu veux utiliser signInAnonymously().
//  - Sinon, connecte un user avant d'appeler uploadToStorage (email/password, custom token, etc.).

import storage from '@react-native-firebase/storage';
import auth from '@react-native-firebase/auth';

const NS = '[UPLOAD_CORE]';

function normMime(mime) {
  if (!mime) {return 'image/jpeg';}
  const m = String(mime).toLowerCase();
  if (m.includes('png')) {return 'image/png';}
  if (m.includes('webp')) {return 'image/webp';}
  if (m.includes('jpg') || m.includes('jpeg')) {return 'image/jpeg';}
  if (m.includes('heic')) {return 'image/heic';}
  if (m.includes('mp4') || m.includes('video')) {return 'video/mp4';}
  return 'application/octet-stream';
}

/**
 * Tente une auth anonyme pour satisfaire les règles `request.auth != null`.
 * - Si le provider "Anonyme" est OFF, Firebase renvoie `auth/admin-restricted-operation`.
 *   On loggue et on continue (au cas où un user est déjà connecté autrement).
 */
async function ensureAuth() {
  const cur = auth().currentUser;
  if (cur) {
    // déjà connecté (email/pass, custom token, etc.)
    return cur;
  }
  try {
    const cred = await auth().signInAnonymously();
    console.log(NS, 'auth anon OK', cred?.user?.uid);
    return cred.user;
  } catch (e) {
    // Cas classique si l’anonyme est désactivé dans la console Firebase
    if (String(e?.code || '').includes('auth/admin-restricted-operation')) {
      console.warn(NS, 'auth anon désactivée (console Firebase) → ignorer si user déjà loggé');
      return auth().currentUser || null;
    }
    console.warn(NS, 'auth anon fail', e?.code || '', e?.message || String(e));
    return auth().currentUser || null;
  }
}

/**
 * Upload natif (putFile) avec progress + annulation.
 * @param {Object} p
 * @param {string} p.path   ex: 'missing/<caseId>/id_front.jpg'
 * @param {string} p.uri    ex: 'file:///...' ou 'content://...'
 * @param {string} [p.mime] ex: 'image/jpeg'
 * @param {(pct:number)=>void} [p.onProgress]
 * @param {AbortSignal} [p.signal]  // optionnel: annulation
 */
export async function uploadToStorage({ path, uri, mime, onProgress, signal }) {
  console.log(NS, 'begin', { path, mime, uri });

  if (!path || !uri) {throw new Error('UPLOAD_ARGS_MISSING');}

  // 1) S’assurer qu’on a un user (anonyme ou réel)
  await ensureAuth();

  // 2) Préparer la ref et l’upload natif
  const contentType = normMime(mime);
  const ref = storage().ref(path);

  const task = ref.putFile(uri, {
    contentType,
    cacheControl: 'public,max-age=31536000,immutable',
  });

  // 3) Annulation (AbortController -> cancel())
  let aborted = false;
  const abort = () => {
    if (!aborted) {
      aborted = true;
      try { task.cancel(); } catch {}
      console.warn(NS, 'upload cancelled');
    }
  };
  if (signal) {
    if (signal.aborted) {abort();}
    else {signal.addEventListener('abort', abort, { once: true });}
  }

  // 4) Promesse d’upload avec progression
  return new Promise((resolve, reject) => {
    const unsub = task.on(
      'state_changed',
      (snap) => {
        const pct = snap.totalBytes
          ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
          : 0;
        onProgress && onProgress(pct);
        // console.log(NS, 'progress', pct + '%');
      },
      (err) => {
        unsub();
        console.error(NS, 'error', { code: err?.code, msg: err?.message || String(err) });
        reject(err);
      },
      async () => {
        try {
          unsub();
          const url = await ref.getDownloadURL();
          console.log(NS, 'success', url);
          resolve({ url, path, contentType });
        } catch (e) {
          console.error(NS, 'getDownloadURL/error', e?.message || String(e));
          reject(e);
        }
      }
    );
  });
}
