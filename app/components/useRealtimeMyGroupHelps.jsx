// src/hooks/useRealtimeMyGroupHelps.js
import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../";

export function useRealtimeMyGroupHelps(groupId, userId) {
  const [myRequests, setMyRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId || !userId) return;
    setLoading(true);
    const q = query(
      collection(db, "groupHelps"),
      where("groupId", "==", groupId),
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setMyRequests(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [groupId, userId]);

  return [myRequests, loading];
}
