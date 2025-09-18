// src/hooks/useRealtimeGroupHelps.js
import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Récupère en temps réel toutes les demandes d'entraide d'un groupe Firestore.
 * @param {string} groupId - ID du groupe
 * @returns {[Array, Boolean]} [groupHelps, loading]
 */
export function useRealtimeGroupHelps(groupId) {
  const [groupHelps, setGroupHelps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId) {
      setGroupHelps([]);
      setLoading(false);
      console.log('[useRealtimeGroupHelps] No groupId fourni, aucun listener.');
      return;
    }
    setLoading(true);

    const q = query(
      collection(db, 'groupHelps'),
      where('groupId', '==', groupId),
      orderBy('createdAt', 'desc')
    );

    console.log('[useRealtimeGroupHelps] Listen path: /groupHelps | groupId =', groupId);

    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setGroupHelps(arr);
        setLoading(false);

        // LOGS ULTRA PRÉCIS
        console.log(
          `[useRealtimeGroupHelps] ${arr.length} demandes reçues pour groupId=${groupId}`
        );
        arr.forEach((dem, idx) => {
          console.log(
            `[useRealtimeGroupHelps] [${idx}] id: ${dem.id} | userId: ${dem.userId} | status: ${dem.status} | volunteerId: ${dem.volunteerId} | volunteerApelido: ${dem.volunteerApelido || '--'}`
          );
        });
      },
      (err) => {
        setLoading(false);
        console.error('[useRealtimeGroupHelps] Firestore ERROR', err);
      }
    );

    return () => {
      unsub();
      console.log('[useRealtimeGroupHelps] Unsubscribe from groupId:', groupId);
    };
  }, [groupId]);

  return [groupHelps, loading];
}
