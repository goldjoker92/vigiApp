// src/miss/lib/helpers/firestoreWait.js
import * as FS from "firebase/firestore";
import { db } from "../../../../firebase"; // ajuste si besoin

/**
 * Attend qu'un doc "missingCases/{id}" soit visible côté serveur (fallback cache),
 * avec un petit polling. JS pur, compatible RN/Expo.
 */
export async function waitForServerCommit(id, timeoutMs = 5000) {
  const ref = FS.doc(db, "missingCases", String(id));
  const deadline = Date.now() + timeoutMs;

  async function tryFetchOnce(preferServer = true) {
    try {
      // Si l'API "server" existe, on la privilégie
      if (preferServer && typeof FS.getDocFromServer === "function") {
        const snap = await FS.getDocFromServer(ref);
        if (snap.exists()) return { id: snap.id, ...snap.data() };
      } else {
        // Fallback standard
        const snap = await FS.getDoc(ref);
        if (snap.exists()) return { id: snap.id, ...snap.data() };
      }
    } catch (_e) {
      // on ignore, on retente plus tard
    }
    return null;
  }

  // 1) Premier essai (serveur si possible)
  const first = await tryFetchOnce(true);
  if (first) return first;

  // 2) Polling léger jusqu'au timeout
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    const got = await tryFetchOnce(true);
    if (got) return got;
  }

  // 3) Dernière chance: cache (si exposé)
  try {
    if (typeof FS.getDocFromCache === "function") {
      const snap = await FS.getDocFromCache(ref);
      if (snap.exists()) return { id: snap.id, ...snap.data() };
    }
  } catch (_e) {
    // nada
  }

  return null;
}
