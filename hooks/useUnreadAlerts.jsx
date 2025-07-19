import { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { useUserStore } from "../store/users";

export function useUnreadAlerts(user, groupId) {
  const [unread, setUnread] = useState(0);
  const { lastSeenAlert } = useUserStore();

  useEffect(() => {
    if (!groupId) return setUnread(0);
    const q = query(collection(db, "alerts"), where("groupId", "==", groupId));
    const unsub = onSnapshot(q, (snap) => {
      let count = 0;
      snap.forEach((doc) => {
        const data = doc.data();
        if (!lastSeenAlert || data.createdAt?.toMillis?.() > lastSeenAlert) count++;
      });
      setUnread(count);
    });
    return () => unsub();
  }, [groupId, lastSeenAlert]);

  return unread;
}
// This hook tracks unread alerts for a specific user and group.
// It listens to the "alerts" collection and counts how many alerts are newer than the user's last seen alert timestamp.
// It returns the count of unread alerts, which can be used to display a badge or notification.
// The hook uses Firestore's real-time updates to ensure the count is always current.   