// =============================================================================
// VigiApp — Device register (robuste, idempotent, "no data loss")
// -----------------------------------------------------------------------------
// - Lit users/{uid} avant d'écrire, pour MERGER proprement les champs existants
// - Upsert global:    /devices/{deviceId}
// - Upsert per-user:  /users/{uid}/devices/{deviceId}
// - Conserve/merge: groups, cep, city (+ ajoute ceux passés en params)
// - Stocke expoPushToken ET fcmDeviceToken (+ alias: expo, fcm) + fcmToken canon
// - active:true, channels.publicAlerts:true, updatedAt: serverTimestamp()
// - lat/lng forcés en Number (contrôles NaN + range) -> geohash si présent
// - deviceId: hash stable du token (safe caractères), logs horodatés
// =============================================================================

import { Platform } from 'react-native';
import { doc, getDoc, setDoc, getFirestore, serverTimestamp } from 'firebase/firestore';

// =============================================================================
// Geohash (précision modérée) — sans dépendances
// =============================================================================
function encodeGeohash(lat, lng, precision = 7) {
  try {
    const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
    let idx = 0,
      bit = 0,
      even = true,
      gh = '';
    let latMin = -90,
      latMax = 90,
      lonMin = -180,
      lonMax = 180;
    while (gh.length < precision) {
      if (even) {
        const m = (lonMin + lonMax) / 2;
        if (lng >= m) {
          idx = idx * 2 + 1;
          lonMin = m;
        } else {
          idx = idx * 2;
          lonMax = m;
        }
      } else {
        const m = (latMin + latMax) / 2;
        if (lat >= m) {
          idx = idx * 2 + 1;
          latMin = m;
        } else {
          idx = idx * 2;
          latMax = m;
        }
      }
      even = !even;
      if (++bit === 5) {
        gh += base32.charAt(idx);
        bit = 0;
        idx = 0;
      }
    }
    return gh;
  } catch {
    return null;
  }
}

// =============================================================================
// Logs & utils
// =============================================================================
const ts = () => {
  try {
    return new Date().toISOString();
  } catch {
    return String(Date.now());
  }
};
const log = (...a) => {
  try {
    console.log(`[registerDevice][${ts()}]`, ...a);
  } catch {}
};
const warn = (...a) => {
  try {
    console.warn(`[registerDevice][${ts()}] ⚠️`, ...a);
  } catch {}
};
const err = (...a) => {
  try {
    console.error(`[registerDevice][${ts()}] ❌`, ...a);
  } catch {}
};
const mask = (t) =>
  !t
    ? '(empty)'
    : String(t).length <= 12
      ? String(t)
      : `${String(t).slice(0, 6)}…${String(t).slice(-4)}`;

function fnv1a64Hex(input) {
  let h1 = 0x2325,
    h2 = 0x8422;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 += (h1 << 1) + (h1 << 4) + (h1 << 5) + (h1 << 7) + (h1 << 8) + (h1 << 40);
    h1 &= 0xffffffff;
    h2 ^= c;
    h2 += (h2 << 1) + (h2 << 4) + (h2 << 5) + (h2 << 7) + (h2 << 8) + (h2 << 40);
    h2 &= 0xffffffff;
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

// Heuristiques tokens
function isLikelyFCMToken(t) {
  return !!t && t.includes(':APA91') && t.length > 80;
}
function isLikelyExpoToken(t) {
  return !!t && /^ExponentPushToken\[[A-Za-z0-9\-_]+\]$/.test(t);
}

// ID device stable
function buildSafeDeviceId({ userId, fcmDeviceToken, expoPushToken }) {
  const src = isLikelyFCMToken(fcmDeviceToken)
    ? `fcm:${fcmDeviceToken}`
    : isLikelyExpoToken(expoPushToken)
      ? `exp:${expoPushToken}`
      : `uid:${userId}|${Platform.OS || 'unk'}`;
  const hash = fnv1a64Hex(src);
  const prefix = src.startsWith('fcm:') ? 'fcm' : src.startsWith('exp:') ? 'expo' : 'usr';
  return `${prefix}_${hash}`;
}

// =============================================================================
// Merge helpers (conserve l’existant, ajoute le nouveau)
// =============================================================================
function mergeGroups(existing, incoming) {
  // existing: {id:true,...} | string[] | undefined
  // incoming: string[] | undefined
  const map = {};
  if (Array.isArray(incoming))
    {for (const g of incoming) {if (g && typeof g === 'string') {map[g] = true;}}}
  if (Array.isArray(existing))
    {for (const g of existing) {if (g && typeof g === 'string') {map[g] = true;}}}
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
    for (const k of Object.keys(existing)) {if (existing[k]) {map[k] = true;}}
  }
  return Object.keys(map).length ? map : {};
}

function pickCepCity({ cepParam, cityParam, existingCep, existingCity }) {
  const cep =
    cepParam !== null
      ? String(cepParam).replace(/\D+/g, '').slice(0, 8)
      : existingCep
        ? String(existingCep).replace(/\D+/g, '').slice(0, 8)
        : null;
  const city =
    cityParam !== null
      ? String(cityParam).trim()
      : existingCity
        ? String(existingCity).trim()
        : null;
  return { cep: cep || null, city: city || null };
}

// =============================================================================
// API principale
// =============================================================================
/**
 * Upsert device + resynchronise le profil user (sans écraser).
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.fcmDeviceToken
 * @param {string=} params.expoPushToken
 * @param {string|number=} params.cep
 * @param {string=} params.city
 * @param {number|string=} params.lat
 * @param {number|string=} params.lng
 * @param {string[]=} params.groups
 * @param {boolean=} params.active
 * @returns {Promise<{ok:boolean, deviceId?:string, hasLatLng?:boolean, geohash?:string|null, merged?:{groups?:Object, cep?:string|null, city?:string|null}, code?:string, error?:string}>}
 */
export async function upsertDevice(params) {
  const {
    userId,
    fcmDeviceToken,
    expoPushToken = null,
    cep = null,
    city = null,
    lat = null,
    lng = null,
    groups = [],
    active = true,
  } = params || {};

  if (!userId) {return { ok: false, code: 'no_user', error: 'userId requis' };}
  if (!isLikelyFCMToken(fcmDeviceToken)) {
    warn('fcmDeviceToken invalide:', mask(fcmDeviceToken));
    return { ok: false, code: 'no_fcm', error: 'fcmDeviceToken requis/valide' };
  }

  const db = getFirestore();
  const now = serverTimestamp();

  try {
    // 1) Lire profil existant pour MERGER (évite toute perte)
    const userRef = doc(db, 'users', userId);
    let existing = null;
    try {
      const snap = await getDoc(userRef);
      existing = snap.exists() ? snap.data() || null : null;
    } catch (e) {
      warn('read users/%s impossible (on continue):', userId, e?.message || e);
    }

    const existingGroups = existing?.groups;
    const existingCep = existing?.cep ?? existing?.CEP ?? null;
    const existingCity = existing?.city ?? existing?.cidade ?? null;

    // 2) Normaliser lat/lng
    const latN = typeof lat === 'string' ? parseFloat(lat) : lat;
    const lngN = typeof lng === 'string' ? parseFloat(lng) : lng;
    const latOk = typeof latN === 'number' && Number.isFinite(latN) && latN >= -90 && latN <= 90;
    const lngOk = typeof lngN === 'number' && Number.isFinite(lngN) && lngN >= -180 && lngN <= 180;
    const hasLatLng = !!(latOk && lngOk);
    const geohash = hasLatLng ? encodeGeohash(latN, lngN, 7) : null;

    // 3) Merge groups/zone
    const mergedGroups = mergeGroups(existingGroups, groups);
    const { cep: mergedCep, city: mergedCity } = pickCepCity({
      cepParam: cep,
      cityParam: city,
      existingCep,
      existingCity,
    });

    // 4) Construire deviceId + payload commun
    const deviceId = buildSafeDeviceId({ userId, fcmDeviceToken, expoPushToken });
    const tokenHash = fnv1a64Hex(String(fcmDeviceToken));
    const basePayload = {
      userId,
      deviceId,
      platform: Platform.OS || 'unknown',
      type: expoPushToken ? 'expo+fcm' : 'fcm',
      fcmToken: fcmDeviceToken,
      fcm: fcmDeviceToken,
      expoPushToken: expoPushToken || null,
      expo: expoPushToken || null,
      tokenHash,
      active: !!active,
      channels: { publicAlerts: true },
      groups: Object.keys(mergedGroups || {}).length ? mergedGroups : {},
      updatedAt: now,
      ...(hasLatLng ? { lat: latN, lng: lngN, geohash } : {}),
      ...(mergedCep ? { cep: mergedCep } : {}),
      ...(mergedCity ? { city: mergedCity } : {}),
    };

    log('START', {
      userId,
      deviceId,
      platform: basePayload.platform,
      hasLatLng,
      geohash,
      cep: mergedCep || null,
      city: mergedCity || null,
      groups: Object.keys(basePayload.groups || {}),
      fcm: mask(fcmDeviceToken),
      expo: expoPushToken ? mask(expoPushToken) : null,
    });

    // 5) Upsert profil user (MERGE ! ne rien écraser)
    //    On ne touche qu’aux champs utiles si on les a (merge:true protège le reste).
    const userPatch = {
      // on n’écrit groups/cep/city que si on a une valeur (merged* peut être null/{} → ignoré si vide)
      ...(Object.keys(mergedGroups || {}).length ? { groups: mergedGroups } : {}),
      ...(mergedCep ? { cep: mergedCep } : {}),
      ...(mergedCity ? { city: mergedCity } : {}),
      updatedAt: now,
    };
    try {
      await setDoc(userRef, userPatch, { merge: true });
      log('✓ FS ok users/%s (merge)', userId);
    } catch (e) {
      // On continue quand même — le device sera écrit, mais on log.
      warn('users/%s merge fail:', userId, e?.message || e);
    }

    // 6) Upsert global device
    try {
      await setDoc(doc(db, 'devices', deviceId), basePayload, { merge: true });
      log('✓ FS ok /devices/%s', deviceId);
    } catch (e) {
      err('global /devices write failed:', e?.message || e);
      throw e;
    }

    // 7) Upsert per-user device
    try {
      await setDoc(
        doc(db, 'users', userId, 'devices', deviceId),
        { ...basePayload, lastSeenAt: now },
        { merge: true },
      );
      log('✓ FS ok /users/%s/devices/%s', userId, deviceId);
    } catch (e) {
      err('per-user /users/{uid}/devices write failed:', e?.message || e);
      throw e;
    }

    log('END OK', { deviceId, userId, hasLatLng, geohash });
    return {
      ok: true,
      deviceId,
      hasLatLng,
      geohash,
      merged: {
        groups: basePayload.groups,
        cep: mergedCep || null,
        city: mergedCity || null,
      },
    };
  } catch (e) {
    err('🔥 upsertDevice failed', e?.message || String(e));
    return { ok: false, code: 'exception', error: e?.message || String(e) };
  }
}
