import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';

const UPLOAD_CORE = '[UPLOAD_CORE]';

export async function uriToBlob(uri) {
  console.log(UPLOAD_CORE, 'uriToBlob/start', uri);
  const res = await fetch(uri);
  if (!res.ok) {
    console.error(UPLOAD_CORE, 'uriToBlob/fail', res.status);
    throw new Error(`URI_FETCH_FAIL_${res.status}`);
  }
  console.log(UPLOAD_CORE, 'uriToBlob/ok');
  return await res.blob();
}

export async function uploadToStorage({ path, uri, mime, onProgress, signal }) {
  console.log(UPLOAD_CORE, 'uploadToStorage/begin', { path, mime });

  if (!path || !uri) {
    console.error(UPLOAD_CORE, 'uploadToStorage/args_missing');
    throw new Error('UPLOAD_ARGS_MISSING');
  }

  const storage = getStorage();
  const blob = await uriToBlob(uri);

  const metadata = {
    contentType: mime || 'image/jpeg',
    cacheControl: 'public,max-age=31536000,immutable',
  };

  const task = uploadBytesResumable(ref(storage, path), blob, metadata);

  if (signal) {
    if (signal.aborted) {
      console.warn(UPLOAD_CORE, 'uploadToStorage/signal_already_aborted');
      try { task.cancel(); } catch { /* noop */ }
    } else {
      signal.addEventListener('abort', () => {
        console.warn(UPLOAD_CORE, 'uploadToStorage/abort_triggered');
        try { task.cancel(); } catch { /* noop */ }
      });
    }
  }

  return new Promise((resolve, reject) => {
    task.on(
      'state_changed',
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        if (onProgress) { onProgress(pct); } // ← braces ajoutées
        console.log(UPLOAD_CORE, 'upload/progress', pct + '%');
      },
      (err) => {
        console.error(UPLOAD_CORE, 'upload/error', err?.message || err);
        reject(err);
      },
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          console.log(UPLOAD_CORE, 'upload/success', url);
          resolve({
            url,
            path,
            bytes: task.snapshot.totalBytes || 0,
            contentType: metadata.contentType,
          });
        } catch (e) {
          console.error(UPLOAD_CORE, 'downloadURL/error', e?.message || e);
          reject(e);
        }
      }
    );
  });
}
