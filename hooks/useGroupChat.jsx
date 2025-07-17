import { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';

export function useGroupChat(helpId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!helpId) return;
    const q = query(
      collection(db, 'groupHelps', helpId, 'chats'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return unsub;
  }, [helpId]);

  // Pour envoyer un message dans le chat
  const sendMessage = useCallback(async ({ helpId, fromUserId, fromApelido, text }) => {
    await addDoc(collection(db, 'groupHelps', helpId, 'chats'), {
      fromUserId,
      fromApelido,
      text,
      createdAt: serverTimestamp(),
      type: 'text'
    });
  }, []);

  return { messages, loading, sendMessage };
}
