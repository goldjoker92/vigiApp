import { useEffect, useState } from "react";
import { db } from "../firebase";
import { doc, onSnapshot } from "firebase/firestore";

export function useGrupoDetails(groupId) {
  const [grupo, setGrupo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId) return setGrupo(null);
    setLoading(true);
    const unsub = onSnapshot(doc(db, "groups", groupId), (snap) => {
      setGrupo(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setLoading(false);
    });
    return () => unsub();
  }, [groupId]);

  return { grupo, loading };
}
