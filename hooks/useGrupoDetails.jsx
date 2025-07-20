import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export function useGrupoDetails(groupId) {
  const [grupo, setGrupo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId) return;
    const unsub = onSnapshot(doc(db, 'groups', groupId), (docSnap) => {
      setGrupo({ id: docSnap.id, ...docSnap.data() });
      setLoading(false);
    });
    return () => unsub();
  }, [groupId]);

  return { grupo, loading };
}
