// src/hooks/useRealtimeGroupHelps.js
import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

export function useRealtimeGroupHelps(groupId, userId) {
  const [groupHelps, setGroupHelps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId || !userId) return;
    setLoading(true);
    const q = query(
      collection(db, "groupHelps"),
      where("groupId", "==", groupId),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, snap => {
      const arr = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(demanda => !(demanda.hiddenBy || []).includes(userId));
      setGroupHelps(arr);
      setLoading(false);
    });
    return () => unsub();
  }, [groupId, userId]);

  return [groupHelps, loading];
}
