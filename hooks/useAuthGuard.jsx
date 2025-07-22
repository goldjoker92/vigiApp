import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { useRouter } from "expo-router";
import { useUserStore } from "../store/users";
import { loadUserProfile } from "../utils/loadUserProfile";

/**
 * Observe l'état Firebase, hydrate Zustand avec Firestore
 * Redirige si déconnecté. Retourne undefined (chargement), null (redirige), ou le user.
 */
export function useAuthGuard({ redirectTo = "/" } = {}) {
  const [firebaseUser, setFirebaseUser] = useState(undefined); // undefined: loading
  const setUser = useUserStore((s) => s.setUser);
  const router = useRouter();

  useEffect(() => {
    // Observe Firebase Auth
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        // Hydrate le user Zustand avec Firestore (pour avoir le profil complet)
        const userData = await loadUserProfile(fbUser.uid);
        setFirebaseUser({ ...userData, email: fbUser.email, id: fbUser.uid });
        setUser({ ...userData, email: fbUser.email, id: fbUser.uid });
      } else {
        setFirebaseUser(null);
        setUser(null);
      }
    });
    return unsubscribe;
  }, [setUser]);

  useEffect(() => {
    // Redirige vers login si déconnecté
    if (firebaseUser === null) {
      setTimeout(() => router.replace(redirectTo), 0);
    }
  }, [firebaseUser, router, redirectTo]);

  return firebaseUser; // undefined: loading, null: pas connecté, objet: ok
}
