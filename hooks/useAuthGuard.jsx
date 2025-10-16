// hooks/useAuthGuard.js
import { useEffect, useRef, useState } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';

// petite égalité superficielle suffisante ici
function shallowEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  const ka = Object.keys(a),
    kb = Object.keys(b);
  if (ka.length !== kb.length) {
    return false;
  }
  for (const k of ka) {
    if (a[k] !== b[k]) {
      return false;
    }
  }
  return true;
}

export function useAuthGuard() {
  const [user, setUser] = useState(undefined); // undefined = loading, null = non connecté, objet = ok
  const lastUserRef = useRef(null);
  const unsubRef = useRef(null); // évite multiples onSnapshot

  useEffect(() => {
    // Nettoie toute souscription précédente si remount (StrictMode, navigation)
    if (unsubRef.current) {
      try {
        unsubRef.current();
      } catch {}
      unsubRef.current = null;
    }

    const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
      if (!fbUser) {
        lastUserRef.current = null;
        setUser(null);
        // supprime l'abonnement au doc user s'il existait
        if (unsubRef.current) {
          try {
            unsubRef.current();
          } catch {}
          unsubRef.current = null;
        }
        return;
      }

      const ref = doc(db, 'users', fbUser.uid);

      // IMPORTANT: un seul onSnapshot vivant à la fois
      if (unsubRef.current) {
        try {
          unsubRef.current();
        } catch {}
      }
      unsubRef.current = onSnapshot(
        ref,
        // évite les callbacks pour des changements de métadonnées
        { includeMetadataChanges: false },
        (snap) => {
          const data = snap.exists() ? { id: snap.id, ...snap.data() } : null;

          // ne pas setState si rien n'a changé
          if (shallowEqual(lastUserRef.current, data)) {
            return;
          }

          lastUserRef.current = data;
          setUser(data);

          // LOG une seule fois par changement utile
          if (__DEV__) {
            // throttle très simple: on ne log que quand ça change
            console.debug('[DEBUG][useAuthGuard] setUser', data);
          }
        },
        (err) => {
          if (__DEV__) {
            console.warn('[useAuthGuard] onSnapshot error:', err?.message || err);
          }
        },
      );
    });

    return () => {
      try {
        unsubAuth();
      } catch {}
      if (unsubRef.current) {
        try {
          unsubRef.current();
        } catch {}
        unsubRef.current = null;
      }
    };
  }, []); // ← ne pas mettre d'autres deps

  return user;
}
