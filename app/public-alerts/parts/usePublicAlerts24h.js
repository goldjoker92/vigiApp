// app/hooks/usePublicAlerts24h.ts
// -----------------------------------------------------------------------------
// Hook unique pour récupérer les alertes publiques des 24 dernières heures
// - Abonnement Firestore temps réel (onSnapshot)
// - Tick local 1/min pour rafraîchir timeAgo() / timeLeft() sans requery
// - TTL robuste (re-filtre côté client au cas où) + tri desc
// -----------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '@/firebase';
import { collection, onSnapshot, orderBy, query, where, Timestamp } from 'firebase/firestore';

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function timeAgo(ts) {
  if (!ts) {
    return '';
  }
  const created = typeof ts === 'number' ? ts : (ts.toMillis?.() ?? 0);
  if (!created) {
    return '';
  }
  const m = Math.max(0, Math.floor((Date.now() - created) / 60000));
  if (m < 1) {
    return 'agora';
  }
  if (m < 60) {
    return `${m} min atrás`;
  }
  const h = Math.floor(m / 60);
  return `${h} h atrás`;
}

export function timeLeft(ts) {
  if (!ts) {
    return '';
  }
  const created = typeof ts === 'number' ? ts : (ts.toMillis?.() ?? 0);
  if (!created) {
    return '';
  }
  const leftMs = created + ONE_DAY_MS - Date.now();
  if (leftMs <= 0) {
    return 'expirada';
  }
  const mins = Math.floor(leftMs / 60000);
  if (mins < 60) {
    return `${mins} min restantes`;
  }
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  return `${h} h ${r} min restantes`;
}

export default function usePublicAlerts24h() {
  const [alerts, setAlerts] = useState(null); // null => loading
  const [, forceTick] = useState(0);
  const tickRef = useRef(null);

  useEffect(() => {
    const since = Timestamp.fromMillis(Date.now() - ONE_DAY_MS);
    const q = query(
      collection(db, 'publicAlerts'),
      where('createdAt', '>=', since),
      orderBy('createdAt', 'desc')
    );

    console.log('[usePublicAlerts24h] subscribe 24h window');
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = [];
        snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
        setAlerts(items);
        console.log('[usePublicAlerts24h] received', items.length, 'items');
      },
      (err) => {
        console.log('[usePublicAlerts24h] onSnapshot error:', err?.message || err);
        setAlerts([]);
      }
    );

    // Tick local (1/min) pour recalcul des libellés temporels
    tickRef.current = setInterval(() => forceTick((v) => v + 1), 60 * 1000);

    return () => {
      unsub();
      if (tickRef.current) {
        clearInterval(tickRef.current);
      }
    };
  }, []);

  // TTL robuste: re-filtrage client 24h + tri desc si jamais l'ordre bouge
  const visible = useMemo(() => {
    if (!alerts) {
      return null;
    }
    const now = Date.now();
    return alerts
      .filter((a) => {
        const ms = a.createdAt?.toMillis?.() ?? 0;
        return ms > 0 && now - ms < ONE_DAY_MS;
      })
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  }, [alerts]);

  return { alerts: visible, loading: visible === null };
}
