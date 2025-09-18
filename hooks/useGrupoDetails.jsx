import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export function useGrupoDetails(groupId) {
  const [grupo, setGrupo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('[HOOK][useGrupoDetails] groupId:', groupId);
    if (!groupId) {
      setGrupo(null);
      setLoading(false);
      return;
    }

    setLoading(true); // Important pour skeleton UX lors du changement de groupe

    const unsub = onSnapshot(doc(db, 'groups', groupId), (docSnap) => {
      console.log(
        '[HOOK][useGrupoDetails] snapshot exists:',
        docSnap.exists(),
        '| data:',
        docSnap.data()
      );
      if (docSnap.exists()) {
        setGrupo({ id: docSnap.id, ...docSnap.data() });
      } else {
        setGrupo(null); // Groupe supprimé ou inexistant
      }
      setLoading(false);
    });

    return () => unsub();
  }, [groupId]);

  return { grupo, loading };
}
