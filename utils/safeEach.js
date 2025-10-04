// utils/safeEach.js
// Boucle tolérante: accepte undefined, Array, Firestore QuerySnapshot, ou {docs: []}
export function safeForEach(maybeArrayOrSnapshot, cb) {
  if (!maybeArrayOrSnapshot || typeof cb !== 'function') {
    return;
  }

  // Firestore QuerySnapshot expose .forEach; si présent, utilise-le (couvre aussi Map, Set, etc.)
  if (typeof maybeArrayOrSnapshot.forEach === 'function') {
    try {
      maybeArrayOrSnapshot.forEach(cb);
    } catch {
      // On évite d'exploser l'app en catchant des implémentations bizarres
      try {
        const docs = Array.isArray(maybeArrayOrSnapshot?.docs) ? maybeArrayOrSnapshot.docs : [];
        for (let i = 0; i < docs.length; i++) {
          cb(docs[i], i);
        }
      } catch {}
    }
    return;
  }

  // Fallback: Array classique ou shape {docs: []}
  const arr = Array.isArray(maybeArrayOrSnapshot)
    ? maybeArrayOrSnapshot
    : Array.isArray(maybeArrayOrSnapshot?.docs)
      ? maybeArrayOrSnapshot.docs
      : [];

  for (let i = 0; i < arr.length; i++) {
    cb(arr[i], i);
  }
}
