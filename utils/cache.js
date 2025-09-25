// utils/cache.js
// -----------------------------------------------------------------------------
// Cache hybride **mémoire + AsyncStorage** avec TTL, logs détaillés.
// API:
//   - cacheSet(key, value, ttlSec)
//   - cacheGet(key)
//   - cacheSetForever(key, value)
//   - cacheGetOrSet(key, ttlSec, producer)
// Features:
//   - "Hot cache" (Map) pour accès instantané (évite I/O).
//   - Namespacing "vigi:" pour ne pas collisionner d'autres modules.
//   - Logs: HIT/MISS (HOT/DISK), temps d'accès, purge expirations.
// -----------------------------------------------------------------------------

import AsyncStorage from '@react-native-async-storage/async-storage';

const TAG = 'CACHE';
const mem = new Map(); // key(ns) -> { value, expiresAt }
const NS = (k) => `vigi:${k}`;

function ts() {
  try {
    return new Date().toISOString();
  } catch {
    return String(Date.now());
  }
}
function log(...a) {
  console.log(`[${TAG}][${ts()}]`, ...a);
}
function warn(...a) {
  console.warn(`[${TAG}][${ts()}]`, ...a);
}

const j = (v) => JSON.stringify(v);
const p = (v, d = null) => {
  try {
    return JSON.parse(v);
  } catch {
    return d;
  }
};

/**
 * Écrit (hot + disque) avec TTL en secondes.
 */
export async function cacheSet(key, value, ttlSec = 3600) {
  const nkey = NS(key);
  const expiresAt = Date.now() + ttlSec * 1000;
  const payload = { value, expiresAt };
  log('SET', { key: nkey, ttlSec, size: sizeOf(value) });

  try {
    mem.set(nkey, payload); // hot
    const tKey = `[${TAG}] write:${nkey}`;
    console.time(tKey);
    await AsyncStorage.setItem(nkey, j(payload)); // disk
    console.timeEnd(tKey);
  } catch (e) {
    warn('SET error', { key: nkey, err: e?.message || String(e) });
  }
}

/**
 * Lit (hot d’abord, sinon disque). Purge si expiré.
 */
export async function cacheGet(key) {
  const nkey = NS(key);
  const now = Date.now();

  // 1) HOT
  const hot = mem.get(nkey);
  if (hot) {
    if (now < hot.expiresAt) {
      log('GET HOT HIT', { key: nkey });
      return hot.value;
    }
    // expiré
    log('GET HOT EXPIRED', { key: nkey });
    mem.delete(nkey);
  }

  // 2) DISK
  const tKey = `[${TAG}] read:${nkey}`;
  console.time(tKey);
  try {
    const raw = await AsyncStorage.getItem(nkey);
    console.timeEnd(tKey);
    if (!raw) {
      log('GET DISK MISS', { key: nkey });
      return null;
    }

    const { value, expiresAt } = p(raw) || {};
    if (!expiresAt || now > expiresAt) {
      log('GET DISK EXPIRED -> PURGE', { key: nkey });
      // purge silencieuse
      AsyncStorage.removeItem(nkey).catch(() => {});
      mem.delete(nkey);
      return null;
    }

    // reseed hot
    mem.set(nkey, { value, expiresAt });
    log('GET DISK HIT', { key: nkey, size: sizeOf(value) });
    return value;
  } catch (e) {
    console.timeEnd(tKey);
    warn('GET error', { key: nkey, err: e?.message || String(e) });
    return null;
  }
}

/**
 * Stockage "longue durée".
 */
export async function cacheSetForever(key, value) {
  const ttlSec = 100 * 365 * 24 * 3600; // ~100 ans
  return cacheSet(key, value, ttlSec);
}

/**
 * Lecture avec fallback producteur.
 */
export async function cacheGetOrSet(key, ttlSec, producer) {
  const nkey = NS(key);
  const hit = await cacheGet(key);
  if (hit !== null && hit !== undefined) {
    log('GETORSET HIT', { key: nkey });
    return hit;
  }

  const label = `[${TAG}] fill:${nkey}`;
  console.time(label);
  const val = await producer();
  await cacheSet(key, val, ttlSec);
  console.timeEnd(label);
  log('GETORSET FILLED', { key: nkey, size: sizeOf(val), ttlSec });
  return val;
}

/**
 * Utils
 */
function sizeOf(x) {
  try {
    return JSON.stringify(x).length;
  } catch {
    return -1;
  }
}
