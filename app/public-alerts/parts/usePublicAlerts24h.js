// app/hooks/usePublicAlerts24h.ts
// -----------------------------------------------------------------------------
// Hook unique pour récupérer les alertes publiques des 24 dernières heures
// - Abonnement Firestore temps réel (onSnapshot)
// - Tick local 1/min pour rafraîchir timeAgo() / timeLeft() sans requery
// - TTL robuste (re-filtre côté client au cas où) + tri desc
// - PATCHS: logs conditionnels (__DEV__) + gestion stricte Timestamp | number
// -----------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '@/firebase';
import { collection, onSnapshot, orderBy, query, where, Timestamp } from 'firebase/firestore';

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Normalise Firestore.Timestamp ou number(ms) vers un nombre de ms fiable. */
function getMillis(ts: any): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts > 0 ? ts : 0;
  const maybe = ts?.toMillis?.();
  return typeof maybe === 'number' && maybe > 0 ? maybe : 0;
}

export function timeAgo(ts: any) {
  const created = getMillis(ts);
  if (!created) return '';
  const m = Math.max(0, Math.floor((Date.now() - created) / 60000));
  if (m < 1) return 'agora';
  if (m < 60) return `${m} min atrás`;
  const h = Math.floor(m / 60);
  return `${h} h atrás`;
}

export function timeLeft(ts: any) {
  const created = getMillis(ts);
  if (!created) return '';
  const leftMs = created + ONE_DAY_MS - Date.now();
  if (leftMs <= 0) return 'expirada';
  const mins = Math.floor(leftMs / 60000);
  if (mins < 60) return `${mins} min restantes`;
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  return `${h} h ${r} min restantes`;
}

export default function usePublicAlerts24h() {
  const [alerts, setAlerts] = useState<any[] | null>(null); // null => loading
  const [, forceTick] = useState(0);
  const tickRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const since = Timestamp.fromMillis(Date.now() - ONE_DAY_MS);
    const q = query(
      collection(db, 'publicAlerts'),
      where('createdAt', '>=', since),
      orderBy('createdAt', 'desc')
    );

    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[usePublicAlerts24h] subscribe 24h window');
    }

    const unsub = onSnapshot(
      q,
      (snap) => {
        const items: any[] = [];
        snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
        setAlerts(items);
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.log('[usePublicAlerts24h] received', items.length, 'items');
        }
      },
      (err) => {
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.log('[usePublicAlerts24h] onSnapshot error:', err?.message || err);
        }
        setAlerts([]);
      }
    );

    // Tick local (1/min) pour recalcul des libellés temporels
    tickRef.current = setInterval(() => forceTick((v) => v + 1), 60 * 1000);

    return () => {
      unsub();
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  // TTL robuste: re-filtrage client ≤ 24h + tri desc (au cas où l’ordre bouge)
  const visible = useMemo(() => {
    if (!alerts) return null;
    const now = Date.now();

    const filtered = alerts.filter((a) => {
      const ms = getMillis(a?.createdAt);
      return ms > 0 && now - ms < ONE_DAY_MS;
    });

    filtered.sort((a, b) => getMillis(b?.createdAt) - getMillis(a?.createdAt));

    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log('[usePublicAlerts24h] visible count', filtered.length);
    }

    return filtered;
  }, [alerts]);

  return { alerts: visible, loading: visible === null };
}
// ============================================================================