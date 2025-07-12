// utils/loadUserProfile.js
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useUserStore } from "../store/users";

// Charge et injecte dans Zustand le profil Firestore (usuarios/uid)
export async function loadUserProfile(uid) {
  if (!uid) return null;
  const ref = doc(db, "usuarios", uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data();
    useUserStore.getState().setUser({ uid, ...data });
    return data;
  } else {
    useUserStore.getState().setUser(null);
    return null;
  }
}
// Charge le profil de l'utilisateur courant