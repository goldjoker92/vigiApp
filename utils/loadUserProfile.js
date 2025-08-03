import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useUserStore } from '../store/users';

/**
 * Charge un profil utilisateur Firestore et hydrate Zustand.
 * Retourne les data Firestore (ou null si absent).
 */
export async function loadUserProfile(uid) {
  if (!uid) {
    console.warn("[loadUserProfile] UID manquant !");
    console.trace();
    return null;
  }
  console.log("[loadUserProfile] Début chargement Firestore pour UID:", uid);
  console.trace();

  const snap = await getDoc(doc(db, "users", uid));

  if (!snap.exists()) {
   console.log('[loadUserProfile] user not found pour', uid);
   console.trace();
    useUserStore.getState().setUser(null);
    return null;
  }
  const data = { id: uid, ...snap.data() };
  console.log('[loadUserProfile] Profil Firestore trouvé', data);
  console.trace();
  useUserStore.getState().setUser(data);
  return data;
}

/**
 * Sauvegarde (ou met à jour) un profil utilisateur dans Firestore.
 * `data` doit être un objet contenant les champs à sauver.
 */
export async function saveUserProfile(uid, data) {
  if (!uid) {
    console.warn("[saveUserProfile] UID manquant !");
    throw new Error("UID manquant pour saveUserProfile");
  }
  console.log(
    "[saveUserProfile] Sauvegarde profil pour UID:", uid,
    "| Champs à sauver:", data
  );
  await setDoc(doc(db, "users", uid), data, { merge: true });
}
