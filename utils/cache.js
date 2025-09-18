// utils/cache.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const j = (v) => JSON.stringify(v);
const p = (v, d = null) => {
  try {
    return JSON.parse(v);
  } catch {
    return d;
  }
};

// set(key, value, ttlSec): stocke {value, expiresAt}
export async function cacheSet(key, value, ttlSec = 3600) {
  const expiresAt = Date.now() + ttlSec * 1000;
  try {
    await AsyncStorage.setItem(key, j({ value, expiresAt }));
  } catch {}
}

// get(key): renvoie value ou null si expiré/absent
export async function cacheGet(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const { value, expiresAt } = p(raw) || {};
    if (!expiresAt || Date.now() > expiresAt) {
      AsyncStorage.removeItem(key).catch(() => {});
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

// set sans TTL (persistance longue)
export async function cacheSetForever(key, value) {
  try {
    await AsyncStorage.setItem(
      key,
      j({ value, expiresAt: Date.now() + 100 * 365 * 24 * 3600 * 1000 })
    );
  } catch {}
}
// get sans TTL
