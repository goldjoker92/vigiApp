import { doc, getDoc } from "firebase/firestore";
import { db, auth } from '../firebase';
import { useUserStore } from '../store/users';

export const loadUserProfile = async (uid) => {
  try {
    const docSnap = await getDoc(doc(db, "usuarios", uid));
    if (docSnap.exists()) {
      useUserStore.getState().setUser({ ...docSnap.data(), uid });
    } else {
      // Garde les infos auth minimal si pas de profil Firestore
      useUserStore.getState().setUser({ uid, email: auth.currentUser.email });
    }
  } catch (e) {
    console.warn("Erreur chargement profil Firestore", e);
  }
};
