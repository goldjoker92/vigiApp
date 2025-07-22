import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useUserStore } from '../store/users';

/**
 * Charge un profil utilisateur Firestore et hydrate Zustand.
 * Retourne les data Firestore (ou null si absent).
 */
export async function loadUserProfile(uid) {
  if (!uid) return null;
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) {
    useUserStore.getState().setUser(null);
    return null;
  }
  const data = { id: uid, ...snap.data() };
  useUserStore.getState().setUser(data);
  return data;
}

/**
 * Sauvegarde (ou met à jour) un profil utilisateur dans Firestore.
 * `data` doit être un objet contenant les champs à sauver.
 */
export async function saveUserProfile(uid, data) {
  if (!uid) throw new Error("UID manquant pour saveUserProfile");
  await setDoc(doc(db, "users", uid), data, { merge: true });
}
