// utils/cache.js — version calmée pour la MAP
// -----------------------------------------------------------------------------
// Cache mémoire + AsyncStorage avec TTL, logs compacts via utils/logger
// API inchangée:
//   cacheSet(key, value, ttlSec)
//   cacheGet(key)
//   cacheSetForever(key, value)
//   cacheGetOrSet(key, ttlSec, producer)
// -----------------------------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLogger } from './logger';

// Logger dédié à la map; throttle global pour éviter le mitraillage
const log = createLogger('MAP:CACHE', { throttleMs: 1000 });

// 🔇 Anti-bruit (mets à false si tu veux débug plus verbeux ponctuellement)
const QUIET_HOT_HIT = true;   // coupe "GET HOT HIT"
const QUIET_SET      = true;  // coupe "SET"
const QUIET_READ_HIT = true;  // coupe "GET DISK HIT"

// Store mémoire (hot)
const mem = new Map(); // nkey -> { value, expiresAt }
const NS  = (k) => `vigi:${k}`;

const j = (v) => JSON.stringify(v);
const p = (v, d = null) => { try { return JSON.parse(v); } catch { return d; } };
const sizeOf = (x) => { try { return JSON.stringify(x).length; } catch { return -1; } };

// (optionnel) résumé unique par clé utile pour sanity-check
const summarized = new Set();
function summaryOnce(nkey, value) {
  if (summarized.has(nkey)) {
    return;
  }
  summarized.add(nkey);
  log.info('SUMMARY', { key: nkey, size: sizeOf(value) });
}

// -----------------------------------------------------------------------------
// Écrit (hot + disque) avec TTL en secondes.
// -----------------------------------------------------------------------------
export async function cacheSet(key, value, ttlSec = 3600) {
  const nkey = NS(key);
  const expiresAt = Date.now() + ttlSec * 1000;
  const payload = { value, expiresAt };

  if (!QUIET_SET) {
    log.info('SET', { key: nkey, ttlSec, size: sizeOf(value) });
  }

  try {
    // hot
    mem.set(nkey, payload);

    // disk (timings visibles seulement en dev)
    if (__DEV__) {
      const tKey = `[MAP:CACHE] write:${nkey}`;
      console.time(tKey);
      await AsyncStorage.setItem(nkey, j(payload));
      console.timeEnd(tKey);
    } else {
      await AsyncStorage.setItem(nkey, j(payload));
    }

    // petit bilan unique (désactivable en commentant)
    summaryOnce(nkey, value);
  } catch (e) {
    log.warn('SET error', { key: nkey, err: e?.message || String(e) });
  }
}

// -----------------------------------------------------------------------------
// Lit (hot d’abord, sinon disque). Purge si expiré.
// -----------------------------------------------------------------------------
export async function cacheGet(key) {
  const nkey = NS(key);
  const now = Date.now();

  // 1) HOT
  const hot = mem.get(nkey);
  if (hot) {
    if (now < hot.expiresAt) {
      if (!QUIET_HOT_HIT) {
        log.info('GET HOT HIT', { key: nkey });
      }
      return hot.value;
    }
    log.info('GET HOT EXPIRED', { key: nkey });
    mem.delete(nkey);
  }

  // 2) DISK
  const tKey = `[MAP:CACHE] read:${nkey}`;
  if (__DEV__) { console.time(tKey); }
  try {
    const raw = await AsyncStorage.getItem(nkey);
    if (__DEV__) { console.timeEnd(tKey); }

    if (!raw) {
      log.info('GET DISK MISS', { key: nkey });
      return null;
    }

    const parsed = p(raw);
    const value = parsed?.value;
    const expiresAt = parsed?.expiresAt;

    if (!expiresAt || now > expiresAt) {
      log.info('GET DISK EXPIRED -> PURGE', { key: nkey });
      AsyncStorage.removeItem(nkey).catch(() => {});
      mem.delete(nkey);
      return null;
    }

    // reseed hot
    mem.set(nkey, { value, expiresAt });
    if (!QUIET_READ_HIT) {
      log.info('GET DISK HIT', { key: nkey, size: sizeOf(value) });
    }

    // bilan unique
    summaryOnce(nkey, value);

    return value;
  } catch (e) {
    if (__DEV__) { console.timeEnd(tKey); }
    log.warn('GET error', { key: nkey, err: e?.message || String(e) });
    return null;
  }
}

// -----------------------------------------------------------------------------
// Stockage longue durée
// -----------------------------------------------------------------------------
export async function cacheSetForever(key, value) {
  const ttlSec = 100 * 365 * 24 * 3600; // ~100 ans
  return cacheSet(key, value, ttlSec);
}

// -----------------------------------------------------------------------------
// Lecture avec fallback producteur
// -----------------------------------------------------------------------------
export async function cacheGetOrSet(key, ttlSec, producer) {
  const nkey = NS(key);
  const hit = await cacheGet(key);
  if (hit !== null && hit !== undefined) {
    // volontairement silencieux ici pour éviter du bruit inutile
    return hit;
  }
  const label = `[MAP:CACHE] fill:${nkey}`;
  if (__DEV__) { console.time(label); }
  const val = await producer();
  await cacheSet(key, val, ttlSec);
  if (__DEV__) { console.timeEnd(label); }
  log.info('FILLED', { key: nkey, ttlSec, size: sizeOf(val) });
  return val;
}
