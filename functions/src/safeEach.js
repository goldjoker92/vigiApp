/**
 * safeEach — itère sans broncher sur:
 *  - QuerySnapshot Firestore (snap.forEach(doc => ...))
 *  - tableaux (arr.forEach(...))
 *  - Map-like (size + forEach)
 *  - valeurs nulles/indéfinies (no-op)
 */
function safeForEach(snapOrArr, fn) {
  if (!snapOrArr || typeof fn !== 'function') {
    return;
  }

  // Firestore QuerySnapshot (possède .docs et .forEach)
  if (typeof snapOrArr.forEach === 'function' && Array.isArray(snapOrArr.docs)) {
    try {
      snapOrArr.forEach((doc) => fn(doc));
    } catch {}
    return;
  }

  // Tableau classique
  if (Array.isArray(snapOrArr)) {
    for (let i = 0; i < snapOrArr.length; i++) {
      try {
        fn(snapOrArr[i], i);
      } catch {}
    }
    return;
  }

  // Map-like (size + forEach)
  if (typeof snapOrArr.size === 'number' && typeof snapOrArr.forEach === 'function') {
    try {
      snapOrArr.forEach((v, k) => fn(v, k));
    } catch {}
    return;
  }

  // Objet simple: on tente d'itérer ses valeurs
  if (typeof snapOrArr === 'object') {
    try {
      const vals = Object.values(snapOrArr);
      for (let i = 0; i < vals.length; i++) {
        try {
          fn(vals[i], i);
        } catch {}
      }
    } catch {} 
  }
}

module.exports = { safeForEach };
